import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/db/client.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth/clerk.js';
import {
  ensureRecordingNotice,
  sanitizeSpecialInstructions,
  buildFirstMessage,
} from '../lib/vapi/first-message.js';

export const clinicRouter = Router();

clinicRouter.use(requireAuth);

const updateClinicSettingsSchema = z
  .object({
    greetingMessage: z
      .string({ invalid_type_error: 'greetingMessage metin olmalıdır.' })
      .min(10, 'Karşılama mesajı en az 10 karakter olmalıdır.')
      .max(500, 'Karşılama mesajı en fazla 500 karakter olabilir.')
      .optional(),
    specialInstructions: z
      .string({ invalid_type_error: 'specialInstructions metin olmalıdır.' })
      .max(1000, 'Özel talimatlar en fazla 1000 karakter olabilir.')
      .nullable()
      .optional(),
    cancellationPolicyHours: z
      .number({ invalid_type_error: 'cancellationPolicyHours tam sayı olmalıdır.' })
      .int('İptal süresi tam sayı olmalıdır.')
      .min(1, 'İptal politikası süresi en az 1 saat olmalıdır.')
      .max(72, 'İptal politikası süresi en fazla 72 saat olabilir.')
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.greetingMessage !== undefined ||
      data.specialInstructions !== undefined ||
      data.cancellationPolicyHours !== undefined,
    {
      message: 'Güncellemek için en az bir ayar alanı (greetingMessage, specialInstructions, cancellationPolicyHours) gönderilmelidir.',
    },
  );

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
        settingsUpdatedAt: clinic.settingsUpdatedAt,
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

/**
 * PATCH /api/clinic/current
 * Updates the authenticated clinic's settings (greetingMessage, specialInstructions, cancellationPolicyHours).
 * Multi-tenant safe: strictly uses req.clinicId.
 * Creates an audit snapshot in ClinicSettingVersion before saving.
 */
clinicRouter.patch('/current', async (req: AuthenticatedRequest, res) => {
  const parsed = updateClinicSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Geçersiz parametreler',
      details: parsed.error.format(),
    });
    return;
  }

  const clinicId = req.clinicId!;
  const data = parsed.data;

  try {
    let cleanGreeting: string | undefined;
    let noticeWasAdded = false;

    if (data.greetingMessage !== undefined) {
      const noticeResult = ensureRecordingNotice(data.greetingMessage);
      cleanGreeting = noticeResult.text;
      noticeWasAdded = noticeResult.added;
    }

    let sanitizedSpecial: string | null | undefined;
    if (data.specialInstructions !== undefined) {
      sanitizedSpecial = sanitizeSpecialInstructions(data.specialInstructions);
    }

    const changedBy =
      (req.auth?.sub as string | undefined) ||
      (req.auth?.userId as string | undefined) ||
      (req.auth?.id as string | undefined) ||
      (req.headers['x-test-user-id'] as string | undefined) ||
      null;

    const updatedClinic = await prisma.$transaction(async (tx) => {
      const existingClinic = await tx.clinic.findUnique({
        where: { id: clinicId },
      });

      if (!existingClinic) {
        return null;
      }

      // 1. Snapshot of previous settings before applying updates
      const snapshot = {
        greetingMessage: existingClinic.greetingMessage,
        specialInstructions: existingClinic.specialInstructions,
        cancellationPolicyHours: existingClinic.cancellationPolicyHours,
      };

      await tx.clinicSettingVersion.create({
        data: {
          clinicId,
          snapshot,
          changedBy,
        },
      });

      // 2. Prepare update payload
      const updatePayload: {
        greetingMessage?: string;
        specialInstructions?: string | null;
        cancellationPolicyHours?: number;
        settingsUpdatedAt: Date;
      } = {
        settingsUpdatedAt: new Date(),
      };

      if (cleanGreeting !== undefined) {
        updatePayload.greetingMessage = cleanGreeting;
      }
      if (data.specialInstructions !== undefined) {
        updatePayload.specialInstructions = sanitizedSpecial;
      }
      if (data.cancellationPolicyHours !== undefined) {
        updatePayload.cancellationPolicyHours = data.cancellationPolicyHours;
      }

      return tx.clinic.update({
        where: { id: clinicId },
        data: updatePayload,
      });
    });

    if (!updatedClinic) {
      res.status(404).json({ error: 'Klinik kaydı bulunamadı.' });
      return;
    }

    const firstMessagePreview = buildFirstMessage({
      name: updatedClinic.name,
      greetingMessage: updatedClinic.greetingMessage,
    });

    res.json({
      clinic: updatedClinic,
      firstMessagePreview,
      noticeWasAdded,
    });
  } catch (error) {
    console.error('[api] Error updating clinic settings:', error);
    res.status(500).json({ error: 'Klinik ayarları güncellenirken hata oluştu.' });
  }
});
