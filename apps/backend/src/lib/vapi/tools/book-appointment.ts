import { z } from 'zod';

import { bookAppointment } from '../../scheduling/booking.js';
import { isValidPhone } from '../../phone.js';

const bookAppointmentSchema = z.object({
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
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
    doctorName,
    doctor_name,
    specialty,
    date,
    time,
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  const resolvedPhone = (patientPhone || patient_phone || '').trim();
  const resolvedDate = (date || '').trim();
  const resolvedTime = (time || '').trim();

  if (!resolvedName) {
    return 'Randevu oluşturabilmek için lütfen hastanın adını ve soyadını belirtiniz.';
  }

  if (!resolvedPhone) {
    return 'Randevu kaydı için lütfen telefon numaranızı belirtiniz.';
  }

  if (!isValidPhone(resolvedPhone)) {
    return 'Belirttiğiniz telefon numarası geçersizdir. Lütfen geçerli bir cep telefonu numaranızı belirtiniz (örneğin: 0532 123 45 67).';
  }

  if (!resolvedDate || !resolvedTime) {
    return 'Lütfen randevu tarihi ve saatini belirtiniz.';
  }

  try {
    const result = await bookAppointment({
      clinicId,
      patientName: resolvedName,
      patientPhone: resolvedPhone,
      doctorName: doctorName || doctor_name,
      specialty,
      date: resolvedDate,
      time: resolvedTime,
      callId,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] bookAppointment error:', error);
    return 'Randevu oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.';
  }
}
