import { describe, it, expect } from 'vitest';
import { parseIstanbulDate, formatIstanbulDateStr, getIstanbulDayRange } from './date-utils.js';

describe('Europe/Istanbul Timezone and Day-Boundary Handling', () => {
  describe('Gün Sınırı: 23:30 Europe/Istanbul', () => {
    it('should keep date as 2026-09-30 for Istanbul 23:30 naive string', () => {
      const parsed = parseIstanbulDate('2026-09-30 23:30');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-09-30');
    });

    it('should keep date as 2026-09-30 for Istanbul 23:30 with explicit offset', () => {
      const parsed = parseIstanbulDate('2026-09-30T23:30:00+03:00');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-09-30');
    });

    it('should keep date as 2026-09-30 for Istanbul 23:30 ISO string without offset', () => {
      const parsed = parseIstanbulDate('2026-09-30T23:30:00');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-09-30');
    });
  });

  describe('UTC 21:00 - 23:59 Aralığı (Istanbul Gece Yarısı ve Ertesi Gün)', () => {
    it('UTC 21:00:00Z should resolve to 2026-10-01 in Europe/Istanbul (midnight transition)', () => {
      const parsed = parseIstanbulDate('2026-09-30T21:00:00Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-10-01');
    });

    it('UTC 21:30:00Z should resolve to 2026-10-01 in Europe/Istanbul (00:30)', () => {
      const parsed = parseIstanbulDate('2026-09-30T21:30:00Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-10-01');
    });

    it('UTC 22:00:00Z should resolve to 2026-10-01 in Europe/Istanbul (01:00)', () => {
      const parsed = parseIstanbulDate('2026-09-30T22:00:00Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-10-01');
    });

    it('UTC 23:59:00Z should resolve to 2026-10-01 in Europe/Istanbul (02:59)', () => {
      const parsed = parseIstanbulDate('2026-09-30T23:59:00Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-10-01');
    });

    it('UTC 23:59:59.999Z should resolve to 2026-10-01 in Europe/Istanbul (02:59:59.999)', () => {
      const parsed = parseIstanbulDate('2026-09-30T23:59:59.999Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-10-01');
    });

    it('UTC 20:59:59Z should remain 2026-09-30 in Europe/Istanbul (23:59:59 - 1 sec before midnight)', () => {
      const parsed = parseIstanbulDate('2026-09-30T20:59:59Z');
      const dateStr = formatIstanbulDateStr(parsed);
      expect(dateStr).toBe('2026-09-30');
    });
  });

  describe('getIstanbulDayRange', () => {
    it('creates correct UTC range for Istanbul day', () => {
      const { startOfDay, endOfDay } = getIstanbulDayRange('2026-10-01');
      // 2026-10-01 00:00:00+03:00 -> 2026-09-30T21:00:00.000Z
      expect(startOfDay.toISOString()).toBe('2026-09-30T21:00:00.000Z');
      // 2026-10-01 23:59:59.999+03:00 -> 2026-10-01T20:59:59.999Z
      expect(endOfDay.toISOString()).toBe('2026-10-01T20:59:59.999Z');
    });
  });
});
