import { Router } from 'express';
import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';
import { normalizePhone, isValidPhone } from '../lib/phone.js';
import { parseIstanbulDate, getIstanbulDayRange } from '../lib/date-utils.js';

export const appointmentsRouter = Router();

// Protect all appointments routes
appointmentsRouter.use(requireAuth);

/**
 * GET /api/appointments
 * Query params: doctorId, date (YYYY-MM-DD), status
 * Multi-tenant safe: uses req.clinicId extracted from verified session.
 */
appointmentsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;
    const { doctorId, date, status } = req.query;

    const whereClause: Record<string, unknown> = {
      clinicId,
    };

    if (doctorId && typeof doctorId === 'string') {
      whereClause.doctorId = doctorId;
    }

    if (status && typeof status === 'string' && Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
      whereClause.status = status as AppointmentStatus;
    }

    if (date && typeof date === 'string') {
      try {
        const { startOfDay, endOfDay } = getIstanbulDayRange(date);
        whereClause.startsAt = {
          gte: startOfDay,
          lte: endOfDay,
        };
      } catch {
        // ignore invalid date filter
      }
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        doctor: {
          select: { id: true, name: true, specialty: true },
        },
        patient: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    res.json({ appointments });
  } catch (error) {
    console.error('[api] Error fetching appointments:', error);
    res.status(500).json({ error: 'Randevular getirilirken bir hata oluştu.' });
  }
});

/**
 * GET /api/appointments/:id
 * Multi-tenant safe: scopes to req.clinicId
 */
appointmentsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;
    const { id } = req.params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, clinicId },
      include: {
        doctor: true,
        patient: true,
        callLog: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Randevu bulunamadı.' });
      return;
    }

    res.json({ appointment });
  } catch (error) {
    console.error('[api] Error fetching appointment:', error);
    res.status(500).json({ error: 'Randevu detayı getirilirken hata oluştu.' });
  }
});

const ALLOWED_DURATIONS = [15, 30, 45, 60] as const;

const createAppointmentSchema = z.object({
  patientName: z.string().min(2),
  patientPhone: z.string().refine((val) => isValidPhone(val), {
    message: 'Lütfen geçerli bir telefon numarası giriniz (örn: 0532 123 45 67).',
  }),
  doctorId: z.string(),
  startsAt: z.string(), // ISO string
  durationMinutes: z
    .number()
    .int()
    .refine((val) => ALLOWED_DURATIONS.includes(val as (typeof ALLOWED_DURATIONS)[number]), {
      message: 'Geçersiz randevu süresi. Sadece 15, 30, 45 veya 60 dakika seçilebilir.',
    })
    .default(30),
});

/**
 * POST /api/appointments
 * Manual appointment creation by secretary.
 * Protected with row-level lock on doctor and multi-tenant isolation.
 */
appointmentsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  const { patientName, patientPhone, doctorId, startsAt: startsAtStr, durationMinutes } = parsed.data;

  try {
    const clinicId = req.clinicId!;
    const startsAt = parseIstanbulDate(startsAtStr);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const normalizedPhone = normalizePhone(patientPhone);

    // Validate doctorId belongs to this clinic (prevents cross-tenant doctorId injection)
    const doctorInClinic = await prisma.doctor.findFirst({ where: { id: doctorId, clinicId } });
    if (!doctorInClinic) {
      res.status(404).json({ error: 'Belirtilen doktor bu kliniğe ait değil veya bulunamadı.' });
      return;
    }

    // Upsert patient scoped to tenant's clinicId
    const patient = await prisma.patient.upsert({
      where: {
        clinicId_phoneNumber: {
          clinicId,
          phoneNumber: normalizedPhone,
        },
      },
      update: { fullName: patientName.trim() },
      create: {
        clinicId,
        fullName: patientName.trim(),
        phoneNumber: normalizedPhone,
      },
    });

    // Conflict check in transaction with row-level lock on Doctor
    const newAppointment = await prisma.$transaction(async (tx) => {
      // Row-level lock on doctor record to serialize slot checking
      await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE`;

      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId,
          doctorId,
          status: { not: AppointmentStatus.CANCELLED },
          AND: [
            { startsAt: { lt: endsAt } },
            { endsAt: { gt: startsAt } },
          ],
        },
      });

      if (conflict) {
        throw new Error('SLOT_OCCUPIED');
      }

      return tx.appointment.create({
        data: {
          clinicId,
          doctorId,
          patientId: patient.id,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
        },
        include: {
          doctor: true,
          patient: true,
        },
      });
    });

    res.status(201).json({ appointment: newAppointment });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_OCCUPIED') {
      res.status(409).json({ error: 'Seçilen saatte doktorun başka bir randevusu bulunmaktadır.' });
      return;
    }
    console.error('[api] Error creating appointment:', error);
    res.status(500).json({ error: 'Randevu kaydedilemedi.' });
  }
});

const updateAppointmentSchema = z.object({
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  durationMinutes: z
    .number()
    .int()
    .refine((val) => ALLOWED_DURATIONS.includes(val as (typeof ALLOWED_DURATIONS)[number]), {
      message: 'Geçersiz randevu süresi. Sadece 15, 30, 45 veya 60 dakika seçilebilir.',
    })
    .optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  doctorId: z.string().optional(),
});

/**
 * PATCH /api/appointments/:id
 * Manual edit (status change, reschedule)
 * Uses transaction with doctor row-level locking to prevent race conditions.
 */
appointmentsRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const parsed = updateAppointmentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  try {
    const clinicId = req.clinicId!;
    const existing = await prisma.appointment.findFirst({
      where: { id, clinicId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Randevu bulunamadı.' });
      return;
    }

    // Final state guard: CANCELLED and COMPLETED are terminal.
    // Only admin role may revert from these states.
    const FINAL_STATES: AppointmentStatus[] = [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED];
    if (FINAL_STATES.includes(existing.status) && req.role !== 'admin') {
      res.status(409).json({
        error: `Randevu durumu değiştirilemez. "${existing.status}" son bir durumdur ve yalnızca yönetici tarafından geri alınabilir.`,
        currentStatus: existing.status,
      });
      return;
    }

    const { startsAt, endsAt, durationMinutes, status, doctorId } = parsed.data;

    const dataToUpdate: Record<string, unknown> = {};

    if (status) {
      dataToUpdate.status = status;
    }
    if (doctorId) {
      // Validate updated doctorId belongs to this clinic
      const doctorInClinic = await prisma.doctor.findFirst({ where: { id: doctorId, clinicId } });
      if (!doctorInClinic) {
        res.status(404).json({ error: 'Belirtilen doktor bu kliniğe ait değil veya bulunamadı.' });
        return;
      }
      dataToUpdate.doctorId = doctorId;
    }

    const targetDoctorId = doctorId || existing.doctorId;
    const targetStatus = status || existing.status;

    let checkStartsAt: Date = existing.startsAt;
    let checkEndsAt: Date = existing.endsAt;
    let scheduleChanged = false;

    if (startsAt) {
      checkStartsAt = parseIstanbulDate(startsAt);
      scheduleChanged = true;
    }

    if (endsAt) {
      checkEndsAt = parseIstanbulDate(endsAt);
      scheduleChanged = true;
    } else if (durationMinutes) {
      checkEndsAt = new Date(checkStartsAt.getTime() + durationMinutes * 60 * 1000);
      scheduleChanged = true;
    } else if (startsAt) {
      // Preserve existing appointment duration if durationMinutes not provided
      const existingDurationMs = existing.endsAt.getTime() - existing.startsAt.getTime();
      checkEndsAt = new Date(checkStartsAt.getTime() + (existingDurationMs > 0 ? existingDurationMs : 30 * 60 * 1000));
      scheduleChanged = true;
    }

    if (scheduleChanged) {
      dataToUpdate.startsAt = checkStartsAt;
      dataToUpdate.endsAt = checkEndsAt;
    }

    // Run in transaction with sorted deadlock-free row-level locks on doctors if updating schedule
    const updated = await prisma.$transaction(async (tx) => {
      if (targetStatus === 'SCHEDULED' && (scheduleChanged || doctorId)) {
        // Lock both source and target doctors in strictly ASCENDING order to prevent deadlocks
        const doctorIdsToLock = Array.from(new Set([existing.doctorId, targetDoctorId])).sort();
        for (const docId of doctorIdsToLock) {
          await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${docId} FOR UPDATE`;
        }

        const conflict = await tx.appointment.findFirst({
          where: {
            clinicId,
            doctorId: targetDoctorId,
            status: { not: AppointmentStatus.CANCELLED },
            id: { not: existing.id },
            AND: [
              { startsAt: { lt: checkEndsAt } },
              { endsAt: { gt: checkStartsAt } },
            ],
          },
        });

        if (conflict) {
          throw new Error('SLOT_OCCUPIED');
        }
      }

      return tx.appointment.update({
        where: { id: existing.id },
        data: dataToUpdate,
        include: {
          doctor: true,
          patient: true,
        },
      });
    });

    res.json({ appointment: updated });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_OCCUPIED') {
      res.status(409).json({ error: 'Seçilen yeni saatte doktorun başka bir randevusu bulunmaktadır.' });
      return;
    }
    console.error('[api] Error updating appointment:', error);
    res.status(500).json({ error: 'Randevu güncellenemedi.' });
  }
});
