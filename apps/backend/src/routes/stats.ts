import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';

export const statsRouter = Router();

statsRouter.use(requireAuth);

/**
 * GET /api/stats/dashboard
 * Aggregated summary numbers for secretary dashboard.
 * Multi-tenant safe: uses req.clinicId.
 */
statsRouter.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todayAppointments, todayCompleted, todayCalls, totalPatients] = await Promise.all([
      prisma.appointment.count({
        where: {
          clinicId,
          startsAt: { gte: startOfToday, lte: endOfToday },
          status: 'SCHEDULED',
        },
      }),
      prisma.appointment.count({
        where: {
          clinicId,
          startsAt: { gte: startOfToday, lte: endOfToday },
          status: 'COMPLETED',
        },
      }),
      prisma.callLog.count({
        where: {
          clinicId,
          createdAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      prisma.patient.count({
        where: { clinicId },
      }),
    ]);

    res.json({
      stats: {
        todayAppointments,
        todayCompleted,
        todayCalls,
        totalPatients,
      },
    });
  } catch (error) {
    console.error('[api] Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'İstatistikler getirilirken hata oluştu.' });
  }
});
