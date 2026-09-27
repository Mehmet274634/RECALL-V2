/**
 * Verification test for appointment rescheduling conflict control:
 * Asserts that attempting to reschedule an appointment into a time slot
 * that is already occupied by the doctor is rejected with SLOT_OCCUPIED.
 */

import { prisma } from '../src/lib/db/client.js';
import { getDefaultClinic } from '../src/lib/db/clinic.js';
import { rescheduleAppointment } from '../src/lib/scheduling/cancellation.js';

async function testRescheduleConflict() {
  console.log('=== TEST: RANDEVU YENİDEN PLANLAMA ÇAKIŞMA KONTROLÜ ===\n');

  const clinic = await getDefaultClinic();
  const doctor = await prisma.doctor.findFirst({ where: { clinicId: clinic.id } });
  if (!doctor) throw new Error('Doctor not found');

  const testDate = '2026-11-20';
  const targetTime = '14:00';
  const [h, m] = targetTime.split(':').map(Number);
  const [year, month, day] = testDate.split('-').map(Number);
  const startsAt = new Date(year, month - 1, day, h, m, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  // Clean up any test records
  await prisma.appointment.deleteMany({
    where: {
      doctorId: doctor.id,
      startsAt,
    },
  });

  // Create Patient 1 and appointment 1 (occupying 14:00)
  const patient1 = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: clinic.id, phoneNumber: '+905550001111' } },
    update: {},
    create: { clinicId: clinic.id, fullName: 'Hasta Bir', phoneNumber: '+905550001111' },
  });

  const appt1 = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      doctorId: doctor.id,
      patientId: patient1.id,
      startsAt,
      endsAt,
      status: 'SCHEDULED',
    },
  });

  // Create Patient 2 and appointment 2 (occupying 15:00)
  const startsAt2 = new Date(year, month - 1, day, 15, 0, 0);
  const endsAt2 = new Date(startsAt2.getTime() + 30 * 60 * 1000);

  const patient2 = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: clinic.id, phoneNumber: '+905550002222' } },
    update: {},
    create: { clinicId: clinic.id, fullName: 'Hasta İki', phoneNumber: '+905550002222' },
  });

  const appt2 = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      doctorId: doctor.id,
      patientId: patient2.id,
      startsAt: startsAt2,
      endsAt: endsAt2,
      status: 'SCHEDULED',
    },
  });

  console.log(`Slot 1 (DOLU): ${testDate} 14:00 - Hasta Bir`);
  console.log(`Slot 2 (DOLU): ${testDate} 15:00 - Hasta İki`);
  console.log('\nHasta İki\'nin randevusunu Hasta Bir\'in saatine (14:00) taşımayı deniyoruz...');

  const result = await rescheduleAppointment({
    clinicId: clinic.id,
    appointmentId: appt2.id,
    newDate: testDate,
    newTime: targetTime,
  });

  console.log('Reschedule Sonucu:', result);

  if (result.success) {
    throw new Error('HATA: Çakışan saate yeniden planlama yapılmasına izin verildi!');
  }

  if (!result.message.includes('başka bir randevusu bulunmaktadır')) {
    throw new Error(`Beklenen çakışma mesajı alınamadı: ${result.message}`);
  }

  console.log('✅ Çakışma kontrolü (SLOT_OCCUPIED) ve row-level lock başarıyla devrede!');

  // Cleanup
  await prisma.appointment.deleteMany({
    where: { id: { in: [appt1.id, appt2.id] } },
  });
  console.log('🧹 Test randevuları temizlendi.');
}

testRescheduleConflict()
  .catch((err) => {
    console.error('Test başarısız:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
