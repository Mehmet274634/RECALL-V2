import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';

export const clinicRouter = Router();

clinicRouter.use(requireAuth);

/**
 * GET /api/clinic/current
 * Returns the authenticated clinic's settings and metadata.
 * Multi-tenant safe: strictly uses req.clinicId.
 */
clinicRouter.get('/current', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        _count: {
          select: {
            doctors: true,
            patients: true,
            appointments: true,
            callLogs: true,
          },
        },
      },
    });

    if (!clinic) {
      res.status(404).json({ error: 'Klinik kaydı bulunamadı.' });
      return;
    }

    res.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        phoneNumber: clinic.phoneNumber,
        timezone: clinic.timezone,
        greetingMessage: clinic.greetingMessage,
        specialInstructions: clinic.specialInstructions,
        cancellationPolicyHours: clinic.cancellationPolicyHours,
        voiceId: clinic.voiceId,
        createdAt: clinic.createdAt,
        counts: {
          doctors: clinic._count.doctors,
          patients: clinic._count.patients,
          appointments: clinic._count.appointments,
          callLogs: clinic._count.callLogs,
        },
      },
    });
  } catch (error) {
    console.error('[api] Error fetching clinic details:', error);
    res.status(500).json({ error: 'Klinik bilgileri getirilirken hata oluştu.' });
  }
});
