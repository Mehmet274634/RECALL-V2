import { z } from 'zod';

import { cancelAppointment } from '../../scheduling/cancellation.js';
import { resolveToolPhone } from '../../phone.js';

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().optional(),
  appointment_id: z.string().optional(),
  patientName: z.string().optional(),
  patient_name: z.string().optional(),
  patientPhone: z.string().optional(),
  patient_phone: z.string().optional(),
  useCallerNumber: z.boolean().optional(),
  use_caller_number: z.boolean().optional(),
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
    return 'Randevu iptali için lütfen adınızı, soyadınızı ve telefon numaranızı belirtiniz.';
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
  } = parsed.data;

  const resolvedName = (patientName || patient_name || '').trim();
  if (!resolvedName) {
    return 'Randevu iptali için lütfen adınızı ve soyadınızı belirtiniz.';
  }

  const phoneResolution = resolveToolPhone({
    explicitPhone: patientPhone || patient_phone,
    useCallerNumber: useCallerNumber ?? use_caller_number,
    defaultCustomerNumber,
  });

  if (phoneResolution.errorMessage || !phoneResolution.phone) {
    return phoneResolution.errorMessage || 'Randevu iptali için lütfen telefon numaranızı belirtiniz.';
  }

  try {
    const result = await cancelAppointment({
      clinicId,
      appointmentId: appointmentId || appointment_id,
      patientName: resolvedName,
      patientPhone: phoneResolution.phone,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] cancelAppointment error:', error);
    return 'Randevu iptal edilirken bir hata oluştu.';
  }
}

