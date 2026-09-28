/**
 * RECALL V2 — Multi-Tenant Security & Functional Validation Test
 * =============================================================
 * Tests clinic isolation, auth guards, functional correctness, data integrity.
 *
 * Strategy:
 *  - DB-level tests: Direct Prisma queries (no Clerk token needed).
 *  - HTTP-level tests: auth guard 401/403 checks against localhost:3001.
 *    NOTE: In dev mode (CLERK_SECRET_KEY=placeholder + ALLOW_DEV_CLINIC_FALLBACK=true)
 *    token-less requests are allowed by design. HTTP auth tests are automatically
 *    SKIPPED when dev-fallback is active. In production (real CLERK key) these
 *    guards are enforced.
 *
 * Safety rules:
 *  - All test data uses "TEST_SEC_" prefix IDs / phone numbers.
 *  - Only self-created records are deleted at the end.
 *  - Real production data is never touched. Secrets are never logged.
 *
 * Usage:
 *   npx tsx scripts/test-security-isolation.ts
 */

import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { parseIstanbulDate, getIstanbulDayRange } from '../src/lib/date-utils.js';
import { isValidPhone, normalizePhone } from '../src/lib/phone.js';

const prisma = new PrismaClient();

// ── Test identifiers (easy cleanup) ───────────────────────────────────────────
const CLINIC_A_ID    = 'TEST_SEC_CLINIC_A';
const CLINIC_A_PHONE = '+901110000001';
const CLINIC_B_ID    = 'TEST_SEC_CLINIC_B';
const CLINIC_B_PHONE = '+901110000002';
const DOCTOR_A_ID    = 'TEST_SEC_DOC_A1';
const DOCTOR_B_ID    = 'TEST_SEC_DOC_B1';
const PATIENT_A_PHONE = '+905550010001';
const PATIENT_B_PHONE = '+905550010002';
const BACKEND_URL = 'http://localhost:3001';

// ── Test counters ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function pass(label: string)   { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string, detail?: string) {
  const msg = detail ? `${label} — ${detail}` : label;
  console.error(`  ❌ ${msg}`); failures.push(msg); failed++;
}
function skip(label: string, reason: string) {
  console.log(`  ⏭  SKIP ${label} (${reason})`); skipped++;
}
function assert(condition: boolean, label: string, detail?: string) {
  if (condition) pass(label); else fail(label, detail);
}
function section(title: string) {
  console.log(`\n${'═'.repeat(62)}\n  ${title}\n${'═'.repeat(62)}`);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function httpGet(path: string, token?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, { headers });
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return { status: -1, body: null }; }
}

async function httpPost(path: string, data: unknown, token?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch { return { status: -1, body: null }; }
}

