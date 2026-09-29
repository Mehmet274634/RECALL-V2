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
  if (trimmed.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }

  return trimmed;
}

/**
 * Validates whether a phone number is a valid telephone number.
 * Rejects incomplete or invalid numbers (e.g. "123", "0532").
 */
export function isValidPhone(raw: string, defaultCountry: 'TR' | string = 'TR'): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length < 10) {
    return false;
  }

  try {
    if (isValidPhoneNumber(trimmed, defaultCountry as 'TR')) {
      return true;
    }
  } catch {
    // continue to fallback check
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) {
    return true;
  }
  if (digits.length === 11 && digits.startsWith('05')) {
    return true;
  }
  if (digits.length === 12 && digits.startsWith('905')) {
    return true;
  }
  if (digits.length >= 10 && trimmed.startsWith('+')) {
    return true;
  }

  return false;
}

/**
 * Strict Turkish mobile phone validator & normalizer for Vapi tool handlers.
 * - Strips whitespace, dashes, parentheses, dots.
 * - Removes leading +90 or 90.
 * - If 10 digits starting with 5: prepends '0' -> exactly 11 digits starting with '05'.
 * - Must be exactly 11 digits and start with '05'.
 * - Never guesses or truncates/pads invalid lengths (e.g. 13-digit numbers).
 */
export function validateAndFormatTurkishPhone(rawPhone?: string | null): {
  isValid: boolean;
  formattedPhone?: string; // 11-digit "05..."
  e164Phone?: string;      // "+905..."
  errorMessage?: string;
} {
  if (!rawPhone || typeof rawPhone !== 'string' || !rawPhone.trim()) {
    return {
      isValid: false,
      errorMessage: 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.',
    };
  }

  // 1. Strip spaces, dashes, dots, parentheses
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');

  // 2. Remove +90 or leading 90 if international format
  if (cleaned.startsWith('+90')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('90') && cleaned.length >= 12) {
    cleaned = cleaned.slice(2);
  }

  // 3. Keep digits only
  const digits = cleaned.replace(/\D/g, '');

  // 4. Handle 10-digit number starting with 5 (e.g., 5444217088 -> 05444217088)
  let standard11 = digits;
  if (digits.length === 10 && digits.startsWith('5')) {
    standard11 = `0${digits}`;
  }

  // 5. Must be exactly 11 digits and start with '05'
  if (standard11.length === 11 && standard11.startsWith('05')) {
    return {
      isValid: true,
      formattedPhone: standard11,
      e164Phone: `+90${standard11.slice(1)}`,
    };
  }

  // Failed: more or fewer than 11 digits, or doesn't start with 05
  return {
    isValid: false,
    errorMessage: 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.',
  };
}

