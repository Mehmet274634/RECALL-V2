import { z } from 'zod';

import { lookupAppointment } from '../../scheduling/lookup.js';
import { validateAndFormatTurkishPhone } from '../../phone.js';

const lookupAppointmentSchema = z.object({
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
});

/**
 * Tool handler: lookup_appointment / lookupAppointment
 */
export async function handleLookupAppointment(
  args: unknown,
  clinicId?: string,
  defaultCustomerNumber?: string,
): Promise<string> {
  const parsed = lookupAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.';
  }

  const { patientPhone, patient_phone } = parsed.data;
  const explicitPhone = (patientPhone || patient_phone || '').trim();
  const candidatePhone = explicitPhone || (defaultCustomerNumber || '').trim();

  if (!candidatePhone) {
    return 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.';
  }

  const phoneValidation = validateAndFormatTurkishPhone(candidatePhone);
  if (!phoneValidation.isValid || !phoneValidation.formattedPhone) {
    return 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.';
  }

  try {
    const result = await lookupAppointment({
      clinicId,
      patientPhone: phoneValidation.formattedPhone,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] lookupAppointment error:', error);
    return 'Randevu bilgileri sorgulanırken bir hata oluştu.';
  }
}
