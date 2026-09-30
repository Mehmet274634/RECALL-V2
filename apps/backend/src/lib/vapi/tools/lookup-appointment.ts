import { z } from 'zod';

import { lookupAppointment } from '../../scheduling/lookup.js';
import { resolveToolPhone } from '../../phone.js';

const lookupAppointmentSchema = z.object({
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
  useCallerNumber: z.boolean().optional(),
  use_caller_number: z.boolean().optional(),
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
    return 'Randevunuzu sorgulayabilmek için lütfen adınızı, soyadınızı ve telefon numaranızı belirtiniz.';
  }

  const {
    patientName,
    patient_name,
    patientPhone,
    patient_phone,
    useCallerNumber,
    use_caller_number,
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  if (!resolvedName) {
    return 'Randevunuzu sorgulayabilmek için lütfen adınızı ve soyadınızı belirtiniz.';
  }

  const phoneResolution = resolveToolPhone({
    explicitPhone: patientPhone || patient_phone,
    useCallerNumber: useCallerNumber ?? use_caller_number,
    defaultCustomerNumber,
  });

  if (phoneResolution.errorMessage || !phoneResolution.phone) {
    return phoneResolution.errorMessage || 'Randevunuzu sorgulayabilmek için lütfen telefon numaranızı belirtiniz.';
  }

  try {
    const result = await lookupAppointment({
      clinicId,
      patientName: resolvedName,
      patientPhone: phoneResolution.phone,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] lookupAppointment error:', error);
    return 'Randevu bilgileri sorgulanırken bir hata oluştu.';
  }
}

