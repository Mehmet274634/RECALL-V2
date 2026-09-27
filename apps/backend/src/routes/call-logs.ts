import { Router } from 'express';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';

export const callLogsRouter = Router();

// Protect all call-logs routes
callLogsRouter.use(requireAuth);

/**
 * GET /api/call-logs
 * Query params: limit, date (YYYY-MM-DD)
 * Scoped strictly to verified req.clinicId
 */
callLogsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;
    const { limit = '50', date } = req.query;

    const whereClause: Record<string, unknown> = {
      clinicId,
    };

    if (date && typeof date === 'string') {
      const [year, month, day] = date.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        whereClause.createdAt = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
    }

    const callLogs = await prisma.callLog.findMany({
      where: whereClause,
      include: {
        appointments: {
          select: {
            id: true,
            startsAt: true,
            status: true,
            doctor: { select: { name: true } },
            patient: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
    });

    res.json({ callLogs });
  } catch (error) {
    console.error('[api] Error fetching call logs:', error);
    res.status(500).json({ error: 'Çağrı kayıtları getirilirken hata oluştu.' });
  }
});

/**
 * GET /api/call-logs/:id
 * Scoped strictly to verified req.clinicId
 */
callLogsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId!;
    const { id } = req.params;

    const callLog = await prisma.callLog.findFirst({
      where: { id, clinicId },
      include: {
        appointments: {
          include: {
            doctor: true,
            patient: true,
          },
        },
      },
    });

    if (!callLog) {
      res.status(404).json({ error: 'Çağrı kaydı bulunamadı.' });
      return;
    }

    res.json({ callLog });
  } catch (error) {
    console.error('[api] Error fetching call log:', error);
    res.status(500).json({ error: 'Çağrı detayı getirilirken hata oluştu.' });
  }
});