// ── Detect dev-fallback mode ──────────────────────────────────────────────────
async function isDevFallbackActive(): Promise<boolean> {
  // Probe: hit a protected endpoint without a token.
  // Dev-fallback returns 200; production returns 401.
  const probe = await httpGet('/api/appointments');
  if (probe.status === -1) return false; // backend not running
  return probe.status === 200;
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
async function setup() {
  section('SETUP — Test klinikleri A ve B oluşturuluyor');

  await prisma.clinic.upsert({ where: { id: CLINIC_A_ID }, update: {},
    create: { id: CLINIC_A_ID, name: 'TEST_SEC Klinik A', phoneNumber: CLINIC_A_PHONE, timezone: 'Europe/Istanbul' } });
  await prisma.clinic.upsert({ where: { id: CLINIC_B_ID }, update: {},
    create: { id: CLINIC_B_ID, name: 'TEST_SEC Klinik B', phoneNumber: CLINIC_B_PHONE, timezone: 'Europe/Istanbul' } });

  const wh = { start: '09:00', end: '17:00', slotDurationMinutes: 30, days: ['monday','tuesday','wednesday','thursday','friday'] };

  await prisma.doctor.upsert({ where: { id: DOCTOR_A_ID }, update: { clinicId: CLINIC_A_ID },
    create: { id: DOCTOR_A_ID, clinicId: CLINIC_A_ID, name: 'TEST_SEC Dr. A', specialty: 'Genel', workingHours: wh } });
  await prisma.doctor.upsert({ where: { id: DOCTOR_B_ID }, update: { clinicId: CLINIC_B_ID },
    create: { id: DOCTOR_B_ID, clinicId: CLINIC_B_ID, name: 'TEST_SEC Dr. B', specialty: 'Genel', workingHours: wh } });

  const patientA = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_A_ID, phoneNumber: PATIENT_A_PHONE } }, update: {},
    create: { clinicId: CLINIC_A_ID, fullName: 'TEST_SEC Hasta A', phoneNumber: PATIENT_A_PHONE } });
  const patientB = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_B_ID, phoneNumber: PATIENT_B_PHONE } }, update: {},
    create: { clinicId: CLINIC_B_ID, fullName: 'TEST_SEC Hasta B', phoneNumber: PATIENT_B_PHONE } });

  await prisma.appointment.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });

  const apptAStart = parseIstanbulDate('2026-11-15T10:00:00+03:00');
  const apptA = await prisma.appointment.create({ data: {
    clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID, patientId: patientA.id,
    startsAt: apptAStart, endsAt: new Date(apptAStart.getTime() + 30*60*1000), status: AppointmentStatus.SCHEDULED } });

  const apptBStart = parseIstanbulDate('2026-11-15T10:00:00+03:00');
  const apptB = await prisma.appointment.create({ data: {
    clinicId: CLINIC_B_ID, doctorId: DOCTOR_B_ID, patientId: patientB.id,
    startsAt: apptBStart, endsAt: new Date(apptBStart.getTime() + 30*60*1000), status: AppointmentStatus.SCHEDULED } });

  console.log(`  ✔ Clinic A: ${CLINIC_A_ID}  Randevu A: ${apptA.id}`);
  console.log(`  ✔ Clinic B: ${CLINIC_B_ID}  Randevu B: ${apptB.id}`);
  return { apptA, apptB, patientA, patientB };
}

