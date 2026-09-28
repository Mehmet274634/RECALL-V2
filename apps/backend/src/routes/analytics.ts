import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';
import { getClinicAnalyticsSummary } from '../lib/analytics/summary.js';

export const analyticsRouter = Router();

// Protect all analytics routes with requireAuth
analyticsRouter.use(requireAuth);

const dateQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz başlangıç tarihi formatı (YYYY-MM-DD)')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz bitiş tarihi formatı (YYYY-MM-DD)')
    .optional(),
});

/**
 * GET /api/analytics/summary
 * Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
 * Multi-tenant safe: Strictly uses req.clinicId from verified session.
 * Date limit: Maximum 366 days (1 year) to prevent timeouts.
 */
analyticsRouter.get('/summary', async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.status(403).json({ error: 'Bu işlem için klinik yetkisi bulunamadı.' });
      return;
    }

    const parseResult = dateQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Geçersiz parametreler',
        details: parseResult.error.flatten(),
      });
      return;
    }

    // Default to last 30 days
    const now = new Date();
    const defaultTo = now.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultFrom = thirtyDaysAgo.toISOString().split('T')[0];

    const from = parseResult.data.from || defaultFrom;
    const to = parseResult.data.to || defaultTo;

    // Validate date order
    const startDate = new Date(`${from}T00:00:00Z`);
    const endDate = new Date(`${to}T00:00:00Z`);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Geçersiz tarih formatı.' });
      return;
    }

    if (startDate > endDate) {
      res.status(400).json({ error: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.' });
      return;
    }

    // Enforce 1-year (366 days) maximum range limit
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 366) {
      res.status(400).json({
        error: 'Tarih aralığı en fazla 366 gün (1 yıl) olabilir.',
      });
      return;
    }

    const summary = await getClinicAnalyticsSummary(clinicId, from, to);
    res.json(summary);
  } catch (error) {
    console.error('[analytics:summary] Error calculating clinic analytics:', error);
    res.status(500).json({ error: 'Analitik verileri hesaplanırken beklenmeyen bir hata oluştu.' });
  }
});
