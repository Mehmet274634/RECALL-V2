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
  // ───────────────────────── E.164 normalisation ─────────────────────────
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

  // ─────────────────────────── maskPhoneNumber ───────────────────────────
  it('masks phone numbers to protect personal data in logs', () => {
    const masked = maskPhoneNumber('+902125550101');
    expect(masked.startsWith('+902')).toBe(true);
    expect(masked.endsWith('01')).toBe(true);
    expect(masked.includes('*')).toBe(true);
    expect(masked).not.toBe('+902125550101');

    expect(maskPhoneNumber(null)).toBe('[YOK]');
    expect(maskPhoneNumber('')).toBe('[YOK]');
  });

  it('masks SIP addresses without exposing full username in logs', () => {
    const sipMasked = maskPhoneNumber('sip:recalltest-4829@sip.vapi.ai');
    expect(sipMasked.startsWith('sip:')).toBe(true);
    expect(sipMasked).toContain('@sip.vapi.ai');
    expect(sipMasked).toContain('*');
    expect(sipMasked).not.toContain('recalltest-4829');
  });

  // ───────────────────── extractPhoneNumberOrClinic ──────────────────────
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

  it('extracts clinicId from query parameter when metadata/variableValues clinicId is absent', () => {
    const payload = {
      message: {
        type: 'tool-calls',
        phoneNumber: { number: '+909999999999' },
      },
    };
    const query = { clinicId: 'some-clinic-id-from-query' };

    const extracted = extractPhoneNumberOrClinic(payload, query);
    expect(extracted.clinicId).toBe('some-clinic-id-from-query');
  });

  it('variableValues/metadata clinicId takes priority over query.clinicId', () => {
    const payload = {
      message: {
        type: 'tool-calls',
        call: {
          assistantOverrides: {
            variableValues: { clinicId: 'metadata-clinic-id' },
          },
        },
      },
    };
    const query = { clinicId: 'query-clinic-id' };

    const extracted = extractPhoneNumberOrClinic(payload, query);
    expect(extracted.clinicId).toBe('metadata-clinic-id');
  });

  // ─────────────────────── resolveClinicForRequest ───────────────────────
  it('returns null when clinic cannot be resolved, without falling back to default clinic', async () => {
    const payload = {
      message: {
        type: 'tool-calls',
        phoneNumber: { number: '+909999999999' },
      },
    };

    const resolved = await resolveClinicForRequest(payload);
    expect(resolved).toBeNull();
  });

  it('does NOT resolve clinic using caller number (customer.number) even if it matches a clinic', async () => {
    const payload = {
      message: {
        type: 'tool-calls',
        customer: { number: '+902125550101' },
      },
    };

    const resolved = await resolveClinicForRequest(payload);
    expect(resolved).toBeNull();
  });

  it('SIP address as dialedNumber returns null without calling normalizeToE164', async () => {
    const payload = {
      message: {
        type: 'assistant-request',
        call: { to: 'sip:recalltest-4829@sip.vapi.ai' },
      },
    };

    const resolved = await resolveClinicForRequest(payload);
    expect(resolved).toBeNull();
  });

  it('resolves clinic via query.clinicId when dialed number is a SIP address', async () => {
    const realClinicId = 'cmujsx0740000uyq8jo95ywjg';
    const payload = {
      message: {
        type: 'assistant-request',
        call: { to: 'sip:recalltest-4829@sip.vapi.ai' },
      },
    };
    const query = { clinicId: realClinicId };

    const resolved = await resolveClinicForRequest(payload, query);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(realClinicId);
  });

  // ──────────────────────── tool-calls error path ────────────────────────
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
      query: {},
    } as unknown as Request;

    let responseStatus = 0;
    let responseJson: unknown = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: unknown) => {
            responseJson = data;
          },
        };
      },
    } as unknown as Response;

    await handleServerMessage(req, res);

    const body = responseJson as { results?: Array<{ toolCallId: string; result: string }> };
    expect(responseStatus).toBe(200);
    expect(body).toBeDefined();
    expect(body.results).toHaveLength(1);
    expect(body.results?.[0]?.toolCallId).toBe('tool-call-1');
    expect(body.results?.[0]?.result).toContain('tamamlayam');
    expect(body.results?.[0]?.result).toContain('arayarak');
  });

  // ────────────────── assistant-request error / success ──────────────────
  it('assistant-request when clinic not found returns { error } — never empty {}', async () => {
    const req = {
      body: {
        message: {
          type: 'assistant-request',
          call: { to: 'sip:unknown-9999@sip.vapi.ai' },
        },
      },
      query: {},
    } as unknown as Request;

    let responseStatus = 0;
    let responseJson: unknown = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: unknown) => {
            responseJson = data;
          },
        };
      },
    } as unknown as Response;

    await handleServerMessage(req, res);

    expect(responseStatus).toBe(200);
    const body = responseJson as Record<string, unknown>;
    expect(body).not.toEqual({});
    expect(typeof body.error).toBe('string');
    expect((body.error as string).length).toBeGreaterThan(10);
    expect(body.assistant).toBeUndefined();
  });

  it('assistant-request success returns assistantId + assistantOverrides with clinicId embedded', async () => {
    const realClinicId = 'cmujsx0740000uyq8jo95ywjg';
    const fakeAssistantId = 'test-base-assistant-id';
    process.env.VAPI_BASE_ASSISTANT_ID = fakeAssistantId;

    const req = {
      body: {
        message: {
          type: 'assistant-request',
          call: { to: 'sip:recalltest-4829@sip.vapi.ai' },
        },
      },
      query: { clinicId: realClinicId },
    } as unknown as Request;

    let responseStatus = 0;
    let responseJson: unknown = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: unknown) => {
            responseJson = data;
          },
        };
      },
    } as unknown as Response;

    await handleServerMessage(req, res);

    expect(responseStatus).toBe(200);
    const body = responseJson as Record<string, unknown>;
    expect(body).not.toEqual({});

    expect(body.assistantId).toBe(fakeAssistantId);
    expect(body.assistant).toBeUndefined();

    const overrides = body.assistantOverrides as Record<string, unknown>;
    expect(overrides).toBeDefined();

    expect(typeof overrides.firstMessage).toBe('string');
    expect((overrides.firstMessage as string).length).toBeGreaterThan(5);

    const model = overrides.model as Record<string, unknown>;
    expect(model).toBeDefined();
    const messages = model.messages as Array<{ role: string; content: string }>;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.role).toBe('system');
    expect(typeof messages[0]?.content).toBe('string');
    expect((messages[0]?.content as string).length).toBeGreaterThan(50);

    const variableValues = overrides.variableValues as Record<string, unknown>;
    expect(variableValues?.clinicId).toBe(realClinicId);

    const metadata = overrides.metadata as Record<string, unknown>;
    expect(metadata?.clinicId).toBe(realClinicId);

    delete process.env.VAPI_BASE_ASSISTANT_ID;
  });

  // ────────────────── individual tool: no clinicId guard ─────────────────
  it('all vapi/tools return safe error immediately when clinicId is missing', async () => {
    const {
      handleCheckAvailability,
      handleBookAppointment,
      handleLookupAppointment,
      handleCancelAppointment,
      handleRescheduleAppointment,
    } = await import('./tools/index.js');

    const checkRes = await handleCheckAvailability({ date: '2026-10-05' }, undefined);
    expect(checkRes).toContain('tamamlayam');

    const bookRes = await handleBookAppointment(
      { patientName: 'Ahmet', patientPhone: '05321112233', date: '2026-10-05', time: '10:00' },
      undefined, undefined, '05321112233',
    );
    expect(bookRes).toContain('tamamlayam');

    const lookupRes = await handleLookupAppointment(
      { patientName: 'Ahmet', patientPhone: '05321112233' },
      undefined, '05321112233',
    );
    expect(lookupRes).toContain('tamamlayam');

    const cancelRes = await handleCancelAppointment(
      { patientName: 'Ahmet', patientPhone: '05321112233' },
      undefined, '05321112233',
    );
    expect(cancelRes).toContain('tamamlayam');

    const rescheduleRes = await handleRescheduleAppointment(
      { patientName: 'Ahmet', patientPhone: '05321112233', newDate: '2026-10-06', newTime: '11:00' },
      undefined, '05321112233',
    );
    expect(rescheduleRes).toContain('tamamlayam');
  });
});
