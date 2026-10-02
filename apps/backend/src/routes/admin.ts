import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/db/client.js';
import { requireAdmin, getClerkClient, type AuthenticatedRequest } from '../lib/auth/clerk.js';
import { generatePlaceholderPhoneNumber } from '../lib/clinic/placeholder-phone.js';
import { getAdminClinicsAnalyticsOverview } from '../lib/analytics/summary.js';

export const adminRouter = Router();

// Enforce Admin role across all /api/admin routes
adminRouter.use(requireAdmin);

/**
 * GET /api/admin/analytics/clinics-overview
 * Platform-wide analytics comparison across clinics (last 30 days).
 */
adminRouter.get('/analytics/clinics-overview', async (_req: AuthenticatedRequest, res) => {
  try {
    const data = await getAdminClinicsAnalyticsOverview();
    res.json(data);
  } catch (error) {
    console.error('[admin:analytics] Error fetching clinics overview:', error);
    res.status(500).json({ error: 'Klinik analitik özeti alınırken hata oluştu.' });
  }
});

/**
 * GET /api/admin/clinics
 * Lists all registered clinics across the entire multi-tenant platform.
 */
adminRouter.get('/clinics', async (_req: AuthenticatedRequest, res) => {
  try {
    const clinics = await prisma.clinic.findMany({
      include: {
        _count: {
          select: {
            doctors: true,
            patients: true,
            appointments: true,
            callLogs: true,
          },
        },
        doctors: {
          select: {
            id: true,
            name: true,
            specialty: true,
            workingHours: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ clinics });
  } catch (error) {
    console.error('[admin] Error fetching clinics:', error);
    res.status(500).json({ error: 'Klinik listesi alınırken hata oluştu.' });
  }
});

const doctorSchema = z.object({
  name: z.string().min(2, 'Doktor adı en az 2 karakter olmalıdır.'),
  specialty: z.string().min(2, 'Uzmanlık branşı gereklidir.'),
  startHour: z.string().default('09:00'),
  endHour: z.string().default('17:00'),
  days: z.array(z.string()).default(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
  complaints: z.string().optional(),
});

const createClinicSchema = z.object({
  name: z.string().min(2, 'Klinik adı en az 2 karakter olmalıdır.'),
  phoneNumber: z.string().optional(),
  aiInboundNumber: z.string().optional(),
  transferNumber: z.string().optional(),
  greetingMessage: z.string().optional(),
  cancellationPolicyHours: z.number().int().min(0).default(2),
  specialInstructions: z.string().optional(),
  voiceId: z.string().optional(),
  doctors: z.array(doctorSchema).optional().default([]),
});

/**
 * POST /api/admin/clinics
 * Creates a new clinic entity with optional initial doctor roster.
 */
adminRouter.post('/clinics', async (req: AuthenticatedRequest, res) => {
  const parsed = createClinicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  const {
    name,
    phoneNumber: rawPhone,
    aiInboundNumber: rawAiInboundNumber,
    transferNumber: rawTransferNumber,
    greetingMessage,
    cancellationPolicyHours,
    specialInstructions,
    voiceId,
    doctors,
  } = parsed.data;

  try {
    let phoneNumber = rawPhone?.trim();
    if (!phoneNumber || phoneNumber.toLowerCase() === 'placeholder') {
      phoneNumber = await generatePlaceholderPhoneNumber();
    }

    const { normalizeAiInboundNumber } = await import('../lib/db/clinic.js');
    const aiInboundNumber = normalizeAiInboundNumber(rawAiInboundNumber);
    const transferNumber = rawTransferNumber?.trim() || null;

    const defaultGreeting = `Merhaba, ${name}'na hoş geldiniz. Ben yapay zeka asistanınız, randevunuz için nasıl yardımcı olabilirim?`;

    const clinic = await prisma.clinic.create({
      data: {
        name: name.trim(),
        phoneNumber,
        aiInboundNumber,
        transferNumber,
        timezone: 'Europe/Istanbul',
        greetingMessage: greetingMessage?.trim() || defaultGreeting,
        cancellationPolicyHours,
        specialInstructions: specialInstructions?.trim() || null,
        voiceId: voiceId?.trim() || null,
        doctors: {
          create: doctors.map((doc) => ({
            name: doc.name.trim(),
            specialty: doc.specialty.trim(),
            workingHours: {
              start: doc.startHour,
              end: doc.endHour,
              slotDurationMinutes: 30,
              days: doc.days,
              complaints: doc.complaints?.trim() || null,
            },
          })),
        },
      },
      include: {
        doctors: true,
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

    res.status(201).json({ clinic });
  } catch (error) {
    console.error('[admin] Error creating clinic:', error);
    res.status(500).json({ error: 'Klinik kaydedilirken bir hata oluştu.' });
  }
});

/**
 * POST /api/admin/clinics/:clinicId/doctors
 * Adds a doctor to an existing clinic.
 */
adminRouter.post('/clinics/:clinicId/doctors', async (req: AuthenticatedRequest, res) => {
  const { clinicId } = req.params;
  const parsed = doctorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz parametreler', details: parsed.error.format() });
    return;
  }

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      res.status(404).json({ error: 'Klinik bulunamadı.' });
      return;
    }

    const { name, specialty, startHour, endHour, days, complaints } = parsed.data;

    const doctor = await prisma.doctor.create({
      data: {
        clinicId,
        name: name.trim(),
        specialty: specialty.trim(),
        workingHours: {
          start: startHour,
          end: endHour,
          slotDurationMinutes: 30,
          days,
          complaints: complaints?.trim() || null,
        },
      },
    });

    res.status(201).json({ doctor });
  } catch (error) {
    console.error('[admin] Error adding doctor:', error);
    res.status(500).json({ error: 'Doktor kaydedilirken hata oluştu.' });
  }
});

const inviteSecretarySchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
});

/**
 * POST /api/admin/clinics/:clinicId/invite-secretary
 * Invites a new secretary via Clerk Invitations API, automatically binding publicMetadata.clinicId
 * and publicMetadata.role = 'secretary'.
 */
adminRouter.post('/clinics/:clinicId/invite-secretary', async (req: AuthenticatedRequest, res) => {
  const { clinicId } = req.params;
  const parsed = inviteSecretarySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Geçersiz e-posta adresi', details: parsed.error.format() });
    return;
  }

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      res.status(404).json({ error: 'Klinik bulunamadı.' });
      return;
    }

    const { email } = parsed.data;
    const clerk = getClerkClient();

    // Call Clerk Invitations API with automatic tenant binding
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email.trim().toLowerCase(),
      publicMetadata: {
        clinicId: clinic.id,
        role: 'secretary',
      },
      ignoreExisting: true,
    });

    res.status(200).json({
      success: true,
      message: `${clinic.name} sekreteri için davet başarıyla oluşturuldu.`,
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        status: invitation.status,
      },
    });
  } catch (error: unknown) {
    console.error('[admin] Error inviting secretary:', error);
    const msg = error instanceof Error ? error.message : 'Sekreter daveti gönderilemedi.';
    res.status(500).json({ error: msg });
  }
});