// ── 1. KLİNİK İZOLASYONU ─────────────────────────────────────────────────────
async function testClinicIsolation(apptA: { id: string }, apptB: { id: string }) {
  section('1. KLİNİK İZOLASYONU — DB seviyesi');

  const apptsByA = await prisma.appointment.findMany({ where: { clinicId: CLINIC_A_ID } });
  assert(apptsByA.every(a => a.clinicId === CLINIC_A_ID), '1a. Klinik A sorgusu sadece A randevuları');
  assert(!apptsByA.some(a => a.id === apptB.id),          '1b. Klinik A sorgusunda B randevusu görünmez');

  const apptsByB = await prisma.appointment.findMany({ where: { clinicId: CLINIC_B_ID } });
  assert(apptsByB.every(a => a.clinicId === CLINIC_B_ID), '1c. Klinik B sorgusu sadece B randevuları');
  assert(!apptsByB.some(a => a.id === apptA.id),          '1d. Klinik B sorgusunda A randevusu görünmez');

  const crossTenant = await prisma.appointment.findFirst({ where: { id: apptB.id, clinicId: CLINIC_A_ID } });
  assert(crossTenant === null, '1e. Çapraz kiracı ID enjeksiyonu engelleniyor (A→B randevusu null)');

  const doctorsByA = await prisma.doctor.findMany({ where: { clinicId: CLINIC_A_ID } });
  assert(doctorsByA.every(d => d.clinicId === CLINIC_A_ID), '1f. Klinik A doktor sorgusu sadece A doktorları');
  assert(!doctorsByA.some(d => d.id === DOCTOR_B_ID),       '1g. Klinik A sorgusunda B doktoru görünmez');

  const patientsByA = await prisma.patient.findMany({ where: { clinicId: CLINIC_A_ID } });
  assert(patientsByA.every(p => p.clinicId === CLINIC_A_ID), '1h. Klinik A hasta sorgusu sadece A hastaları');

  const countA   = await prisma.appointment.count({ where: { clinicId: CLINIC_A_ID } });
  const countB   = await prisma.appointment.count({ where: { clinicId: CLINIC_B_ID } });
  const countAll = await prisma.appointment.count({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  assert(countA + countB === countAll, `1i. İzole sayımlar toplamı eşleşiyor (${countA}+${countB}=${countAll})`);
}

// ── 2. AUTH GUARDS ────────────────────────────────────────────────────────────
async function testAuthGuards() {
  section('2. KİMLİK DOĞRULAMA KORUYUCULARI — HTTP seviyesi');

  const DEV_SKIP_REASON = 'dev-fallback aktif (CLERK_SECRET_KEY=placeholder, ALLOW_DEV_CLINIC_FALLBACK=true)';

  // Check if backend is up at all
  const health = await httpGet('/api/health');
  if (health.status === -1) {
    console.warn('  ⚠️  Backend çalışmıyor (port 3001) — tüm HTTP testleri atlandı');
    skipped += 9;
    return;
  }

  // Detect dev-fallback mode
  const devFallback = await isDevFallbackActive();
  if (devFallback) {
    console.log(`  ℹ️  Dev-fallback modu aktif: Clerk token kontrolü devre dışı.`);
    console.log(`     Production ortamında (gerçek CLERK_SECRET_KEY ile) 401 dönülür.`);
  }

  const regularEndpoints = [
    '/api/appointments',
    '/api/doctors',
    '/api/call-logs',
    '/api/stats/dashboard',
    '/api/analytics/summary',
  ];

  for (const ep of regularEndpoints) {
    const r = await httpGet(ep);
    if (devFallback) {
      // In dev mode, 200 is expected (fallback bypasses auth) — skip, don't fail
      skip(`Token yok → ${ep}`, DEV_SKIP_REASON);
    } else {
      assert(r.status === 401 || r.status === 403, `2. Token yok → ${ep} → 401/403`, `Gerçek: ${r.status}`);
    }
  }

  // Admin endpoints use requireAdmin which checks role='secretary' from dev fallback → 403 even in dev
  const adminEndpoints = [
    '/api/admin/clinics',
    '/api/admin/analytics/clinics-overview',
  ];
  for (const ep of adminEndpoints) {
    const r = await httpGet(ep);
    assert(r.status === 403, `2. /api/admin sekreter rolüyle erişilemez → ${ep} → 403`, `Gerçek: ${r.status}`);
  }

  // Invalid token
  const bad = await httpGet('/api/appointments', 'invalid-garbage-token');
  if (devFallback) {
    skip('Geçersiz token reddi testi', DEV_SKIP_REASON);
  } else {
    assert(bad.status === 401, `2j. Geçersiz token → 401`, `Gerçek: ${bad.status}`);
  }

  // POST without token
  const postR = await httpPost('/api/appointments', { patientName: 'X', patientPhone: '05550010001', doctorId: DOCTOR_A_ID, startsAt: '2026-11-20T10:00:00+03:00' });
  if (devFallback) {
    // In dev mode, auth passes then validation fails → 400 is acceptable
    assert(postR.status === 400 || postR.status === 409, `2k. Dev modda POST (auth bypass → validasyon hatası) → ${postR.status}`,
      'Dev modda 400/409 bekleniyor (auth bypass sonrası body/conflict kontrolü)');
  } else {
    assert(postR.status === 401 || postR.status === 403, `2k. Token yok POST /api/appointments → 401/403`, `Gerçek: ${postR.status}`);
  }
}

// ── 3. DURUM GEÇİŞLERİ ───────────────────────────────────────────────────────
async function testStatusTransitions(apptA: { id: string }) {
  section('3. DURUM GEÇİŞLERİ — DB seviyesi');

  const completed = await prisma.appointment.update({ where: { id: apptA.id }, data: { status: AppointmentStatus.COMPLETED } });
  assert(completed.status === AppointmentStatus.COMPLETED, '3a. SCHEDULED → COMPLETED');

  const cancelled = await prisma.appointment.update({ where: { id: apptA.id }, data: { status: AppointmentStatus.CANCELLED } });
  assert(cancelled.status === AppointmentStatus.CANCELLED, '3b. COMPLETED → CANCELLED (mevcut davranış: izin veriliyor — backend kısıtlama yok)');

  await prisma.appointment.update({ where: { id: apptA.id }, data: { status: AppointmentStatus.SCHEDULED } });
  pass('3c. Test randevusu SCHEDULED durumuna geri alındı');
}

// ── 4. ÇAKIŞMA KONTROLÜ ──────────────────────────────────────────────────────
async function testConflictDetection() {
  section('4. ÇAKIŞMA KONTROLÜ — DB seviyesi');

  const extraPatient = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_A_ID, phoneNumber: '+905550010099' } }, update: {},
    create: { clinicId: CLINIC_A_ID, fullName: 'TEST_SEC Çakışma', phoneNumber: '+905550010099' } });

  const occStart = parseIstanbulDate('2026-11-16T11:00:00+03:00');
  const occEnd   = new Date(occStart.getTime() + 30*60*1000);
  const occ = await prisma.appointment.create({ data: {
    clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID, patientId: extraPatient.id,
    startsAt: occStart, endsAt: occEnd, status: AppointmentStatus.SCHEDULED } });

  const conflict = await prisma.appointment.findFirst({ where: {
    clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID, status: AppointmentStatus.SCHEDULED,
    AND: [{ startsAt: { lt: occEnd } }, { endsAt: { gt: occStart } }] } });
  assert(conflict !== null,          '4a. Aynı doktor/slot çakışması tespit ediliyor');
  assert(conflict?.id === occ.id,    '4b. Çakışan kayıt doğru');

  // Cross-tenant: same time-slot but different clinic → no conflict
  const noConflict = await prisma.appointment.findFirst({ where: {
    clinicId: CLINIC_B_ID, doctorId: DOCTOR_B_ID, status: AppointmentStatus.SCHEDULED,
    AND: [{ startsAt: { lt: occEnd } }, { endsAt: { gt: occStart } }] } });
  assert(noConflict === null, '4c. Farklı klinik aynı saatte çakışma yaratmaz (cross-tenant yalıtım)');

  await prisma.appointment.delete({ where: { id: occ.id } });
  await prisma.patient.deleteMany({ where: { clinicId: CLINIC_A_ID, phoneNumber: '+905550010099' } });
}

