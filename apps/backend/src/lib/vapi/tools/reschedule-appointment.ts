import { z } from 'zod';

import { rescheduleAppointment } from '../../scheduling/cancellation.js';
import { isValidPhone } from '../../phone.js';

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().optional(),
  appointment_id: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
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
export async function handleRescheduleAppointment(args: unknown, clinicId?: string): Promise<string> {
  const parsed = rescheduleAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevu saatinizi değiştirmek için lütfen telefon numaranızı ve yeni tarih/saati belirtiniz.';
  }

  const {
    appointmentId,
    appointment_id,
    patientPhone,
    patient_phone,
    newDate,
    new_date,
    date,
    newTime,
    new_time,
    time,
  } = parsed.data;

  const phone = (patientPhone || patient_phone || '').trim();
  if (!phone) {
    return 'Randevu saatinizi değiştirmek için lütfen telefon numaranızı belirtiniz.';
  }

  if (!isValidPhone(phone)) {
    return 'Randevu saati değişikliği için belirttiğiniz telefon numarası geçersizdir. Lütfen başında sıfır ile cep telefonu numaranızı söyleyiniz.';
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
      patientPhone: phone,
      newDate: targetDate,
      newTime: targetTime,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] rescheduleAppointment error:', error);
    return 'Randevu saati güncellenirken bir hata oluştu.';
  }
}
