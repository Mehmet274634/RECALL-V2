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

/**
 * Resolves and validates phone number for tool calls according to strict rules:
 * 1. If explicitPhone is provided: validate and format (11-digit 05...).
 * 2. If explicitPhone is empty and useCallerNumber !== true: do NOT fall back to caller ID. Return:
 *    "Telefon numarası alınmadı. Hastadan numara ya da \"bu numaradan ulaşın\" onayı iste."
 * 3. If useCallerNumber === true and defaultCustomerNumber is missing/empty (web test):
 *    "Arayan numara tespit edilemedi. Lütfen hastadan telefon numarasını isteyiniz."
 * 4. If useCallerNumber === true and defaultCustomerNumber exists: validate & format caller ID.
 */
export function resolveToolPhone(params: {
  explicitPhone?: string | null;
  useCallerNumber?: boolean | null;
  defaultCustomerNumber?: string | null;
}): {
  phone?: string;
  errorMessage?: string;
} {
  const explicit = (params.explicitPhone || '').trim();

  // 1. patientPhone doluysa onu kullan (11 hane / 05 doğrulaması aynen)
  if (explicit) {
    const val = validateAndFormatTurkishPhone(explicit);
    if (!val.isValid || !val.formattedPhone) {
      return { errorMessage: 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.' };
    }
    return { phone: val.formattedPhone };
  }

  // 2. patientPhone boşsa ve useCallerNumber !== true ise arayan numaraya DÜŞME; işlemi yapma
  if (params.useCallerNumber !== true) {
    return {
      errorMessage: 'Telefon numarası alınmadı. Hastadan numara ya da "bu numaradan ulaşın" onayı iste.',
    };
  }

  // 3. useCallerNumber true ve call.customer.number yoksa (web testi) işlemi yapma, numara iste
  const caller = (params.defaultCustomerNumber || '').trim();
  if (!caller) {
    return {
      errorMessage: 'Arayan numara tespit edilemedi. Lütfen hastadan telefon numarasını isteyiniz.',
    };
  }

  const callerVal = validateAndFormatTurkishPhone(caller);
  if (!callerVal.isValid || !callerVal.formattedPhone) {
    return { errorMessage: 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.' };
  }

  return { phone: callerVal.formattedPhone };
}

/**
 * Normalizes a Turkish full name for case and diacritic-insensitive comparison.
 * e.g. "ayşe yılmaz" === "Ayşe Yılmaz" === "AYSE YILMAZ".
 */
export function normalizeTurkishName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

export function isTurkishNameMatch(nameA?: string | null, nameB?: string | null): boolean {
  const normA = normalizeTurkishName(nameA);
  const normB = normalizeTurkishName(nameB);
  if (!normA || !normB) return false;
  return normA === normB;
}

