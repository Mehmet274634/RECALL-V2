import { z } from 'zod';

import { bookAppointment } from '../../scheduling/booking.js';
import { validateAndFormatTurkishPhone } from '../../phone.js';

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
    doctorName,
    doctor_name,
    specialty,
    date,
    time,
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  const explicitPhone = (patientPhone || patient_phone || '').trim();
  const candidatePhone = explicitPhone || (defaultCustomerNumber || '').trim();
  const resolvedDate = (date || '').trim();
  const resolvedTime = (time || '').trim();

  if (!resolvedName) {
    return 'Randevu oluşturabilmek için lütfen hastanın adını ve soyadını belirtiniz.';
  }

  if (!candidatePhone) {
    return 'Randevu kaydı için lütfen telefon numaranızı belirtiniz.';
  }

  const phoneValidation = validateAndFormatTurkishPhone(candidatePhone);
  if (!phoneValidation.isValid || !phoneValidation.formattedPhone) {
    return 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.';
  }

  if (!resolvedDate || !resolvedTime) {
    return 'Lütfen randevu tarihi ve saatini belirtiniz.';
  }

  try {
    const result = await bookAppointment({
      clinicId,
      patientName: resolvedName,
      patientPhone: phoneValidation.formattedPhone,
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
