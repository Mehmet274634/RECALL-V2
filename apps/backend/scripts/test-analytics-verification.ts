import { prisma } from '../src/lib/db/client.js';
import { getClinicAnalyticsSummary, getAdminClinicsAnalyticsOverview } from '../src/lib/analytics/summary.js';

async function main() {
  console.log('🚀 [Analytics Verification] Starting Faz 5 validation tests in ISOLATED test clinics...');

  const timestamp = Date.now();
  const testClinicRecallPhone = `+90000${String(timestamp).slice(-6)}1`;
  const testClinicAnadoluPhone = `+90000${String(timestamp).slice(-6)}2`;

  let testClinicRecall: { id: string; name: string } | null = null;
  let testClinicAnadolu: { id: string; name: string } | null = null;

  try {
    // 1. Create isolated test clinics
    testClinicRecall = await prisma.clinic.create({
      data: {
        name: `Automated Test Recall ${timestamp}`,
        phoneNumber: testClinicRecallPhone,
        timezone: 'Europe/Istanbul',
      },
    });

    testClinicAnadolu = await prisma.clinic.create({
      data: {
        name: `Automated Test Anadolu ${timestamp}`,
        phoneNumber: testClinicAnadoluPhone,
        timezone: 'Europe/Istanbul',
      },
    });

    console.log(`✓ Isolated Recall Clinic ID: ${testClinicRecall.id}`);
    console.log(`✓ Isolated Anadolu Clinic ID: ${testClinicAnadolu.id}`);

    // Create isolated doctors
    const doctorRecall = await prisma.doctor.create({
      data: {
        clinicId: testClinicRecall.id,
        name: 'Dr. Test Ahmet',
        specialty: 'Kardiyoloji',
        workingHours: {
          start: '09:00',
          end: '17:00',
          slotDurationMinutes: 30,
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        },
      },
    });

    const doctorAnadolu = await prisma.doctor.create({
      data: {
        clinicId: testClinicAnadolu.id,
        name: 'Dr. Test Selin',
        specialty: 'Dermatoloji',
        workingHours: {
          start: '10:00',
          end: '16:00',
          slotDurationMinutes: 30,
          days: ['monday', 'wednesday', 'friday'],
        },
      },
    });

    // Create isolated patients
    const patientRecall = await prisma.patient.create({
      data: {
        clinicId: testClinicRecall.id,
        fullName: 'Test Patient Recall',
        phoneNumber: '+905559990001',
      },
    });

    const patientAnadolu = await prisma.patient.create({
      data: {
        clinicId: testClinicAnadolu.id,
        fullName: 'Test Patient Anadolu',
        phoneNumber: '+905559990002',
      },
    });

    const from = '2026-09-20';
    const to = '2026-09-28';

    // Call Logs for Recall: 4 calls
    const call1 = await prisma.callLog.create({
      data: {
        clinicId: testClinicRecall.id,
        vapiCallId: `isolated-call-1-${timestamp}`,
        durationSeconds: 120,
        category: 'Randevu Talebi',
        endedReason: 'customer-ended-call',
        createdAt: new Date('2026-09-21T07:02:00Z'),
      },
    });

    const call2 = await prisma.callLog.create({
      data: {
        clinicId: testClinicRecall.id,
        vapiCallId: `isolated-call-2-${timestamp}`,
        durationSeconds: 60,
        category: 'Randevu Talebi',
        endedReason: 'assistant-ended-call',
        createdAt: new Date('2026-09-22T08:01:00Z'),
      },
    });

    await prisma.callLog.create({
      data: {
        clinicId: testClinicRecall.id,
        vapiCallId: `isolated-call-3-${timestamp}`,
        durationSeconds: 90,
        category: 'İptal / Değişiklik',
        endedReason: 'customer-ended-call',
        createdAt: new Date('2026-09-23T09:01:30Z'),
      },
    });

    await prisma.callLog.create({
      data: {
        clinicId: testClinicRecall.id,
        vapiCallId: `isolated-call-4-${timestamp}`,
        durationSeconds: 150,
        category: 'Genel Bilgi',
        endedReason: 'customer-ended-call',
        createdAt: new Date('2026-09-24T10:02:30Z'),
      },
    });

    // Call Log for Anadolu: 1 call
    const callAnadolu = await prisma.callLog.create({
      data: {
        clinicId: testClinicAnadolu.id,
        vapiCallId: `isolated-call-anadolu-1-${timestamp}`,
        durationSeconds: 120,
        category: 'Randevu Talebi',
        endedReason: 'customer-ended-call',
        createdAt: new Date('2026-09-22T11:02:00Z'),
      },
    });

    // Appointments for Recall:
    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: call1.id,
        status: 'COMPLETED',
        startsAt: new Date('2026-09-22T07:00:00Z'), // 10:00 TR
        endsAt: new Date('2026-09-22T07:30:00Z'),
        createdAt: new Date('2026-09-21T07:02:00Z'),
      },
    });

    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: call2.id,
        status: 'NO_SHOW',
        startsAt: new Date('2026-09-23T08:00:00Z'), // 11:00 TR
        endsAt: new Date('2026-09-23T08:30:00Z'),
        createdAt: new Date('2026-09-22T08:01:00Z'),
      },
    });

    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: null,
        status: 'CANCELLED',
        startsAt: new Date('2026-09-24T09:00:00Z'), // 12:00 TR
        endsAt: new Date('2026-09-24T09:30:00Z'),
        createdAt: new Date('2026-09-24T09:00:00Z'),
      },
    });

    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: null,
        status: 'SCHEDULED',
        startsAt: new Date('2026-09-25T10:00:00Z'), // 13:00 TR
        endsAt: new Date('2026-09-25T10:30:00Z'),
        createdAt: new Date('2026-09-25T10:00:00Z'),
      },
    });

    // Timezone test appointments:
    // 2026-09-25 23:30 TR is 2026-09-25T20:30:00Z
    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: null,
        status: 'COMPLETED',
        startsAt: new Date('2026-09-25T20:30:00Z'),
        endsAt: new Date('2026-09-25T21:00:00Z'),
        createdAt: new Date('2026-09-25T20:30:00Z'),
      },
    });

    // 2026-09-26 00:30 TR is 2026-09-25T21:30:00Z (UTC is 25th, Istanbul is 26th!)
    await prisma.appointment.create({
      data: {
        clinicId: testClinicRecall.id,
        doctorId: doctorRecall.id,
        patientId: patientRecall.id,
        createdViaCallId: null,
        status: 'COMPLETED',
        startsAt: new Date('2026-09-25T21:30:00Z'),
        endsAt: new Date('2026-09-25T22:00:00Z'),
        createdAt: new Date('2026-09-25T21:30:00Z'),
      },
    });

    // Anadolu appointment
    await prisma.appointment.create({
      data: {
        clinicId: testClinicAnadolu.id,
        doctorId: doctorAnadolu.id,
        patientId: patientAnadolu.id,
        createdViaCallId: callAnadolu.id,
        status: 'COMPLETED',
        startsAt: new Date('2026-09-22T08:00:00Z'),
        endsAt: new Date('2026-09-22T08:30:00Z'),
        createdAt: new Date('2026-09-22T08:00:00Z'),
      },
    });

    console.log('✓ Isolated test data successfully seeded.');

    // 2. EXECUTE getClinicAnalyticsSummary for Recall
    const recallSummary = await getClinicAnalyticsSummary(testClinicRecall.id, from, to);

    console.log('\n--- ISOLATED RECALL CLINIC SUMMARY RESULTS ---');
    console.log('Total Appointments:', recallSummary.appointments.total);
    console.log('Completed:', recallSummary.appointments.completed);
    console.log('No-Show:', recallSummary.appointments.noShow);
    console.log('Cancelled:', recallSummary.appointments.cancelled);
    console.log('Scheduled:', recallSummary.appointments.scheduled);
    console.log('No-Show Rate (%):', recallSummary.appointments.noShowRate);
    console.log('Cancellation Rate (%):', recallSummary.appointments.cancellationRate);
    console.log('Total Calls:', recallSummary.calls.totalCalls);
    console.log('Average Duration Seconds:', recallSummary.calls.averageDurationSeconds);
    console.log('Call-to-Appt Conversion Rate (%):', recallSummary.calls.conversionRate);

    // Assertions:
    if (recallSummary.appointments.total !== 6) {
      throw new Error(`Expected Recall total appointments 6, got ${recallSummary.appointments.total}`);
    }
    if (recallSummary.appointments.completed !== 3) {
      throw new Error(`Expected Recall completed 3, got ${recallSummary.appointments.completed}`);
    }
    if (recallSummary.appointments.noShow !== 1) {
      throw new Error(`Expected Recall noShow 1, got ${recallSummary.appointments.noShow}`);
    }

    // No-Show Rate = 1 / (3 + 1) = 25.0%
    const expectedNoShowRate = (1 / (3 + 1)) * 100;
    if (Math.abs(recallSummary.appointments.noShowRate - expectedNoShowRate) > 0.1) {
      throw new Error(`Expected noShowRate ${expectedNoShowRate}%, got ${recallSummary.appointments.noShowRate}%`);
    }
    console.log('✓ No-Show Rate Formula verified: 1 / (3 + 1) = 25%');

    // Cancellation Rate = 1 / 6 = 16.7%
    const expectedCancellationRate = 16.7;
    if (Math.abs(recallSummary.appointments.cancellationRate - expectedCancellationRate) > 0.1) {
      throw new Error(`Expected cancellationRate ${expectedCancellationRate}%, got ${recallSummary.appointments.cancellationRate}%`);
    }
    console.log('✓ Cancellation Rate Formula verified: 1 / 6 = 16.7%');

    // Call Conversion Rate = 2 / 4 = 50.0%
    const expectedConversionRate = (2 / 4) * 100;
    if (Math.abs(recallSummary.calls.conversionRate - expectedConversionRate) > 0.1) {
      throw new Error(`Expected conversionRate ${expectedConversionRate}%, got ${recallSummary.calls.conversionRate}%`);
    }
    console.log('✓ Conversion Rate Formula verified: 2 Vapi appointments created / 4 total calls = 50%');

    // Call Average Duration = (120 + 60 + 90 + 150) / 4 = 105 seconds
    if (recallSummary.calls.averageDurationSeconds !== 105) {
      throw new Error(`Expected avg duration 105s, got ${recallSummary.calls.averageDurationSeconds}s`);
    }
    console.log('✓ Call Average Duration verified: 105 seconds');

    // 3. TIMEZONE GROUPING TEST (23:30 vs 00:30 Istanbul time)
    const day25 = recallSummary.appointments.dailyTrend.find((d) => d.date === '2026-09-25');
    const day26 = recallSummary.appointments.dailyTrend.find((d) => d.date === '2026-09-26');

    if (!day25 || day25.total !== 2) {
      throw new Error(`Expected 2 appointments on 2026-09-25, got ${day25?.total}`);
    }
    if (!day26 || day26.total !== 1) {
      throw new Error(`Expected 1 appointment on 2026-09-26, got ${day26?.total}`);
    }
    console.log('✓ Timezone grouping verified: 23:30 is on 2026-09-25, and 00:30 is on 2026-09-26!');

    // 4. TENANT ISOLATION TEST
    const anadoluSummary = await getClinicAnalyticsSummary(testClinicAnadolu.id, from, to);
    if (anadoluSummary.appointments.total !== 1 || anadoluSummary.calls.totalCalls !== 1) {
      throw new Error('Tenant isolation check failed!');
    }
    console.log('✓ Tenant Isolation verified.');

    // 5. ADMIN OVERVIEW TEST
    const adminOverview = await getAdminClinicsAnalyticsOverview();
    const recallInAdmin = adminOverview.clinics.find((c) => c.id === testClinicRecall!.id);
    if (!recallInAdmin) {
      throw new Error('Admin overview did not return test clinic!');
    }
    console.log('✓ Admin Platform Overview verified.');

    console.log('\n🎉 ALL ISOLATED VERIFICATION TESTS PASSED!');
  } finally {
    // 6. CLEAN UP TEST CLINICS AND ALL RELATED DATA COMPLETELY
    console.log('\n🧹 Cleaning up isolated test clinics and test data...');
    const clinicIdsToDelete = [testClinicRecall?.id, testClinicAnadolu?.id].filter(Boolean) as string[];

    if (clinicIdsToDelete.length > 0) {
      await prisma.appointment.deleteMany({ where: { clinicId: { in: clinicIdsToDelete } } });
      await prisma.callLog.deleteMany({ where: { clinicId: { in: clinicIdsToDelete } } });
      await prisma.doctor.deleteMany({ where: { clinicId: { in: clinicIdsToDelete } } });
      await prisma.patient.deleteMany({ where: { clinicId: { in: clinicIdsToDelete } } });
      await prisma.clinic.deleteMany({ where: { id: { in: clinicIdsToDelete } } });
      console.log(`✓ Cleaned up ${clinicIdsToDelete.length} isolated test clinics and all associated data.`);
    }
  }
}

main()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
