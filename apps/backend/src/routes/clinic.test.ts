import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { clinicRouter } from './clinic.js';
import { prisma } from '../lib/db/client.js';
import { cancelAppointment } from '../lib/scheduling/cancellation.js';

// Mock prisma to safely test without mutating live DB and without requiring unapplied migrations
vi.mock('../lib/db/client.js', () => {
  const mockClinic = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const mockClinicSettingVersion = {
    create: vi.fn(),
  };
  const mockAppointment = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const mockPatient = {
    findFirst: vi.fn(),
  };

  return {
    prisma: {
      clinic: mockClinic,
      clinicSettingVersion: mockClinicSettingVersion,
      appointment: mockAppointment,
      patient: mockPatient,
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb({
          clinic: mockClinic,
          clinicSettingVersion: mockClinicSettingVersion,
        });
      }),
    },
  };
});

describe('PATCH /api/clinic/current', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NODE_ENV = 'test';
    process.env.TEST_AUTH_OVERRIDE = 'true';

    app = express();
    app.use(express.json());
    app.use('/api/clinic', clinicRouter);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  const startTestServer = (): Promise<string> => {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}/api/clinic`;
        resolve(baseUrl);
      });
    });
  };

  it('1. Rejects unknown clinicId in body (400) and does NOT touch Clinic B', async () => {
    const url = await startTestServer();

    // Authenticated user belongs to Clinic A, but attempts to spoof body.clinicId = 'clinic-B'
    const res = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
      },
      body: JSON.stringify({
        clinicId: 'clinic-B',
        greetingMessage: 'Merhaba bu bir test mesajıdır.',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Geçersiz parametreler');
    expect(body.details._errors.some((e: string) => e.includes('clinicId'))).toBe(true);

    // Verify DB update or transaction was never triggered for Clinic B
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('2. Rejects unauthorized fields like phoneNumber and name (400)', async () => {
    const url = await startTestServer();

    const res = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
      },
      body: JSON.stringify({
        name: 'Yeni Sahte Klinik Adı',
        phoneNumber: '+905559990011',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Geçersiz parametreler');
    expect(
      body.details._errors.some(
        (e: string) => e.includes('name') || e.includes('phoneNumber'),
      ),
    ).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('3. Rejects greetingMessage exceeding 500 characters (400)', async () => {
    const url = await startTestServer();

    const longGreeting = 'A'.repeat(501);
    const res = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
      },
      body: JSON.stringify({
        greetingMessage: longGreeting,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.greetingMessage).toBeDefined();
  });

  it('4. Rejects cancellationPolicyHours when 0 or 73 (400)', async () => {
    const url = await startTestServer();

    // Test 0
    const res0 = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
      },
      body: JSON.stringify({
        cancellationPolicyHours: 0,
      }),
    });
    expect(res0.status).toBe(400);
    const body0 = await res0.json();
    expect(body0.details.cancellationPolicyHours).toBeDefined();

    // Test 73
    const res73 = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
      },
      body: JSON.stringify({
        cancellationPolicyHours: 73,
      }),
    });
    expect(res73.status).toBe(400);
    const body73 = await res73.json();
    expect(body73.details.cancellationPolicyHours).toBeDefined();
  });

  it('5 & 6. Automatically injects missing KVKK notice, creates audit snapshot in ClinicSettingVersion, and updates settings', async () => {
    const url = await startTestServer();

    const oldClinic = {
      id: 'clinic-A',
      name: 'Test Sağlık Kliniği',
      phoneNumber: '+902125550101',
      timezone: 'Europe/Istanbul',
      greetingMessage: 'Eski karşılama mesajı.',
      specialInstructions: 'Eski özel talimat.',
      cancellationPolicyHours: 2,
    };

    (prisma.clinic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(oldClinic);
    (prisma.clinic.update as unknown as ReturnType<typeof vi.fn>).mockImplementation(({ data }) => {
      return Promise.resolve({
        ...oldClinic,
        ...data,
      });
    });

    // Greeting without KVKK recording notice
    const inputGreeting = 'Merhaba, kliniğimize hoş geldiniz. Size nasıl yardımcı olabilirim?';

    const res = await fetch(`${url}/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-clinic-id': 'clinic-A',
        'x-test-role': 'secretary',
        'x-test-user-id': 'user-secretary-123',
      },
      body: JSON.stringify({
        greetingMessage: inputGreeting,
        cancellationPolicyHours: 4,
        specialInstructions: 'Girişte kimlik gösteriniz.',
      }),
    });

    expect(res.status).toBe(200);
    const resJson = await res.json();

    // Notice was automatically added
    expect(resJson.noticeWasAdded).toBe(true);
    expect(resJson.clinic.greetingMessage).toContain('Görüşmemiz randevu işlemleri ve hizmet kalitesi amacıyla kaydedilmektedir.');
    expect(resJson.clinic.cancellationPolicyHours).toBe(4);
    expect(resJson.firstMessagePreview).toBeDefined();

    // Snapshot creation verification (point 6)
    expect(prisma.clinicSettingVersion.create).toHaveBeenCalledWith({
      data: {
        clinicId: 'clinic-A',
        snapshot: {
          greetingMessage: 'Eski karşılama mesajı.',
          specialInstructions: 'Eski özel talimat.',
          cancellationPolicyHours: 2,
        },
        changedBy: 'user-secretary-123',
      },
    });

    // Clinic update verification
    expect(prisma.clinic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'clinic-A' },
        data: expect.objectContaining({
          cancellationPolicyHours: 4,
          settingsUpdatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('7. cancellation.ts uses the newly updated cancellationPolicyHours', async () => {
    // Mock clinic with new 4-hour policy
    (prisma.clinic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'clinic-A',
      name: 'Test Kliniği',
      cancellationPolicyHours: 4, // Updated policy: 4 hours
    });

    const now = Date.now();
    // Appointment is 3 hours in the future (under the 4-hour limit)
    const futureAppointmentTime = new Date(now + 3 * 60 * 60 * 1000);

    (prisma.patient.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'patient-1',
      fullName: 'Ahmet Yılmaz',
    });

    (prisma.appointment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      startsAt: futureAppointmentTime,
      patient: { fullName: 'Ahmet Yılmaz' },
      doctor: { name: 'Dr. Mehmet' },
    });

    const result = await cancelAppointment({
      clinicId: 'clinic-A',
      patientName: 'Ahmet Yılmaz',
      patientPhone: '05321112233',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Randevuya 4 saatten az kaldığı için');
  });
});
