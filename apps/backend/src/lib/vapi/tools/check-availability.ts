import { z } from 'zod';

import { checkAvailability } from '../../scheduling/availability.js';

const checkAvailabilitySchema = z.object({
  doctorName: z.string().optional(),
  doctor_name: z.string().optional(),
  specialty: z.string().optional(),
  branch: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
});

/**
 * Tool handler: check_availability / checkAvailability
 */
export async function handleCheckAvailability(args: unknown, clinicId?: string): Promise<string> {
  const parsed = checkAvailabilitySchema.safeParse(args || {});
  if (!parsed.success) {
    return 'Lütfen randevu almak istediğiniz tarihi veya doktor branşını belirtiniz.';
  }

  const { doctorName, doctor_name, specialty, branch, date, time } = parsed.data;

  try {
    const result = await checkAvailability({
      clinicId,
      doctorName: doctorName || doctor_name,
      specialty: specialty || branch,
      date,
      time,
    });
    return result.message;
  } catch (error) {
    console.error('[vapi-tool] checkAvailability error:', error);
    return 'Müsaitlik durumu kontrol edilirken bir hata oluştu. Lütfen tekrar deneyiniz.';
  }
}
