/**
 * Test script to verify collision-free placeholder phone number generation:
 * Creates 5 consecutive test clinics using placeholder phone numbers,
 * verifies that:
 * 1. Each clinic receives a distinct, collision-free phone number.
 * 2. All phone numbers start with '+90000' (non-routable fake prefix).
 * 3. No Prisma @unique constraint violations occur.
 * 4. Cleans up test clinics after verification.
 */

import { prisma } from '../src/lib/db/client.js';
import { onboardClinic, generatePlaceholderPhoneNumber } from './onboard-clinic.js';

async function testPlaceholderPhoneGeneration() {
  console.log('=== TEST: PLACEHOLDER TELEFON NUMARASI ÇAKIŞMA TESTİ (5 KLİNİK) ===\n');

  const createdClinicIds: string[] = [];
  const assignedPhoneNumbers: string[] = [];

  try {
    for (let i = 1; i <= 5; i++) {
      const clinicName = `Test Placeholder Kliniği #${i} - ${Date.now()}`;
      console.log(`[Adım ${i}/5] "${clinicName}" oluşturuluyor (placeholder telefon ile)...`);

      const clinic = await onboardClinic({
        clinicName,
        // phoneNumber omitted -> triggers generatePlaceholderPhoneNumber
        cancellationPolicyHours: 2,
        doctors: [
          {
            name: `Test Doktor ${i}`,
            specialty: 'Genel Cerrahi',
            startHour: '09:00',
            endHour: '17:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
        ],
      });

      createdClinicIds.push(clinic.id);
      assignedPhoneNumbers.push(clinic.phoneNumber);

      console.log(` -> Tahsis Edilen Numara: ${clinic.phoneNumber}`);
    }

    console.log('\n=== ASSERTION KONTROLLERİ ===');
    console.log('Tahsis Edilen Numaralar:', assignedPhoneNumbers);

    // 1. Check all numbers start with +90000
    for (const num of assignedPhoneNumbers) {
      if (!num.startsWith('+90000')) {
        throw new Error(`Geçersiz placeholder formatı: ${num} ('+90000' ile başlamıyor)`);
      }
    }
    console.log("✅ Tüm numaralar '+90000' unallocated prefix standardına uygun.");

    // 2. Check all numbers are unique
    const uniqueSet = new Set(assignedPhoneNumbers);
    if (uniqueSet.size !== 5) {
      throw new Error(
        `Çakışma tespit edildi! Beklenen 5 benzersiz numara, ancak ${uniqueSet.size} tekil numara üretildi.`,
      );
    }
    console.log('✅ 5 kliniğin tamamına benzersiz, çakışmasız telefon numaraları tahsis edildi.');

    // 3. Test generatePlaceholderPhoneNumber standalone consistency
    const nextCandidate = await generatePlaceholderPhoneNumber();
    console.log(` -> Bir sonraki aday placeholder: ${nextCandidate}`);
    if (assignedPhoneNumbers.includes(nextCandidate)) {
      throw new Error(`Bir sonraki aday numara (${nextCandidate}) mevcut bir numarayla çakışıyor!`);
    }
    console.log('✅ Aday numara kontrolü de çakışmasız ve tutarlı.');

    console.log('\n🎉 TEST BAŞARIYLA TAMAMLANDI: Hiçbir çakışma riski bulunmuyor!');
  } finally {
    // Cleanup test clinics
    console.log('\n🧹 Test klinikleri veritabanından temizleniyor...');
    if (createdClinicIds.length > 0) {
      await prisma.doctor.deleteMany({
        where: { clinicId: { in: createdClinicIds } },
      });
      await prisma.clinic.deleteMany({
        where: { id: { in: createdClinicIds } },
      });
      console.log(`✅ ${createdClinicIds.length} test kliniği başarıyla temizlendi.`);
    }
  }
}

testPlaceholderPhoneGeneration()
  .catch((err) => {
    console.error('❌ Test başarısız:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
