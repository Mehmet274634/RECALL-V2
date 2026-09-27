/**
 * Interactive CLI Onboarding Script for New Clinics in RECALL.
 *
 * Usage:
 *   Interactive:      pnpm --filter backend clinic:onboard
 *                     npx tsx scripts/onboard-clinic.ts
 *   Test / Demo:      npx tsx scripts/onboard-clinic.ts --sample-marmara
 *
 * Workflow:
 * 1. Prompts for Clinic details (Name, Phone, Greeting, Cancellation policy, Special instructions, Voice preference)
 * 2. Iteratively collects Doctor rosters (Name, Specialty, Complaints, Hours)
 * 3. Persists Clinic and Doctor entities into Neon PostgreSQL
 * 4. Outputs generated clinicId and ready-to-copy Clerk JSON metadata snippet
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface DoctorInput {
  name: string;
  specialty: string;
  startHour: string;
  endHour: string;
  days: string[];
  complaints?: string;
}

export interface OnboardClinicData {
  clinicName: string;
  phoneNumber?: string;
  greetingMessage?: string;
  cancellationPolicyHours?: number;
  specialInstructions?: string | null;
  voiceId?: string | null;
  doctors: DoctorInput[];
}

/**
 * Generates a collision-proof, unmistakable placeholder phone number.
 * Uses "+90000" (an unallocated, non-routable prefix in Turkey)
 * combined with a zero-padded counter and database-level uniqueness check.
 * E.g., +900000000001, +900000000002, etc.
 */
export async function generatePlaceholderPhoneNumber(): Promise<string> {
  const count = await prisma.clinic.count();
  let candidate = `+90000${String(count + 1).padStart(7, '0')}`;
  let exists = await prisma.clinic.findUnique({ where: { phoneNumber: candidate } });
  let offset = 1;

  while (exists) {
    candidate = `+90000${String(count + 1 + offset).padStart(7, '0')}`;
    exists = await prisma.clinic.findUnique({ where: { phoneNumber: candidate } });
    offset++;
  }

  return candidate;
}

export async function onboardClinic(data: OnboardClinicData) {
  const defaultGreeting = `Merhaba, ${data.clinicName}'na hoş geldiniz. Ben yapay zeka asistanınız, randevunuz için nasıl yardımcı olabilirim?`;

  let phoneNumber = data.phoneNumber?.trim();
  if (!phoneNumber || phoneNumber.toLowerCase() === 'placeholder') {
    phoneNumber = await generatePlaceholderPhoneNumber();
  }

  const createdClinic = await prisma.clinic.create({
    data: {
      name: data.clinicName,
      phoneNumber,
      timezone: 'Europe/Istanbul',
      greetingMessage: data.greetingMessage?.trim() || defaultGreeting,
      cancellationPolicyHours: data.cancellationPolicyHours ?? 2,
      specialInstructions: data.specialInstructions?.trim() || null,
      voiceId: data.voiceId || null,
      doctors: {
        create: data.doctors.map((d) => ({
          name: d.name,
          specialty: d.specialty,
          workingHours: {
            start: d.startHour,
            end: d.endHour,
            slotDurationMinutes: 30,
            days: d.days,
            complaints: d.complaints || null,
          },
        })),
      },
    },
    include: {
      doctors: true,
    },
  });

  console.log('\n✅ KLİNİK BAŞARIYLA OLUŞTURULDU!');
  console.log('------------------------------------------------------------');
  console.log(`Klinik ID:       ${createdClinic.id}`);
  console.log(`Klinik Adı:      ${createdClinic.name}`);
  console.log(`Telefon Hattı:   ${createdClinic.phoneNumber}`);
  console.log(`İptal Süresi:    ${createdClinic.cancellationPolicyHours} saat`);
  console.log(`Voice ID:        ${createdClinic.voiceId || 'Varsayılan'}`);
  console.log(`Doktor Sayısı:   ${createdClinic.doctors.length}`);
  createdClinic.doctors.forEach((doc, idx) => {
    console.log(`  ${idx + 1}. ${doc.name} (${doc.specialty})`);
  });
  console.log('------------------------------------------------------------\n');

  console.log('============================================================');
  console.log('📋 CLERK SEKRETER KULLANICISI OLUŞTURMA ADIMI (KOPYALAYIN):');
  console.log('============================================================');
  console.log("1. Clerk Dashboard'a (dashboard.clerk.com) gidin.");
  console.log('2. Users -> "Create User" ile klinik sekreteri için hesap açın.');
  console.log('3. Kullanıcının profiline girip "Metadata" -> "Public" alanına');
  console.log("   AŞAĞIDAKİ JSON'I KOPYALAYIP YAPIŞTIRIN:\n");
  console.log(
    JSON.stringify(
      {
        clinicId: createdClinic.id,
      },
      null,
      2,
    ),
  );
  console.log('\n============================================================\n');

  return createdClinic;
}

