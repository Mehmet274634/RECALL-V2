import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import { normalizePhone, isValidPhone, isTurkishNameMatch } from '../phone.js';
import { parseIstanbulDate, formatIstanbulTime, formatIstanbulDate } from '../date-utils.js';

export interface CancelAppointmentParams {
  clinicId?: string;
  appointmentId?: string;
  patientPhone?: string;
  patientName?: string;
}

export interface RescheduleAppointmentParams {
  clinicId?: string;
  appointmentId?: string;
  patientPhone?: string;
  patientName?: string;
  newDoctorId?: string;
  newDate: string; // YYYY-MM-DD
  newTime: string; // HH:mm
}

export interface ModificationResult {
  success: boolean;
  message: string;
}

/**
 * Cancels an existing scheduled appointment strictly by appointmentId or verified patient phone + patientName.
 * Checks clinic cancellationPolicyHours: rejects if startsAt - now < policyHours.
 */
export async function cancelAppointment(params: CancelAppointmentParams): Promise<ModificationResult> {
  const clinic = params.clinicId
    ? await prisma.clinic.findUnique({ where: { id: params.clinicId } })
    : await getDefaultClinic();
  const resolvedClinicId = clinic?.id || (await getDefaultClinic()).id;
  const policyHours = clinic?.cancellationPolicyHours ?? 2;

  if (!params.patientName || !params.patientName.trim()) {
    return {
      success: false,
      message: 'Randevunuzu iptal edebilmek için lütfen adınızı ve soyadınızı belirtiniz.',
    };
  }

  if (!params.patientPhone) {
    return {
      success: false,
      message: 'Randevunuzu iptal edebilmek için lütfen telefon numaranızı belirtiniz.',
    };
  }

  if (!isValidPhone(params.patientPhone)) {
    return {
      success: false,
      message: 'Geçersiz telefon numarası. Lütfen geçerli bir telefon numarası belirtiniz (örn: 0532 123 45 67).',
    };
  }

  const normPhone = normalizePhone(params.patientPhone);
  let appointment = null;

  if (params.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: {
        id: params.appointmentId,
        clinicId: resolvedClinicId,
        status: 'SCHEDULED',
        patient: { phoneNumber: normPhone },
      },
      include: { doctor: true, patient: true },
    });

    if (!appointment || !isTurkishNameMatch(appointment.patient.fullName, params.patientName)) {
      return {
        success: false,
        message: 'Bu bilgilerle kayıtlı randevu bulunamadı.',
      };
    }
  } else {
    const patient = await prisma.patient.findFirst({
      where: { clinicId: resolvedClinicId, phoneNumber: normPhone },
    });
    if (patient && isTurkishNameMatch(patient.fullName, params.patientName)) {
      appointment = await prisma.appointment.findFirst({
        where: { clinicId: resolvedClinicId, patientId: patient.id, status: 'SCHEDULED' },
        include: { doctor: true, patient: true },
        orderBy: { startsAt: 'asc' },
      });
    }
  }

  if (!appointment) {
    return {
      success: false,
      message: 'Bu bilgilerle kayıtlı randevu bulunamadı.',
    };
  }

  // Check cancellation policy hours (tam N saat kala kabul, altı ret, geçmiş randevu ret)
  const diffMs = appointment.startsAt.getTime() - Date.now();
  const policyMs = policyHours * 60 * 60 * 1000;
  if (diffMs < policyMs) {
    return {
      success: false,
      message: `Randevuya ${policyHours} saatten az kaldığı için online iptal/değişiklik yapılamıyor. Sizi yetkili sekreterimize aktarabilirim.`,
    };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  const dateFormatted = formatIstanbulDate(appointment.startsAt);
  const timeFormatted = formatIstanbulTime(appointment.startsAt);

  return {
    success: true,
    message: `Sayın ${appointment.patient.fullName}, ${appointment.doctor.name} ile ${dateFormatted} saat ${timeFormatted}'deki randevunuz başarıyla iptal edilmiştir.`,
  };
}

/**
 * Reschedules an existing scheduled appointment to a new date and time.
 * Enforces cancellationPolicyHours on the OLD appointment.
 */
