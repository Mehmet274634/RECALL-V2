import { z } from 'zod';

import { cancelAppointment } from '../../scheduling/cancellation.js';
import { validateAndFormatTurkishPhone } from '../../phone.js';

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().optional(),
  appointment_id: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
});

/**
 * Tool handler: cancel_appointment / cancelAppointment
 */
export async function handleCancelAppointment(
  args: unknown,
  clinicId?: string,
  defaultCustomerNumber?: string,
): Promise<string> {
  const parsed = cancelAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevu iptali için lütfen telefon numaranızı belirtiniz.';
  }

  const {
    appointmentId,
    appointment_id,
    patientPhone,
    patient_phone,
  } = parsed.data;

  const explicitPhone = (patientPhone || patient_phone || '').trim();
  const candidatePhone = explicitPhone || (defaultCustomerNumber || '').trim();
  if (!candidatePhone) {
    return 'Randevu iptali için lütfen telefon numaranızı belirtiniz.';
  }

  const phoneValidation = validateAndFormatTurkishPhone(candidatePhone);
  if (!phoneValidation.isValid || !phoneValidation.formattedPhone) {
    return 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.';
  }

  try {
    const result = await cancelAppointment({
      clinicId,
      appointmentId: appointmentId || appointment_id,
      patientPhone: phoneValidation.formattedPhone,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] cancelAppointment error:', error);
    return 'Randevu iptal edilirken bir hata oluştu.';
  }
}
