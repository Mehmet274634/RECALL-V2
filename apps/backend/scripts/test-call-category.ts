import assert from 'node:assert/strict';
import {
  determineCallCategory,
  extractUserTranscript,
  sanitizeCallSummary,
  extractStructuredCallSummary,
} from '../src/lib/vapi/server-handler.js';

console.log('================================================================');
console.log('CALL CATEGORY & SUMMARY SANITIZATION TEST SUITE');
console.log('================================================================\n');

// Standard greeting used by AI assistant (contains the word "randevu")
const AI_GREETING =
  'AI: Merhaba, Recall Sağlık Kliniği\'ne hoş geldiniz. Randevu işlemleri ve hizmet kalitesi amacıyla yapay zekâ asistanı tarafından kaydedilen bu görüşmede size nasıl yardımcı olabilirim?';

// ---------------------------------------------------------------------------
// TEST 1: Bilgi Sorusu (Karşılamada "randevu" geçse bile "Genel Bilgi" dönmeli)
// ---------------------------------------------------------------------------
console.log('1. Bilgi Sorusu Testleri (Karşılamada "randevu" geçse bile):');

// 1A: call_summary ile "Bilgi soruldu."
const t1a = determineCallCategory(
  'Bilgi soruldu.',
  `${AI_GREETING}\nUser: Çalışma saatleriniz nelerdir?\nAI: Hafta içi her gün 09:00 - 18:00 arası açığız.`,
);
console.log(`   1A (call_summary = "Bilgi soruldu."):`, t1a);
assert.equal(t1a, 'Genel Bilgi', '1A failed: must be Genel Bilgi');

// 1B: call_summary ile "Bilgi soruldu (çalışma saatleri hakkında)."
const t1b = determineCallCategory(
  'Bilgi soruldu (çalışma saatleri hakkında).',
  `${AI_GREETING}\nUser: Hangi branşlar var?`,
);
console.log(`   1B (call_summary = "Bilgi soruldu (çalışma saatleri hakkında)."):`, t1b);
assert.equal(t1b, 'Genel Bilgi', '1B failed: must be Genel Bilgi');

// 1C: Özet boş olduğunda, User sadece saat sormuşken (AI karşılama cümlesindeki "randevu" yok sayılmalı):
const t1c = determineCallCategory(
  '',
  `${AI_GREETING}\nUser: Kliniğiniz saat kaça kadar açık?\nAI: Saat 18:00'e kadar açığız.`,
);
console.log(`   1C (Özet yok, sadece User sorusu: "saat kaça kadar açık"):`, t1c);
assert.equal(t1c, 'Genel Bilgi', '1C failed: must be Genel Bilgi');

// 1D: extractUserTranscript testi (AI satırlarını filtreleme)
const rawTranscript = `${AI_GREETING}\nUser: Muayene ücretleriniz hakkında bilgi alabilir miyim?\nAI: Tabii, dahiliye muayene ücreti...`;
const userOnly = extractUserTranscript(rawTranscript);
console.log(`   1D (extractUserTranscript filtrelenmiş kullanıcı konuşması): "${userOnly}"`);
assert.equal(
  userOnly,
  'Muayene ücretleriniz hakkında bilgi alabilir miyim?',
  '1D failed: AI lines must be completely stripped',
);
assert.equal(
  userOnly.includes('Randevu işlemleri'),
  false,
  '1D failed: AI greeting must not be in user speech',
);
console.log('   ✅ Bilgi Sorusu testleri başarıyla geçti!\n');

// ---------------------------------------------------------------------------
// TEST 2: Yeni Randevu Talebi
// ---------------------------------------------------------------------------
console.log('2. Yeni Randevu Talebi Testleri:');

// 2A: call_summary üzerinden
const t2a = determineCallCategory(
  'Dr. Ahmet Yılmaz için 30 Eylül saat 10:30\'a randevu oluşturuldu.',
  `${AI_GREETING}\nUser: Yarın için randevu almak istiyorum.\nUser: 10:30 olsun.\nUser: Onaylıyorum.`,
);
console.log(`   2A (call_summary ile randevu oluşturuldu):`, t2a);
assert.equal(t2a, 'Randevu Talebi', '2A failed: must be Randevu Talebi');

// 2B: Özet boş, sadece User transkripti üzerinden
const t2b = determineCallCategory(
  '',
  `${AI_GREETING}\nUser: Yarın dahiliye için randevu almak istiyorum.\nAI: Hangi saat uygundur?`,
);
console.log(`   2B (Özet yok, User: "randevu almak istiyorum"):`, t2b);
assert.equal(t2b, 'Randevu Talebi', '2B failed: must be Randevu Talebi');
console.log('   ✅ Yeni Randevu Talebi testleri başarıyla geçti!\n');

