/**
 * Date and Timezone Utilities for RECALL Backend.
 * Standardizes Europe/Istanbul (UTC+3) parsing and querying.
 */

/**
 * Parses an incoming date/time string, ensuring that timezone-naive strings
 * are interpreted strictly as Europe/Istanbul (UTC+3) time.
 * If the string already includes timezone info ('Z' or offset like '+03:00'),
 * it is parsed preserving that exact instant in UTC.
 */
export function parseIstanbulDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  if (!trimmed) {
    throw new Error('Geçersiz tarih formatı: boş değer.');
  }

  // Check if string already has a timezone indicator: 'Z' or [+-]HH:mm or [+-]HHmm
  const hasTimezone = /Z|[+-]\d{2}(?::?\d{2})?$/i.test(trimmed);

  let date: Date;

  if (hasTimezone) {
    date = new Date(trimmed);
  } else if (trimmed.includes('T')) {
    // e.g. "2026-09-29T17:40" or "2026-09-29T17:40:00"
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    date = new Date(`${withSeconds}+03:00`);
  } else if (trimmed.includes(' ')) {
    // e.g. "2026-09-29 17:40" or "2026-09-29 17:40:00"
    const isoLike = trimmed.replace(' ', 'T');
    const withSeconds = isoLike.length === 16 ? `${isoLike}:00` : isoLike;
    date = new Date(`${withSeconds}+03:00`);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // e.g. "2026-09-29" -> start of day in Istanbul
    date = new Date(`${trimmed}T00:00:00+03:00`);
  } else {
    date = new Date(trimmed);
  }

  if (isNaN(date.getTime())) {
    throw new Error(`Geçersiz tarih formatı: ${dateStr}`);
  }

  return date;
}

/**
 * Returns UTC Date range [startOfDay, endOfDay] for a calendar date (YYYY-MM-DD)
 * in Europe/Istanbul timezone.
 */
export function getIstanbulDayRange(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const trimmed = dateStr.trim();
  const startOfDay = new Date(`${trimmed}T00:00:00.000+03:00`);
  const endOfDay = new Date(`${trimmed}T23:59:59.999+03:00`);

  if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
    throw new Error(`Geçersiz takvim tarihi: ${dateStr}`);
  }

  return { startOfDay, endOfDay };
}

/**
 * Formats a Date object into a 24-hour time string ("HH:mm", e.g. "18:30")
 * strictly in the Europe/Istanbul timezone (UTC+3), regardless of server local time.
 */
export function formatIstanbulTime(date: Date): string {
  return date.toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Formats a Date object into a readable Turkish date string (e.g. "29 Eylül Salı" or "29 Eylül")
 * strictly in the Europe/Istanbul timezone (UTC+3), regardless of server local time.
 */
export function formatIstanbulDate(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    weekday: options?.weekday,
    ...options,
  });
}

/**
 * Returns ISO calendar date string ("YYYY-MM-DD") strictly in Europe/Istanbul timezone (UTC+3).
 */
export function formatIstanbulDateStr(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

