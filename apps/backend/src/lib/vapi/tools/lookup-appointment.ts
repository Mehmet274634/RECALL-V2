import { z } from 'zod';

import { lookupAppointment } from '../../scheduling/lookup.js';
import { isValidPhone } from '../../phone.js';

const lookupAppointmentSchema = z.object({
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
});

/**
 * Tool handler: lookup_appointment / lookupAppointment
 */
export async function handleLookupAppointment(args: unknown, clinicId?: string): Promise<string> {
  const parsed = lookupAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.';
  }

  const { patientPhone, patient_phone } = parsed.data;
  const resolvedPhone = (patientPhone || patient_phone || '').trim();

  if (!resolvedPhone) {
    return 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.';
  }

  if (!isValidPhone(resolvedPhone)) {
    return 'Belirttiğiniz telefon numarası geçersizdir. Lütfen geçerli bir telefon numarası belirtiniz (örneğin: 0532 123 45 67).';
  }

  try {
    const result = await lookupAppointment({
      clinicId,
      patientPhone: resolvedPhone,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] lookupAppointment error:', error);
    return 'Randevu bilgileri sorgulanırken bir hata oluştu.';
  }
}
