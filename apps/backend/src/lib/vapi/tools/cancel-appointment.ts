import { z } from 'zod';

import { cancelAppointment } from '../../scheduling/cancellation.js';
import { isValidPhone } from '../../phone.js';

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().optional(),
  appointment_id: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
});

/**
 * Tool handler: cancel_appointment / cancelAppointment
 */
export async function handleCancelAppointment(args: unknown, clinicId?: string): Promise<string> {
  const parsed = cancelAppointmentSchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Randevu iptali için lütfen telefon numaranızı veya randevu bilginizi belirtiniz.';
  }

  const {
    appointmentId,
    appointment_id,
    patientPhone,
    patient_phone,
    patientName,
    patient_name,
  } = parsed.data;

  const phone = (patientPhone || patient_phone || '').trim();
  if (phone && !isValidPhone(phone)) {
    return 'İptal işlemi için belirttiğiniz telefon numarası geçersizdir. Lütfen başında sıfır ile cep telefonu numaranızı söyleyiniz.';
  }

  try {
    const result = await cancelAppointment({
      clinicId,
      appointmentId: appointmentId || appointment_id,
      patientPhone: patientPhone || patient_phone,
      patientName: patientName || patient_name,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] cancelAppointment error:', error);
    return 'Randevu iptal edilirken bir hata oluştu.';
  }
}
