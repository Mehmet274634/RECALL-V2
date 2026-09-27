import 'dotenv/config';
import { prisma } from '../src/lib/db/client.js';
import { getDefaultClinic } from '../src/lib/db/clinic.js';
import { bookAppointment } from '../src/lib/scheduling/booking.js';
import { lookupAppointment } from '../src/lib/scheduling/lookup.js';
import { cancelAppointment, rescheduleAppointment } from '../src/lib/scheduling/cancellation.js';
import { resolveClinicIdFromToken } from '../src/lib/auth/clerk.js';
import { isValidPhone } from '../src/lib/phone.js';

async function runFollowupTests() {
  console.log('=====================================================');
  console.log('  RECALL FAZ 1 REVIEW — TAKİP TESTLERİ');
  console.log('=====================================================\n');

  const clinic = await getDefaultClinic();
  const doctors = await prisma.doctor.findMany({ where: { clinicId: clinic.id } });
  if (doctors.length < 2) {
    throw new Error('At least 2 doctors required for testing');
  }
  const [docA, docB] = doctors;

  // -----------------------------------------------------------------
  // 1. CLERK TOKEN CLINIC RESOLUTION & SILENT FALLBACK REMOVAL
  // -----------------------------------------------------------------
  console.log('--- TEST 1: Token clinicId Resolution (No Silent Fallback) ---');

  // Case 1.1: Empty token claims -> MUST be null (NOT defaulted!)
  const emptyRes = await resolveClinicIdFromToken({});
  console.log(`Empty claims resolution: ${emptyRes} (Expected: null)`);
  if (emptyRes !== null) {
    throw new Error(`Silent fallback still exists! Got: ${emptyRes}`);
  }

  // Case 1.2: Token with direct clinicId claim
  const directRes = await resolveClinicIdFromToken({ clinicId: 'clinic_test_123' });
  console.log(`Direct claim resolution: ${directRes} (Expected: clinic_test_123)`);
  if (directRes !== 'clinic_test_123') {
    throw new Error('Direct claim failed');
  }

  // Case 1.3: Token with public_metadata.clinicId
  const metaRes = await resolveClinicIdFromToken({ public_metadata: { clinicId: 'clinic_meta_456' } });
  console.log(`Metadata claim resolution: ${metaRes} (Expected: clinic_meta_456)`);
  if (metaRes !== 'clinic_meta_456') {
    throw new Error('Metadata claim failed');
  }

  // Case 1.4: Token with unmapped org_id -> MUST be null
  const unmappedOrgRes = await resolveClinicIdFromToken({ org_id: 'org_unmapped_random' });
  console.log(`Unmapped org_id resolution: ${unmappedOrgRes} (Expected: null)`);
  if (unmappedOrgRes !== null) {
    throw new Error('Unmapped org_id unexpectedly resolved to a clinic');
  }

  console.log('✅ Silent production fallback completely removed! Tokens without clinic claims are rejected.\n');

  // -----------------------------------------------------------------
  // 2. INVALID PHONE NUMBER REJECTION (isValidPhone in all entrypoints)
  // -----------------------------------------------------------------
  console.log('--- TEST 2: Invalid Phone Number Rejection ---');
  const invalidPhones = ['123', '0532', 'abcde', '0 (532)', ''];

  for (const phone of invalidPhones) {
    // bookAppointment
    const bookRes = await bookAppointment({
      clinicId: clinic.id,
      patientName: 'Test Invalid',
      patientPhone: phone,
      doctorId: docA.id,
      date: '2026-11-20',
      time: '14:00',
    });
    console.log(`bookAppointment with "${phone}": success=${bookRes.success}, message="${bookRes.message}"`);
    if (bookRes.success) {
      throw new Error(`bookAppointment accepted invalid phone: "${phone}"`);
    }

    // lookupAppointment
    if (phone) {
      const lookupRes = await lookupAppointment({
        clinicId: clinic.id,
        patientPhone: phone,
      });
      console.log(`lookupAppointment with "${phone}": success=${lookupRes.success}, message="${lookupRes.message}"`);
      if (lookupRes.success && lookupRes.appointments.length > 0) {
        throw new Error(`lookupAppointment accepted invalid phone: "${phone}"`);
      }

      // cancelAppointment
      const cancelRes = await cancelAppointment({
        clinicId: clinic.id,
        patientPhone: phone,
      });
      if (cancelRes.success) {
        throw new Error(`cancelAppointment accepted invalid phone: "${phone}"`);
      }

      // rescheduleAppointment
      const reschedRes = await rescheduleAppointment({
        clinicId: clinic.id,
        patientPhone: phone,
        newDate: '2026-11-20',
        newTime: '15:00',
      });
      if (reschedRes.success) {
        throw new Error(`rescheduleAppointment accepted invalid phone: "${phone}"`);
      }
    }
  }

  // Valid phone must succeed
  const validPhone = '0532 999 88 77';
  console.log(`Testing valid phone booking with "${validPhone}"...`);
  const validBook = await bookAppointment({
    clinicId: clinic.id,
    patientName: 'Valid Phone Patient',
    patientPhone: validPhone,
    doctorId: docA.id,
    date: '2026-11-20',
    time: '14:00',
  });
  console.log(`bookAppointment with valid phone: success=${validBook.success}, message="${validBook.message}"`);
  if (!validBook.success) {
    throw new Error('bookAppointment failed for valid phone number');
  }

  console.log('✅ isValidPhone is actively enforced across all scheduling functions.\n');

  // -----------------------------------------------------------------
  // 3. RESCHEDULE CONCURRENCY & DEADLOCK-FREE LOCKING
  // -----------------------------------------------------------------
  console.log('--- TEST 3: Reschedule Cross-Doctor Deadlock-Free Locking ---');
  // Create an appointment with Doctor B
  const bookB = await bookAppointment({
    clinicId: clinic.id,
    patientName: 'Swap Patient B',
    patientPhone: '0542 888 77 66',
    doctorId: docB.id,
    date: '2026-11-20',
    time: '16:00',
  });

  const apptAId = validBook.appointment!.id;
  const apptBId = bookB.appointment!.id;

  console.log(`Simultaneously swapping appointments between Doctor A (${docA.name}) and Doctor B (${docB.name})...`);

  // Concurrent swap: Appt A moves to Doc B, Appt B moves to Doc A
  const [swapA, swapB] = await Promise.all([
    rescheduleAppointment({
      clinicId: clinic.id,
      appointmentId: apptAId,
      newDoctorId: docB.id,
      newDate: '2026-11-20',
      newTime: '10:00',
    }),
    rescheduleAppointment({
      clinicId: clinic.id,
      appointmentId: apptBId,
      newDoctorId: docA.id,
      newDate: '2026-11-20',
      newTime: '11:00',
    }),
  ]);

  console.log(`Swap A result: success=${swapA.success}, message="${swapA.message}"`);
  console.log(`Swap B result: success=${swapB.success}, message="${swapB.message}"`);
  if (!swapA.success || !swapB.success) {
    throw new Error('Concurrent reschedule swap failed');
  }

  // Verify DB updated doctors
  const updatedA = await prisma.appointment.findUnique({ where: { id: apptAId } });
  const updatedB = await prisma.appointment.findUnique({ where: { id: apptBId } });

  if (updatedA?.doctorId !== docB.id || updatedB?.doctorId !== docA.id) {
    throw new Error('Doctors were not swapped correctly in database');
  }

  console.log('✅ Cross-doctor concurrent reschedule completed without deadlock via sorted FOR UPDATE locking.\n');

  // -----------------------------------------------------------------
  // CLEANUP
  // -----------------------------------------------------------------
  await prisma.appointment.deleteMany({
    where: { id: { in: [apptAId, apptBId] } },
  });
  await prisma.patient.deleteMany({
    where: {
      fullName: { in: ['Valid Phone Patient', 'Swap Patient B', 'Test Invalid'] },
    },
  });
  console.log('🧹 Cleaned up test data.');

  console.log('=====================================================');
  console.log('  ALL 3 FOLLOW-UP TESTS PASSED WITH 100% SUCCESS!');
  console.log('=====================================================');
}

runFollowupTests()
  .catch((err) => {
    console.error('Follow-up test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
