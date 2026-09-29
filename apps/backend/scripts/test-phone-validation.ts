import assert from 'node:assert/strict';
import { validateAndFormatTurkishPhone } from '../src/lib/phone.js';

console.log('================================================================');
console.log('PHONE VALIDATION & NORMALIZATION TEST SUITE');
console.log('================================================================\n');

// 1. Valid numbers
const validCases = [
  { raw: '0544 444 21 70', expected: '05444442170' },
  { raw: '5444442170', expected: '05444442170' },
  { raw: '+90 544 444 21 70', expected: '05444442170' },
  { raw: '+905444442170', expected: '05444442170' },
  { raw: '905444442170', expected: '05444442170' },
  { raw: '0(532) 123-45-67', expected: '05321234567' },
  { raw: '0 532 123 45 67', expected: '05321234567' },
  { raw: '+90 (555) 000 11 22', expected: '05550001122' },
];

for (const vc of validCases) {
  const res = validateAndFormatTurkishPhone(vc.raw);
  console.log(`[PASS] Input: "${vc.raw}" -> ${res.formattedPhone}`);
  assert.equal(res.isValid, true);
  assert.equal(res.formattedPhone, vc.expected);
}

// 2. Invalid numbers (must fail and return strict error message)
const invalidCases = [
  '0544 44 421 7088', // 13 digits (like yesterday's call)
  '0544 44 421',      // 9 digits (too short)
  '0212 123 45 67',   // Landline (starts with 02, not 05)
  '0312 456 78 90',   // Landline
  '0444 123 45 67',   // Does not start with 05
  '',                 // Empty
  '   ',
  'telefon',          // Non-digit text
  null,
  undefined,
];

const EXPECTED_ERR = 'Telefon numarası geçersiz, hastadan numarayı yeniden iste.';

for (const ic of invalidCases) {
  const res = validateAndFormatTurkishPhone(ic);
  console.log(`[REJECT] Input: "${ic}" -> valid: ${res.isValid}, error: "${res.errorMessage}"`);
  assert.equal(res.isValid, false);
  assert.equal(res.errorMessage, EXPECTED_ERR);
  assert.equal(res.formattedPhone, undefined);
}

console.log('\n✅ All phone normalization and validation tests passed successfully!');
