/**
 * Date and Timezone Utilities for RECALL Frontend.
 * Standardizes Europe/Istanbul (UTC+3) formatting, input generation, and ISO serialization.
 */

export const ISTANBUL_TIMEZONE = 'Europe/Istanbul';

/**
 * Combines date (YYYY-MM-DD) and time (HH:mm) entered by user into an ISO 8601 string
 * with explicit Europe/Istanbul timezone offset (+03:00).
 * Example: toIstanbulIsoString("2026-09-29", "17:40") -> "2026-09-29T17:40:00+03:00"
 */
export function toIstanbulIsoString(dateStr: string, timeStr: string): string {
  const d = dateStr.trim();
  const t = timeStr.trim();
  const timeWithSeconds = t.length === 5 ? `${t}:00` : t;
  return `${d}T${timeWithSeconds}+03:00`;
}

/**
 * Extracts YYYY-MM-DD and HH:mm strictly according to Europe/Istanbul timezone.
 * Safe against browser/system timezone differences and avoids UTC slicing bugs.
 */
export function getIstanbulDateParts(dateOrIso: Date | string): { dateStr: string; timeStr: string } {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    timeStr: `${get('hour')}:${get('minute')}`,
  };
}

/**
 * Formats a Date or ISO string into a Turkish localized string in Europe/Istanbul timezone.
 */
export function formatIstanbulDate(
  dateOrIso: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TIMEZONE,
    ...options,
  }).format(date);
}

/**
 * Formats full appointment representation: e.g. "29 Eylül 2026 • 17:40"
 */
export function formatIstanbulAppointment(dateOrIso: Date | string): string {
  const datePart = formatIstanbulDate(dateOrIso, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = formatIstanbulDate(dateOrIso, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart} • ${timePart}`;
}
