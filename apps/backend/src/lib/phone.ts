import parsePhoneNumber, { isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Normalizes phone numbers to standard E.164 format (e.g., "+905321234567").
 * Defaults to 'TR' (Turkey) country code if no international prefix is given.
 */
export function normalizePhone(raw: string, defaultCountry: 'TR' | string = 'TR'): string {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  const trimmed = raw.trim();

  try {
    const parsed = parsePhoneNumber(trimmed, defaultCountry as 'TR');
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch {
    // Fallback if libphonenumber parsing encounters unexpected input
  }

  // Robust fallback for Turkish numbers (e.g. "0532 123 45 67", "5321234567")
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+90${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+90${digits}`;
  }
  if (trimmed.startsWith('+') && digits.length >= 8) {
    return `+${digits}`;
  }

  return trimmed;
}

/**
 * Validates whether a phone number is a valid telephone number.
 */
export function isValidPhone(raw: string, defaultCountry: 'TR' | string = 'TR'): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }
  try {
    return isValidPhoneNumber(raw.trim(), defaultCountry as 'TR');
  } catch {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 10;
  }
}
