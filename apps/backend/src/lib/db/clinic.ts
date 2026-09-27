import { prisma } from './client.js';

import type { Clinic } from '@prisma/client';

let cachedClinic: Clinic | null = null;

/**
 * Returns the default clinic for MVP / single-clinic operations.
 */
export async function getDefaultClinic(): Promise<Clinic> {
  if (cachedClinic) {
    return cachedClinic;
  }

  const clinic = await prisma.clinic.findFirst();
  if (!clinic) {
    throw new Error('Kayıtlı klinik bulunamadı. Lütfen veritabanı seed scriptini çalıştırınız.');
  }

  cachedClinic = clinic;
  return clinic;
}