async function promptUser(rl: readline.Interface, question: string, defaultValue = ''): Promise<string> {
  const displayPrompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  const answer = await rl.question(displayPrompt);
  return answer.trim() || defaultValue;
}

async function runInteractiveWizard() {
  const rl = readline.createInterface({ input, output });

  console.log('\n============================================================');
  console.log('🏥 RECALL — ÇOKLU KLİNİK ONBOARDING SİHİRBAZI');
  console.log('============================================================\n');

  try {
    // 1. Clinic Name
    let clinicName = '';
    while (!clinicName) {
      clinicName = await promptUser(rl, '1. Klinik Tam Adı (örn: Marmara Fizik Tedavi Merkezi)');
      if (!clinicName) console.log('⚠️ Klinik adı boş bırakılamaz.');
    }

    // 2. Phone Number
    console.log('\nℹ️ Telefon Numarası Notu: Şimdilik geçici/placeholder bir numara girebilirsiniz.');
    console.log('   (Varsayılan olarak güvenli +90000XXXXXXX tahsis edilecektir, Netgsm hazır olduğunda güncellenebilir).');
    const suggestedPlaceholder = await generatePlaceholderPhoneNumber();
    const phoneInput = await promptUser(
      rl,
      '2. Santral Telefon Numarası (boş bırakırsanız placeholder atanır)',
      suggestedPlaceholder,
    );
    const phoneNumber = phoneInput.trim() || suggestedPlaceholder;

    // 3. Greeting Message
    const defaultGreeting = `Merhaba, ${clinicName}'na hoş geldiniz. Ben yapay zeka asistanınız, randevunuz için nasıl yardımcı olabilirim?`;
    const greetingMessage = await promptUser(
      rl,
      '\n3. Sesli Karşılama Cümlesi (Boş bırakılırsa varsayılan atanır)',
      defaultGreeting,
    );

    // 4. Cancellation Policy Hours
    const cancelHoursStr = await promptUser(
      rl,
      '\n4. Randevu İptal / Erteleme Minimum Bildirim Süresi (Saat)',
      '2',
    );
    const cancellationPolicyHours = parseInt(cancelHoursStr, 10) || 2;

    // 5. Special Instructions
    console.log('\n5. Kliniğe Özel Kurallar ve Talimatlar (Opsiyonel):');
    console.log('   (Örn: SGK geçerlidir, TC kimlik ve eski tahlil getirilmeli, otopark mevcuttur)');
    const specialInstructions = await promptUser(rl, 'Özel talimat metni (yoksa Enter)', '');

    // 6. Voice Selection
    console.log('\n6. Ses Tercihi (Voice ID):');
    console.log('   1 - Sarah (ElevenLabs Doğal Kadın Sesi — ID: EXAVITQu4vr4xnSDxMaL) [Varsayılan]');
    console.log('   2 - Brian (ElevenLabs Güven Veren Erkek Sesi — ID: nPczCjzI2devNBz1zQrb)');
    console.log('   3 - Boş / Özel Voice ID');
    const voiceChoice = await promptUser(rl, 'Seçiminiz (1/2/3 veya doğrudan ID)', '1');

    let voiceId: string | null = 'EXAVITQu4vr4xnSDxMaL';
    if (voiceChoice === '1') {
      voiceId = 'EXAVITQu4vr4xnSDxMaL';
    } else if (voiceChoice === '2') {
      voiceId = 'nPczCjzI2devNBz1zQrb';
    } else if (voiceChoice === '3') {
      voiceId = null;
    } else if (voiceChoice.length > 5) {
      voiceId = voiceChoice;
    }

    // 7. Doctors Roster
    console.log('\n============================================================');
    console.log('👨‍⚕️ KLİNİK DOKTOR KADROSU TANIMLAMA');
    console.log('============================================================\n');

    const doctors: DoctorInput[] = [];
    let addMoreDoctors = true;
    let docIndex = 1;

    while (addMoreDoctors) {
      console.log(`\n--- Doktor #${docIndex} ---`);
      const docName = await promptUser(rl, 'Doktor Adı Soyadı (örn: Dr. Hakan Demir)');
      const specialty = await promptUser(rl, 'Uzmanlık Branşı (örn: Fiziksel Tıp ve Rehabilitasyon)');
      const complaints = await promptUser(
        rl,
        'İlgilendiği Şikayetler / Belirtiler (örn: Bel fıtığı, kireçlenme, inme - opsiyonel)',
        '',
      );
      const startHour = await promptUser(rl, 'Mesai Başlangıç Saati', '09:00');
      const endHour = await promptUser(rl, 'Mesai Bitiş Saati', '17:00');

      doctors.push({
        name: docName,
        specialty,
        complaints: complaints || undefined,
        startHour,
        endHour,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      });

      const more = await promptUser(rl, '\nBaşka bir doktor eklemek istiyor musunuz? (e/h)', 'h');
      addMoreDoctors = more.toLowerCase() === 'e' || more.toLowerCase() === 'evet';
      docIndex++;
    }

    // Confirmation
    console.log('\n============================================================');
    console.log('KAYDEDİLECEK BİLGİLER:');
    console.log(`- Klinik: ${clinicName}`);
    console.log(`- Telefon: ${phoneNumber}`);
    console.log(`- İptal Politikası: ${cancellationPolicyHours} saat`);
    console.log(`- Voice ID: ${voiceId || 'Varsayılan'}`);
    console.log(`- Doktor Sayısı: ${doctors.length}`);
    console.log('============================================================\n');

    const confirm = await promptUser(rl, 'Veritabanına kaydı onaylıyor musunuz? (e/h)', 'e');
    if (confirm.toLowerCase() !== 'e' && confirm.toLowerCase() !== 'evet') {
      console.log('❌ İşlem iptal edildi.');
      return;
    }

    console.log('\n⏳ Veritabanı kaydı oluşturuluyor...');
    await onboardClinic({
      clinicName,
      phoneNumber,
      greetingMessage,
      cancellationPolicyHours,
      specialInstructions,
      voiceId,
      doctors,
    });
  } catch (error) {
    console.error('❌ Onboarding sırasında hata oluştu:', error);
  } finally {
    rl.close();
  }
}

