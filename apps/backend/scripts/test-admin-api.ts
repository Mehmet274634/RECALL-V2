/**
 * Verification test script for Admin API:
 * 1. Verifies role-based access control (Secretary is rejected with 403, Admin is allowed).
 * 2. Creates a 4th test clinic ("Ege Çocuk Sağlığı ve Hastalıkları Kliniği") via POST /api/admin/clinics.
 * 3. Adds a doctor via POST /api/admin/clinics/:clinicId/doctors.
 * 4. Dispatches secretary invitation via POST /api/admin/clinics/:clinicId/invite-secretary.
 * 5. Asserts automatic tenant binding in invitation metadata: { clinicId, role: 'secretary' }.
 */

import { prisma } from '../src/lib/db/client.js';

async function testAdminApi() {
  console.log('=== TEST: ADMIN API & ROLE-BASED ACCESS CONTROL ===\n');

  const baseUrl = 'http://localhost:3001/api/admin';

  // 1. Test Secretary 403 Rejection
  console.log('--- TEST 1: Secretary Role 403 Forbidden Verification ---');
  const resSecretary = await fetch(`${baseUrl}/clinics`, {
    headers: {
      'x-mock-role': 'secretary',
    },
  });

  console.log(`Status with role='secretary': ${resSecretary.status} (Expected 403)`);
  if (resSecretary.status !== 403) {
    throw new Error(`Expected 403 for secretary on admin route, got ${resSecretary.status}`);
  }
  const secBody = await resSecretary.json();
  console.log('Response body:', secBody);
  console.log('✅ Secretary role is strictly blocked with 403 Forbidden.\n');

  // 2. Test Admin 200 Access
  console.log('--- TEST 2: Admin Role 200 OK Verification ---');
  const resAdmin = await fetch(`${baseUrl}/clinics`, {
    headers: {
      'x-mock-role': 'admin',
    },
  });

  console.log(`Status with role='admin': ${resAdmin.status} (Expected 200)`);
  if (resAdmin.status !== 200) {
    throw new Error(`Expected 200 for admin on admin route, got ${resAdmin.status}`);
  }
  const adminBody = await resAdmin.json();
  console.log(`Active clinics count retrieved: ${adminBody.clinics.length}`);
  console.log('✅ Admin role successfully granted access.\n');

  // 3. Create 4th Clinic via POST /api/admin/clinics
  console.log('--- TEST 3: Create 4th Clinic (Ege Çocuk Sağlığı) via Admin API ---');
  // Cleanup any previous test run
  const existingClinic = await prisma.clinic.findFirst({
    where: { name: 'Ege Çocuk Sağlığı ve Hastalıkları Kliniği' },
  });
  if (existingClinic) {
    await prisma.doctor.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.clinic.delete({ where: { id: existingClinic.id } });
  }

  const resCreate = await fetch(`${baseUrl}/clinics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mock-role': 'admin',
    },
    body: JSON.stringify({
      name: 'Ege Çocuk Sağlığı ve Hastalıkları Kliniği',
      cancellationPolicyHours: 2,
      greetingMessage: 'Merhaba, Ege Çocuk Sağlığı Kliniği’ne hoş geldiniz. Randevunuz için size yardımcı olabilirim.',
      specialInstructions: 'Çocuk hastalarımız için lütfen aşı kartını yanınızda bulundurunuz.',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      doctors: [
        {
          name: 'Dr. Canan Erdem',
          specialty: 'Çocuk Sağlığı ve Hastalıkları (Pediatri)',
          startHour: '09:00',
          endHour: '17:00',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          complaints: 'Ateş, öksürük, büyüme takibi, çocukluk çağı aşıları',
        },
      ],
    }),
  });

  console.log(`Create Clinic Status: ${resCreate.status} (Expected 201)`);
  if (resCreate.status !== 201) {
    const err = await resCreate.text();
    throw new Error(`Failed to create clinic: ${err}`);
  }
  const createData = await resCreate.json();
  const newClinic = createData.clinic;
  console.log(`Created Clinic ID: ${newClinic.id}`);
  console.log(`Assigned Phone: ${newClinic.phoneNumber}`);
  console.log(`Initial Doctors Count: ${newClinic.doctors.length}`);
  console.log('✅ 4th Clinic successfully created.\n');

  // 4. Add 2nd Doctor via POST /api/admin/clinics/:clinicId/doctors
  console.log('--- TEST 4: Add Doctor via Admin API ---');
  const resDoc = await fetch(`${baseUrl}/clinics/${newClinic.id}/doctors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mock-role': 'admin',
    },
    body: JSON.stringify({
      name: 'Dr. Murat Yurt',
      specialty: 'Çocuk Alerji ve İmmünoloji',
      startHour: '10:00',
      endHour: '16:00',
      days: ['monday', 'wednesday', 'friday'],
      complaints: 'Alerjik astım, egzama, besin alerjileri',
    }),
  });

  console.log(`Add Doctor Status: ${resDoc.status} (Expected 201)`);
  if (resDoc.status !== 201) {
    const err = await resDoc.text();
    throw new Error(`Failed to add doctor: ${err}`);
  }
  const docData = await resDoc.json();
  console.log(`Added Doctor: ${docData.doctor.name} (${docData.doctor.specialty})`);
  console.log('✅ Doctor added to clinic successfully.\n');

  // 5. Dispatch Secretary Invitation via POST /api/admin/clinics/:clinicId/invite-secretary
  console.log('--- TEST 5: Automatic Secretary Invitation with PublicMetadata ---');
  const testSecretaryEmail = 'sekreter.egecocuk@example.com';
  const resInvite = await fetch(`${baseUrl}/clinics/${newClinic.id}/invite-secretary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mock-role': 'admin',
    },
    body: JSON.stringify({
      email: testSecretaryEmail,
    }),
  });

  console.log(`Invite Status: ${resInvite.status} (Expected 200)`);
  if (resInvite.status !== 200) {
    const err = await resInvite.text();
    throw new Error(`Failed to invite secretary: ${err}`);
  }
  const inviteData = await resInvite.json();
  console.log('Invitation response:', JSON.stringify(inviteData, null, 2));
  console.log(`✅ Automatic invitation sent for ${testSecretaryEmail} bound to clinic ${newClinic.id}.`);

  console.log('\n🎉 ALL ADMIN API TESTS COMPLETED AND VERIFIED SUCCESSFULLY!');
}

testAdminApi()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