export async function rescheduleAppointment(params: RescheduleAppointmentParams): Promise<ModificationResult> {
  const clinic = params.clinicId
    ? await prisma.clinic.findUnique({ where: { id: params.clinicId } })
    : await getDefaultClinic();
  const resolvedClinicId = clinic?.id || (await getDefaultClinic()).id;
  const policyHours = clinic?.cancellationPolicyHours ?? 2;

  if (!params.patientName || !params.patientName.trim()) {
    return {
      success: false,
      message: 'Randevu saatinizi değiştirmek için lütfen adınızı ve soyadınızı belirtiniz.',
    };
  }

  if (!params.patientPhone) {
    return {
      success: false,
      message: 'Randevu saatinizi değiştirmek için lütfen telefon numaranızı belirtiniz.',
    };
  }

  if (!isValidPhone(params.patientPhone)) {
    return {
      success: false,
      message: 'Geçersiz telefon numarası. Lütfen geçerli bir telefon numarası belirtiniz (örn: 0532 123 45 67).',
    };
  }

  const normPhone = normalizePhone(params.patientPhone);
  let appointment = null;

  if (params.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: {
        id: params.appointmentId,
        clinicId: resolvedClinicId,
        status: 'SCHEDULED',
        patient: { phoneNumber: normPhone },
      },
      include: { doctor: true, patient: true },
    });

    if (!appointment || !isTurkishNameMatch(appointment.patient.fullName, params.patientName)) {
      return {
        success: false,
        message: 'Bu bilgilerle kayıtlı randevu bulunamadı.',
      };
    }
  } else {
    const patient = await prisma.patient.findFirst({
      where: { clinicId: resolvedClinicId, phoneNumber: normPhone },
    });
    if (patient && isTurkishNameMatch(patient.fullName, params.patientName)) {
      appointment = await prisma.appointment.findFirst({
        where: { clinicId: resolvedClinicId, patientId: patient.id, status: 'SCHEDULED' },
        include: { doctor: true, patient: true },
        orderBy: { startsAt: 'asc' },
      });
    }
  }

  if (!appointment) {
    return {
      success: false,
      message: 'Bu bilgilerle kayıtlı randevu bulunamadı.',
    };
  }

  // Check cancellation policy hours on the OLD appointment startsAt
  const diffMs = appointment.startsAt.getTime() - Date.now();
  const policyMs = policyHours * 60 * 60 * 1000;
  if (diffMs < policyMs) {
    return {
      success: false,
      message: `Randevuya ${policyHours} saatten az kaldığı için online iptal/değişiklik yapılamıyor. Sizi yetkili sekreterimize aktarabilirim.`,
    };
  }

  // Parse new date and time
  let newStartsAt: Date;
  try {
    const timeFormatted = params.newTime.trim().length === 5 ? `${params.newTime.trim()}:00` : params.newTime.trim();
    newStartsAt = parseIstanbulDate(`${params.newDate.trim()}T${timeFormatted}`);
    if (isNaN(newStartsAt.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    return {
      success: false,
      message: 'Lütfen geçerli bir yeni randevu tarihi ve saati belirtiniz.',
    };
  }

  const durationMs = appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const newEndsAt = new Date(newStartsAt.getTime() + durationMs);

  if (newStartsAt.getTime() < Date.now()) {
    return {
      success: false,
      message: 'Randevunuz geçmiş bir tarihe veya saate alınamaz.',
    };
  }

  const targetDoctorId = params.newDoctorId || appointment.doctorId;

  // Conflict check in transaction with deadlock-free sorted row-level locks on doctors
  try {
    await prisma.$transaction(async (tx) => {
      // Sort involved doctor IDs to guarantee deadlock freedom (no cyclic lock waits)
      const doctorIdsToLock = Array.from(new Set([appointment.doctorId, targetDoctorId])).sort();
      for (const docId of doctorIdsToLock) {
        await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${docId} FOR UPDATE`;
      }

      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId: resolvedClinicId,
          doctorId: targetDoctorId,
          status: 'SCHEDULED',
          id: { not: appointment.id },
          AND: [
            { startsAt: { lt: newEndsAt } },
            { endsAt: { gt: newStartsAt } },
          ],
        },
      });

      if (conflict) {
        throw new Error('SLOT_OCCUPIED');
      }

      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          doctorId: targetDoctorId,
          startsAt: newStartsAt,
          endsAt: newEndsAt,
        },
      });
    });

    const dateFormatted = formatIstanbulDate(newStartsAt, { weekday: 'long' });
    const timeFormatted = formatIstanbulTime(newStartsAt);

    return {
      success: true,
      message: `Sayın ${appointment.patient.fullName}, randevunuz ${dateFormatted} saat ${timeFormatted} olarak güncellenmiştir.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_OCCUPIED') {
      return {
        success: false,
        message: 'Seçtiğiniz yeni saatte doktorumuzun başka bir randevusu bulunmaktadır. Lütfen farklı bir saat seçiniz.',
      };
    }
    return {
      success: false,
      message: 'Randevu güncellenirken bir hata oluştu.',
    };
  }
}