async function main() {
  try {
    const isSampleMarmara = process.argv.includes('--sample-marmara');

    if (isSampleMarmara) {
      console.log('🚀 Örnek Test Kliniği Onboarding Ediliyor: Marmara Fizik Tedavi Merkezi...');
      // Clean up previous test run if exists for +902123330303
      const existing = await prisma.clinic.findUnique({
        where: { phoneNumber: '+902123330303' },
        include: { doctors: true },
      });
      if (existing) {
        console.log(`⚠️ Varolan test kliniği bulundu (${existing.id}), temizleniyor...`);
        await prisma.doctor.deleteMany({ where: { clinicId: existing.id } });
        await prisma.clinic.delete({ where: { id: existing.id } });
      }

      await onboardClinic({
        clinicName: 'Marmara Fizik Tedavi Merkezi',
        phoneNumber: '+902123330303',
        greetingMessage:
          'Merhaba, Marmara Fizik Tedavi Merkezi’ne hoş geldiniz. Fizik tedavi ve ortopedi randevularınız için size yardımcı olabilirim.',
        cancellationPolicyHours: 3,
        specialInstructions:
          'SGK anlaşmalıdır. İlk muayenenizde lütfen TC kimlik kartınızı ve varsa güncel MR/röntgen sonuçlarınızı yanınızda getiriniz. Kliniğimiz bünyesinde ücretsiz kapalı otopark mevcuttur.',
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        doctors: [
          {
            name: 'Dr. Hakan Demir',
            specialty: 'Fiziksel Tıp ve Rehabilitasyon',
            complaints: 'Bel ve boyun fıtığı, kireçlenme, fibromiyalji, inme rehabilitasyonu',
            startHour: '09:00',
            endHour: '17:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
          {
            name: 'Dr. Ayşe Yılmaz',
            specialty: 'Ortopedi ve Travmatoloji',
            complaints: 'Menisküs, bağ yaralanmaları, diz ve kalça protezi muayenesi, spor sakatlıkları',
            startHour: '09:30',
            endHour: '16:30',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
        ],
      });
      return;
    }

    await runInteractiveWizard();
  } finally {
    await prisma.$disconnect();
  }
}

main();
