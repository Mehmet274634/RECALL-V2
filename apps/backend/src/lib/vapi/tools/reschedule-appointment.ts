import { z } from 'zod';

import { rescheduleAppointment } from '../../scheduling/cancellation.js';
import { resolveToolPhone } from '../../phone.js';

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().optional(),
  appointment_id: z.string().optional(),
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
  useCallerNumber: z.boolean().optional(),
  use_caller_number: z.boolean().optional(),
  newDate: z.string().optional(),
  new_date: z.string().optional(),
  date: z.string().optional(),
  newTime: z.string().optional(),
  new_time: z.string().optional(),
  time: z.string().optional(),
});

/**
 * Tool handler: reschedule_appointment / rescheduleAppointment
 */
export async function handleRescheduleAppointment(
  args: unknown,
  clinicId?: string,
  defaultCustomerNumber?: string,
): Promise<string> {
  if (!clinicId) {
    return 'Şu an işleminizi tamamlayamıyorum, lütfen kliniği doğrudan arayarak sekreterliğe ulaşınız.';
  }

  const parsed = rescheduleAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevu saatinizi değiştirmek için lütfen adınızı, telefon numaranızı ve yeni tarih/saati belirtiniz.';
  }

  const {
    appointmentId,
    appointment_id,
    patientName,
    patient_name,
    patientPhone,
    patient_phone,
    useCallerNumber,
    use_caller_number,
    newDate,
    new_date,
    date,
    newTime,
    new_time,
    time,
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  if (!resolvedName) {
    return 'Randevu saatinizi değiştirmek için lütfen adınızı ve soyadınızı belirtiniz.';
  }

  const phoneResolution = resolveToolPhone({
    explicitPhone: patientPhone || patient_phone,
    useCallerNumber: useCallerNumber ?? use_caller_number,
    defaultCustomerNumber,
  });

  if (phoneResolution.errorMessage || !phoneResolution.phone) {
    return phoneResolution.errorMessage || 'Randevu saatinizi değiştirmek için lütfen telefon numaranızı belirtiniz.';
  }

  const targetDate = newDate || new_date || date;
  const targetTime = newTime || new_time || time;

  if (!targetDate || !targetTime) {
    return 'Lütfen randevunuzu taşımak istediğiniz yeni tarih ve saati belirtiniz.';
  }

  try {
    const result = await rescheduleAppointment({
      clinicId,
      appointmentId: appointmentId || appointment_id,
      patientName: resolvedName,
      patientPhone: phoneResolution.phone,
      newDate: targetDate,
      newTime: targetTime,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] rescheduleAppointment error:', error);
    return 'Randevu saati güncellenirken bir hata oluştu.';
  }
}

