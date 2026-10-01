import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/client.js';
import { getDoctorSlotDuration, checkAvailability } from './availability.js';
import { bookAppointment } from './booking.js';

describe('Doctor Slot Duration & Conflict Logic', () => {
  let testClinicId: string;
  let testDoctorId: string;

  beforeEach(async () => {
    // Create a temporary clinic and a 20-minute slot doctor for the test
    const clinic = await prisma.clinic.create({
      data: {
        name: 'Test 20 Min Slot Clinic',
        phoneNumber: '+902129998877',
        timezone: 'Europe/Istanbul',
      },
    });
    testClinicId = clinic.id;

    const doctor = await prisma.doctor.create({
      data: {
        clinicId: testClinicId,
        name: 'Dr. Test Yirmi Dakika',
        specialty: 'Genel Cerrahi',
        workingHours: {
          start: '09:00',
          end: '17:00',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          slotDurationMinutes: 20,
        },
      },
    });
    testDoctorId = doctor.id;
  });

  afterEach(async () => {
    // Cleanup created test records
    await prisma.appointment.deleteMany({ where: { clinicId: testClinicId } });
    await prisma.patient.deleteMany({ where: { clinicId: testClinicId } });
    await prisma.doctor.deleteMany({ where: { clinicId: testClinicId } });
    await prisma.clinic.deleteMany({ where: { id: testClinicId } });
  });

  it('correctly reads slotDurationMinutes via getDoctorSlotDuration and defaults to 30', () => {
    expect(
      getDoctorSlotDuration({
        workingHours: { slotDurationMinutes: 20 },
      }),
    ).toBe(20);

    expect(
      getDoctorSlotDuration({
        workingHours: { slotDurationMinutes: 45 },
      }),
    ).toBe(45);

    expect(getDoctorSlotDuration(null)).toBe(30);
    expect(getDoctorSlotDuration({ workingHours: {} })).toBe(30);
    expect(getDoctorSlotDuration({ workingHours: { slotDurationMinutes: 0 } })).toBe(30);
  });

  it(
    'for a 20-min doctor: 09:00 appointment has endsAt = 09:20, does NOT conflict with 09:20, and 09:20 endsAt is 09:40',
    async () => {
    // Pick next Monday to avoid weekend rejection
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + ((1 + 7 - targetDate.getDay()) % 7 || 7));
    const dateStr = targetDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

    // 1. Book first appointment at 09:00
    const firstBooking = await bookAppointment({
      clinicId: testClinicId,
      doctorId: testDoctorId,
      patientName: 'Hasta Bir',
      patientPhone: '05321110001',
      date: dateStr,
      time: '09:00',
    });

    expect(firstBooking.success).toBe(true);
    expect(firstBooking.appointment).toBeDefined();

    // Verify endsAt is exactly startsAt + 20 minutes
    const firstStartsAt = new Date(firstBooking.appointment!.startsAt);
    const firstEndsAt = new Date(firstBooking.appointment!.endsAt);
    const diffMins1 = (firstEndsAt.getTime() - firstStartsAt.getTime()) / (60 * 1000);
    expect(diffMins1).toBe(20);

    // 2. An overlapping time like 09:10 MUST fail with conflict
    const overlapBooking = await bookAppointment({
      clinicId: testClinicId,
      doctorId: testDoctorId,
      patientName: 'Hasta Çakışan',
      patientPhone: '05321110002',
      date: dateStr,
      time: '09:10',
    });
    expect(overlapBooking.success).toBe(false);
    expect(overlapBooking.message).toContain('başka bir randevusu bulunmaktadır');

    // 3. 09:20 MUST NOT conflict with 09:00 (since 09:00 ends at 09:20)
    const secondBooking = await bookAppointment({
      clinicId: testClinicId,
      doctorId: testDoctorId,
      patientName: 'Hasta İki',
      patientPhone: '05321110003',
      date: dateStr,
      time: '09:20',
    });

    expect(secondBooking.success).toBe(true);
    expect(secondBooking.appointment).toBeDefined();

    // Verify 09:20 endsAt is exactly 09:40 (startsAt + 20 minutes)
    const secondStartsAt = new Date(secondBooking.appointment!.startsAt);
    const secondEndsAt = new Date(secondBooking.appointment!.endsAt);
    const diffMins2 = (secondEndsAt.getTime() - secondStartsAt.getTime()) / (60 * 1000);
    expect(diffMins2).toBe(20);

    // 4. checkAvailability should reflect 20-min intervals and list 09:40 as available
    const avail = await checkAvailability({
      clinicId: testClinicId,
      doctorId: testDoctorId,
      date: dateStr,
    });

    expect(avail.success).toBe(true);
    expect(avail.availableSlots).not.toContain('09:00');
    expect(avail.availableSlots).not.toContain('09:20');
    expect(avail.availableSlots).toContain('09:40');
    expect(avail.availableSlots).toContain('10:00');
  }, 30000);
});
