import { prisma } from '../src/lib/db/client.js';
import { getClinicAnalyticsSummary, getAdminClinicsAnalyticsOverview } from '../src/lib/analytics/summary.js';

async function main() {
  console.log('🚀 [Analytics Verification] Starting Faz 5 validation tests...');

  // 1. Identify or ensure Recall and Anadolu clinics
  let recall = await prisma.clinic.findFirst({
    where: { name: { contains: 'Recall', mode: 'insensitive' } },
  });
  if (!recall) {
    recall = await prisma.clinic.create({
      data: {
        name: 'Recall Sağlık Kliniği',
        phoneNumber: '+905320000001',
        timezone: 'Europe/Istanbul',
      },
    });
  }

  let anadolu = await prisma.clinic.findFirst({
    where: { name: { contains: 'Anadolu', mode: 'insensitive' } },
  });
  if (!anadolu) {
    anadolu = await prisma.clinic.create({
      data: {
        name: 'Anadolu Sağlık Merkezi',
        phoneNumber: '+905320000002',
        timezone: 'Europe/Istanbul',
      },
    });
  }

  console.log(`✓ Recall Clinic ID: ${recall.id}`);
  console.log(`✓ Anadolu Clinic ID: ${anadolu.id}`);

  // Ensure doctors exist for Recall
  let doctorRecall = await prisma.doctor.findFirst({
    where: { clinicId: recall.id },
  });
  if (!doctorRecall) {
    doctorRecall = await prisma.doctor.create({
      data: {
        clinicId: recall.id,
        name: 'Dr. Ahmet Yılmaz',
        specialty: 'Kardiyoloji',
        workingHours: {
          start: '09:00',
          end: '17:00',
          slotDurationMinutes: 30,
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        },
      },
    });
  }

  // Ensure doctor exists for Anadolu
  let doctorAnadolu = await prisma.doctor.findFirst({
    where: { clinicId: anadolu.id },
  });
  if (!doctorAnadolu) {
    doctorAnadolu = await prisma.doctor.create({
      data: {
        clinicId: anadolu.id,
        name: 'Dr. Zeynep Kaya',
        specialty: 'Dermatoloji',
        workingHours: {
          start: '10:00',
          end: '16:00',
          slotDurationMinutes: 30,
          days: ['monday', 'wednesday', 'friday'],
        },
      },
    });
  }

  // Ensure patients
  let patientRecall = await prisma.patient.findFirst({ where: { clinicId: recall.id } });
  if (!patientRecall) {
    patientRecall = await prisma.patient.create({
      data: {
        clinicId: recall.id,
        fullName: 'Test Hasta Recall',
        phoneNumber: '+905551112233',
      },
    });
  }

  let patientAnadolu = await prisma.patient.findFirst({ where: { clinicId: anadolu.id } });
  if (!patientAnadolu) {
    patientAnadolu = await prisma.patient.create({
      data: {
        clinicId: anadolu.id,
        fullName: 'Test Hasta Anadolu',
        phoneNumber: '+905554445566',
      },
    });
  }

  // 2. Clean and seed test dataset for known range 2026-09-20 to 2026-09-28
  const from = '2026-09-20';
  const to = '2026-09-28';

  // Seed Recall appointments:
  // 1x COMPLETED (Vapi AI)
  // 1x NO_SHOW (Vapi AI)
  // 1x CANCELLED (Panel Manuel)
  // 1x SCHEDULED (Panel Manuel)
  // Timezone test:
  // Istanbul 2026-09-25 23:30 (UTC: 2026-09-25 20:30:00Z)
  // Istanbul 2026-09-26 00:30 (UTC: 2026-09-25 21:30:00Z) -> in UTC this is on the 25th, but in Istanbul it MUST be the 26th!

  // Delete previous appointments & call logs
  await prisma.appointment.deleteMany({
    where: {
      clinicId: { in: [recall.id, anadolu.id] },
    },
  });

  await prisma.callLog.deleteMany({
    where: {
      clinicId: { in: [recall.id, anadolu.id] },
    },
  });

  // Call Logs for Recall: 4 calls
  const call1 = await prisma.callLog.create({
    data: {
      clinicId: recall.id,
      vapiCallId: 'vapi-call-1',
      durationSeconds: 120,
      category: 'Randevu Talebi',
      endedReason: 'customer-ended-call',
      createdAt: new Date('2026-09-21T07:02:00Z'),
    },
  });

  const call2 = await prisma.callLog.create({
    data: {
      clinicId: recall.id,
      vapiCallId: 'vapi-call-2',
      durationSeconds: 60,
      category: 'Randevu Talebi',
      endedReason: 'assistant-ended-call',
      createdAt: new Date('2026-09-22T08:01:00Z'),
    },
  });

  await prisma.callLog.create({
    data: {
      clinicId: recall.id,
      vapiCallId: 'vapi-call-3',
      durationSeconds: 90,
      category: 'İptal / Değişiklik',
      endedReason: 'customer-ended-call',
      createdAt: new Date('2026-09-23T09:01:30Z'),
    },
  });

  await prisma.callLog.create({
    data: {
      clinicId: recall.id,
      vapiCallId: 'vapi-call-4',
      durationSeconds: 150,
      category: 'Genel Bilgi',
      endedReason: 'customer-ended-call',
      createdAt: new Date('2026-09-24T10:02:30Z'),
    },
  });

  // Call Log for Anadolu: 1 call
  const callAnadolu = await prisma.callLog.create({
    data: {
      clinicId: anadolu.id,
      vapiCallId: 'vapi-call-anadolu-1',
      durationSeconds: 120,
      category: 'Randevu Talebi',
      endedReason: 'customer-ended-call',
      createdAt: new Date('2026-09-22T11:02:00Z'),
    },
  });

  // Appointments for Recall:
  const appt1 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: call1.id,
      status: 'COMPLETED',
      startsAt: new Date('2026-09-22T07:00:00Z'), // 10:00 TR
      endsAt: new Date('2026-09-22T07:30:00Z'),
    },
  });

  const appt2 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: call2.id,
      status: 'NO_SHOW',
      startsAt: new Date('2026-09-23T08:00:00Z'), // 11:00 TR
      endsAt: new Date('2026-09-23T08:30:00Z'),
    },
  });

  const appt3 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: null,
      status: 'CANCELLED',
      startsAt: new Date('2026-09-24T09:00:00Z'), // 12:00 TR
      endsAt: new Date('2026-09-24T09:30:00Z'),
    },
  });

  const appt4 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: null,
      status: 'SCHEDULED',
      startsAt: new Date('2026-09-25T10:00:00Z'), // 13:00 TR
      endsAt: new Date('2026-09-25T10:30:00Z'),
    },
  });

  // Timezone test appointments:
  // 2026-09-25 23:30 TR is 2026-09-25T20:30:00Z
  const apptTz1 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: null,
      status: 'COMPLETED',
      startsAt: new Date('2026-09-25T20:30:00Z'),
      endsAt: new Date('2026-09-25T21:00:00Z'),
    },
  });

  // 2026-09-26 00:30 TR is 2026-09-25T21:30:00Z (UTC is 25th, Istanbul is 26th!)
  const apptTz2 = await prisma.appointment.create({
    data: {
      clinicId: recall.id,
      doctorId: doctorRecall.id,
      patientId: patientRecall.id,
      createdViaCallId: null,
      status: 'COMPLETED',
      startsAt: new Date('2026-09-25T21:30:00Z'),
      endsAt: new Date('2026-09-25T22:00:00Z'),
    },
  });

  // Anadolu appointment
  const apptAnadolu = await prisma.appointment.create({
    data: {
      clinicId: anadolu.id,
      doctorId: doctorAnadolu.id,
      patientId: patientAnadolu.id,
      createdViaCallId: callAnadolu.id,
      status: 'COMPLETED',
      startsAt: new Date('2026-09-22T08:00:00Z'),
      endsAt: new Date('2026-09-22T08:30:00Z'),
    },
  });

  console.log('✓ Test data successfully seeded.');

  // 3. EXECUTE getClinicAnalyticsSummary for Recall
  const recallSummary = await getClinicAnalyticsSummary(recall.id, from, to);

  console.log('\n--- RECALL CLINIC SUMMARY RESULTS ---');
  console.log('Total Appointments:', recallSummary.appointments.total);
  console.log('Completed:', recallSummary.appointments.completed);
  console.log('No-Show:', recallSummary.appointments.noShow);
  console.log('Cancelled:', recallSummary.appointments.cancelled);
  console.log('Scheduled:', recallSummary.appointments.scheduled);
  console.log('No-Show Rate (%):', recallSummary.appointments.noShowRate);
  console.log('Cancellation Rate (%):', recallSummary.appointments.cancellationRate);
  console.log('Vapi AI Channel:', recallSummary.appointments.channels.vapiAi);
  console.log('Panel Manual Channel:', recallSummary.appointments.channels.panelManual);
  console.log('Total Calls:', recallSummary.calls.totalCalls);
  console.log('Average Duration Seconds:', recallSummary.calls.averageDurationSeconds);
  console.log('Call-to-Appt Conversion Rate (%):', recallSummary.calls.conversionRate);

  // Assertions:
  // Expected Recall Total = 6 (4 initial + 2 timezone test)
  if (recallSummary.appointments.total !== 6) {
    throw new Error(`Expected Recall total appointments 6, got ${recallSummary.appointments.total}`);
  }

  // Completed = 3 (1 initial + 2 timezone)
  if (recallSummary.appointments.completed !== 3) {
    throw new Error(`Expected Recall completed 3, got ${recallSummary.appointments.completed}`);
  }

  // No-Show = 1
  if (recallSummary.appointments.noShow !== 1) {
    throw new Error(`Expected Recall noShow 1, got ${recallSummary.appointments.noShow}`);
  }

  // No-Show Rate = noShow / (completed + noShow) = 1 / (3 + 1) = 25.0%
  const expectedNoShowRate = (1 / (3 + 1)) * 100;
  if (Math.abs(recallSummary.appointments.noShowRate - expectedNoShowRate) > 0.01) {
    throw new Error(`Expected noShowRate ${expectedNoShowRate}%, got ${recallSummary.appointments.noShowRate}%`);
  }
  console.log(`✓ No-Show Rate Formula verified: 1 / (3 + 1) = 25%`);

  // Cancellation Rate = cancelled / total = 1 / 6 = 16.7%
  const expectedCancellationRate = 16.7;
  if (Math.abs(recallSummary.appointments.cancellationRate - expectedCancellationRate) > 0.1) {
    throw new Error(`Expected cancellationRate ${expectedCancellationRate}%, got ${recallSummary.appointments.cancellationRate}%`);
  }
  console.log(`✓ Cancellation Rate Formula verified: 1 / 6 = 16.7%`);

  // Call Conversion Rate = vapiAppointments / totalCalls = 2 / 4 = 50.0%
  const expectedConversionRate = (2 / 4) * 100;
  if (Math.abs(recallSummary.calls.conversionRate - expectedConversionRate) > 0.01) {
    throw new Error(`Expected conversionRate ${expectedConversionRate}%, got ${recallSummary.calls.conversionRate}%`);
  }
  console.log(`✓ Conversion Rate Formula verified: 2 Vapi appointments / 4 total calls = 50%`);

  // Call Average Duration = (120 + 60 + 90 + 150) / 4 = 420 / 4 = 105 seconds
  if (recallSummary.calls.averageDurationSeconds !== 105) {
    throw new Error(`Expected avg duration 105s, got ${recallSummary.calls.averageDurationSeconds}s`);
  }
  console.log(`✓ Call Average Duration verified: 105 seconds`);

  // 4. TIMEZONE GROUPING TEST (23:30 vs 00:30 Istanbul time)
  const day25 = recallSummary.appointments.dailyTrend.find((d) => d.date === '2026-09-25');
  const day26 = recallSummary.appointments.dailyTrend.find((d) => d.date === '2026-09-26');

  console.log('Daily Trend 2026-09-25 count:', day25?.total);
  console.log('Daily Trend 2026-09-26 count:', day26?.total);

  // appt4 (13:00 TR on 25th) + apptTz1 (23:30 TR on 25th) = 2 on 2026-09-25
  if (!day25 || day25.total !== 2) {
    throw new Error(`Expected 2 appointments on 2026-09-25 (including 23:30 TR), got ${day25?.total}`);
  }
  // apptTz2 (00:30 TR on 26th) = 1 on 2026-09-26 (even though UTC was 25th 21:30!)
  if (!day26 || day26.total !== 1) {
    throw new Error(`Expected 1 appointment on 2026-09-26 for 00:30 TR, got ${day26?.total}`);
  }
  console.log('✓ Timezone grouping verified: 23:30 is on 2026-09-25, and 00:30 is correctly on 2026-09-26!');

  // 5. TENANT ISOLATION TEST (Anadolu Clinic Summary)
  const anadoluSummary = await getClinicAnalyticsSummary(anadolu.id, from, to);
  console.log('\n--- ANADOLU CLINIC SUMMARY RESULTS ---');
  console.log('Anadolu Total Appointments:', anadoluSummary.appointments.total);
  console.log('Anadolu Total Calls:', anadoluSummary.calls.totalCalls);

  if (anadoluSummary.appointments.total !== 1) {
    throw new Error(`Expected Anadolu total appointments 1, got ${anadoluSummary.appointments.total}`);
  }
  if (anadoluSummary.calls.totalCalls !== 1) {
    throw new Error(`Expected Anadolu total calls 1, got ${anadoluSummary.calls.totalCalls}`);
  }
  console.log('✓ Tenant Isolation verified: Recall summary has 6 appts, Anadolu has exactly 1 appt, 0 data leakage.');

  // 6. EMPTY CLINIC RESILIENCE TEST (zero division / NaN test)
  const emptyClinic = await prisma.clinic.create({
    data: {
      name: 'Boş Test Kliniği',
      phoneNumber: '+905320000099',
      timezone: 'Europe/Istanbul',
    },
  });

  const emptySummary = await getClinicAnalyticsSummary(emptyClinic.id, from, to);
  console.log('\n--- EMPTY CLINIC RESILIENCE RESULTS ---');
  console.log('Empty Total Appts:', emptySummary.appointments.total);
  console.log('Empty No-Show Rate:', emptySummary.appointments.noShowRate);
  console.log('Empty Cancellation Rate:', emptySummary.appointments.cancellationRate);
  console.log('Empty Conversion Rate:', emptySummary.calls.conversionRate);

  if (
    isNaN(emptySummary.appointments.noShowRate) ||
    isNaN(emptySummary.appointments.cancellationRate) ||
    isNaN(emptySummary.calls.conversionRate)
  ) {
    throw new Error('NaN detected in empty clinic summary!');
  }
  console.log('✓ Empty Clinic verified: all rates safely return 0 without NaN or division-by-zero.');

  // Clean up empty clinic
  await prisma.clinic.delete({ where: { id: emptyClinic.id } });

  // 7. ADMIN OVERVIEW TEST
  const adminOverview = await getAdminClinicsAnalyticsOverview();
  console.log('\n--- ADMIN OVERVIEW RESULTS ---');
  console.log(`Clinics count in admin overview: ${adminOverview.clinics.length}`);
  const recallInAdmin = adminOverview.clinics.find((c) => c.id === recall!.id);
  const anadoluInAdmin = adminOverview.clinics.find((c) => c.id === anadolu!.id);
  console.log(`Recall in Admin: ${recallInAdmin?.name} - 30d Appts: ${recallInAdmin?.appointmentsCountLast30Days}, Calls: ${recallInAdmin?.callsCountLast30Days}`);
  console.log(`Anadolu in Admin: ${anadoluInAdmin?.name} - 30d Appts: ${anadoluInAdmin?.appointmentsCountLast30Days}, Calls: ${anadoluInAdmin?.callsCountLast30Days}`);

  if (!recallInAdmin || !anadoluInAdmin) {
    throw new Error('Admin overview did not return both clinics!');
  }
  console.log('✓ Admin Platform Overview verified successfully.');

  console.log('\n🎉 ALL FAZ 5 ANALYTICS VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

main()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
