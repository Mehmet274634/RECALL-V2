import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';

export const doctorsRouter = Router();

// Protect doctors routes
doctorsRouter.use(requireAuth);

/**
 * GET /api/doctors
 * Returns all doctors in the tenant's clinic with today's appointment counts.
 * Multi-tenant safe: uses req.clinicId.
 */
doctorsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const doctors = await prisma.doctor.findMany({
      where: { clinicId },
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
