import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import { normalizePhone } from './booking.js';

export interface CancelAppointmentParams {
  appointmentId?: string;
  patientPhone?: string;
  patientName?: string;
}

export interface RescheduleAppointmentParams {
  appointmentId?: string;
  patientPhone?: string;
  patientName?: string;
  newDate: string; // YYYY-MM-DD
  newTime: string; // HH:mm
}

export interface ModificationResult {
  success: boolean;
  message: string;
}

/**
 * Cancels an existing scheduled appointment.
 */
export async function cancelAppointment(params: CancelAppointmentParams): Promise<ModificationResult> {
  const clinic = await getDefaultClinic();

  let appointment = null;

  if (params.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, clinicId: clinic.id, status: 'SCHEDULED' },
      include: { doctor: true, patient: true },
    });
  }

  if (!appointment && params.patientPhone) {
    const normPhone = normalizePhone(params.patientPhone);
    const patient = await prisma.patient.findFirst({
      where: { clinicId: clinic.id, phoneNumber: normPhone },
    });
    if (patient) {
      appointment = await prisma.appointment.findFirst({
        where: { clinicId: clinic.id, patientId: patient.id, status: 'SCHEDULED' },
        include: { doctor: true, patient: true },
        orderBy: { startsAt: 'asc' },
      });
    }
  }

  if (!appointment && params.patientName) {
    const patient = await prisma.patient.findFirst({
      where: { clinicId: clinic.id, fullName: { contains: params.patientName, mode: 'insensitive' } },
    });
    if (patient) {
      appointment = await prisma.appointment.findFirst({
        where: { clinicId: clinic.id, patientId: patient.id, status: 'SCHEDULED' },
        include: { doctor: true, patient: true },
        orderBy: { startsAt: 'asc' },
      });
    }
  }

  if (!appointment) {
    return {
      success: false,
      message: 'İptal edilecek aktif bir randevu bulunamadı.',
    };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  const dateFormatted = appointment.startsAt.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
  });
  const timeFormatted = `${appointment.startsAt.getHours().toString().padStart(2, '0')}:${appointment.startsAt.getMinutes().toString().padStart(2, '0')}`;

  return {
    success: true,
    message: `Sayın ${appointment.patient.fullName}, ${appointment.doctor.name} ile ${dateFormatted} saat ${timeFormatted}'deki randevunuz başarıyla iptal edilmiştir.`,
  };
}

/**
 * Reschedules an existing scheduled appointment to a new date and time.
 */
export async function rescheduleAppointment(params: RescheduleAppointmentParams): Promise<ModificationResult> {
  const clinic = await getDefaultClinic();

  let appointment = null;

  if (params.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, clinicId: clinic.id, status: 'SCHEDULED' },
      include: { doctor: true, patient: true },
    });
  }

  if (!appointment && params.patientPhone) {
    const normPhone = normalizePhone(params.patientPhone);
    const patient = await prisma.patient.findFirst({
      where: { clinicId: clinic.id, phoneNumber: normPhone },
    });
    if (patient) {
      appointment = await prisma.appointment.findFirst({
        where: { clinicId: clinic.id, patientId: patient.id, status: 'SCHEDULED' },
        include: { doctor: true, patient: true },
        orderBy: { startsAt: 'asc' },
      });
    }
  }

  if (!appointment) {
    return {
      success: false,
      message: 'Değiştirilecek aktif bir randevu bulunamadı.',
    };
  }

  // Parse new date and time
  let newStartsAt: Date;
  try {
    const [h, m] = params.newTime.split(':').map(Number);
    const [year, month, day] = params.newDate.split('-').map(Number);
    newStartsAt = new Date(year, month - 1, day, h, m, 0);
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

  // Conflict check in transaction
  try {
    await prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          clinicId: clinic.id,
          doctorId: appointment.doctorId,
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
          startsAt: newStartsAt,
          endsAt: newEndsAt,
        },
      });
    });

    const dateFormatted = newStartsAt.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });
    const timeFormatted = `${newStartsAt.getHours().toString().padStart(2, '0')}:${newStartsAt.getMinutes().toString().padStart(2, '0')}`;

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
