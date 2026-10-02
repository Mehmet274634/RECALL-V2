import { prisma } from '../db/client.js';

import type { Appointment } from '@prisma/client';

export { normalizePhone, isValidPhone } from '../phone.js';
import { normalizePhone, isValidPhone } from '../phone.js';
import { parseIstanbulDate, formatIstanbulTime, formatIstanbulDate } from '../date-utils.js';
import { checkAvailability, getDoctorSlotDuration } from './availability.js';

export interface BookAppointmentParams {
  clinicId: string;
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
 * Books an appointment in a database transaction with overlap conflict prevention.
 * clinicId is strictly required. Throws if missing.
 */
export async function bookAppointment(params: BookAppointmentParams): Promise<BookingResult> {
  const clinicId = params.clinicId?.trim();
  if (!clinicId) {
    throw new Error('clinicId is required for bookAppointment');
  }

  if (!params.patientName?.trim()) {
    return { success: false, message: 'Randevu oluşturmak için hasta adı gereklidir.' };
  }

  if (!params.patientPhone?.trim()) {
    return { success: false, message: 'Randevu oluşturmak için telefon numarası gereklidir.' };
  }

  if (!isValidPhone(params.patientPhone)) {
    return {
      success: false,
      message: 'Geçersiz telefon numarası. Lütfen geçerli bir telefon numarası belirtiniz (örn: 0532 123 45 67).',
    };
  }

  // 1. Resolve Doctor
  let doctor = null;
  if (params.doctorId) {
    doctor = await prisma.doctor.findFirst({
      where: { id: params.doctorId, clinicId },
    });
    if (!doctor) {
      return { success: false, message: 'Belirtilen doktor bu kliniğe ait değil veya bulunamadı.' };
    }
  }

  if (!doctor && params.doctorName) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId,
        name: { contains: params.doctorName, mode: 'insensitive' },
      },
    });
    if (!doctor && !params.specialty) {
      return { success: false, message: `Kliniğimizde "${params.doctorName}" isimli hekim bulunamadı.` };
    }
  }

  if (!doctor && params.specialty) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId,
        specialty: { contains: params.specialty, mode: 'insensitive' },
      },
    });
  }

  if (!doctor) {
    doctor = await prisma.doctor.findFirst({
      where: { clinicId },
    });
  }

  if (!doctor) {
    return { success: false, message: 'Kliniğe ait doktor bulunamadı.' };
  }

  // 2. Parse Date and Time
  let startsAt: Date;
  try {
    if (params.date.includes('T')) {
      startsAt = parseIstanbulDate(params.date);
    } else {
      const timeFormatted = params.time.trim().length === 5 ? `${params.time.trim()}:00` : params.time.trim();
      startsAt = parseIstanbulDate(`${params.date.trim()}T${timeFormatted}`);
    }
    if (isNaN(startsAt.getTime())) {
      throw new Error('Invalid date/time');
    }
  } catch {
    return { success: false, message: 'Geçersiz randevu tarihi veya saati belirtildi.' };
  }

  const doctorSlotDuration = getDoctorSlotDuration(doctor);
  const duration = params.durationMinutes && params.durationMinutes > 0
    ? params.durationMinutes
    : doctorSlotDuration;
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
        clinicId,
        phoneNumber: normalizedPhone,
      },
    },
    update: {
      fullName: params.patientName.trim(),
    },
    create: {
      clinicId,
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
        clinicId,
        vapiCallId: params.callId,
        summary: 'Devam eden sesli görüşme...',
      },
    });
    callLogId = callLog.id;
  }

  // 4. Transaction: Check conflict and create appointment with row-level lock
  try {
    const createdAppointment = await prisma.$transaction(async (tx) => {
      // Row-level lock on doctor record to serialize concurrent booking attempts for this doctor
      await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${doctor.id} FOR UPDATE`;

      // Find overlapping appointments
      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId,
          doctorId: doctor.id,
          status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
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
          clinicId,
          doctorId: doctor.id,
          patientId: patient.id,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
          createdViaCallId: callLogId,
        },
      });
    });

    const dateFormatted = formatIstanbulDate(startsAt, { weekday: 'long' });
    const timeFormatted = formatIstanbulTime(startsAt);

    const confirmationMsg = `Sayın ${patient.fullName}, ${doctor.name} ile ${dateFormatted} saat ${timeFormatted} için randevunuz başarıyla oluşturuldu.`;

    return {
      success: true,
      appointment: createdAppointment,
      message: confirmationMsg,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_OCCUPIED') {
      let conflictMsg =
        'Seçilen saatte doktorumuzun başka bir randevusu bulunmaktadır. Lütfen müsait olan başka bir saat seçiniz.';
      try {
        const dateOnly = params.date.includes('T') ? params.date.split('T')[0] : params.date.trim();
        const avail = await checkAvailability({
          clinicId,
          doctorId: doctor.id,
          date: dateOnly,
        });
        if (avail.success && avail.availableSlots && avail.availableSlots.length > 0) {
          const sample = avail.availableSlots.slice(0, 3).join(', ');
          conflictMsg = `Seçilen saatte doktorumuzun başka bir randevusu bulunmaktadır. Müsait alternatif saatler: ${sample}. Bu saatlerden birini tercih edebilir misiniz?`;
        }
      } catch {
        // Fallback to standard conflict message if availability calculation encounters an issue
      }

      return {
        success: false,
        message: conflictMsg,
      };
    }
    console.error('[booking] Error booking appointment:', error);
    return {
      success: false,
      message: 'Randevu oluşturulurken sistemsel bir hata meydana geldi.',
    };
  }
}
