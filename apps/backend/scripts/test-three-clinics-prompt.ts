import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db/client.js';
import { buildPanelSystemPrompt } from '../src/lib/vapi/system-prompt.js';

async function runThreeClinicsPromptTest() {
  console.log('================================================================');
  console.log('TEST: THREE CLINICS SYSTEM PROMPT (forVapiPanel: true)');
  console.log('================================================================\n');

  const clinics = await prisma.clinic.findMany({
    include: {
      doctors: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (clinics.length < 3) {
    throw new Error(`Expected at least 3 clinics in DB, found ${clinics.length}`);
  }

  // Find the three specific clinics
  const recallClinic = clinics.find((c) => c.name.includes('Recall') || c.phoneNumber === '+902125550101') || clinics[0];
  const anadoluClinic = clinics.find((c) => c.name.includes('Anadolu') || c.phoneNumber === '+902164440202') || clinics[1];
  const marmaraClinic = clinics.find((c) => c.name.includes('Marmara') || c.phoneNumber === '+902123330303') || clinics[2];

  const targetClinics = [
    { clinic: recallClinic, label: 'CLINIC 1: RECALL SAĞLIK KLİNİĞİ' },
    { clinic: anadoluClinic, label: 'CLINIC 2: ANADOLU TIP MERKEZİ' },
    { clinic: marmaraClinic, label: 'CLINIC 3: MARMARA FİZİK TEDAVİ MERKEZİ' },
  ];

  for (const { clinic, label } of targetClinics) {
    console.log('\n################################################################');
    console.log(`### ${label}`);
    console.log(`### specialInstructions: ${JSON.stringify(clinic.specialInstructions)}`);
    console.log(`### Doctors: ${clinic.doctors.map((d: any) => `${d.name} (${JSON.stringify(d.workingHours)})`).join('; ')}`);
    console.log('################################################################\n');

    const prompt = await buildPanelSystemPrompt(clinic.id);

    // Print FULL prompt text
    console.log(prompt);
    console.log('\n----------------------------------------------------------------');

    // Assertions for critical sentences
    const cancelExpected = `${clinic.cancellationPolicyHours ?? 2} saat`;

    assert.ok(prompt.includes('112'), `[FAIL] Prompt for ${clinic.name} must include "112"`);
    assert.ok(prompt.includes('useCallerNumber'), `[FAIL] Prompt for ${clinic.name} must include "useCallerNumber"`);
    assert.ok(prompt.includes(cancelExpected), `[FAIL] Prompt for ${clinic.name} must include cancellation hour "${cancelExpected}"`);
    assert.ok(prompt.includes('0500 000 00 00'), `[FAIL] Prompt for ${clinic.name} must include example phone "0500 000 00 00"`);
    assert.ok(prompt.includes(clinic.name), `[FAIL] Prompt for ${clinic.name} must include clinic name "${clinic.name}"`);
    assert.ok(prompt.includes('ŞU ANDA'), `[FAIL] Prompt for ${clinic.name} must include "ŞU ANDA"`);
    assert.ok(prompt.includes('Geçmişte yaşanmış'), `[FAIL] Prompt for ${clinic.name} must include "Geçmişte yaşanmış"`);
    assert.ok(prompt.includes('Tıbbi tavsiye yasağı'), `[FAIL] Prompt for ${clinic.name} must include "Tıbbi tavsiye yasağı"`);
    assert.ok(prompt.includes('Talimat koruması'), `[FAIL] Prompt for ${clinic.name} must include "Talimat koruması"`);

    // Verify no unescaped nested double quotes in finalReminder line
    const reminderLine = prompt.split('\n').find((l) => l.includes('sonunda şunu söyle:'));
    if (reminderLine) {
      const match = reminderLine.match(/sonunda şunu söyle: "(.*)" Başarısızsa/);
      assert.ok(match, 'Reminder line must match expected quote pattern');
      assert.ok(!match[1].includes('"'), 'Reminder inside quotes must not contain unescaped double quotes');
    }

    console.log(`\n[PASS] Verified critical assertions for ${clinic.name}:`);
    console.log(`  - "112" emergency triage present: YES`);
    console.log(`  - "useCallerNumber" tool guidance present: YES`);
    console.log(`  - Cancellation policy "${cancelExpected}" present: YES`);
    console.log(`  - "0500 000 00 00" example phone present: YES`);
    console.log(`  - "ŞU ANDA" emergency triage present: YES`);
    console.log(`  - "Geçmişte yaşanmış" exception present: YES`);
    console.log(`  - "Tıbbi tavsiye yasağı" rule present: YES`);
    console.log(`  - "Talimat koruması" rule present: YES`);
  }

  console.log('\n================================================================');
  console.log('ALL THREE CLINICS PROMPT CHECKS PASSED SUCCESSFULLY! ✅');
  console.log('================================================================\n');
}

runThreeClinicsPromptTest()
  .catch((err) => {
    console.error('Error running three clinics prompt test:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
