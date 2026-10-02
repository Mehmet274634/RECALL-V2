import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeAiInboundNumber, findClinicByInboundNumber } from './clinic.js';
import { resolveClinicForRequest, resolveCallerInfo } from '../vapi/server-handler.js';
import { prisma } from './client.js';

// Mock prisma for isolated number model testing
vi.mock('./client.js', () => {
  const mockClinic = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  const mockPatient = {
    findFirst: vi.fn(),
  };

  return {
    prisma: {
      clinic: mockClinic,
      patient: mockPatient,
    },
  };
});

describe('Clinic Number Model & Inbound Routing Logic', () => {
  const CLINIC_A = {
    id: 'clinic-a-111',
    name: 'Klinik Alpha',
    phoneNumber: '+902125550101',
    aiInboundNumber: '+908502220101',
    transferNumber: '+902125550199',
  };

  const CLINIC_B = {
    id: 'clinic-b-222',
    name: 'Klinik Beta',
    phoneNumber: '+902164440202',
    aiInboundNumber: 'recalltest-4829', // SIP username in aiInboundNumber
    transferNumber: '+902164440299',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. normalizeAiInboundNumber behavior
  describe('normalizeAiInboundNumber', () => {
    it('normalizes phone-like values to international E.164 format', () => {
      expect(normalizeAiInboundNumber('0212 555 01 01')).toBe('+902125550101');
      expect(normalizeAiInboundNumber('0532 111 22 33')).toBe('+905321112233');
      expect(normalizeAiInboundNumber('+90 850 222 01 01')).toBe('+908502220101');
      expect(normalizeAiInboundNumber('8502220101')).toBe('+908502220101');
    });

    it('preserves non-phone strings like SIP usernames and URIs as-is', () => {
      expect(normalizeAiInboundNumber('recalltest-4829')).toBe('recalltest-4829');
      expect(normalizeAiInboundNumber('sip:recalltest-4829@sip.vapi.ai')).toBe('sip:recalltest-4829@sip.vapi.ai');
      expect(normalizeAiInboundNumber('my-clinic-trunk')).toBe('my-clinic-trunk');
    });

    it('returns null for empty or null values', () => {
      expect(normalizeAiInboundNumber(null)).toBeNull();
      expect(normalizeAiInboundNumber(undefined)).toBeNull();
      expect(normalizeAiInboundNumber('   ')).toBeNull();
    });
  });

  // 2. Inbound routing: ai_inbound_number vs legacy phone_number
  describe('findClinicByInboundNumber', () => {
    it('resolves clinic by ai_inbound_number first', async () => {
      (prisma.clinic.findFirst as any).mockImplementation(({ where }: any) => {
        if (where.aiInboundNumber && where.aiInboundNumber.in.includes('+908502220101')) {
          return Promise.resolve(CLINIC_A);
        }
        return Promise.resolve(null);
      });

      const clinic = await findClinicByInboundNumber('+90 (850) 222-0101');
      expect(clinic).not.toBeNull();
      expect(clinic?.id).toBe(CLINIC_A.id);
      expect(clinic?.name).toBe('Klinik Alpha');
    });

    it('falls back to legacy phone_number if ai_inbound_number is not matched', async () => {
      (prisma.clinic.findFirst as any).mockImplementation(({ where }: any) => {
        // ai_inbound_number search returns null
        if (where.aiInboundNumber) {
          return Promise.resolve(null);
        }
        // fallback legacy phoneNumber matches
        if (where.phoneNumber && where.phoneNumber.in.includes('+902125550101')) {
          return Promise.resolve(CLINIC_A);
        }
        return Promise.resolve(null);
      });

      const clinic = await findClinicByInboundNumber('0212 555 01 01');
      expect(clinic).not.toBeNull();
      expect(clinic?.id).toBe(CLINIC_A.id);
    });

    it('differentiates between two clinics with different phone numbers', async () => {
      (prisma.clinic.findFirst as any).mockImplementation(({ where }: any) => {
        if (where.phoneNumber?.in?.includes('+902125550101')) return Promise.resolve(CLINIC_A);
        if (where.phoneNumber?.in?.includes('+902164440202')) return Promise.resolve(CLINIC_B);
        return Promise.resolve(null);
      });

      const clinicA = await findClinicByInboundNumber('+902125550101');
      const clinicB = await findClinicByInboundNumber('+902164440202');

      expect(clinicA?.id).toBe(CLINIC_A.id);
      expect(clinicB?.id).toBe(CLINIC_B.id);
    });

    it('resolves SIP URI by matching SIP username to ai_inbound_number', async () => {
      (prisma.clinic.findFirst as any).mockImplementation(({ where }: any) => {
        if (where.aiInboundNumber?.in?.includes('recalltest-4829')) {
          return Promise.resolve(CLINIC_B);
        }
        return Promise.resolve(null);
      });

      const clinic = await findClinicByInboundNumber('sip:recalltest-4829@sip.vapi.ai');
      expect(clinic).not.toBeNull();
      expect(clinic?.id).toBe(CLINIC_B.id);
      expect(clinic?.name).toBe('Klinik Beta');
    });

    it('returns null safely for an unmatched dialed number without throwing', async () => {
      (prisma.clinic.findFirst as any).mockResolvedValue(null);

      const clinic = await findClinicByInboundNumber('+905559999999');
      expect(clinic).toBeNull();
    });
  });

  // 3. resolveClinicForRequest priority order
  describe('resolveClinicForRequest priority order', () => {
    it('variableValues/metadata clinicId takes top priority over dialed number', async () => {
      (prisma.clinic.findUnique as any).mockResolvedValue(CLINIC_B);

      const payload = {
        message: {
          call: {
            assistantOverrides: {
              variableValues: { clinicId: CLINIC_B.id },
            },
            to: CLINIC_A.phoneNumber, // Dialed number belongs to Clinic A, but metadata specifies Clinic B
          },
        },
      };

      const resolved = await resolveClinicForRequest(payload);
      expect(resolved?.id).toBe(CLINIC_B.id);
      expect(prisma.clinic.findUnique).toHaveBeenCalledWith({ where: { id: CLINIC_B.id } });
    });

    it('query.clinicId takes priority over dialed number when metadata is absent', async () => {
      (prisma.clinic.findUnique as any).mockResolvedValue(CLINIC_A);

      const payload = {
        message: {
          call: {
            to: CLINIC_B.phoneNumber,
          },
        },
      };
      const query = { clinicId: CLINIC_A.id };

      const resolved = await resolveClinicForRequest(payload, query);
      expect(resolved?.id).toBe(CLINIC_A.id);
    });
  });

  // 4. resolveCallerInfo helper
  describe('resolveCallerInfo', () => {
    it('extracts, normalizes, masks caller ID and matches patient record when available', async () => {
      (prisma.patient.findFirst as any).mockResolvedValue({
        id: 'pat-100',
        fullName: 'Zeynep Kaya',
        phoneNumber: '+905321112233',
      });

      const payload = {
        message: {
          customer: {
            number: '0532 111 22 33',
          },
        },
      };

      const callerInfo = await resolveCallerInfo(payload, CLINIC_A.id);

      expect(callerInfo.rawCallerNumber).toBe('0532 111 22 33');
      expect(callerInfo.normalizedCallerNumber).toBe('+905321112233');
      expect(callerInfo.maskedCallerNumber.startsWith('+9053')).toBe(true);
      expect(callerInfo.maskedCallerNumber.includes('*')).toBe(true);
      expect(callerInfo.patientId).toBe('pat-100');
      expect(callerInfo.patient?.fullName).toBe('Zeynep Kaya');
    });

    it('handles payload without customer.number smoothly without throwing', async () => {
      const payload = {
        message: {},
      };

      const callerInfo = await resolveCallerInfo(payload, CLINIC_A.id);

      expect(callerInfo.rawCallerNumber).toBeNull();
      expect(callerInfo.normalizedCallerNumber).toBeNull();
      expect(callerInfo.maskedCallerNumber).toBe('[YOK]');
      expect(callerInfo.patientId).toBeNull();
      expect(callerInfo.patient).toBeNull();
    });
  });
});
