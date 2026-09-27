import { Router } from 'express';
import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../lib/db/client.js';
import { getDefaultClinic } from '../lib/db/clinic.js';
import { requireAuth } from '../lib/auth/clerk.js';
import { normalizePhone } from '../lib/scheduling/booking.js';

export const appointmentsRouter = Router();

// Protect all appointments routes
appointmentsRouter.use(requireAuth);

/**
 * GET /api/appointments
 * Query params: doctorId, date (YYYY-MM-DD), status
 */
appointmentsRouter.get('/', async (req, res) => {
  try {
    const clinic = await getDefaultClinic();
    const { doctorId, date, status } = req.query;

    const whereClause: Record<string, unknown> = {
      clinicId: clinic.id,
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
 */
appointmentsRouter.get('/:id', async (req, res) => {
  try {
    const clinic = await getDefaultClinic();
    const { id } = req.params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, clinicId: clinic.id },
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
 * Manual appointment creation by secretary
 */
appointmentsRouter.post('/', async (req, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  const { patientName, patientPhone, doctorId, startsAt: startsAtStr, durationMinutes } = parsed.data;

  try {
    const clinic = await getDefaultClinic();
    const startsAt = new Date(startsAtStr);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const normalizedPhone = normalizePhone(patientPhone);

    // Upsert patient
    const patient = await prisma.patient.upsert({
      where: {
        clinicId_phoneNumber: {
          clinicId: clinic.id,
          phoneNumber: normalizedPhone,
        },
      },
      update: { fullName: patientName.trim() },
      create: {
        clinicId: clinic.id,
        fullName: patientName.trim(),
        phoneNumber: normalizedPhone,
      },
    });

    // Conflict check in transaction
    const newAppointment = await prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId: clinic.id,
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
          clinicId: clinic.id,
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
 */
appointmentsRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const parsed = updateAppointmentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  try {
    const clinic = await getDefaultClinic();
    const existing = await prisma.appointment.findFirst({
      where: { id, clinicId: clinic.id },
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
    if (startsAt) {
      const newStartsAt = new Date(startsAt);
      const newEndsAt = endsAt ? new Date(endsAt) : new Date(newStartsAt.getTime() + 30 * 60 * 1000);

      // Check conflict if keeping SCHEDULED
      const targetDoctorId = doctorId || existing.doctorId;
      const targetStatus = status || existing.status;

      if (targetStatus === 'SCHEDULED') {
        const conflict = await prisma.appointment.findFirst({
          where: {
            clinicId: clinic.id,
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
          res.status(409).json({ error: 'Seçilen yeni saatte doktorun başka bir randevusu bulunmaktadır.' });
          return;
        }
      }

      dataToUpdate.startsAt = newStartsAt;
      dataToUpdate.endsAt = newEndsAt;
    }

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: dataToUpdate,
      include: {
        doctor: true,
        patient: true,
      },
    });

    res.json({ appointment: updated });
  } catch (error) {
    console.error('[api] Error updating appointment:', error);
    res.status(500).json({ error: 'Randevu güncellenemedi.' });
  }
});
