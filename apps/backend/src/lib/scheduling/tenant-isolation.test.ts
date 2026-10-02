import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';

import { checkAvailability } from './availability.js';
import { bookAppointment } from './booking.js';
import { lookupAppointment } from './lookup.js';
import { cancelAppointment, rescheduleAppointment } from './cancellation.js';
import { buildSystemPromptDetails } from '../vapi/system-prompt.js';
import { appointmentsRouter } from '../../routes/appointments.js';
import { prisma } from '../db/client.js';

// Mock prisma for isolated tenant testing
vi.mock('../db/client.js', () => {
  const mockDoctor = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const mockAppointment = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const mockPatient = {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  };
  const mockClinic = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  const mockCallLog = {
    upsert: vi.fn(),
  };

  return {
    prisma: {
      doctor: mockDoctor,
      appointment: mockAppointment,
      patient: mockPatient,
      clinic: mockClinic,
      callLog: mockCallLog,
      $executeRaw: vi.fn(),
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb({
          doctor: mockDoctor,
          appointment: mockAppointment,
          patient: mockPatient,
          clinic: mockClinic,
          $executeRaw: vi.fn(),
        });
      }),
    },
  };
});

describe('Multi-Tenant Isolation & Clinic Scoping Tests', () => {
  const CLINIC_A = 'clinic-alpha-111';
  const CLINIC_B = 'clinic-beta-222';

  const DOCTOR_A = {
    id: 'doc-alpha',
    clinicId: CLINIC_A,
    name: 'Dr. Alpha Healer',
    specialty: 'Kardiyoloji',
    workingHours: { start: '09:00', end: '17:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
  };

  const DOCTOR_B = {
    id: 'doc-beta',
    clinicId: CLINIC_B,
    name: 'Dr. Beta Care',
    specialty: 'Dahiliye',
    workingHours: { start: '09:00', end: '17:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Mandatory clinicId validation
  it('throws an error when clinicId is missing in scheduling functions', async () => {
    await expect(checkAvailability({ clinicId: '' } as any)).rejects.toThrow('clinicId is required');
    await expect(bookAppointment({ clinicId: '', patientName: 'Ahmet', patientPhone: '05321112233', date: '2026-10-10', time: '10:00' } as any)).rejects.toThrow('clinicId is required');
    await expect(lookupAppointment({ clinicId: '' } as any)).rejects.toThrow('clinicId is required');
    await expect(cancelAppointment({ clinicId: '' } as any)).rejects.toThrow('clinicId is required');
    await expect(rescheduleAppointment({ clinicId: '', newDate: '2026-10-11', newTime: '11:00' } as any)).rejects.toThrow('clinicId is required');
    await expect(buildSystemPromptDetails('')).rejects.toThrow('clinicId is required');
  });

  // 2. Doctor cross-tenant protection in checkAvailability
  it('does NOT allow checking availability of Clinic A doctor through Clinic B', async () => {
    // Attempt with doctorId
    (prisma.doctor.findFirst as any).mockImplementation(({ where }: any) => {
      if (where.clinicId === CLINIC_B && where.id === DOCTOR_A.id) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const resById = await checkAvailability({
      clinicId: CLINIC_B,
      doctorId: DOCTOR_A.id,
      date: '2026-10-15',
    });

    expect(resById.success).toBe(false);
    expect(resById.message).toContain('Belirtilen hekim bu kliniğe ait değil');

    // Attempt with doctorName
    const resByName = await checkAvailability({
      clinicId: CLINIC_B,
      doctorName: DOCTOR_A.name,
      date: '2026-10-15',
    });

    expect(resByName.success).toBe(false);
    expect(resByName.message).toContain('bulunamadı');
  });

  // 3. Doctor cross-tenant protection in bookAppointment
  it('does NOT allow booking an appointment with Clinic A doctor through Clinic B', async () => {
    (prisma.doctor.findFirst as any).mockImplementation(({ where }: any) => {
      // Doctor A does not belong to Clinic B
      if (where.clinicId === CLINIC_B && where.id === DOCTOR_A.id) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const res = await bookAppointment({
      clinicId: CLINIC_B,
      doctorId: DOCTOR_A.id,
      patientName: 'Test Patient',
      patientPhone: '05321112233',
      date: '2026-10-15',
      time: '10:00',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Belirtilen doktor bu kliniğe ait değil veya bulunamadı');
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  // 4. Appointment lookup isolation across clinics
  it('does NOT return Clinic A appointment when looking up via Clinic B', async () => {
    (prisma.patient.findFirst as any).mockImplementation(({ where }: any) => {
      // Patient with this phone exists in Clinic A, but NOT in Clinic B
      if (where.clinicId === CLINIC_B) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ id: 'pat-1', clinicId: CLINIC_A, fullName: 'Kemal Can', phoneNumber: '+905321112233' });
    });

    const res = await lookupAppointment({
      clinicId: CLINIC_B,
      patientName: 'Kemal Can',
      patientPhone: '05321112233',
    });

    expect(res.success).toBe(false);
    expect(res.appointments).toHaveLength(0);
    expect(res.message).toContain('Bu bilgilerle kayıtlı randevu bulunamadı');
  });

  // 5. Appointment cancellation isolation across clinics
  it('does NOT allow cancelling Clinic A appointment through Clinic B', async () => {
    (prisma.clinic.findUnique as any).mockResolvedValue({ id: CLINIC_B, cancellationPolicyHours: 2 });
    (prisma.appointment.findFirst as any).mockImplementation(({ where }: any) => {
      // Appointment belongs to Clinic A, querying with Clinic B yields null
      if (where.clinicId === CLINIC_B) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id: 'appt-a',
        clinicId: CLINIC_A,
        startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      });
    });

    const res = await cancelAppointment({
      clinicId: CLINIC_B,
      appointmentId: 'appt-a',
      patientName: 'Kemal Can',
      patientPhone: '05321112233',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Bu bilgilerle kayıtlı randevu bulunamadı');
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  // 6. Appointment reschedule isolation across clinics (including newDoctorId cross-tenant check)
  it('does NOT allow rescheduling Clinic A appointment through Clinic B', async () => {
    (prisma.clinic.findUnique as any).mockResolvedValue({ id: CLINIC_B, cancellationPolicyHours: 2 });
    (prisma.appointment.findFirst as any).mockImplementation(({ where }: any) => {
      if (where.clinicId === CLINIC_B) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const res = await rescheduleAppointment({
      clinicId: CLINIC_B,
      appointmentId: 'appt-a',
      patientName: 'Kemal Can',
      patientPhone: '05321112233',
      newDate: '2026-10-20',
      newTime: '11:00',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Bu bilgilerle kayıtlı randevu bulunamadı');
  });

  it('rejects rescheduling if newDoctorId belongs to another clinic', async () => {
    (prisma.clinic.findUnique as any).mockResolvedValue({ id: CLINIC_B, cancellationPolicyHours: 2 });
    (prisma.appointment.findFirst as any).mockResolvedValue({
      id: 'appt-b',
      clinicId: CLINIC_B,
      doctorId: DOCTOR_B.id,
      startsAt: new Date(Date.now() + 48 * 3600 * 1000),
      endsAt: new Date(Date.now() + 48 * 3600 * 1000 + 30 * 60000),
      patient: { fullName: 'Kemal Can', phoneNumber: '+905321112233' },
    });

    // newDoctorId is DOCTOR_A.id, which does NOT belong to CLINIC_B
    (prisma.doctor.findFirst as any).mockImplementation(({ where }: any) => {
      if (where.clinicId === CLINIC_B && where.id === DOCTOR_A.id) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const res = await rescheduleAppointment({
      clinicId: CLINIC_B,
      appointmentId: 'appt-b',
      patientName: 'Kemal Can',
      patientPhone: '05321112233',
      newDoctorId: DOCTOR_A.id, // Malicious cross-tenant doctor ID
      newDate: '2026-10-20',
      newTime: '14:00',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Belirtilen yeni hekim bu kliniğe ait değil veya bulunamadı');
  });

  // 7. Patient record isolation with identical phone number
  it('upserts patient records strictly scoped to clinicId_phoneNumber compound key', async () => {
    (prisma.doctor.findFirst as any).mockResolvedValue(DOCT_CLINIC_A(CLINIC_A));
    (prisma.appointment.findFirst as any).mockResolvedValue(null);
    (prisma.patient.upsert as any).mockImplementation(({ where, create }: any) => {
      return Promise.resolve({
        id: `pat-${where.clinicId_phoneNumber.clinicId}`,
        clinicId: where.clinicId_phoneNumber.clinicId,
        phoneNumber: where.clinicId_phoneNumber.phoneNumber,
        fullName: create.fullName,
      });
    });

    const phone = '0532 999 00 11';

    await bookAppointment({
      clinicId: CLINIC_A,
      patientName: 'Hasta Alpha',
      patientPhone: phone,
      date: '2026-10-25',
      time: '10:00',
    });

    expect(prisma.patient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId_phoneNumber: {
            clinicId: CLINIC_A,
            phoneNumber: '+905329990011',
          },
        },
      }),
    );

    await bookAppointment({
      clinicId: CLINIC_B,
      patientName: 'Hasta Beta',
      patientPhone: phone,
      date: '2026-10-25',
      time: '11:00',
    });

    expect(prisma.patient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId_phoneNumber: {
            clinicId: CLINIC_B,
            phoneNumber: '+905329990011',
          },
        },
      }),
    );
  });

  // 8. Panel API isolation: Clinic A secretary cannot access Clinic B appointments
  it('returns 404 when Clinic A user tries to read or modify Clinic B appointment via panel API', async () => {
    const app = express();
    app.use(express.json());

    // Middleware simulating Clinic A authenticated user
    app.use((req: any, _res, next) => {
      req.clinicId = CLINIC_A;
      req.role = 'secretary';
      next();
    });

    app.use('/api/appointments', appointmentsRouter);

    // Mock DB behavior: Appointment belongs to Clinic B
    (prisma.appointment.findFirst as any).mockImplementation(({ where }: any) => {
      if (where.id === 'appt-of-clinic-b' && where.clinicId === CLINIC_A) {
        return Promise.resolve(null); // Not found for Clinic A
      }
      return Promise.resolve(null);
    });

    // 8a. GET /api/appointments/:id
    const mockResGet = createMockRes();
    const mockReqGet = {
      clinicId: CLINIC_A,
      role: 'secretary',
      params: { id: 'appt-of-clinic-b' },
    } as unknown as Request;

    const getRouteLayer = appointmentsRouter.stack.find((s) => s.route?.path === '/:id' && s.route?.methods?.get);
    const getHandler = getRouteLayer?.route?.stack?.[0]?.handle;
    await getHandler(mockReqGet, mockResGet, () => {});

    expect(mockResGet.statusCode).toBe(404);
    expect(mockResGet.body).toEqual({ error: 'Randevu bulunamadı.' });

    // 8b. PATCH /api/appointments/:id
    const mockResPatch = createMockRes();
    const mockReqPatch = {
      clinicId: CLINIC_A,
      role: 'secretary',
      params: { id: 'appt-of-clinic-b' },
      body: { status: 'CANCELLED' },
    } as unknown as Request;

    const patchRouteLayer = appointmentsRouter.stack.find((s) => s.route?.path === '/:id' && s.route?.methods?.patch);
    const patchHandler = patchRouteLayer?.route?.stack?.[0]?.handle;
    await patchHandler(mockReqPatch, mockResPatch, () => {});

    expect(mockResPatch.statusCode).toBe(404);
    expect(mockResPatch.body).toEqual({ error: 'Randevu bulunamadı.' });
  });
});

function DOCT_CLINIC_A(clinicId: string) {
  return {
    id: 'doc-1',
    clinicId,
    name: 'Dr. Test',
    specialty: 'Dahiliye',
    workingHours: { start: '09:00', end: '17:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}
