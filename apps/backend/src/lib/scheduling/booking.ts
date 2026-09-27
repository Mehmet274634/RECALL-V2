import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';

import type { Appointment } from '@prisma/client';

export interface BookAppointmentParams {
  patientName: string;
  patientPhone: string;
  doctorName?: string;
  doctorId?: string;
  specialty?: string;
  date: string; // YYYY-MM-DD or ISO
  time: string; // HH:mm (e.g. "14:30")
  durationMinutes?: number;
  callId?: string;
}

export interface BookingResult {
  success: boolean;
  appointment?: Appointment;
  message: string;
}

/**
 * Normalizes phone numbers (e.g. "0532 123 45 67" -> "+905321234567")
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+90${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+90${digits}`;
  }
  if (raw.startsWith('+')) {
    return `+${digits}`;
  }
  return raw.trim();
}

/**
 * Books an appointment in a database transaction with overlap conflict prevention.
 */
export async function bookAppointment(params: BookAppointmentParams): Promise<BookingResult> {
  const clinic = await getDefaultClinic();

  if (!params.patientName?.trim()) {
    return { success: false, message: 'Randevu oluşturmak için hasta adı gereklidir.' };
  }

  if (!params.patientPhone?.trim()) {
    return { success: false, message: 'Randevu oluşturmak için telefon numarası gereklidir.' };
  }

  // 1. Resolve Doctor
  let doctor = null;
  if (params.doctorId) {
    doctor = await prisma.doctor.findFirst({
      where: { id: params.doctorId, clinicId: clinic.id },
    });
  }

  if (!doctor && params.doctorName) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId: clinic.id,
        name: { contains: params.doctorName, mode: 'insensitive' },
      },
    });
  }

  if (!doctor && params.specialty) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId: clinic.id,
        specialty: { contains: params.specialty, mode: 'insensitive' },
      },
    });
  }

  if (!doctor) {
    doctor = await prisma.doctor.findFirst({
      where: { clinicId: clinic.id },
    });
  }

  if (!doctor) {
    return { success: false, message: 'Kliniğe ait doktor bulunamadı.' };
  }

  // 2. Parse Date and Time
  let startsAt: Date;
  try {
    if (params.date.includes('T')) {
      startsAt = new Date(params.date);
    } else {
      const [h, m] = params.time.split(':').map(Number);
      const [year, month, day] = params.date.split('-').map(Number);
      startsAt = new Date(year, month - 1, day, h, m, 0);
    }
    if (isNaN(startsAt.getTime())) {
      throw new Error('Invalid date/time');
    }
  } catch {
    return { success: false, message: 'Geçersiz randevu tarihi veya saati belirtildi.' };
  }

  const duration = params.durationMinutes || 30;
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

  // Past check
  if (startsAt.getTime() < Date.now()) {
    return { success: false, message: 'Geçmiş bir saate randevu oluşturulamaz.' };
  }

  const normalizedPhone = normalizePhone(params.patientPhone);

  // 3. Upsert Patient
  const patient = await prisma.patient.upsert({
    where: {
      clinicId_phoneNumber: {
        clinicId: clinic.id,
        phoneNumber: normalizedPhone,
      },
    },
    update: {
      fullName: params.patientName.trim(),
    },
    create: {
      clinicId: clinic.id,
      fullName: params.patientName.trim(),
      phoneNumber: normalizedPhone,
    },
  });

  // Resolve or create callLog if callId provided so createdViaCallId is immediately linked
  let callLogId: string | null = null;
  if (params.callId) {
    const callLog = await prisma.callLog.upsert({
      where: { vapiCallId: params.callId },
      update: {},
      create: {
        clinicId: clinic.id,
        vapiCallId: params.callId,
        summary: 'Devam eden sesli görüşme...',
      },
    });
    callLogId = callLog.id;
  }

  // 4. Transaction: Check conflict and create appointment
  try {
    const createdAppointment = await prisma.$transaction(async (tx) => {
      // Find overlapping appointments
      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId: clinic.id,
          doctorId: doctor.id,
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
          doctorId: doctor.id,
          patientId: patient.id,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
          createdViaCallId: callLogId,
        },
      });
    });

    const dateFormatted = startsAt.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });
    const timeFormatted = `${startsAt.getHours().toString().padStart(2, '0')}:${startsAt.getMinutes().toString().padStart(2, '0')}`;

    const confirmationMsg = `Sayın ${patient.fullName}, ${doctor.name} ile ${dateFormatted} saat ${timeFormatted} için randevunuz başarıyla oluşturuldu.`;

    return {
      success: true,
      appointment: createdAppointment,
      message: confirmationMsg,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_OCCUPIED') {
      return {
        success: false,
        message: 'Seçilen saatte doktorumuzun başka bir randevusu bulunmaktadır. Lütfen müsait olan başka bir saat seçiniz.',
      };
    }
    console.error('[booking] Error booking appointment:', error);
    return {
      success: false,
      message: 'Randevu oluşturulurken sistemsel bir hata meydana geldi.',
    };
  }
}
