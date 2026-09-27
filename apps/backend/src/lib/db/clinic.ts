import { prisma } from './client.js';

import type { Clinic } from '@prisma/client';

let cachedClinic: Clinic | null = null;

/**
 * Returns the default clinic for MVP / fallback operations.
 */
export async function getDefaultClinic(): Promise<Clinic> {
  if (cachedClinic) {
    return cachedClinic;
  }

  const clinic = await prisma.clinic.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!clinic) {
    throw new Error('Kayıtlı klinik bulunamadı. Lütfen veritabanı seed scriptini çalıştırınız.');
  }

  cachedClinic = clinic;
  return clinic;
}

/**
 * Resolves a clinic by inbound dialed phone number.
 * Normalizes phone number or matches exact DB value.
 */
export async function findClinicByPhoneNumber(phoneNumber?: string | null): Promise<Clinic | null> {
  if (!phoneNumber) return null;

  const trimmed = phoneNumber.trim();

  // Try direct match
  let clinic = await prisma.clinic.findFirst({
    where: { phoneNumber: trimmed },
  });

  if (!clinic) {
    // Try without leading plus or with leading plus
    const alt = trimmed.startsWith('+') ? trimmed.slice(1) : `+${trimmed}`;
    clinic = await prisma.clinic.findFirst({
      where: { phoneNumber: alt },
    });
  }

  return clinic;
}

/**
 * Resets the in-memory cached clinic.
 */
export function clearClinicCache(): void {
  cachedClinic = null;
}
