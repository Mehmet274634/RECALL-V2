import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db/client.js';
import { getDefaultClinic } from '../src/lib/db/clinic.js';
import { buildPanelSystemPrompt } from '../src/lib/vapi/system-prompt.js';

async function runPromptUnitTests() {
  console.log('================================================================');
  console.log('TEST SUITE: VAPI PANEL SYSTEM PROMPT GENERATOR');
  console.log('================================================================\n');

  const defaultClinic = await getDefaultClinic();
  console.log(`Test Clinic: ${defaultClinic.name} (${defaultClinic.id})`);

  const prompt = await buildPanelSystemPrompt(defaultClinic.id);

  console.log(`Generated prompt length: ${prompt.length} characters`);

  // Test 1: Vapi syntax for date must be present
  const EXPECTED_DATE_SYNTAX = 'Bugünün tarihi ve saati: {{"now" | date: "%Y-%m-%d %A %H:%M", "Europe/Istanbul"}}';
  assert.ok(
    prompt.includes(EXPECTED_DATE_SYNTAX),
    'Date header must include exact Vapi liquid syntax {{"now" | date: ...}}',
  );
  console.log('[PASS] Test 1: Date header contains exact Vapi Liquid date syntax');

  // Test 2: "ÖNEMLİ NOT" must NOT be in the prompt
  assert.ok(
    !prompt.includes('ÖNEMLİ NOT'),
    'Prompt must NOT contain "ÖNEMLİ NOT"',
  );
  console.log('[PASS] Test 2: Prompt does NOT contain "ÖNEMLİ NOT"');

  // Test 3: {{KARSILAMA_MESAJI}} must NOT be in the prompt
  assert.ok(
    !prompt.includes('{{KARSILAMA_MESAJI}}'),
    'Prompt must NOT contain "{{KARSILAMA_MESAJI}}"',
  );
  console.log('[PASS] Test 3: Prompt does NOT contain "{{KARSILAMA_MESAJI}}"');

  // Test 4: No unfilled template variables like {{KLINIK_ADI}}, {{DOKTOR_LISTESI}}, {{IPTAL_SURESI_SAAT}}, {{OZEL_TALIMATLAR}}
  const unfilledVariables = [
    '{{KLINIK_ADI}}',
    '{{DOKTOR_LISTESI}}',
    '{{IPTAL_SURESI_SAAT}}',
    '{{OZEL_TALIMATLAR}}',
    '{{BRANSLAR}}',
  ];

  for (const v of unfilledVariables) {
    assert.ok(!prompt.includes(v), `Prompt must NOT contain unfilled variable "${v}"`);
  }
  console.log('[PASS] Test 4: All clinic template variables are filled with real DB values');

  // Test 5: Verify real clinic name is present
  assert.ok(
    prompt.includes(defaultClinic.name),
    `Prompt must include clinic name "${defaultClinic.name}"`,
  );
  console.log(`[PASS] Test 5: Clinic name "${defaultClinic.name}" is present`);

  // Test 6: Verify doctors and cancellation policy are present
  assert.ok(
    prompt.includes('KLİNİK, DOKTORLAR VE POLİTİKA') || prompt.includes('Hekimler'),
    'Prompt must include doctor roster section',
  );
  assert.ok(
    prompt.includes(`${defaultClinic.cancellationPolicyHours ?? 2} saat`),
    `Prompt must include cancellation policy hours (${defaultClinic.cancellationPolicyHours ?? 2} saat)`,
  );
  console.log('[PASS] Test 6: Doctor roster and cancellation hours are properly rendered');

  // Test 7: Verify "ÖZEL KARŞILAMA ŞABLONUN" is excluded from panel prompt (since First Message handles it)
  assert.ok(
    !prompt.includes('ÖZEL KARŞILAMA ŞABLONUN'),
    'Panel prompt must NOT contain "ÖZEL KARŞILAMA ŞABLONUN"',
  );
  console.log('[PASS] Test 7: "ÖZEL KARŞILAMA ŞABLONUN" is excluded from panel prompt');

  console.log('\n================================================================');
  console.log('✅ ALL VAPI PANEL PROMPT UNIT TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runPromptUnitTests()
  .catch((err) => {
    console.error('Prompt unit test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
