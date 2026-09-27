import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { getDefaultClinic } from '../lib/db/clinic.js';
import { requireAuth } from '../lib/auth/clerk.js';

export const statsRouter = Router();

statsRouter.use(requireAuth);

/**
 * GET /api/stats/dashboard
 * Aggregated summary numbers for secretary dashboard
 */
statsRouter.get('/dashboard', async (_req, res) => {
  try {
    const clinic = await getDefaultClinic();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todayAppointments, todayCompleted, todayCalls, totalPatients] = await Promise.all([
      prisma.appointment.count({
        where: {
          clinicId: clinic.id,
          startsAt: { gte: startOfToday, lte: endOfToday },
          status: 'SCHEDULED',
        },
      }),
      prisma.appointment.count({
        where: {
          clinicId: clinic.id,
          startsAt: { gte: startOfToday, lte: endOfToday },
          status: 'COMPLETED',
        },
      }),
      prisma.callLog.count({
        where: {
          clinicId: clinic.id,
          createdAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      prisma.patient.count({
        where: { clinicId: clinic.id },
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
