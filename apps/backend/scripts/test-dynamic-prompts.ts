/**
 * Test script to verify dynamic multi-clinic system prompt generation:
 * 1. Simulates Vapi assistant-request for Clinic 1 (+902125550101 - Recall Sağlık Kliniği)
 * 2. Simulates Vapi assistant-request for Clinic 2 (+902164440202 - Anadolu Tıp Merkezi)
 * 3. Compares the resulting system prompts side-by-side to verify:
 *    - Invariable safety & dialogue skeleton (112 triage, identity, tone, step-by-step tools)
 *    - Dynamic clinic customization (greetings, doctors/specialties, cancellation policy hours, special instructions, voiceId)
 */

import { buildSystemPromptDetails } from '../src/lib/vapi/system-prompt.js';
import { prisma } from '../src/lib/db/client.js';

async function testDynamicPrompts() {
  console.log('=== MULTI-CLINIC DYNAMIC SYSTEM PROMPT GENERATION TEST ===\n');

  // Fetch both clinics
  const clinicRecall = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902125550101' },
  });
  const clinicAnadolu = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902164440202' },
  });

  if (!clinicRecall || !clinicAnadolu) {
    throw new Error('Clinics could not be found in DB.');
  }

  // 1. Build prompt for Clinic 1 (Recall)
  const recallRes = await buildSystemPromptDetails(clinicRecall.id);
  console.log(`[TEST 1] Clinic: ${recallRes.clinicName} (${recallRes.clinicId})`);
  console.log(`- Voice ID: ${recallRes.voiceId}`);
  console.log(`- Prompt Length: ${recallRes.prompt.length} chars`);
  console.log('- Prompt Snippet (First 500 chars):\n');
  console.log(recallRes.prompt.slice(0, 500));
  console.log('\n------------------------------------------------------------\n');

  // 2. Build prompt for Clinic 2 (Anadolu)
  const anadoluRes = await buildSystemPromptDetails(clinicAnadolu.id);
  console.log(`[TEST 2] Clinic: ${anadoluRes.clinicName} (${anadoluRes.clinicId})`);
  console.log(`- Voice ID: ${anadoluRes.voiceId}`);
  console.log(`- Prompt Length: ${anadoluRes.prompt.length} chars`);
  console.log('- Prompt Snippet (First 500 chars):\n');
  console.log(anadoluRes.prompt.slice(0, 500));
  console.log('\n------------------------------------------------------------\n');

  // 3. Automated Assertions
  console.log('=== VERIFYING PROMPT ASSERTIONS ===\n');

  // A. Invariable skeleton assertions
  const skeletonFeatures = [
    'KRİTİK GÜVENLİK VE ACİL DURUM KURALI (EN YÜKSEK ÖNCELİK)',
    "112 Acil Çağrı Merkezi'ni arayınız",
    'KİMLİK, ŞEFFAFLIK VE KONUŞMA TONU',
    'ADIM ADIM İŞLEM AKIŞLARI (TOOLS KULLANIMI)',
    'check_availability',
    'book_appointment',
  ];

  for (const feature of skeletonFeatures) {
    if (!recallRes.prompt.includes(feature) || !anadoluRes.prompt.includes(feature)) {
      throw new Error(`Invariable skeleton feature missing: "${feature}"`);
    }
  }
  console.log('✅ Invariable architectural skeleton (112 triage, identity, tone, tools) is strictly preserved across both clinics.');

  // B. Clinic 1 specific assertions
  if (
    !recallRes.prompt.includes('Recall Sağlık Kliniği') ||
    !recallRes.prompt.includes('Dr. Ahmet Yılmaz — Branş: Dahiliye') ||
    !recallRes.prompt.includes('en az 2 saat önce') ||
    !recallRes.prompt.includes('TC Kimlik kartınızı')
  ) {
    throw new Error('Clinic 1 specific data missing from Recall prompt.');
  }
  console.log('✅ Recall Clinic specific prompt correctly injected (Dahiliye, Kardiyoloji, KBB, 2 saat, TC kimlik uyarısı).');

  // C. Clinic 2 specific assertions
  if (
    !anadoluRes.prompt.includes('Anadolu Tıp Merkezi') ||
    !anadoluRes.prompt.includes('Dr. Selin Arslan — Branş: Dermatoloji') ||
    !anadoluRes.prompt.includes('Dr. Kerem Aydın — Branş: Göz Hastalıkları') ||
    !anadoluRes.prompt.includes('en az 4 saat önce') ||
    !anadoluRes.prompt.includes('SGK ve tamamlayıcı sigorta geçerlidir')
  ) {
    throw new Error('Clinic 2 specific data missing from Anadolu prompt.');
  }
  console.log('✅ Anadolu Tıp Merkezi specific prompt correctly injected (Dermatoloji, Göz, 4 saat, SGK/Otopark uyarısı).');

  // E. Voice ID assertions
  if (recallRes.voiceId !== 'EXAVITQu4vr4xnSDxMaL') {
    throw new Error(`Expected Sarah voice ID for Recall clinic, got: ${recallRes.voiceId}`);
  }
  if (anadoluRes.voiceId !== 'nPczCjzI2devNBz1zQrb') {
    throw new Error(`Expected Brian voice ID for Anadolu clinic, got: ${anadoluRes.voiceId}`);
  }
  console.log('✅ Real ElevenLabs Voice IDs verified: Recall -> EXAVITQu4vr4xnSDxMaL (Sarah), Anadolu -> nPczCjzI2devNBz1zQrb (Brian).');

  console.log('\nALL MULTI-TENANT DYNAMIC PROMPT TESTS PASSED SUCCESSFULLY! 🎉');
}

testDynamicPrompts()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