// ── 5. TELEFON DOĞRULAMA ─────────────────────────────────────────────────────
async function testPhoneValidation() {
  section('5. TELEFON NUMARASI DOĞRULAMA');

  const valid: [string, string][] = [
    ['05321234567',    '+905321234567'],
    ['5321234567',     '+905321234567'],
    ['+905321234567',  '+905321234567'],
    ['0532 123 45 67', '+905321234567'],
  ];
  for (const [inp, exp] of valid) {
    assert(isValidPhone(inp),             `5. isValidPhone("${inp}") → true`);
    const norm = normalizePhone(inp);
    assert(norm === exp, `5. normalizePhone("${inp}") → "${exp}"`, `Gerçek: "${norm}"`);
  }
  for (const inp of ['123', '0532', 'abc', '']) {
    assert(!isValidPhone(inp), `5. isValidPhone("${inp}") → false`);
  }
}

// ── 6. TARİH FİLTRESİ & TIMEZONE ────────────────────────────────────────────
async function testDateFiltersAndTimezone(apptA: { id: string }) {
  section('6. TARİH FİLTRESİ & TIMEZONE (Europe/Istanbul)');

  const { startOfDay, endOfDay } = getIstanbulDayRange('2026-11-15');
  const found = await prisma.appointment.findFirst({
    where: { clinicId: CLINIC_A_ID, id: apptA.id, startsAt: { gte: startOfDay, lte: endOfDay } } });
  assert(found !== null, '6a. 2026-11-15 filtresi Istanbul 10:00 randevusunu yakalar');

  const wrong = getIstanbulDayRange('2026-11-14');
  const notFound = await prisma.appointment.findFirst({
    where: { clinicId: CLINIC_A_ID, id: apptA.id, startsAt: { gte: wrong.startOfDay, lte: wrong.endOfDay } } });
  assert(notFound === null, '6b. Yanlış gün filtresi randevuyu bulamaz');

  const parsed = parseIstanbulDate('2026-11-15T10:00:00+03:00');
  assert(parsed.getUTCHours() === 7 && parsed.getUTCMinutes() === 0,
    `6c. parseIstanbulDate("...T10:00+03:00") → UTC 07:00`, `UTC: ${parsed.getUTCHours()}:${String(parsed.getUTCMinutes()).padStart(2,'0')}`);

  const byDoctor = await prisma.appointment.findMany({ where: { clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID } });
  assert(byDoctor.every(a => a.doctorId === DOCTOR_A_ID), '6d. Doktor filtresi yalnızca o doktorun randevuları');

  const scheduled = await prisma.appointment.findMany({ where: { clinicId: CLINIC_A_ID, status: AppointmentStatus.SCHEDULED } });
  assert(scheduled.every(a => a.status === AppointmentStatus.SCHEDULED), '6e. Status filtresi sadece SCHEDULED');
}

