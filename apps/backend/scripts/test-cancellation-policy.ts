import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db/client.js';
import { getDefaultClinic } from '../src/lib/db/clinic.js';
import { cancelAppointment, rescheduleAppointment } from '../src/lib/scheduling/cancellation.js';
import { lookupAppointment } from '../src/lib/scheduling/lookup.js';
import { resolveToolPhone, isTurkishNameMatch, normalizeTurkishName } from '../src/lib/phone.js';

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: CANCELLATION POLICY, CALLER ID, AND NAME MATCHING');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PART A: Unit Tests for resolveToolPhone (İŞ 2)
  // -------------------------------------------------------------
  console.log('--- PART A: resolveToolPhone (Caller ID & Phone Validation) ---');

  // A1: explicit phone provided and valid
  const resA1 = resolveToolPhone({ explicitPhone: '0532 123 45 67' });
  assert.equal(resA1.phone, '05321234567');
  assert.equal(resA1.errorMessage, undefined);
  console.log('[PASS] A1: Explicit valid phone resolved correctly to 05321234567');

  // A2: explicit phone provided but invalid format
  const resA2 = resolveToolPhone({ explicitPhone: '0532 123 45 6789' });
  assert.equal(resA2.phone, undefined);
  assert.equal(resA2.errorMessage, 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.');
  console.log('[PASS] A2: Explicit invalid phone rejected with standard message');

  // A3: phone empty and useCallerNumber !== true -> DO NOT fall back to caller ID
  const resA3 = resolveToolPhone({
    explicitPhone: '',
    useCallerNumber: false,
    defaultCustomerNumber: '+905321234567',
  });
  assert.equal(resA3.phone, undefined);
  assert.equal(
    resA3.errorMessage,
    'Telefon numarası alınmadı. Hastadan numara ya da "bu numaradan ulaşın" onayı iste.',
  );
  console.log('[PASS] A3: Empty phone without caller ID confirmation rejected without fallback');

  // A4: useCallerNumber === true but caller number missing (web test / no caller ID)
  const resA4 = resolveToolPhone({
    explicitPhone: '',
    useCallerNumber: true,
    defaultCustomerNumber: undefined,
  });
  assert.equal(resA4.phone, undefined);
  assert.equal(
    resA4.errorMessage,
    'Arayan numara tespit edilemedi. Lütfen hastadan telefon numarasını isteyiniz.',
  );
  console.log('[PASS] A4: useCallerNumber=true with missing caller ID rejects asking for number');

  // A5: useCallerNumber === true and caller number present -> accepted and normalized
  const resA5 = resolveToolPhone({
    explicitPhone: '',
    useCallerNumber: true,
    defaultCustomerNumber: '+905444442170',
  });
  assert.equal(resA5.phone, '05444442170');
  assert.equal(resA5.errorMessage, undefined);
  console.log('[PASS] A5: useCallerNumber=true with valid caller ID properly formatted to 05444442170');

  // -------------------------------------------------------------
  // PART B: Unit Tests for Turkish Name Matching (İŞ 3)
  // -------------------------------------------------------------
  console.log('\n--- PART B: Turkish Name Matching ---');
  assert.equal(isTurkishNameMatch('Ayşe Yılmaz', 'ayşe yılmaz'), true);
  assert.equal(isTurkishNameMatch('Ayşe Yılmaz', 'AYŞE YILMAZ'), true);
  assert.equal(isTurkishNameMatch('Ayşe Yılmaz', 'ayse yilmaz'), true);
  assert.equal(isTurkishNameMatch('Çağlar Öztürk', 'caglar ozturk'), true);
  assert.equal(isTurkishNameMatch('Mehmet Öz', 'Ali Demir'), false);
  console.log('[PASS] B1: Turkish lowercasing and diacritic normalization behaves as expected');

  // -------------------------------------------------------------
  // PART C: Integration Tests with DB (İŞ 1 & İŞ 3)
  // -------------------------------------------------------------
  console.log('\n--- PART C: Cancellation Policy Hours & Boundary Conditions ---');

  const defaultClinic = await getDefaultClinic();
  const policyHours = defaultClinic.cancellationPolicyHours ?? 2;
  console.log(`Clinic ID: ${defaultClinic.id}, CancellationPolicyHours: ${policyHours}h`);

  const testDoctor = await prisma.doctor.findFirst({
    where: { clinicId: defaultClinic.id },
  });
  if (!testDoctor) {
    throw new Error('No doctor found in DB for testing');
  }

  // Create or update a test patient
  const TEST_PHONE = '05999990001';
  const TEST_PATIENT_NAME = 'Ayşe Yılmaz';
  let patient = await prisma.patient.findFirst({
    where: { clinicId: defaultClinic.id, phoneNumber: '+905999990001' },
  });
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        clinicId: defaultClinic.id,
        fullName: TEST_PATIENT_NAME,
        phoneNumber: '+905999990001',
      },
    });
  }

  const nowMs = Date.now();
  const EXPECTED_POLICY_REJECT_MSG = `Randevuya ${policyHours} saatten az kaldığı için online iptal/değişiklik yapılamıyor. Sizi yetkili sekreterimize aktarabilirim.`;

  // Helper to create test appointment at specific relative hour offset
  async function createTestAppt(offsetHours: number) {
    const startsAt = new Date(nowMs + offsetHours * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    return prisma.appointment.create({
      data: {
        clinicId: defaultClinic.id,
        doctorId: testDoctor.id,
        patientId: patient!.id,
        startsAt,
        endsAt,
        status: 'SCHEDULED',
      },
    });
  }

  // Scenario 1: N saatten az kala (e.g. 1 hour remaining) -> MUST REJECT
  const apptLessThanN = await createTestAppt(1);
  const cancelResLess = await cancelAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptLessThanN.id,
    patientName: 'ayşe yılmaz',
    patientPhone: TEST_PHONE,
  });
  assert.equal(cancelResLess.success, false);
  assert.equal(cancelResLess.message, EXPECTED_POLICY_REJECT_MSG);
  console.log(`[PASS] C1: Appointment with 1h (< ${policyHours}h) rejected with policy message`);

  // Scenario 2: Geçmiş randevu (e.g. -2 hours, in the past) -> MUST REJECT
  const apptPast = await createTestAppt(-2);
  const cancelResPast = await cancelAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptPast.id,
    patientName: 'ayşe yılmaz',
    patientPhone: TEST_PHONE,
  });
  assert.equal(cancelResPast.success, false);
  assert.equal(cancelResPast.message, EXPECTED_POLICY_REJECT_MSG);
  console.log(`[PASS] C2: Past appointment rejected with policy message`);

  // Scenario 3: Tam N saat kala (e.g. exactly N hours + a small 500ms margin for execution) -> MUST ACCEPT
  // Since time advances slightly during test execution, give +2.01 hours so at execution time it's >= N hours.
  const apptExactlyN = await createTestAppt(policyHours + 0.02);
  const cancelResExact = await cancelAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptExactlyN.id,
    patientName: 'AYSE YILMAZ',
    patientPhone: TEST_PHONE,
  });
  assert.equal(cancelResExact.success, true);
  assert.ok(cancelResExact.message.includes('başarıyla iptal edilmiştir'));
  console.log(`[PASS] C3: Appointment at boundary (>= ${policyHours}h) accepted and cancelled`);

  // Scenario 4: N saatten fazla kala (e.g. N + 5 hours) -> MUST ACCEPT
  const apptMoreThanN = await createTestAppt(policyHours + 5);
  const cancelResMore = await cancelAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptMoreThanN.id,
    patientName: 'Ayşe Yılmaz',
    patientPhone: TEST_PHONE,
  });
  assert.equal(cancelResMore.success, true);
  assert.ok(cancelResMore.message.includes('başarıyla iptal edilmiştir'));
  console.log(`[PASS] C4: Appointment with > ${policyHours}h accepted and cancelled`);

  // Scenario 5: Reschedule check on OLD appointment (< N hours) -> MUST REJECT
  const apptRescheduleUnderN = await createTestAppt(1);
  const rescheduleResUnder = await rescheduleAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptRescheduleUnderN.id,
    patientName: 'ayşe yılmaz',
    patientPhone: TEST_PHONE,
    newDate: '2026-11-20',
    newTime: '14:00',
  });
  assert.equal(rescheduleResUnder.success, false);
  assert.equal(rescheduleResUnder.message, EXPECTED_POLICY_REJECT_MSG);
  console.log(`[PASS] C5: Reschedule on appointment (< ${policyHours}h) rejected with policy message`);

  // Scenario 6: Name mismatch on lookup -> MUST return "Bu bilgilerle kayıtlı randevu bulunamadı."
  const lookupMismatch = await lookupAppointment({
    clinicId: defaultClinic.id,
    patientName: 'Fatma Kara', // different name
    patientPhone: TEST_PHONE,
  });
  assert.equal(lookupMismatch.success, false);
  assert.equal(lookupMismatch.message, 'Bu bilgilerle kayıtlı randevu bulunamadı.');
  console.log(`[PASS] C6: Lookup with phone match but name mismatch returned generic message (no leak)`);

  // Scenario 7: Name mismatch on cancellation -> MUST return "Bu bilgilerle kayıtlı randevu bulunamadı."
  const cancelMismatch = await cancelAppointment({
    clinicId: defaultClinic.id,
    appointmentId: apptLessThanN.id,
    patientName: 'Fatma Kara',
    patientPhone: TEST_PHONE,
  });
  assert.equal(cancelMismatch.success, false);
  assert.equal(cancelMismatch.message, 'Bu bilgilerle kayıtlı randevu bulunamadı.');
  console.log(`[PASS] C7: Cancellation with name mismatch returned generic message`);

  // Clean up test appointments and patient
  await prisma.appointment.deleteMany({
    where: { patientId: patient!.id },
  });
  await prisma.patient.delete({
    where: { id: patient!.id },
  });
  console.log('\n[CLEANUP] Test records cleaned up successfully.');

  console.log('\n================================================================');
  console.log('✅ ALL TESTS PASSED SUCCESSFULLY (İŞ 1, İŞ 2, İŞ 3)');
  console.log('================================================================');
}

runTests()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
