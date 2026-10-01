import { z } from 'zod';

import { prisma } from '../../db/client.js';
import { bookAppointment } from '../../scheduling/booking.js';
import { normalizeTimeInput, getDoctorSlotDuration } from '../../scheduling/availability.js';
import { normalizePhone, resolveToolPhone } from '../../phone.js';
import { parseIstanbulDate, formatIstanbulTime } from '../../date-utils.js';

const bookAppointmentSchema = z.object({
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
  useCallerNumber: z.boolean().optional(),
  use_caller_number: z.boolean().optional(),
  doctorName: z.string().optional(),
  doctor_name: z.string().optional(),
  specialty: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
});

/**
 * Tool handler: book_appointment / bookAppointment
 */
export async function handleBookAppointment(
  args: unknown,
  callId?: string,
  clinicId?: string,
  defaultCustomerNumber?: string,
): Promise<string> {
  const parsed = bookAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevu oluşturabilmek için lütfen adınızı, telefon numaranızı, randevu tarihi ve saatini belirtiniz.';
  }

  const {
    patientName,
    patient_name,
    patientPhone,
    patient_phone,
    useCallerNumber,
    use_caller_number,
    doctorName,
    doctor_name,
    specialty,
    date,
    time,
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  const resolvedDate = (date || '').trim();
  const resolvedTime = (time || '').trim();

  if (!resolvedName) {
    return 'Randevu oluşturabilmek için lütfen hastanın adını ve soyadını belirtiniz.';
  }

  const phoneResolution = resolveToolPhone({
    explicitPhone: patientPhone || patient_phone,
    useCallerNumber: useCallerNumber ?? use_caller_number,
    defaultCustomerNumber,
  });

  if (phoneResolution.errorMessage || !phoneResolution.phone) {
    return phoneResolution.errorMessage || 'Randevu kaydı için lütfen telefon numaranızı belirtiniz.';
  }

  if (!clinicId) {
    return 'Şu an işleminizi tamamlayamıyorum, lütfen kliniği doğrudan arayarak sekreterliğe ulaşınız.';
  }

  if (!resolvedDate || !resolvedTime) {
    return 'Lütfen randevu tarihi ve saatini belirtiniz.';
  }

  try {
    const resolvedClinicId = clinicId;
    const normPhone = normalizePhone(phoneResolution.phone);

    // Resolve doctor for repeat call check
    let doctor = null;
    const docName = (doctorName || doctor_name || '').trim();
    const spec = (specialty || '').trim();

    if (docName) {
      doctor = await prisma.doctor.findFirst({
        where: {
          clinicId: resolvedClinicId,
          name: { contains: docName, mode: 'insensitive' },
        },
      });
    }

    if (!doctor && spec) {
      doctor = await prisma.doctor.findFirst({
        where: {
          clinicId: resolvedClinicId,
          specialty: { contains: spec, mode: 'insensitive' },
        },
      });
    }

    if (!doctor) {
      doctor = await prisma.doctor.findFirst({
        where: { clinicId: resolvedClinicId },
      });
    }

    if (doctor) {
      const normTime = normalizeTimeInput(resolvedTime) || resolvedTime;
      const timeFormatted = normTime.length === 5 ? `${normTime}:00` : normTime;
      let startsAt: Date | null = null;
      try {
        if (resolvedDate.includes('T')) {
          startsAt = parseIstanbulDate(resolvedDate);
        } else {
          startsAt = parseIstanbulDate(`${resolvedDate}T${timeFormatted}`);
        }
      } catch {
        startsAt = null;
      }

      if (startsAt && !isNaN(startsAt.getTime())) {
        const duration = getDoctorSlotDuration(doctor);
        const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

        // Check if an active appointment already exists for this doctor and time slot
        const existing = await prisma.appointment.findFirst({
          where: {
            clinicId: resolvedClinicId,
            doctorId: doctor.id,
            status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
            AND: [
              { startsAt: { lt: endsAt } },
              { endsAt: { gt: startsAt } },
            ],
          },
          include: {
            patient: true,
          },
        });

        // If the slot is already booked for this exact same patient phone: idempotency protection
        if (
          existing &&
          existing.patient &&
          normalizePhone(existing.patient.phoneNumber) === normPhone
        ) {
          const dateStr = startsAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
          const timeStr = formatIstanbulTime(startsAt);
          const patientDisplayName = existing.patient.fullName || resolvedName;
          return `Randevu zaten oluşturulmuş: ${patientDisplayName}, ${dateStr} ${timeStr}.`;
        }
      }
    }

    const duration = getDoctorSlotDuration(doctor);
    const result = await bookAppointment({
      clinicId: resolvedClinicId,
      patientName: resolvedName,
      patientPhone: phoneResolution.phone,
      doctorName: doctorName || doctor_name,
      specialty,
      date: resolvedDate,
      time: resolvedTime,
      durationMinutes: duration,
      callId,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] bookAppointment error:', error);
    return 'Randevu oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.';
  }
}

