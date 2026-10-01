import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { normalizeToE164 } from '../db/clinic.js';
import {
  maskPhoneNumber,
  extractPhoneNumberOrClinic,
  resolveClinicForRequest,
  handleServerMessage,
} from './server-handler.js';

describe('server-handler: E.164 normalization and clinic resolution', () => {
  it('normalizes various phone formats to E.164 correctly', () => {
    expect(normalizeToE164('+90 (212) 555-0101')).toBe('+902125550101');
    expect(normalizeToE164('0212 555 01 01')).toBe('+902125550101');
    expect(normalizeToE164('2125550101')).toBe('+902125550101');
    expect(normalizeToE164('00902125550101')).toBe('+902125550101');
    expect(normalizeToE164('902125550101')).toBe('+902125550101');
    expect(normalizeToE164('+902125550101')).toBe('+902125550101');
    expect(normalizeToE164(null)).toBeNull();
    expect(normalizeToE164('')).toBeNull();
  });

  it('masks phone numbers to protect personal data in logs', () => {
    const masked = maskPhoneNumber('+902125550101');
    expect(masked.startsWith('+902')).toBe(true);
    expect(masked.endsWith('01')).toBe(true);
    expect(masked.includes('*')).toBe(true);
    expect(masked).not.toBe('+902125550101');

    expect(maskPhoneNumber(null)).toBe('[YOK]');
    expect(maskPhoneNumber('')).toBe('[YOK]');
  });

  it('extracts dialed number and caller number from Vapi payload correctly', () => {
    const payload = {
      message: {
        type: 'tool-calls',
        phoneNumber: { number: '+90 (212) 555-0101' },
        customer: { number: '0532 111 22 33' },
      },
    };

    const extracted = extractPhoneNumberOrClinic(payload);
    expect(extracted.dialedNumber).toBe('+90 (212) 555-0101');
    expect(extracted.callerNumber).toBe('0532 111 22 33');
    expect(extracted.phoneNumber).toBe('+90 (212) 555-0101');
  });

  it('returns null when clinic cannot be resolved, without falling back to default clinic', async () => {
    const payload = {
      message: {
        type: 'tool-calls',
        phoneNumber: { number: '+909999999999' }, // non-existent clinic number
      },
    };

    const resolved = await resolveClinicForRequest(payload);
    expect(resolved).toBeNull();
  });

  it('does NOT resolve clinic using caller number (customer.number) even if caller number matches a clinic', async () => {
    // Recall clinic phone number is +902125550101
    const payload = {
      message: {
        type: 'tool-calls',
        customer: { number: '+902125550101' }, // caller number matches clinic in DB
        // no dialed number (phoneNumberObj, call.phoneNumber, call.to, message.to) and no clinicId
      },
    };

    const resolved = await resolveClinicForRequest(payload);
    expect(resolved).toBeNull();
  });

  it('returns safe error result for tool-calls when clinic is not detected', async () => {
    const req = {
      body: {
        message: {
          type: 'tool-calls',
          callId: 'call-unknown-123',
          phoneNumber: { number: '+909999999999' },
          customer: { number: '05321112233' },
          toolCallList: [
            {
              id: 'tool-call-1',
              function: {
                name: 'check_availability',
                arguments: JSON.stringify({ doctorName: 'Dr. Test' }),
              },
            },
          ],
        },
      },
    } as unknown as Request;

    let responseStatus = 0;
    let responseJson: { results?: Array<{ toolCallId: string; result: string }> } | null = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: unknown) => {
            responseJson = data as typeof responseJson;
          },
        };
      },
    } as unknown as Response;

    await handleServerMessage(req, res);

    expect(responseStatus).toBe(200);
    expect(responseJson).toBeDefined();
    expect(responseJson?.results).toHaveLength(1);
    expect(responseJson?.results?.[0]?.toolCallId).toBe('tool-call-1');
    expect(responseJson?.results?.[0]?.result).toContain('Şu an işleminizi tamamlayamıyorum');
    expect(responseJson?.results?.[0]?.result).toContain('kliniği doğrudan arayarak');
  });

  it('all vapi/tools return safe error immediately when clinicId is missing', async () => {
    const {
      handleCheckAvailability,
      handleBookAppointment,
      handleLookupAppointment,
      handleCancelAppointment,
      handleRescheduleAppointment,
    } = await import('./tools/index.js');

    const expectedMsg = 'Şu an işleminizi tamamlayamıyorum, lütfen kliniği doğrudan arayarak sekreterliğe ulaşınız.';

    const checkRes = await handleCheckAvailability({ date: '2026-10-05' }, undefined);
    expect(checkRes).toBe(expectedMsg);

    const bookRes = await handleBookAppointment({ patientName: 'Ahmet', patientPhone: '05321112233', date: '2026-10-05', time: '10:00' }, undefined, undefined, '05321112233');
    expect(bookRes).toBe(expectedMsg);

    const lookupRes = await handleLookupAppointment({ patientName: 'Ahmet', patientPhone: '05321112233' }, undefined, '05321112233');
    expect(lookupRes).toBe(expectedMsg);

    const cancelRes = await handleCancelAppointment({ patientName: 'Ahmet', patientPhone: '05321112233' }, undefined, '05321112233');
    expect(cancelRes).toBe(expectedMsg);

    const rescheduleRes = await handleRescheduleAppointment({ patientName: 'Ahmet', patientPhone: '05321112233', newDate: '2026-10-06', newTime: '11:00' }, undefined, '05321112233');
    expect(rescheduleRes).toBe(expectedMsg);
  });
});
