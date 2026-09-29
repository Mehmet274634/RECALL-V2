import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import { normalizePhone, isValidPhone } from '../phone.js';
import { formatIstanbulTime, formatIstanbulDate } from '../date-utils.js';

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
 * Look up existing appointments for a patient strictly by verified phone number.
 */
export async function lookupAppointment(params: LookupAppointmentParams): Promise<LookupResult> {
  const clinicId = params.clinicId || (await getDefaultClinic()).id;

  if (!params.patientPhone) {
    return {
      success: false,
      appointments: [],
      message: 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.',
    };
  }

  if (!isValidPhone(params.patientPhone)) {
    return {
      success: false,
      appointments: [],
      message: 'Geçersiz telefon numarası. Lütfen geçerli bir telefon numarası belirtiniz (örn: 0532 123 45 67).',
    };
  }

  // Find patient strictly by normalized phone number (no name fallback for patient privacy)
  const normPhone = normalizePhone(params.patientPhone);
  const patient = await prisma.patient.findFirst({
    where: {
      clinicId,
      phoneNumber: normPhone,
    },
  });

  if (!patient) {
    return {
      success: false,
      appointments: [],
      message: 'Belirttiğiniz telefon numarasıyla kayıtlı bir hasta veya randevu bulunamadı.',
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
  const dateFormatted = formatIstanbulDate(first.startsAt, { weekday: 'long' });
  const timeFormatted = formatIstanbulTime(first.startsAt);

  const message = `Sayın ${patient.fullName}, ${first.doctor.name} ile ${dateFormatted} saat ${timeFormatted}'de randevunuz bulunmaktadır.`;

  return {
    success: true,
    appointments: mapped,
    message,
  };
}
