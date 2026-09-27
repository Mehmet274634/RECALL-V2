import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import { normalizePhone, isValidPhone } from '../phone.js';

export interface LookupAppointmentParams {
  clinicId?: string;
  patientPhone?: string;
  patientName?: string;
}

export interface LookupResult {
  success: boolean;
  appointments: Array<{
    id: string;
    doctorName: string;
    specialty: string | null;
    patientName: string;
    startsAt: string;
    endsAt: string;
    status: string;
  }>;
  message: string;
}

/**
 * Look up existing appointments for a patient.
 */
export async function lookupAppointment(params: LookupAppointmentParams): Promise<LookupResult> {
  const clinicId = params.clinicId || (await getDefaultClinic()).id;

  if (!params.patientPhone && !params.patientName) {
    return {
      success: false,
      appointments: [],
      message: 'Randevu sorgulamak için lütfen telefon numaranızı veya adınızı belirtiniz.',
    };
  }

  if (params.patientPhone && !isValidPhone(params.patientPhone)) {
    return {
      success: false,
      appointments: [],
      message: 'Geçersiz telefon numarası. Lütfen geçerli bir telefon numarası belirtiniz (örn: 0532 123 45 67).',
    };
  }

  // Find patient
  let patient = null;
  if (params.patientPhone) {
    const normPhone = normalizePhone(params.patientPhone);
    patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        phoneNumber: normPhone,
      },
    });
  }

  if (!patient && params.patientName) {
    patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        fullName: { contains: params.patientName, mode: 'insensitive' },
      },
    });
  }

  if (!patient) {
    return {
      success: false,
      appointments: [],
      message: 'Belirttiğiniz bilgilerle kayıtlı bir hasta veya randevu bulunamadı.',
    };
  }

  // Query appointments
  const appts = await prisma.appointment.findMany({
    where: {
      clinicId,
      patientId: patient.id,
      status: 'SCHEDULED',
      startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // current or future
    },
    include: {
      doctor: true,
      patient: true,
    },
    orderBy: { startsAt: 'asc' },
  });

  if (appts.length === 0) {
    return {
      success: true,
      appointments: [],
      message: `Sayın ${patient.fullName}, adınıza kayıtlı yaklaşan bir aktif randevu bulunmamaktadır.`,
    };
  }

  const mapped = appts.map((a) => ({
    id: a.id,
    doctorName: a.doctor.name,
    specialty: a.doctor.specialty,
    patientName: a.patient.fullName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
  }));

  const first = appts[0];
  const dateFormatted = first.startsAt.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  const timeFormatted = `${first.startsAt.getHours().toString().padStart(2, '0')}:${first.startsAt.getMinutes().toString().padStart(2, '0')}`;

  const message = `Sayın ${patient.fullName}, ${first.doctor.name} ile ${dateFormatted} saat ${timeFormatted}'de randevunuz bulunmaktadır.`;

  return {
    success: true,
    appointments: mapped,
    message,
  };
}
