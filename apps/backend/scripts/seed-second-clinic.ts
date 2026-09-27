import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding second test clinic...');

  // 1. Update Recall Clinic with specific new fields
  const recallClinic = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902125550101' },
  });
  if (recallClinic) {
    await prisma.clinic.update({
      where: { id: recallClinic.id },
      data: {
        greetingMessage:
          "Recall Sağlık Kliniği'ne hoş geldiniz. Ben yapay zeka asistanınız, randevunuz için nasıl yardımcı olabilirim?",
        cancellationPolicyHours: 2,
        specialInstructions:
          'Kliniğimize gelirken TC Kimlik kartınızı ve varsa önceki tahlil sonuçlarınızı yanınızda bulundurunuz. Özel sağlık sigortası anlaşmalarımız geçerlidir.',
        voiceId: 'EXAVITQu4vr4xnSDxMaL', // ElevenLabs "Sarah" - Doğal, profesyonel kadın sesi (Türkçe multilingual destekli)
      },
    });
    console.log('Recall Clinic updated with prompt fields.');
  }

  // 2. Create Second Clinic: Anadolu Tıp Merkezi
  const clinic2 = await prisma.clinic.upsert({
    where: { phoneNumber: '+902164440202' },
    update: {
      name: 'Anadolu Tıp Merkezi',
      greetingMessage:
        "Anadolu Tıp Merkezi'ne hoş geldiniz! Randevu ve danışma hattındasınız.",
      cancellationPolicyHours: 4,
      specialInstructions:
        'SGK ve tamamlayıcı sigorta geçerlidir. Randevunuza 15 dakika önce gelmeniz rica olunur. Otoparkımız mevcuttur.',
      voiceId: 'nPczCjzI2devNBz1zQrb', // ElevenLabs "Brian" - Güven veren, net erkek sesi (Türkçe multilingual destekli)
    },
    create: {
      name: 'Anadolu Tıp Merkezi',
      phoneNumber: '+902164440202',
      timezone: 'Europe/Istanbul',
      greetingMessage:
        "Anadolu Tıp Merkezi'ne hoş geldiniz! Randevu ve danışma hattındasınız.",
      cancellationPolicyHours: 4,
      specialInstructions:
        'SGK ve tamamlayıcı sigorta geçerlidir. Randevunuza 15 dakika önce gelmeniz rica olunur. Otoparkımız mevcuttur.',
      voiceId: 'nPczCjzI2devNBz1zQrb', // ElevenLabs "Brian"
    },
  });
  console.log('Second clinic ready:', clinic2.name, clinic2.id);

  // 3. Add Doctors to Second Clinic
  const doc1 = await prisma.doctor.upsert({
    where: { id: 'test-doc-anadolu-1' },
    update: {
      clinicId: clinic2.id,
      name: 'Dr. Selin Arslan',
      specialty: 'Dermatoloji',
      workingHours: {
        start: '10:00',
        end: '18:00',
        slotDurationMinutes: 30,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
    },
    create: {
      id: 'test-doc-anadolu-1',
      clinicId: clinic2.id,
      name: 'Dr. Selin Arslan',
      specialty: 'Dermatoloji',
      workingHours: {
        start: '10:00',
        end: '18:00',
        slotDurationMinutes: 30,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
    },
  });

  const doc2 = await prisma.doctor.upsert({
    where: { id: 'test-doc-anadolu-2' },
    update: {
      clinicId: clinic2.id,
      name: 'Dr. Kerem Aydın',
      specialty: 'Göz Hastalıkları',
      workingHours: {
        start: '09:00',
        end: '15:00',
        slotDurationMinutes: 30,
        days: ['monday', 'wednesday', 'friday'],
      },
    },
    create: {
      id: 'test-doc-anadolu-2',
      clinicId: clinic2.id,
      name: 'Dr. Kerem Aydın',
      specialty: 'Göz Hastalıkları',
      workingHours: {
        start: '09:00',
        end: '15:00',
        slotDurationMinutes: 30,
        days: ['monday', 'wednesday', 'friday'],
      },
    },
  });

  console.log('Doctors added to second clinic:', doc1.name, doc2.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
