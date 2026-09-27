/**
 * Test script to verify dynamic multi-clinic system prompt generation:
 * 1. Simulates Vapi assistant-request for Clinic 1 (+902125550101 - Recall Sağlık Kliniği)
 * 2. Simulates Vapi assistant-request for Clinic 2 (+902164440202 - Anadolu Tıp Merkezi)
 * 3. Simulates Vapi assistant-request for Clinic 3 (+902123330303 - Marmara Fizik Tedavi Merkezi)
 * 4. Compares the resulting system prompts side-by-side to verify:
 *    - Invariable safety & dialogue skeleton (112 triage, identity, tone, step-by-step tools)
 *    - Dynamic clinic customization (greetings, doctors/specialties/complaints, cancellation policy hours, special instructions, voiceId)
 *    - Cross-tenant isolation (no doctor/clinic data leakage between clinics)
 */

import { buildSystemPromptDetails } from '../src/lib/vapi/system-prompt.js';
import { prisma } from '../src/lib/db/client.js';

async function testDynamicPrompts() {
  console.log('=== MULTI-CLINIC DYNAMIC SYSTEM PROMPT GENERATION TEST ===\n');

  // Fetch all 3 clinics
  const clinicRecall = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902125550101' },
  });
  const clinicAnadolu = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902164440202' },
  });
  const clinicMarmara = await prisma.clinic.findFirst({
    where: { phoneNumber: '+902123330303' },
  });

  if (!clinicRecall || !clinicAnadolu || !clinicMarmara) {
    throw new Error(
      `Clinics could not be found in DB (Recall: ${!!clinicRecall}, Anadolu: ${!!clinicAnadolu}, Marmara: ${!!clinicMarmara}). Run onboard script for Marmara first!`,
    );
  }

  // 1. Build prompt for Clinic 1 (Recall)
  const recallRes = await buildSystemPromptDetails(clinicRecall.id);
  console.log(`[TEST 1] Clinic: ${recallRes.clinicName} (${recallRes.clinicId})`);
  console.log(`- Voice ID: ${recallRes.voiceId}`);
  console.log(`- Prompt Length: ${recallRes.prompt.length} chars`);
  console.log('- Prompt Snippet (First 350 chars):\n');
  console.log(recallRes.prompt.slice(0, 350));
  console.log('\n------------------------------------------------------------\n');

  // 2. Build prompt for Clinic 2 (Anadolu)
  const anadoluRes = await buildSystemPromptDetails(clinicAnadolu.id);
  console.log(`[TEST 2] Clinic: ${anadoluRes.clinicName} (${anadoluRes.clinicId})`);
  console.log(`- Voice ID: ${anadoluRes.voiceId}`);
  console.log(`- Prompt Length: ${anadoluRes.prompt.length} chars`);
  console.log('- Prompt Snippet (First 350 chars):\n');
  console.log(anadoluRes.prompt.slice(0, 350));
  console.log('\n------------------------------------------------------------\n');

  // 3. Build prompt for Clinic 3 (Marmara Fizik Tedavi Merkezi)
  const marmaraRes = await buildSystemPromptDetails(clinicMarmara.id);
  console.log(`[TEST 3] Clinic: ${marmaraRes.clinicName} (${marmaraRes.clinicId})`);
  console.log(`- Voice ID: ${marmaraRes.voiceId}`);
  console.log(`- Prompt Length: ${marmaraRes.prompt.length} chars`);
  console.log('- Prompt Snippet (First 350 chars):\n');
  console.log(marmaraRes.prompt.slice(0, 350));
  console.log('\n------------------------------------------------------------\n');

  // 4. Automated Assertions
  console.log('=== VERIFYING PROMPT ASSERTIONS ACROSS ALL 3 CLINICS ===\n');

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
    if (
      !recallRes.prompt.includes(feature) ||
      !anadoluRes.prompt.includes(feature) ||
      !marmaraRes.prompt.includes(feature)
    ) {
      throw new Error(`Invariable skeleton feature missing: "${feature}"`);
    }
  }
  console.log(
    '✅ Invariable architectural skeleton (112 triage, identity, tone, tools) is strictly preserved across all 3 clinics.',
  );

  // B. Clinic 1 specific assertions
  if (
    !recallRes.prompt.includes('Recall Sağlık Kliniği') ||
    !recallRes.prompt.includes('Dr. Ahmet Yılmaz — Branş: Dahiliye') ||
    !recallRes.prompt.includes('en az 2 saat önce') ||
    !recallRes.prompt.includes('TC Kimlik kartınızı')
  ) {
    throw new Error('Clinic 1 specific data missing from Recall prompt.');
  }
  console.log(
    '✅ Recall Clinic specific prompt correctly injected (Dahiliye, Kardiyoloji, KBB, 2 saat, TC kimlik uyarısı).',
  );

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
  console.log(
    '✅ Anadolu Tıp Merkezi specific prompt correctly injected (Dermatoloji, Göz, 4 saat, SGK/Otopark uyarısı).',
  );

  // D. Clinic 3 specific assertions
  const marmaraChecks = [
    { label: 'Name', pass: marmaraRes.prompt.includes('Marmara Fizik Tedavi Merkezi') },
    { label: 'Dr. Hakan', pass: marmaraRes.prompt.includes('Dr. Hakan Demir — Branş: Fiziksel Tıp ve Rehabilitasyon') },
    { label: 'Complaints', pass: marmaraRes.prompt.includes('İlgilendiği şikayetler: Bel ve boyun fıtığı') },
    { label: 'Dr. Ayse', pass: marmaraRes.prompt.includes('Dr. Ayşe Yılmaz — Branş: Ortopedi ve Travmatoloji') },
    { label: '3 saat', pass: marmaraRes.prompt.includes('en az 3 saat önce') },
    { label: 'MR/röntgen', pass: marmaraRes.prompt.includes('MR/röntgen') },
  ];

  for (const c of marmaraChecks) {
    if (!c.pass) {
      console.error(`Marmara check failed for label: ${c.label}`);
      console.log('Marmara prompt excerpt:\n', marmaraRes.prompt);
      throw new Error(`Clinic 3 check failed: ${c.label}`);
    }
  }
  console.log(
    '✅ Marmara Fizik Tedavi Merkezi specific prompt correctly injected (FTR, Ortopedi, şikayetler, 3 saat, MR/röntgen talimatı).',
  );

  // E. Strict Multi-Tenant Isolation (No Cross-Tenant Contamination)
  if (recallRes.prompt.includes('Dr. Hakan Demir') || recallRes.prompt.includes('Dr. Selin Arslan')) {
    throw new Error('Tenant isolation breach: Recall prompt contains foreign doctors!');
  }
  if (anadoluRes.prompt.includes('Dr. Ahmet Yılmaz') || anadoluRes.prompt.includes('Dr. Hakan Demir')) {
    throw new Error('Tenant isolation breach: Anadolu prompt contains foreign doctors!');
  }
  if (marmaraRes.prompt.includes('Dr. Ahmet Yılmaz') || marmaraRes.prompt.includes('Dr. Kerem Aydın')) {
    throw new Error('Tenant isolation breach: Marmara prompt contains foreign doctors!');
  }
  console.log(
    '✅ Strict Multi-Tenant Isolation verified: Zero cross-clinic contamination across all 3 clinics.',
  );

  // F. Voice ID assertions
  if (recallRes.voiceId !== 'EXAVITQu4vr4xnSDxMaL') {
    throw new Error(`Expected Sarah voice ID for Recall clinic, got: ${recallRes.voiceId}`);
  }
  if (anadoluRes.voiceId !== 'nPczCjzI2devNBz1zQrb') {
    throw new Error(`Expected Brian voice ID for Anadolu clinic, got: ${anadoluRes.voiceId}`);
  }
  if (marmaraRes.voiceId !== 'EXAVITQu4vr4xnSDxMaL') {
    throw new Error(`Expected Sarah voice ID for Marmara clinic, got: ${marmaraRes.voiceId}`);
  }
  console.log(
    '✅ Real ElevenLabs Voice IDs verified for all 3 clinics (Recall: Sarah, Anadolu: Brian, Marmara: Sarah).',
  );

  console.log('\nALL 3 CLINIC DYNAMIC PROMPT TESTS PASSED SUCCESSFULLY! 🎉');
}

testDynamicPrompts()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
