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
 * Normalizes any phone number into E.164 international format.
 * Strips whitespace, dashes, parentheses, and dots.
 * Automatically handles Turkish domestic prefixes (0, 90) and international (+).
 */
export function normalizeToE164(phoneNumber?: string | null): string | null {
  if (!phoneNumber) return null;
  let cleaned = phoneNumber.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // Turkey national format starting with 0 (e.g. 02125550101 -> 11 digits)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '+90' + cleaned.slice(1);
  }
  // 10 digits without leading 0 (e.g. 2125550101)
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    return '+90' + cleaned;
  }
  // 12 digits starting with 90 without + (e.g. 902125550101)
  if (cleaned.startsWith('90') && cleaned.length === 12) {
    return '+' + cleaned;
  }
  if (/^\d+$/.test(cleaned)) {
    return '+' + cleaned;
  }
  return cleaned;
}

/**
 * Resolves a clinic by inbound dialed phone number.
 * Normalizes phone number using E.164 and checks all candidate formats against DB.
 */
export async function findClinicByPhoneNumber(phoneNumber?: string | null): Promise<Clinic | null> {
  if (!phoneNumber) return null;

  const rawTrimmed = phoneNumber.trim();
  const normalized = normalizeToE164(rawTrimmed);

  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
    if (normalized.startsWith('+')) {
      candidates.add(normalized.slice(1));
    }
  }
  candidates.add(rawTrimmed);
  if (rawTrimmed.startsWith('+')) {
    candidates.add(rawTrimmed.slice(1));
  } else {
    candidates.add(`+${rawTrimmed}`);
  }

  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        phoneNumber: {
          in: Array.from(candidates),
        },
      },
    });

    return clinic;
  } catch (error) {
    console.error('[db] Error finding clinic by phone number:', error);
    return null;
  }
}

/**
 * Resets the in-memory cached clinic.
 */
export function clearClinicCache(): void {
  cachedClinic = null;
}