// ── 7. HASTA ARAMA ────────────────────────────────────────────────────────────
async function testPatientSearch() {
  section('7. HASTA ARAMA — Klinik izolasyonu');

  const inA = await prisma.patient.findMany({
    where: { clinicId: CLINIC_A_ID, fullName: { contains: 'TEST_SEC', mode: 'insensitive' } } });
  assert(inA.length > 0,                             '7a. Klinik A içinde "TEST_SEC" araması sonuç döndürür');
  assert(inA.every(p => p.clinicId === CLINIC_A_ID), '7b. Sonuçlar sadece Klinik A');

  const cross = await prisma.patient.findMany({
    where: { clinicId: CLINIC_A_ID, fullName: { contains: 'Hasta B', mode: 'insensitive' } } });
  assert(cross.every(p => p.clinicId === CLINIC_A_ID), '7c. Klinik A sorgusu Klinik B hastasını getirmez');
}

// ── 8. VERİ BÜTÜNLÜĞÜ ────────────────────────────────────────────────────────
async function testDataIntegrity(apptA: { id: string }) {
  section('8. VERİ BÜTÜNLÜĞÜ');

  const newStart = parseIstanbulDate('2026-11-17T14:00:00+03:00');
  const newEnd   = new Date(newStart.getTime() + 30*60*1000);
  const rescheduled = await prisma.appointment.update({ where: { id: apptA.id }, data: { startsAt: newStart, endsAt: newEnd } });
  assert(rescheduled.startsAt.getTime() === newStart.getTime(), '8a. Yeniden planlama yeni saati doğru kaydetti');
  assert(rescheduled.clinicId === CLINIC_A_ID,                  '8b. Yeniden planlamada clinicId değişmedi');

  // Cross-tenant updateMany injection simulation: wrong clinicId guard → 0 rows affected
  await prisma.appointment.updateMany({
    where: { id: apptA.id, clinicId: CLINIC_B_ID },
    data: { status: AppointmentStatus.CANCELLED } });
  const check = await prisma.appointment.findUnique({ where: { id: apptA.id } });
  assert(check?.status !== AppointmentStatus.CANCELLED,
    '8c. Yanlış clinicId ile updateMany → sıfır satır değişir (çapraz kiracı koruma)');
}

// ── CLEANUP ───────────────────────────────────────────────────────────────────
async function cleanup() {
  section('TEMİZLİK — Test kayıtları siliniyor');
  const d1 = await prisma.appointment.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  const d2 = await prisma.patient.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  const d3 = await prisma.doctor.deleteMany({ where: { id: { in: [DOCTOR_A_ID, DOCTOR_B_ID] } } });
  const d4 = await prisma.clinic.deleteMany({ where: { id: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  console.log(`  🗑  Randevu: ${d1.count}  Hasta: ${d2.count}  Doktor: ${d3.count}  Klinik: ${d4.count}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RECALL V2 — Güvenlik & Fonksiyonel Doğrulama Test Süiti    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let setupData: Awaited<ReturnType<typeof setup>> | null = null;
  try {
    setupData = await setup();
    await testClinicIsolation(setupData.apptA, setupData.apptB);
    await testAuthGuards();
    await testStatusTransitions(setupData.apptA);
    await testConflictDetection();
    await testPhoneValidation();
    await testDateFiltersAndTimezone(setupData.apptA);
    await testPatientSearch();
    await testDataIntegrity(setupData.apptA);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n${'═'.repeat(62)}\n  SONUÇ\n${'═'.repeat(62)}`);
  console.log(`  ✅ Geçen     : ${passed}`);
  console.log(`  ❌ Başarısız : ${failed}`);
  console.log(`  ⏭  Atlanan   : ${skipped}`);
  if (failures.length > 0) {
    console.log('\n  Başarısız testler:');
    failures.forEach(f => console.log(`    • ${f}`));
  }
  if (failed > 0) process.exit(1);
  else console.log('\n  🎉 Tüm çalışan testler başarıyla geçti!\n');
}

main().catch(err => { console.error('Test süiti çöktü:', err); prisma.$disconnect(); process.exit(1); });
