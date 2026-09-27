/**
 * Database seed script for RECALL.
 *
 * Usage: pnpm --filter backend db:seed
 *
 * Populates:
 * - 1 Clinic: Recall Sağlık Kliniği
 * - 3 Doctors with specialties and working hours
 * - Sample Patients
 * - Sample Appointments and CallLog
 */

import { PrismaClient, AppointmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] Starting database seed...');

  // 1. Create or update Default Clinic
  const clinic = await prisma.clinic.upsert({
    where: { phoneNumber: '+902125550101' },
    update: {
      name: 'Recall Sağlık Kliniği',
      timezone: 'Europe/Istanbul',
    },
    create: {
      name: 'Recall Sağlık Kliniği',
      phoneNumber: '+902125550101',
      timezone: 'Europe/Istanbul',
    },
  });
  console.log(`[seed] Clinic ready: ${clinic.name} (${clinic.id})`);

  // 2. Create Doctors
  const doctorData = [
    {
      name: 'Dr. Ahmet Yılmaz',
      specialty: 'Dahiliye',
      workingHours: {
        start: '09:00',
        end: '17:00',
        slotDurationMinutes: 30,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
    },
    {
      name: 'Dr. Zeynep Kaya',
      specialty: 'Kardiyoloji',
      workingHours: {
        start: '09:00',
        end: '16:00',
        slotDurationMinutes: 30,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
    },
    {
      name: 'Dr. Mehmet Demir',
      specialty: 'Kulak Burun Boğaz',
      workingHours: {
        start: '10:00',
        end: '18:00',
        slotDurationMinutes: 30,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
    },
  ];

  const doctors = [];
  for (const doc of doctorData) {
    const existing = await prisma.doctor.findFirst({
      where: { clinicId: clinic.id, name: doc.name },
    });
    if (existing) {
      const updated = await prisma.doctor.update({
        where: { id: existing.id },
        data: { specialty: doc.specialty, workingHours: doc.workingHours },
      });
      doctors.push(updated);
    } else {
      const created = await prisma.doctor.create({
        data: {
          clinicId: clinic.id,
          name: doc.name,
          specialty: doc.specialty,
          workingHours: doc.workingHours,
        },
      });
      doctors.push(created);
    }
  }
  console.log(`[seed] Doctors ready: ${doctors.map((d) => d.name).join(', ')}`);

  // 3. Create Sample Patients
  const patientData = [
    { fullName: 'Canan Özdemir', phoneNumber: '+905321112233' },
    { fullName: 'Murat Arslan', phoneNumber: '+905423334455' },
    { fullName: 'Elif Şahin', phoneNumber: '+905556667788' },
  ];

  const patients = [];
  for (const p of patientData) {
    const patient = await prisma.patient.upsert({
      where: {
        clinicId_phoneNumber: {
          clinicId: clinic.id,
          phoneNumber: p.phoneNumber,
        },
      },
      update: { fullName: p.fullName },
      create: {
        clinicId: clinic.id,
        fullName: p.fullName,
        phoneNumber: p.phoneNumber,
      },
    });
    patients.push(patient);
  }
  console.log(`[seed] Patients ready: ${patients.map((p) => p.fullName).join(', ')}`);

  // 4. Sample CallLog
  const sampleCall = await prisma.callLog.upsert({
    where: { vapiCallId: 'seed-call-sample-001' },
    update: {},
    create: {
      clinicId: clinic.id,
      vapiCallId: 'seed-call-sample-001',
      transcript:
        'Hasta: Merhaba, Dr. Ahmet Bey için randevu almak istiyorum.\nAsistan: Tabii, yarın saat 10:00 uygun mudur?\nHasta: Evet uygundur, onaylıyorum.',
      summary: 'Kategori: Randevu Talebi. Hasta Dr. Ahmet Yılmaz için randevu aldı.',
      endedReason: 'customer-ended-call',
    },
  });

  // 5. Sample Appointments (today and tomorrow)
  const now = new Date();
  const today10 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const today1030 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30, 0);

  const today14 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
  const today1430 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30, 0);

  const tomorrow11 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0, 0);
  const tomorrow1130 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 30, 0);

  // Check if appointments already exist
  const existingAppt = await prisma.appointment.findFirst({
    where: { clinicId: clinic.id },
  });

  if (!existingAppt) {
    await prisma.appointment.createMany({
      data: [
        {
          clinicId: clinic.id,
          doctorId: doctors[0].id,
          patientId: patients[0].id,
          startsAt: today10,
          endsAt: today1030,
          status: AppointmentStatus.SCHEDULED,
          createdViaCallId: sampleCall.id,
        },
        {
          clinicId: clinic.id,
          doctorId: doctors[1].id,
          patientId: patients[1].id,
          startsAt: today14,
          endsAt: today1430,
          status: AppointmentStatus.SCHEDULED,
        },
        {
          clinicId: clinic.id,
          doctorId: doctors[0].id,
          patientId: patients[2].id,
          startsAt: tomorrow11,
          endsAt: tomorrow1130,
          status: AppointmentStatus.SCHEDULED,
        },
      ],
    });
    console.log('[seed] Sample appointments created.');
  }

  console.log('[seed] Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

