import { Router } from 'express';
import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';
import { normalizePhone } from '../lib/phone.js';

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
      const [year, month, day] = date.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        whereClause.startsAt = {
          gte: startOfDay,
          lte: endOfDay,
        };
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

const createAppointmentSchema = z.object({
  patientName: z.string().min(2),
  patientPhone: z.string().min(8),
  doctorId: z.string(),
  startsAt: z.string(), // ISO string
  durationMinutes: z.number().default(30),
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
    const startsAt = new Date(startsAtStr);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const normalizedPhone = normalizePhone(patientPhone);

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
          status: 'SCHEDULED',
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

    const { startsAt, endsAt, status, doctorId } = parsed.data;

    const dataToUpdate: Record<string, unknown> = {};

    if (status) {
      dataToUpdate.status = status;
    }
    if (doctorId) {
      dataToUpdate.doctorId = doctorId;
    }

    const targetDoctorId = doctorId || existing.doctorId;
    const targetStatus = status || existing.status;

    let newStartsAt: Date | undefined;
    let newEndsAt: Date | undefined;

    if (startsAt) {
      newStartsAt = new Date(startsAt);
      newEndsAt = endsAt ? new Date(endsAt) : new Date(newStartsAt.getTime() + 30 * 60 * 1000);
      dataToUpdate.startsAt = newStartsAt;
      dataToUpdate.endsAt = newEndsAt;
    }

    // Run in transaction with row-level lock on doctor if updating schedule
    const updated = await prisma.$transaction(async (tx) => {
      if (newStartsAt && newEndsAt && targetStatus === 'SCHEDULED') {
        // Lock doctor record to prevent concurrent double-booking
        await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${targetDoctorId} FOR UPDATE`;

        const conflict = await tx.appointment.findFirst({
          where: {
            clinicId,
            doctorId: targetDoctorId,
            status: 'SCHEDULED',
            id: { not: existing.id },
            AND: [
              { startsAt: { lt: newEndsAt } },
              { endsAt: { gt: newStartsAt } },
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
