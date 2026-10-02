import { prisma } from './client.js';

import type { Clinic } from '@prisma/client';

export const legacyClinicSelect = {
  id: true,
  name: true,
  phoneNumber: true,
  timezone: true,
  greetingMessage: true,
  specialInstructions: true,
  cancellationPolicyHours: true,
  voiceId: true,
  settingsUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

let cachedClinic: Clinic | null = null;

/**
 * Returns the default clinic for MVP / fallback operations.
 * Strictly blocked in production unless explicit ALLOW_DEV_CLINIC_FALLBACK is set.
 */
export async function getDefaultClinic(): Promise<Clinic> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_CLINIC_FALLBACK !== 'true') {
    throw new Error('getDefaultClinic() is disabled in production for multi-tenant safety.');
  }

  if (cachedClinic) {
    return cachedClinic;
  }

  try {
    const clinic = await prisma.clinic.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!clinic) {
      throw new Error('Kayıtlı klinik bulunamadı. Lütfen veritabanı seed scriptini çalıştırınız.');
    }

    cachedClinic = clinic;
    return clinic;
  } catch (error: any) {
    if (error?.code === 'P2022') {
      const clinic = await prisma.clinic.findFirst({
        orderBy: { createdAt: 'asc' },
        select: legacyClinicSelect,
      });
      if (!clinic) {
        throw new Error('Kayıtlı klinik bulunamadı. Lütfen veritabanı seed scriptini çalıştırınız.');
      }
      cachedClinic = clinic as Clinic;
      return clinic as Clinic;
    }
    throw error;
  }
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
  } catch (error: any) {
    if (error?.code === 'P2022') {
      const clinic = await prisma.clinic.findFirst({
        where: {
          phoneNumber: {
            in: Array.from(candidates),
          },
        },
        select: legacyClinicSelect,
      });
      return clinic as Clinic | null;
    }
    console.error('[db] Error finding clinic by phone number:', error);
    return null;
  }
}

/**
 * Normalizes an AI inbound identifier:
 * - If it resembles a phone number (e.g. +90..., 0532..., digits with formatting), normalizes to E.164.
 * - If it's a non-phone string (e.g. SIP username 'recalltest-4829'), trims and preserves as-is.
 */
export function normalizeAiInboundNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Check if it's purely a phone number (digits with optional +, spaces, dashes, dots, parentheses)
  const nonDigitOrSymbol = trimmed.replace(/[\d\s+\-().]/g, '');
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (nonDigitOrSymbol.length === 0 && digitCount >= 7) {
    return normalizeToE164(trimmed) || trimmed;
  }

  return trimmed;
}

/**
 * Resolves a clinic from an inbound dialed number or SIP URI.
 * Priority:
 * 1. If dialedNumber is a SIP URI (sip:username@host):
 *    - Looks up aiInboundNumber matching the SIP username or full SIP URI.
 *    - Does NOT pass to normalizeToE164.
 * 2. If dialedNumber is a phone number:
 *    - Looks up in aiInboundNumber first (with E.164 candidates).
 *    - If not found, falls back to legacy phoneNumber column.
 */
export async function findClinicByInboundNumber(dialedNumber?: string | null): Promise<Clinic | null> {
  if (!dialedNumber) return null;
  const rawTrimmed = dialedNumber.trim();
  if (!rawTrimmed) return null;

  // 1. SIP URI handling
  if (rawTrimmed.toLowerCase().startsWith('sip:')) {
    const atIndex = rawTrimmed.indexOf('@');
    const sipUsername = atIndex > 4 ? rawTrimmed.slice(4, atIndex) : rawTrimmed.slice(4);

    const sipCandidates = [rawTrimmed, sipUsername].filter(Boolean);

    try {
      const clinicBySip = await prisma.clinic.findFirst({
        where: {
          aiInboundNumber: {
            in: sipCandidates,
          },
        },
      });
      if (clinicBySip) return clinicBySip;
    } catch (error: any) {
      if (error?.code !== 'P2022') {
        console.error('[db] Error finding clinic by SIP aiInboundNumber:', error);
      }
    }

    // SIP URIs never fall back to E.164 phone lookup
    return null;
  }

  // 2. Phone number candidate generation
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
  const candidateList = Array.from(candidates);

  try {
    // 2a. Priority: ai_inbound_number
    try {
      const clinicByAiNumber = await prisma.clinic.findFirst({
        where: {
          aiInboundNumber: {
            in: candidateList,
          },
        },
      });
      if (clinicByAiNumber) return clinicByAiNumber;
    } catch (err: any) {
      if (err?.code !== 'P2022') {
        console.error('[db] Error finding clinic by aiInboundNumber:', err);
      }
    }

    // 2b. Fallback: legacy phone_number
    const clinicByLegacyPhone = await prisma.clinic.findFirst({
      where: {
        phoneNumber: {
          in: candidateList,
        },
      },
    });
    if (clinicByLegacyPhone) return clinicByLegacyPhone;
  } catch (error: any) {
    if (error?.code === 'P2022') {
      const clinicByLegacyPhone = await prisma.clinic.findFirst({
        where: {
          phoneNumber: {
            in: candidateList,
          },
        },
        select: legacyClinicSelect,
      });
      if (clinicByLegacyPhone) return clinicByLegacyPhone as Clinic;
    } else {
      console.error('[db] Error finding clinic by inbound phone number:', error);
    }
  }

  return null;
}

/**
 * Resets the in-memory cached clinic.
 */
export function clearClinicCache(): void {
  cachedClinic = null;
}