// ---------------------------------------------------------------------------
// TEST 3: Randevu İptali
// ---------------------------------------------------------------------------
console.log('3. Randevu İptali Testleri:');

// 3A: call_summary üzerinden
const t3a = determineCallCategory(
  'Hasta randevusunu iptal etti.',
  `${AI_GREETING}\nUser: Randevumu iptal etmek istiyorum.`,
);
console.log(`   3A (call_summary ile iptal):`, t3a);
assert.equal(t3a, 'Randevu İptali', '3A failed: must be Randevu İptali');

// 3B: Özet boş, User transkripti üzerinden
const t3b = determineCallCategory(
  '',
  `${AI_GREETING}\nUser: Gelemeyeceğim, randevumdan vazgeçtim iptal eder misiniz?`,
);
console.log(`   3B (Özet yok, User: "vazgeçtim iptal eder misiniz"):`, t3b);
assert.equal(t3b, 'Randevu İptali', '3B failed: must be Randevu İptali');
console.log('   ✅ Randevu İptali testleri başarıyla geçti!\n');

// ---------------------------------------------------------------------------
// TEST 4: Randevu Değişikliği (Erteleme)
// ---------------------------------------------------------------------------
console.log('4. Randevu Değişikliği Testleri:');

// 4A: call_summary üzerinden
const t4a = determineCallCategory(
  'Randevu saati 14:30 olarak ertelendi.',
  `${AI_GREETING}\nUser: Randevu saatimi değiştirebilir miyiz?`,
);
console.log(`   4A (call_summary ile erteleme):`, t4a);
assert.equal(t4a, 'Randevu Değişikliği', '4A failed: must be Randevu Değişikliği');

// 4B: Özet boş, User transkripti üzerinden
const t4b = determineCallCategory(
  '',
  `${AI_GREETING}\nUser: Randevumu yarına ertelemek istiyorum.\nAI: Tabii, saat kaç olsun?`,
);
console.log(`   4B (Özet yok, User: "yarına ertelemek istiyorum"):`, t4b);
assert.equal(t4b, 'Randevu Değişikliği', '4B failed: must be Randevu Değişikliği');
console.log('   ✅ Randevu Değişikliği testleri başarıyla geçti!\n');

// ---------------------------------------------------------------------------
// TEST 5: Summary Sanitization ve "Kategori: ..." İfadesinin Çıkarılması
// ---------------------------------------------------------------------------
console.log('5. Summary Sanitization ve "Kategori: ..." Kontrolü:');

const rawSummary1 = 'Bilgi soruldu (çalışma saatleri hakkında).';
const sanitized1 = sanitizeCallSummary(rawSummary1, 'Genel Bilgi');
console.log(`   5A Temiz Özet: "${sanitized1}"`);
assert.equal(
  sanitized1.startsWith('Kategori:'),
  false,
  '5A failed: summary must NOT prepend "Kategori: ..."',
);
assert.equal(sanitized1, rawSummary1, '5A failed: text should remain clean');

// Tıbbi şikayet gizleme testi
const rawSummaryWithMedical = 'Hasta şiddetli karın ağrısı ve yüksek tansiyon sebebiyle randevu aldı.';
const sanitizedMedical = sanitizeCallSummary(rawSummaryWithMedical, 'Randevu Talebi');
console.log(`   5B Tıbbi Şikayet Gizleme: "${sanitizedMedical}"`);
assert.equal(
  sanitizedMedical.includes('[Tıbbi şikayet/bilgi KVKK gereği gizlendi]'),
  true,
  '5B failed: medical terms must be redacted',
);
assert.equal(
  sanitizedMedical.startsWith('Kategori:'),
  false,
  '5B failed: summary must NOT prepend "Kategori: ..."',
);
console.log('   ✅ Sanitization ve Kategori ayrımı başarıyla geçti!\n');

// ---------------------------------------------------------------------------
// TEST 6: Structured call_summary Extraction (UUID-Agnostic)
// ---------------------------------------------------------------------------
console.log('6. Structured Output call_summary Çıkarımı:');

// Real Vapi artifact structure with random UUID key
const mockArtifact = {
  structuredOutputs: {
    '8b6c4e01-1234-4567-89ab-cdef01234567': {
      name: 'call_summary',
      result: 'Bilgi soruldu.',
    },
    'another-uuid-key-002': {
      name: 'other_data',
      result: 'some other data',
    },
  },
};

const extracted = extractStructuredCallSummary(mockArtifact);
console.log(`   6A Çıkarılan call_summary: "${extracted}"`);
assert.equal(extracted, 'Bilgi soruldu.', '6A failed: must extract call_summary');
console.log('   ✅ Structured Output extraction başarıyla geçti!\n');

console.log('================================================================');
console.log('TÜM TESTLER BAŞARIYLA TAMAMLANDI! (100% PASS)');
console.log('================================================================');
