import { describe, it, expect } from 'vitest';
import type * as Sentry from '@sentry/node';

import { redactSensitiveData, sentryBeforeSend } from './sentry.js';

describe('KVKK & Sensitive Data Redaction for Sentry', () => {
  it('redacts sensitive fields in nested objects', () => {
    const rawPayload = {
      clinicId: 'clinic_123',
      patientName: 'Zeynep Demir',
      patientPhone: '+905321112233',
      doctor: {
        id: 'doc_1',
        name: 'Dr. Ahmet Yılmaz',
      },
      appointment: {
        complaints: 'Şiddetli baş ağrısı ve yüksek tansiyon',
        specialInstructions: 'Önceki tahlil sonuçlarını getirecek',
      },
      apiKey: 'sec_test_secret_12345',
    };

    const sanitized = redactSensitiveData(rawPayload) as typeof rawPayload;

    expect(sanitized.clinicId).toBe('clinic_123');
    expect(sanitized.patientName).toBe('[REDACTED]');
    expect(sanitized.patientPhone).toBe('[REDACTED]');
    expect(sanitized.appointment.complaints).toBe('[REDACTED]');
    expect(sanitized.appointment.specialInstructions).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
  });

  it('masks phone numbers and email addresses embedded in strings', () => {
    const rawString = 'Hasta aradı: 0532 111 22 33 no ile kayıt açıldı. E-posta: hasta@example.com';
    const sanitized = redactSensitiveData(rawString);

    expect(sanitized).not.toContain('0532 111 22 33');
    expect(sanitized).not.toContain('hasta@example.com');
    expect(sanitized).toContain('[REDACTED_PHONE]');
    expect(sanitized).toContain('[REDACTED_EMAIL]');
  });

  it('masks patient details via sentryBeforeSend hook', () => {
    const mockEvent = {
      event_id: 'abc1234',
      user: {
        id: 'user_123',
        email: 'sekreter@recall.health',
        username: 'sekreter',
        ip_address: '192.168.1.1',
      },
      request: {
        headers: {
          authorization: 'Bearer secret_token_xyz',
        },
        data: {
          patientName: 'Mehmet Yılmaz',
          patientPhone: '+905444421708',
          complaint: 'Alerjik reaksiyon',
        },
      },
      extra: {
        rawInput: 'Hasta Mehmet, tel: +905444421708 randevu istedi',
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Failed to process booking for +905444421708 (Mehmet Yılmaz)',
          },
        ],
      },
    } as unknown as Sentry.ErrorEvent;

    const scrubbedEvent = sentryBeforeSend(mockEvent);
    expect(scrubbedEvent).not.toBeNull();

    // Verify user details are scrubbed
    expect(scrubbedEvent?.user?.email).toBe('[REDACTED_EMAIL]');
    expect(scrubbedEvent?.user?.username).toBe('[REDACTED]');
    expect(scrubbedEvent?.user?.ip_address).toBe('[REDACTED_IP]');

    // Verify request headers and body
    const requestData = scrubbedEvent?.request?.data as Record<string, string>;
    expect(requestData?.patientName).toBe('[REDACTED]');
    expect(requestData?.patientPhone).toBe('[REDACTED]');
    expect(requestData?.complaint).toBe('[REDACTED]');

    // Verify extra string data phone redaction
    const extra = scrubbedEvent?.extra as { rawInput: string };
    expect(extra?.rawInput).toContain('[REDACTED_PHONE]');
    expect(extra?.rawInput).not.toContain('+905444421708');

    // Verify exception message scrubbing
    const excValue = scrubbedEvent?.exception?.values?.[0]?.value;
    expect(excValue).toContain('[REDACTED_PHONE]');
    expect(excValue).not.toContain('+905444421708');
  });
});
