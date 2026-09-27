import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { getDefaultClinic } from '../lib/db/clinic.js';
import { requireAuth } from '../lib/auth/clerk.js';

export const doctorsRouter = Router();

// Protect doctors routes
doctorsRouter.use(requireAuth);

/**
 * GET /api/doctors
 * Returns all doctors in the clinic with today's appointment counts.
 */
doctorsRouter.get('/', async (_req, res) => {
  try {
    const clinic = await getDefaultClinic();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const doctors = await prisma.doctor.findMany({
      where: { clinicId: clinic.id },
      include: {
        _count: {
          select: {
            appointments: {
              where: {
                startsAt: { gte: startOfToday, lte: endOfToday },
                status: 'SCHEDULED',
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const mapped = doctors.map((doc) => ({
      id: doc.id,
      name: doc.name,
      specialty: doc.specialty,
      workingHours: doc.workingHours,
      todayAppointmentsCount: doc._count.appointments,
      createdAt: doc.createdAt,
    }));

    res.json({ doctors: mapped });
  } catch (error) {
    console.error('[api] Error fetching doctors:', error);
    res.status(500).json({ error: 'Doktor listesi getirilirken hata oluştu.' });
  }
});
