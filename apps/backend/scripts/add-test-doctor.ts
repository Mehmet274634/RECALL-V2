import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables (.env) safely
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/backend/.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
dotenv.config();

const TARGET_CLINIC_ID = 'cmujsx0740000uyq8jo95ywjg';

const DOCTOR_DATA = {
  name: 'Dr. Ahmet Yılmaz',
  specialty: 'Dahiliye',
  workingHours: {
    start: '09:00',
    end: '17:00',
    slotDurationMinutes: 30,
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  },
};

/**
 * Extracts only the host from a database connection string without exposing credentials.
 */
function extractDbHost(urlStr?: string): string {
  if (!urlStr) return '[DATABASEV2_DATABASE_URL BULUNAMADI]';
  try {
    const parsed = new URL(urlStr);
    return parsed.host;
  } catch {
    const match = urlStr.match(/@([^/?#]+)/);
    return match ? match[1] : '[HOST AYRIŞTIRILAMADI]';
  }
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const dbUrl = process.env.DATABASEV2_DATABASE_URL || process.env.DATABASE_URL;
  const dbHost = extractDbHost(dbUrl);

  console.log('====================================================');
  console.log('        RECALL V2 - TEST HEKİMİ EKLEME ARACI        ');
  console.log('====================================================');
  console.log(`Veritabanı Host : ${dbHost}`);
  console.log(`Çalışma Modu     : ${isApply ? 'APPLY (GERÇEK YAZMA)' : 'DRY-RUN (SADECE ÖNİZLEME)'}`);
  console.log(`Hedef Klinik ID  : ${TARGET_CLINIC_ID}`);
  console.log('----------------------------------------------------');

  const prisma = new PrismaClient();

  try {
    // 1. Kliniğin varlığını kontrol et
    const clinic = await prisma.clinic.findUnique({
      where: { id: TARGET_CLINIC_ID },
      include: {
        doctors: {
          select: { id: true, name: true, specialty: true },
        },
      },
    });

    if (!clinic) {
      console.error(`\n❌ HATA: Hedef klinik bulunamadı! ID: "${TARGET_CLINIC_ID}"`);
      process.exit(1);
    }

    console.log(`Klinik Bulundu   : ${clinic.name} (${clinic.phoneNumber})`);
    console.log(`Mevcut Hekim Sayısı: ${clinic.doctors.length}`);
    if (clinic.doctors.length > 0) {
      clinic.doctors.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. ${doc.name} (${doc.specialty}) [ID: ${doc.id}]`);
      });
    }

    // 2. Aynı isimde hekim var mı kontrol et
    const existingDoctor = await prisma.doctor.findFirst({
      where: {
        clinicId: TARGET_CLINIC_ID,
        name: DOCTOR_DATA.name,
      },
    });

    if (existingDoctor) {
      console.log(`\n⚠️  BİLGİ: "${DOCTOR_DATA.name}" isimli hekim bu klinikte zaten mevcut!`);
      console.log(`Hekim ID        : ${existingDoctor.id}`);
      console.log(`Uzmanlık        : ${existingDoctor.specialty}`);
      console.log('Hiçbir değişiklik yapılmadı.');
      return;
    }

    // 3. Eklenecek hekim detayları
    console.log('\n---------------- EKLENECEK VERİ ----------------');
    console.log(`Hekim Adı       : ${DOCTOR_DATA.name}`);
    console.log(`Uzmanlık Branşı : ${DOCTOR_DATA.specialty}`);
    console.log('Çalışma Saatleri (workingHours JSON):');
    console.log(JSON.stringify(DOCTOR_DATA.workingHours, null, 2));
    console.log('------------------------------------------------');

    if (!isApply) {
      console.log('\n[DRY-RUN TAMAMLANDI]');
      console.log('Veritabanına hiçbir kayıt yazılmadı.');
      console.log('Gerçek yazma işlemi için komutu "--apply" bayrağı ile çalıştırınız.');
      return;
    }

    // 4. Gerçek yazma işlemi (--apply ile)
    console.log('\n[APPLY] Hekim veritabanına kaydediliyor...');
    const createdDoctor = await prisma.doctor.create({
      data: {
        clinicId: TARGET_CLINIC_ID,
        name: DOCTOR_DATA.name,
        specialty: DOCTOR_DATA.specialty,
        workingHours: DOCTOR_DATA.workingHours,
      },
    });

    console.log('\n✅ BAŞARILI: Test hekimi başarıyla eklendi!');
    console.log(`Yeni Hekim ID   : ${createdDoctor.id}`);
    console.log(`Hekim Adı       : ${createdDoctor.name}`);
    console.log(`Klinik ID       : ${createdDoctor.clinicId}`);
  } catch (error) {
    console.error('\n❌ Beklenmeyen bir hata oluştu:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
