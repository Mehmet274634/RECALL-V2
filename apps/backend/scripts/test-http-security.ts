/**
 * RECALL V2 — HTTP Security Integration Test Suite
 * =================================================
 * Starts a real Express server on port 3099 with TEST_AUTH_OVERRIDE=true,
 * then runs all HTTP-level security tests without requiring real Clerk JWTs.
 *
 * Tests:
 *  1. Auth guard verification (previously skipped 6 tests)
 *  2. clinicId injection proof (body / query params ignored)
 *  3. IDOR tests (cross-tenant GET / PATCH via HTTP)
 *  4. Conflict detection via HTTP
 *  5. User scenarios (no clinicId, secretary vs admin roles)
 *  6. Production startup guard (spawn + exit-code check)
 *  7. clinicId DB consistency
 *  8. Final state transition guard
 *
 * Usage:
 *   npx tsx scripts/test-http-security.ts
 *   npm run test:security   (chains with test-security-isolation)
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { parseIstanbulDate } from '../src/lib/date-utils.js';
import { bookAppointment } from '../src/lib/scheduling/booking.js';
import { checkAvailability } from '../src/lib/scheduling/availability.js';
import { setTimeout as wait } from 'timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 3099;
const BASE = `http://localhost:${TEST_PORT}`;
const isWin = process.platform === 'win32';

// ── Test clinics (reuse same IDs as isolation test for setup, cleanup separately) ──
const CLINIC_A_ID    = 'TEST_HTTP_CLINIC_A';
const CLINIC_A_PHONE = '+901110000011';
const CLINIC_B_ID    = 'TEST_HTTP_CLINIC_B';
const CLINIC_B_PHONE = '+901110000012';
const DOCTOR_A_ID    = 'TEST_HTTP_DOC_A1';
const DOCTOR_B_ID    = 'TEST_HTTP_DOC_B1';
const PATIENT_A_PHONE = '+905550020001';
const PATIENT_B_PHONE = '+905550020002';

const prisma = new PrismaClient();
let serverProcess: ChildProcess | null = null;
let apptA_id = '';
let apptB_id = '';
const serverLogs: string[] = [];

// ── Counter ────────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0; let skipped = 0;
const failures: string[] = [];
function pass(l: string)   { console.log(`  ✅ ${l}`); passed++; }
function fail(l: string, d?: string) { const m = d ? `${l} — ${d}` : l; console.error(`  ❌ ${m}`); failures.push(m); failed++; }
function skip(l: string, r: string)  { console.log(`  ⏭  SKIP ${l} (${r})`); skipped++; }
function assert(c: boolean, l: string, d?: string) { if (c) pass(l); else fail(l, d); }
function section(t: string) { console.log(`\n${'═'.repeat(62)}\n  ${t}\n${'═'.repeat(62)}`); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function headers(clinicId?: string, role: string = 'secretary', extra: Record<string,string> = {}): Record<string,string> {
  const h: Record<string,string> = { 'Content-Type': 'application/json', ...extra };
  if (clinicId) { h['X-Test-Clinic-Id'] = clinicId; h['X-Test-Role'] = role; }
  return h;
}

async function req(method: string, path: string, body?: unknown, clinicId?: string, role: string = 'secretary', extraHeaders: Record<string,string> = {}) {
  try {
    const opts: RequestInit = { method, headers: headers(clinicId, role, extraHeaders) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (e) { return { status: -1, data: String(e) }; }
}
const GET   = (path: string, clinicId?: string, role: string = 'secretary') => req('GET',  path, undefined, clinicId, role);
const POST  = (path: string, body: unknown, clinicId?: string, role: string = 'secretary') => req('POST', path, body, clinicId, role);
const PATCH = (path: string, body: unknown, clinicId?: string, role: string = 'secretary') => req('PATCH', path, body, clinicId, role);

// ── Server lifecycle ──────────────────────────────────────────────────────────
async function startServer(): Promise<boolean> {
  console.log(`  → Test sunucusu başlatılıyor (port ${TEST_PORT}, TEST_AUTH_OVERRIDE=true)...`);
  const tsxCmd = 'npx'; const spawnOpts = { shell: true };
  serverProcess = spawn(tsxCmd, ['tsx', 'src/index.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      TEST_AUTH_OVERRIDE: 'true',
      PORT: String(TEST_PORT),
      NODE_ENV: 'development',
      ALLOW_DEV_CLINIC_FALLBACK: 'false',
    },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => { console.warn('  ⚠️  Sunucu başlatma zaman aşımı'); resolve(false); }, 30_000);
    serverProcess!.stdout?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      serverLogs.push(msg);
      if (msg.includes('Server running')) { clearTimeout(timeout); resolve(true); }
    });
    serverProcess!.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      serverLogs.push(msg);
      if (!msg.includes('[sentry]') && !msg.includes('ExperimentalWarning')) { process.stderr.write(`[srv] ${msg}`); }
    });
    serverProcess!.on('error', () => { clearTimeout(timeout); resolve(false); });
    serverProcess!.on('exit', (code) => { if (code !== 0) { clearTimeout(timeout); resolve(false); } });
  });
}

function stopServer() {
  if (serverProcess?.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch {
      // process already dead
    }
    serverProcess = null;
  }
}

// ── DB Setup ──────────────────────────────────────────────────────────────────
async function dbSetup() {
  section('SETUP — HTTP test klinikleri oluşturuluyor');
  const wh = { start: '09:00', end: '17:00', slotDurationMinutes: 30, days: ['monday','tuesday','wednesday','thursday','friday'] };

  await prisma.clinic.upsert({ where: { id: CLINIC_A_ID }, update: {},
    create: { id: CLINIC_A_ID, name: 'TEST_HTTP Klinik A', phoneNumber: CLINIC_A_PHONE, timezone: 'Europe/Istanbul' } });
  await prisma.clinic.upsert({ where: { id: CLINIC_B_ID }, update: {},
    create: { id: CLINIC_B_ID, name: 'TEST_HTTP Klinik B', phoneNumber: CLINIC_B_PHONE, timezone: 'Europe/Istanbul' } });

  await prisma.doctor.upsert({ where: { id: DOCTOR_A_ID }, update: { clinicId: CLINIC_A_ID },
    create: { id: DOCTOR_A_ID, clinicId: CLINIC_A_ID, name: 'TEST_HTTP Dr. A', specialty: 'Genel', workingHours: wh } });
  await prisma.doctor.upsert({ where: { id: DOCTOR_B_ID }, update: { clinicId: CLINIC_B_ID },
    create: { id: DOCTOR_B_ID, clinicId: CLINIC_B_ID, name: 'TEST_HTTP Dr. B', specialty: 'Genel', workingHours: wh } });

  const pA = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_A_ID, phoneNumber: PATIENT_A_PHONE } }, update: {},
    create: { clinicId: CLINIC_A_ID, fullName: 'TEST_HTTP Hasta A', phoneNumber: PATIENT_A_PHONE } });
  const pB = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_B_ID, phoneNumber: PATIENT_B_PHONE } }, update: {},
    create: { clinicId: CLINIC_B_ID, fullName: 'TEST_HTTP Hasta B', phoneNumber: PATIENT_B_PHONE } });

  await prisma.appointment.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });

  const aStart = parseIstanbulDate('2026-12-01T10:00:00+03:00');
  const apptA = await prisma.appointment.create({ data: {
    clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID, patientId: pA.id,
    startsAt: aStart, endsAt: new Date(aStart.getTime() + 30*60*1000), status: AppointmentStatus.SCHEDULED } });

  const bStart = parseIstanbulDate('2026-12-01T10:00:00+03:00');
  const apptB = await prisma.appointment.create({ data: {
    clinicId: CLINIC_B_ID, doctorId: DOCTOR_B_ID, patientId: pB.id,
    startsAt: bStart, endsAt: new Date(bStart.getTime() + 30*60*1000), status: AppointmentStatus.SCHEDULED } });

  apptA_id = apptA.id; apptB_id = apptB.id;
  console.log(`  ✔ Clinic A: ${CLINIC_A_ID} | Appt A: ${apptA_id}`);
  console.log(`  ✔ Clinic B: ${CLINIC_B_ID} | Appt B: ${apptB_id}`);
}

// ── 1. Auth Guards ────────────────────────────────────────────────────────────
async function test1_AuthGuards() {
  section('1. AUTH GUARDS — Token olmadan 401 bekleniyor (TEST_AUTH_OVERRIDE modunda)');

  const endpoints = [
    { path: '/api/appointments', method: 'GET' },
    { path: '/api/doctors',      method: 'GET' },
    { path: '/api/call-logs',    method: 'GET' },
    { path: '/api/stats/dashboard', method: 'GET' },
    { path: '/api/analytics/summary', method: 'GET' },
  ];

  for (const ep of endpoints) {
    // No X-Test-Clinic-Id header → should be 401
    const r = await GET(ep.path); // no clinicId arg → no test headers sent
    assert(r.status === 401, `1. Token yok → ${ep.path} → 401`, `Gerçek: ${r.status}`);
  }

  // POST without identity
  const rPost = await POST('/api/appointments', { patientName: 'X', patientPhone: '05550020001', doctorId: DOCTOR_A_ID, startsAt: '2026-12-10T10:00:00+03:00' });
  assert(rPost.status === 401, '1f. Token yok → POST /api/appointments → 401', `Gerçek: ${rPost.status}`);

  // Admin endpoints without admin role → 403
  const rAdmin1 = await GET('/api/admin/clinics', CLINIC_A_ID, 'secretary');
  assert(rAdmin1.status === 403, '1g. Sekreter → /api/admin/clinics → 403', `Gerçek: ${rAdmin1.status}`);

  // Admin with proper role → 200
  const rAdmin2 = await GET('/api/admin/clinics', CLINIC_A_ID, 'admin');
  assert(rAdmin2.status === 200, '1h. Admin → /api/admin/clinics → 200', `Gerçek: ${rAdmin2.status}`);
}

// ── 2. clinicId Injection Proof ───────────────────────────────────────────────
async function test2_ClinicIdInjection() {
  section('2. clinicId ENJEKSIYONU — Body/query parametreleri yok sayılmalı');

  // GET with ?clinicId=CLINIC_B_ID injected in query — as Clinic A user, should only see Clinic A data
  const rGet = await GET(`/api/appointments?clinicId=${CLINIC_B_ID}`, CLINIC_A_ID, 'secretary');
  assert(rGet.status === 200, '2a. GET ?clinicId=B (Klinik A kullanıcısı) → 200', `Gerçek: ${rGet.status}`);
  const appts = (rGet.data as { appointments?: Array<{ clinicId: string }> })?.appointments ?? [];
  assert(appts.every(a => a.clinicId === CLINIC_A_ID), '2b. Dönen randevular yalnızca Klinik A\'ya ait (query injection yok sayıldı)',
    `Klinikler: ${JSON.stringify([...new Set(appts.map(a => a.clinicId))])}`);
  assert(!appts.some(a => a.clinicId === CLINIC_B_ID), '2c. Klinik B randevusu sonuçlara karışmadı');

  // POST with clinicId in body — appointment should be created for Clinic A, not B
  const rPost = await POST('/api/appointments', {
    patientName: 'TEST_HTTP Enjeksiyon Hastası',
    patientPhone: '05550029001',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-02T10:00:00+03:00',
    clinicId: CLINIC_B_ID, // injection attempt — should be ignored
  }, CLINIC_A_ID, 'secretary');
  assert(rPost.status === 201, '2d. POST body[clinicId=B] olarak Klinik A kullanıcısından → 201 (body clinicId yok sayıldı)', `Gerçek: ${rPost.status}`);
  const createdAppt = (rPost.data as { appointment?: { clinicId: string; id: string } })?.appointment;
  assert(createdAppt?.clinicId === CLINIC_A_ID, '2e. Oluşturulan randevunun clinicId değeri A (body enjeksiyonu engellendi)',
    `Gerçek clinicId: ${createdAppt?.clinicId}`);

  // Cleanup injection test appointment
  if (createdAppt?.id) {
    await prisma.appointment.delete({ where: { id: createdAppt.id } }).catch(() => {});
  }
  await prisma.patient.deleteMany({ where: { clinicId: CLINIC_A_ID, phoneNumber: '+905550029001' } }).catch(() => {});
}

// ── 3. IDOR Tests ─────────────────────────────────────────────────────────────
async function test3_IDOR() {
  section('3. IDOR — Çapraz kiracı erişim denemeleri');

  // GET B's appointment as A's user
  const rGet = await GET(`/api/appointments/${apptB_id}`, CLINIC_A_ID, 'secretary');
  assert(rGet.status === 404, `3a. Klinik A kullanıcısı Klinik B randevusunu GET → 404`, `Gerçek: ${rGet.status}`);

  // PATCH B's appointment as A's user
  const rPatch = await PATCH(`/api/appointments/${apptB_id}`, { status: 'COMPLETED' }, CLINIC_A_ID, 'secretary');
  assert(rPatch.status === 404, `3b. Klinik A kullanıcısı Klinik B randevusunu PATCH → 404`, `Gerçek: ${rPatch.status}`);

  // GET B's call-log as A's user (use nonexistent ID to simulate cross-clinic)
  const rCallLog = await GET(`/api/call-logs/TEST_HTTP_FAKE_B_LOG`, CLINIC_A_ID, 'secretary');
  assert(rCallLog.status === 404, '3c. Klinik A kullanıcısı Klinik B call-log GET → 404', `Gerçek: ${rCallLog.status}`);

  // POST with cross-clinic doctorId (B's doctor, A's credentials)
  const rCrossDoctor = await POST('/api/appointments', {
    patientName: 'IDOR Test Hastası',
    patientPhone: '05550029999',
    doctorId: DOCTOR_B_ID, // B's doctor — should be rejected
    startsAt: '2026-12-03T10:00:00+03:00',
  }, CLINIC_A_ID, 'secretary');
  assert(rCrossDoctor.status === 404, '3d. Klinik A kullanıcısı Klinik B doktoruyla POST → 404 (doctorId enjeksiyonu engellendi)',
    `Gerçek: ${rCrossDoctor.status} — ${JSON.stringify((rCrossDoctor.data as {error?:string})?.error)}`);

  // PATCH A's appointment to use B's doctor
  const rCrossDoctorPatch = await PATCH(`/api/appointments/${apptA_id}`, { doctorId: DOCTOR_B_ID }, CLINIC_A_ID, 'secretary');
  assert(rCrossDoctorPatch.status === 404, '3e. PATCH ile Klinik B doktoru atanamaz → 404',
    `Gerçek: ${rCrossDoctorPatch.status}`);
}

// ── 4. Conflict Detection ──────────────────────────────────────────────────────
async function test4_ConflictDetection() {
  section('4. ÇAKIŞMA KONTROLÜ — Aralık Bazlı (HTTP + Vapi)');

  // 4a. Geçersiz süre (20 dk veya 50 dk) gönderildiğinde 400 Bad Request
  const rInvalid = await POST('/api/appointments', {
    patientName: 'Geçersiz Süre Testi',
    patientPhone: '05550021001',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T14:00:00+03:00',
    durationMinutes: 20, // Geçersiz süre
  }, CLINIC_A_ID, 'secretary');
  assert(rInvalid.status === 400, '4a. Geçersiz süre (20 dk) reddedildi → 400', `Gerçek: ${rInvalid.status}`);

  // 4b. Ana randevu oluşturma: 14:00 - 14:45 (45 dk)
  const rBase = await POST('/api/appointments', {
    patientName: 'Aralık Testi Ana',
    patientPhone: '05550021001',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T14:00:00+03:00',
    durationMinutes: 45,
  }, CLINIC_A_ID, 'secretary');
  assert(rBase.status === 201, '4b. Ana randevu oluşturuldu: 14:00-14:45 (45 dk) → 201', `Gerçek: ${rBase.status}`);
  const baseId = (rBase.data as { appointment?: { id: string } })?.appointment?.id;

  // 4c. 14:00-14:45 varken 14:15 (30 dk) → reddedilmeli
  const rOverlap1 = await POST('/api/appointments', {
    patientName: 'Aralık Kesişen 14:15',
    patientPhone: '05550021002',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T14:15:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');
  assert(rOverlap1.status === 409, '4c. 14:00-14:45 varken 14:15 (30 dk) reddedildi → 409 SLOT_OCCUPIED', `Gerçek: ${rOverlap1.status}`);

  // 4d. 14:00-14:45 varken 14:45 (30 dk) → kabul edilmeli (bitişik)
  const rAdjacentAfter = await POST('/api/appointments', {
    patientName: 'Bitişik Sonrası 14:45',
    patientPhone: '05550021003',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T14:45:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');
  assert(rAdjacentAfter.status === 201, '4d. 14:00-14:45 varken 14:45 (30 dk) bitişik randevu kabul edildi → 201', `Gerçek: ${rAdjacentAfter.status}`);

  // 4e. 14:00-14:45 varken 13:45 (30 dk, 14:15'te biter) → reddedilmeli
  const rOverlapStart = await POST('/api/appointments', {
    patientName: 'Aralık Kesişen 13:45',
    patientPhone: '05550021004',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T13:45:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');
  assert(rOverlapStart.status === 409, '4e. 14:00-14:45 varken 13:45 (30 dk, 14:15 bitiş) reddedildi → 409', `Gerçek: ${rOverlapStart.status}`);

  // 4f. 14:00-14:45 varken 13:30 (30 dk, 14:00'te biter) → kabul edilmeli (bitişik)
  const rAdjacentBefore = await POST('/api/appointments', {
    patientName: 'Bitişik Öncesi 13:30',
    patientPhone: '05550021005',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T13:30:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');
  assert(rAdjacentBefore.status === 201, '4f. 14:00-14:45 varken 13:30 (30 dk) bitişik randevu kabul edildi → 201', `Gerçek: ${rAdjacentBefore.status}`);

  // 4g. Yeni randevu mevcut olanı tamamen kapsıyorsa (16:15 15 dk varken 16:00 45 dk kapsama)
  const rInside = await POST('/api/appointments', {
    patientName: 'İç Randevu 16:15',
    patientPhone: '05550021006',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T16:15:00+03:00',
    durationMinutes: 15,
  }, CLINIC_A_ID, 'secretary');
  assert(rInside.status === 201, '4g-1. 16:15-16:30 (15 dk) randevu oluşturuldu → 201', `Gerçek: ${rInside.status}`);
  const insideId = (rInside.data as { appointment?: { id: string } })?.appointment?.id;

  const rEnvelop = await POST('/api/appointments', {
    patientName: 'Kapsayan Randevu 16:00',
    patientPhone: '05550021007',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T16:00:00+03:00',
    durationMinutes: 45, // 16:00 - 16:45 covers 16:15 - 16:30
  }, CLINIC_A_ID, 'secretary');
  assert(rEnvelop.status === 409, '4g-2. Mevcut randevuyu tamamen kapsayan yeni randevu (16:00 45 dk) reddedildi → 409', `Gerçek: ${rEnvelop.status}`);

  // 4h. İptal edilmiş randevunun aralığı tekrar kullanılabilmeli
  if (insideId) {
    const rCancelInside = await PATCH(`/api/appointments/${insideId}`, { status: 'CANCELLED' }, CLINIC_A_ID, 'secretary');
    assert(rCancelInside.status === 200, '4h-1. 16:15 randevusu iptal edildi → 200', `Gerçek: ${rCancelInside.status}`);

    const rReuseAfterCancel = await POST('/api/appointments', {
      patientName: 'Kapsayan Randevu 16:00 Tekrar',
      patientPhone: '05550021007',
      doctorId: DOCTOR_A_ID,
      startsAt: '2026-12-05T16:00:00+03:00',
      durationMinutes: 45,
    }, CLINIC_A_ID, 'secretary');
    assert(rReuseAfterCancel.status === 201, '4h-2. İptal edilen aralık tekrar kullanılarak 16:00 (45 dk) oluşturuldu → 201', `Gerçek: ${rReuseAfterCancel.status}`);
  }

  // 4i. Yeniden planlamada kendi eski aralığıyla kesişme çakışma sayılmamalı & süre korunmalı
  const rSelfTest = await POST('/api/appointments', {
    patientName: 'Kendi Eski Aralığı Testi',
    patientPhone: '05550021013',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T11:00:00+03:00',
    durationMinutes: 45, // 11:00 - 11:45
  }, CLINIC_A_ID, 'secretary');
  assert(rSelfTest.status === 201, '4i-0. İzole 11:00 (45 dk) randevusu oluşturuldu → 201', `Gerçek: ${rSelfTest.status}`);
  const selfTestId = (rSelfTest.data as { appointment?: { id: string } })?.appointment?.id;

  if (selfTestId) {
    // Move from 11:00-11:45 to 11:15 without duration change.
    // [11:15, 12:00) overlaps its own former slot [11:00, 11:45). Must not conflict with itself!
    const rRescheduleSelf = await PATCH(`/api/appointments/${selfTestId}`, {
      startsAt: '2026-12-05T11:15:00+03:00',
    }, CLINIC_A_ID, 'secretary');
    assert(rRescheduleSelf.status === 200, '4i-1. Yeniden planlamada kendi eski aralığıyla kesişme çakışma sayılmadı → 200', `Gerçek: ${rRescheduleSelf.status}`);

    const updatedSelf = (rRescheduleSelf.data as { appointment?: { startsAt: string; endsAt: string } })?.appointment;
    const durMs = updatedSelf ? new Date(updatedSelf.endsAt).getTime() - new Date(updatedSelf.startsAt).getTime() : 0;
    assert(durMs === 45 * 60 * 1000, '4i-2. Yeniden planlamada süre belirtilmediğinde mevcut süre (45 dk) korundu', `Gerçek süre: ${durMs / 60000} dk`);
  }

  // 4j. Farklı doktor ve farklı klinik aynı saatte çakışmamalı
  const rDiffClinic = await POST('/api/appointments', {
    patientName: 'Farklı Klinik Randevusu',
    patientPhone: '05550021008',
    doctorId: DOCTOR_B_ID,
    startsAt: '2026-12-05T14:00:00+03:00',
    durationMinutes: 45,
  }, CLINIC_B_ID, 'secretary');
  assert(rDiffClinic.status === 201, '4j. Farklı klinik ve farklı doktor aynı saatte çakışmadı → 201', `Gerçek: ${rDiffClinic.status}`);

  // 4k. Gün sınırı (23:45 başlayıp gece yarısını 00:15'te geçen randevu)
  const rMidnight1 = await POST('/api/appointments', {
    patientName: 'Gece Yarısı Randevusu 1',
    patientPhone: '05550021009',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T23:45:00+03:00',
    durationMinutes: 30, // ends at 2026-12-06T00:15:00+03:00
  }, CLINIC_A_ID, 'secretary');
  assert(rMidnight1.status === 201, '4k-1. Gece yarısını geçen randevu (23:45-00:15) başarıyla oluşturuldu → 201', `Gerçek: ${rMidnight1.status}`);

  const rMidnightConflict = await POST('/api/appointments', {
    patientName: 'Gece Yarısı Çakışan 2',
    patientPhone: '05550021010',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-06T00:00:00+03:00',
    durationMinutes: 30, // 00:00 - 00:30 overlaps 23:45 - 00:15
  }, CLINIC_A_ID, 'secretary');
  assert(rMidnightConflict.status === 409, '4k-2. Gece yarısı sonrasına taşan aralık çakışması yakalandı → 409', `Gerçek: ${rMidnightConflict.status}`);

  // 4l. Vapi Sesli Asistan akışı (booking.ts) aralık çakışma testi
  const vapiConflict = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'Vapi Aralık Testi',
    patientPhone: '05550021011',
    date: '2026-12-05',
    time: '14:30', // overlaps 14:15-15:00
    durationMinutes: 30,
  });
  assert(vapiConflict.success === false && vapiConflict.message.includes('başka bir randevusu bulunmaktadır'),
    '4l-1. Vapi sesli asistan (booking.ts) aralık çakışmasında başarıyla engellendi (SLOT_OCCUPIED)');

  const vapiSuccess = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'Vapi Boş Slot Testi',
    patientPhone: '05550021012',
    date: '2026-12-05',
    time: '18:00',
    durationMinutes: 30,
  });
  assert(vapiSuccess.success === true, '4l-2. Vapi sesli asistan müsait slota randevu oluşturabildi → success: true');

  // 4m. Yarış durumu: Eşzamanlı POST isteği (Promise.all ile 2 istek aynı anda)
  // Aynı doktor ve saate aynı anda iki POST atıldığında: biri 201, diğeri 409 dönmeli
  const [rRacePost1, rRacePost2] = await Promise.all([
    POST('/api/appointments', {
      patientName: 'Yarış POST Hasta 1',
      patientPhone: '05550021021',
      doctorId: DOCTOR_A_ID,
      startsAt: '2026-12-05T19:00:00+03:00',
      durationMinutes: 30,
    }, CLINIC_A_ID, 'secretary'),
    POST('/api/appointments', {
      patientName: 'Yarış POST Hasta 2',
      patientPhone: '05550021022',
      doctorId: DOCTOR_A_ID,
      startsAt: '2026-12-05T19:00:00+03:00',
      durationMinutes: 30,
    }, CLINIC_A_ID, 'secretary'),
  ]);

  const postStatuses = [rRacePost1.status, rRacePost2.status].sort();
  assert(
    postStatuses[0] === 201 && postStatuses[1] === 409,
    '4m-1. Eşzamanlı POST (Promise.all): Biri 201, diğeri 409 SLOT_OCCUPIED döndü',
    `Dönen kodlar: ${rRacePost1.status}, ${rRacePost2.status}`
  );

  const postApptsCount = await prisma.appointment.count({
    where: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      startsAt: parseIstanbulDate('2026-12-05T19:00:00+03:00'),
    },
  });
  assert(
    postApptsCount === 1,
    '4m-2. Eşzamanlı POST sonucunda veritabanında tam olarak 1 randevu oluşturuldu (mükerrer kayıt önlendi)',
    `DB kayıt sayısı: ${postApptsCount}`
  );

  // 4n. Yarış durumu: Eşzamanlı PATCH (Yeniden planlama) isteği
  // İki farklı randevuyu (10:00 ve 12:00) aynı anda 20:00 boş slotuna taşımayı dene
  const rApptRace1 = await POST('/api/appointments', {
    patientName: 'Yarış PATCH Hasta 1',
    patientPhone: '05550021023',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T10:00:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');
  const rApptRace2 = await POST('/api/appointments', {
    patientName: 'Yarış PATCH Hasta 2',
    patientPhone: '05550021024',
    doctorId: DOCTOR_A_ID,
    startsAt: '2026-12-05T12:00:00+03:00',
    durationMinutes: 30,
  }, CLINIC_A_ID, 'secretary');

  const patchApptId1 = (rApptRace1.data as { appointment?: { id: string } })?.appointment?.id;
  const patchApptId2 = (rApptRace2.data as { appointment?: { id: string } })?.appointment?.id;

  if (patchApptId1 && patchApptId2) {
    const [rRacePatch1, rRacePatch2] = await Promise.all([
      PATCH(`/api/appointments/${patchApptId1}`, {
        startsAt: '2026-12-05T20:00:00+03:00',
      }, CLINIC_A_ID, 'secretary'),
      PATCH(`/api/appointments/${patchApptId2}`, {
        startsAt: '2026-12-05T20:00:00+03:00',
      }, CLINIC_A_ID, 'secretary'),
    ]);

    const patchStatuses = [rRacePatch1.status, rRacePatch2.status].sort();
    assert(
      patchStatuses[0] === 200 && patchStatuses[1] === 409,
      '4n-1. Eşzamanlı PATCH (Promise.all): Biri 200, diğeri 409 SLOT_OCCUPIED döndü',
      `Dönen kodlar: ${rRacePatch1.status}, ${rRacePatch2.status}`
    );

    const patchTargetCount = await prisma.appointment.count({
      where: {
        clinicId: CLINIC_A_ID,
        doctorId: DOCTOR_A_ID,
        startsAt: parseIstanbulDate('2026-12-05T20:00:00+03:00'),
      },
    });
    assert(
      patchTargetCount === 1,
      '4n-2. Eşzamanlı PATCH sonucunda hedef slotta (20:00) tam olarak 1 randevu yer aldı',
      `DB kayıt sayısı: ${patchTargetCount}`
    );
  }

  // 4o. check_availability ve book_appointment tutarlılık testleri
  await prisma.appointment.deleteMany({
    where: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      startsAt: {
        gte: parseIstanbulDate('2026-12-07T00:00:00+03:00'),
        lte: parseIstanbulDate('2026-12-07T23:59:59+03:00'),
      },
    },
  });

  // 1. 45 dk'lık randevu (10:00 - 10:45) aralık kontrolü
  const appt45 = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'Tutarlılık Hasta 45dk',
    patientPhone: '05550021031',
    date: '2026-12-07',
    time: '10:00',
    durationMinutes: 45,
  });
  assert(appt45.success === true, '4o-1. 45 dk süreli başlangıç randevusu oluşturuldu (10:00 - 10:45)');

  const availAfter45 = await checkAvailability({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    date: '2026-12-07',
  });
  assert(
    !availAfter45.availableSlots.includes('10:00') && !availAfter45.availableSlots.includes('10:30'),
    '4o-2. check_availability: 45 dk randevu nedeniyle hem 10:00 hem 10:30 slotlarını dolu saydı',
    `Müsait slotlar: ${availAfter45.availableSlots.join(', ')}`
  );

  const suggestedSlot = availAfter45.availableSlots[0];
  const bookSuggested = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'Önerilen Slot Hastası',
    patientPhone: '05550021032',
    date: '2026-12-07',
    time: suggestedSlot,
    durationMinutes: 30,
  });
  assert(
    bookSuggested.success === true,
    `4o-3. check_availability'nin önerdiği müsait slot (${suggestedSlot}) book_appointment tarafından reddedilmedi`
  );

  // 2. COMPLETED randevu slotunun dolu sayılması testi
  const patientA = await prisma.patient.findFirst({ where: { clinicId: CLINIC_A_ID } });
  await prisma.appointment.create({
    data: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      patientId: patientA!.id,
      startsAt: parseIstanbulDate('2026-12-07T13:00:00+03:00'),
      endsAt: parseIstanbulDate('2026-12-07T13:30:00+03:00'),
      status: 'COMPLETED',
    },
  });

  const availAfterCompleted = await checkAvailability({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    date: '2026-12-07',
  });
  assert(
    !availAfterCompleted.availableSlots.includes('13:00'),
    '4o-4. check_availability: COMPLETED durumundaki randevu slotunu dolu gördü (status not CANCELLED)'
  );

  // 3. CANCELLED randevu slotunun boş sayılması ve tekrar rezerve edilebilmesi
  await prisma.appointment.create({
    data: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      patientId: patientA!.id,
      startsAt: parseIstanbulDate('2026-12-07T14:00:00+03:00'),
      endsAt: parseIstanbulDate('2026-12-07T14:30:00+03:00'),
      status: 'CANCELLED',
    },
  });

  const availAfterCancelled = await checkAvailability({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    date: '2026-12-07',
  });
  assert(
    availAfterCancelled.availableSlots.includes('14:00'),
    '4o-5. check_availability: CANCELLED durumundaki randevu slotunu boş saydı ve önerdi'
  );

  const bookCancelledSlot = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'İptal Slotu Hastası',
    patientPhone: '05550021033',
    date: '2026-12-07',
    time: '14:00',
    durationMinutes: 30,
  });
  assert(
    bookCancelledSlot.success === true,
    '4o-6. book_appointment: İptal edilmiş slot için randevuyu başarıyla oluşturdu'
  );

  // 4. book_appointment çakışma durumunda alternatif slot önerisi testi
  const conflictWithAlternates = await bookAppointment({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    patientName: 'Çakışma Alternatif Hastası',
    patientPhone: '05550021034',
    date: '2026-12-07',
    time: '10:00',
    durationMinutes: 30,
  });
  assert(
    conflictWithAlternates.success === false &&
      conflictWithAlternates.message.includes('Müsait alternatif saatler:'),
    '4o-7. book_appointment çakışmada hastaya alternatif saat önerisi sundu'
  );

  // 5. NO_SHOW randevu slotunun dolu sayılması testi
  await prisma.appointment.create({
    data: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      patientId: patientA!.id,
      startsAt: parseIstanbulDate('2026-12-07T15:00:00+03:00'),
      endsAt: parseIstanbulDate('2026-12-07T15:30:00+03:00'),
      status: 'NO_SHOW',
    },
  });

  const availAfterNoShow = await checkAvailability({
    clinicId: CLINIC_A_ID,
    doctorId: DOCTOR_A_ID,
    date: '2026-12-07',
  });
  assert(
    !availAfterNoShow.availableSlots.includes('15:00'),
    '4o-8. check_availability: NO_SHOW durumundaki randevu slotunu dolu gördü (status not CANCELLED)'
  );

  // 6. Numarasız ve metadata'sız çağrıda güvenlik fallback logu kontrolü
  const secretKey = process.env.VAPI_SERVER_SECRET || 'dev-secret-change-me';
  const rVapiNoPhone = await fetch(`${BASE}/api/vapi/server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({
      message: {
        type: 'assistant-request',
      },
    }),
  });
  assert(rVapiNoPhone.status === 200, '4o-9. Numarasız/metadata\'sız Vapi isteği 200 döndü (fallback)');

  await wait(300);
  const hasFallbackWarn = serverLogs.some((l) =>
    l.includes('[vapi] Inbound request missing phoneNumber and clinicId metadata — falling back to default clinic'),
  );
  assert(
    hasFallbackWarn,
    '4o-10. Numarasız çağrıda beklenen güvenlik fallback logu yazıldı (klinik adı ifşa edilmeden)'
  );

  // Clean up 2026-12-07 appointments
  await prisma.appointment.deleteMany({
    where: {
      clinicId: CLINIC_A_ID,
      doctorId: DOCTOR_A_ID,
      startsAt: {
        gte: parseIstanbulDate('2026-12-07T00:00:00+03:00'),
        lte: parseIstanbulDate('2026-12-07T23:59:59+03:00'),
      },
    },
  });

  // Cleanup test appointments and patients
  await prisma.appointment.deleteMany({
    where: {
      clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] },
      doctorId: { in: [DOCTOR_A_ID, DOCTOR_B_ID] },
      startsAt: {
        gte: parseIstanbulDate('2026-12-05T00:00:00+03:00'),
        lte: parseIstanbulDate('2026-12-06T23:59:59+03:00'),
      },
    },
  }).catch(() => {});
  await prisma.patient.deleteMany({
    where: {
      clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] },
      phoneNumber: { startsWith: '+9055500210' },
    },
  }).catch(() => {});
}

// ── 5. User Scenarios ─────────────────────────────────────────────────────────
async function test5_UserScenarios() {
  section('5. KULLANICI SENARYOLARI');

  // No clinicId in metadata → 401 (X-Test-Clinic-Id missing)
  const rNoClinic = await GET('/api/appointments');
  assert(rNoClinic.status === 401, '5a. clinicId olmayan kullanıcı hiçbir veriye erişemez → 401', `Gerçek: ${rNoClinic.status}`);

  // Secretary cannot access admin routes
  const rSecAdmin = await GET('/api/admin/clinics', CLINIC_A_ID, 'secretary');
  assert(rSecAdmin.status === 403, '5b. Sekreter /api/admin → 403', `Gerçek: ${rSecAdmin.status}`);

  const rSecAdmin2 = await GET('/api/admin/analytics/clinics-overview', CLINIC_A_ID, 'secretary');
  assert(rSecAdmin2.status === 403, '5c. Sekreter /api/admin/analytics → 403', `Gerçek: ${rSecAdmin2.status}`);

  // Secretary CAN access regular routes
  const rSec = await GET('/api/appointments', CLINIC_A_ID, 'secretary');
  assert(rSec.status === 200, '5d. Sekreter /api/appointments → 200', `Gerçek: ${rSec.status}`);

  // Admin CAN access admin routes
  const rAdm = await GET('/api/admin/clinics', CLINIC_A_ID, 'admin');
  assert(rAdm.status === 200, '5e. Admin /api/admin/clinics → 200', `Gerçek: ${rAdm.status}`);

  // 5f. Doctor rolü yetki ve davranış testleri (çalıştırıldı)
  // Backend'de bağımsız bir 'doctor' rol kısıtı bulunmamaktadır; admin olmayan tüm roller (doctor dahil) 'secretary' seviyesinde çözülür.
  const rDocAdmin = await GET('/api/admin/clinics', CLINIC_A_ID, 'doctor');
  assert(rDocAdmin.status === 403, '5f-1. Doctor rolü /api/admin/clinics uç noktasına 403 Forbidden alır (admin değildir)', `Gerçek: ${rDocAdmin.status}`);

  const rDocAppointments = await GET('/api/appointments', CLINIC_A_ID, 'doctor');
  assert(rDocAppointments.status === 200, '5f-2. Doctor rolü kendi kliniğinin randevularına erişebilir → 200', `Gerçek: ${rDocAppointments.status}`);

  // Test: Doctor rolündeki bir kullanıcı randevu iptal edebilir mi?
  // apptA_id randevusunu role: 'doctor' ile iptal etmeyi dene
  const rDocCancel = await PATCH(`/api/appointments/${apptA_id}`, {
    status: 'CANCELLED',
  }, CLINIC_A_ID, 'doctor');
  assert(
    rDocCancel.status === 200,
    '5f-3. Doctor rolü randevuyu iptal edebilir → 200 (Mevcut davranış: doctor rolü sekreter yetkilerine sahiptir)',
    `Gerçek: ${rDocCancel.status}`
  );
}

// ── 6. Production Startup Guard ───────────────────────────────────────────────
async function test6_ProductionGuard() {
  section('6. PRODUCTION BAŞLANGIC KORUYUCUSU');

  const tsxCmd = 'npx'; const spawnOpts = { shell: true };

  // 6a: Production + bad CLERK_SECRET_KEY → exit 1
  const exitCode_a = await new Promise<number | null>((resolve) => {
    const p = spawn(tsxCmd, ['tsx', 'src/index.ts'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, NODE_ENV: 'production', PORT: '3097' },
      shell: true,
      stdio: 'pipe',
    });
    const timeout = setTimeout(() => { p.kill(); resolve(-999); }, 10_000);
    p.on('exit', (code) => { clearTimeout(timeout); resolve(code); });
  });
  assert(exitCode_a === 1, '6a. NODE_ENV=production + CLERK_SECRET_KEY=placeholder → exit 1',
    `Gerçek exit kodu: ${exitCode_a}`);

  // 6b: Production + ALLOW_DEV_CLINIC_FALLBACK=true → exit 1
  const exitCode_b = await new Promise<number | null>((resolve) => {
    const p = spawn(tsxCmd, ['tsx', 'src/index.ts'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_' + 'live_FAKEKEYFORTEST12345678901234567890', ALLOW_DEV_CLINIC_FALLBACK: 'true', PORT: '3096' },
      shell: true,
      stdio: 'pipe',
    });
    const timeout = setTimeout(() => { p.kill(); resolve(-999); }, 10_000);
    p.on('exit', (code) => { clearTimeout(timeout); resolve(code); });
  });
  assert(exitCode_b === 1, '6b. NODE_ENV=production + ALLOW_DEV_CLINIC_FALLBACK=true → exit 1',
    `Gerçek exit kodu: ${exitCode_b}`);

  // 6c: Production + TEST_AUTH_OVERRIDE=true → exit 1
  const exitCode_c = await new Promise<number | null>((resolve) => {
    const p = spawn(tsxCmd, ['tsx', 'src/index.ts'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_' + 'live_FAKEKEYFORTEST12345678901234567890', TEST_AUTH_OVERRIDE: 'true', PORT: '3095' },
      shell: true,
      stdio: 'pipe',
    });
    const timeout = setTimeout(() => { p.kill(); resolve(-999); }, 10_000);
    p.on('exit', (code) => { clearTimeout(timeout); resolve(code); });
  });
  assert(exitCode_c === 1, '6c. NODE_ENV=production + TEST_AUTH_OVERRIDE=true → exit 1',
    `Gerçek exit kodu: ${exitCode_c}`);
}

// ── 7. clinicId DB Consistency ────────────────────────────────────────────────
async function test7_ClinicIdConsistency() {
  section('7. clinicId VERİTABANI TUTARLIĞI');

  const realClinic = await prisma.clinic.findFirst({
    where: { id: { not: { startsWith: 'TEST_' } } },
    orderBy: { createdAt: 'asc' },
  });

  assert(realClinic !== null, '7a. Gerçek (test olmayan) bir klinik kayıtlı');

  if (realClinic) {
    assert(typeof realClinic.id === 'string' && realClinic.id.length > 0, '7b. Gerçek kliniğin ID formatı geçerli');
    assert(realClinic.timezone === 'Europe/Istanbul', '7c. Gerçek kliniğin timezone = Europe/Istanbul',
      `Gerçek: ${realClinic.timezone}`);
    // Log ID (not a secret)
    console.log(`  ℹ️  Gerçek klinik: "${realClinic.name}" — ID: ${realClinic.id}`);
    console.log(`     Clerk metadata'daki clinicId bu değerle eşleşmeli.`);
    console.log(`     ⚠️  Clerk metadata doğrulaması manuel olarak yapılmalı (Clerk Dashboard → Users → publicMetadata.clinicId).`);
  }

  // Check test clinics were properly scoped
  const testA = await prisma.clinic.findUnique({ where: { id: CLINIC_A_ID } });
  const testB = await prisma.clinic.findUnique({ where: { id: CLINIC_B_ID } });
  assert(testA !== null && testB !== null, '7d. Test klinikleri veritabanında mevcut');
}

// ── 8. Final State Transitions ────────────────────────────────────────────────
async function test8_FinalStateGuard() {
  section('8. SON DURUM GEÇİŞ KURALI (CANCELLED / COMPLETED terminal)');

  // Create a fresh appointment for this section
  const pTemp = await prisma.patient.upsert({
    where: { clinicId_phoneNumber: { clinicId: CLINIC_A_ID, phoneNumber: '+905550022001' } }, update: {},
    create: { clinicId: CLINIC_A_ID, fullName: 'TEST_HTTP Son Durum', phoneNumber: '+905550022001' } });

  const tempStart = parseIstanbulDate('2026-12-10T09:00:00+03:00');
  const tempAppt = await prisma.appointment.create({ data: {
    clinicId: CLINIC_A_ID, doctorId: DOCTOR_A_ID, patientId: pTemp.id,
    startsAt: tempStart, endsAt: new Date(tempStart.getTime() + 30*60*1000), status: AppointmentStatus.SCHEDULED } });

  // 8a. SCHEDULED → CANCELLED via HTTP (secretary can do this)
  const rCancel = await PATCH(`/api/appointments/${tempAppt.id}`, { status: 'CANCELLED' }, CLINIC_A_ID, 'secretary');
  assert(rCancel.status === 200, '8a. Sekreter SCHEDULED → CANCELLED → 200', `Gerçek: ${rCancel.status}`);

  // 8b. CANCELLED → SCHEDULED as secretary → 409
  const rRevert = await PATCH(`/api/appointments/${tempAppt.id}`, { status: 'SCHEDULED' }, CLINIC_A_ID, 'secretary');
  assert(rRevert.status === 409, '8b. Sekreter CANCELLED → SCHEDULED → 409 (terminal durum)', `Gerçek: ${rRevert.status}`);
  assert((rRevert.data as {error?: string})?.error?.includes('son bir durumdur') ?? false,
    '8c. 409 yanıtında "son bir durumdur" mesajı var');

  // 8d. Admin CAN revert from CANCELLED
  const rAdminRevert = await PATCH(`/api/appointments/${tempAppt.id}`, { status: 'SCHEDULED' }, CLINIC_A_ID, 'admin');
  assert(rAdminRevert.status === 200, '8d. Admin CANCELLED → SCHEDULED → 200 (admin geri alabilir)', `Gerçek: ${rAdminRevert.status}`);

  // 8e. SCHEDULED → COMPLETED via secretary
  const rComplete = await PATCH(`/api/appointments/${tempAppt.id}`, { status: 'COMPLETED' }, CLINIC_A_ID, 'secretary');
  assert(rComplete.status === 200, '8e. Sekreter SCHEDULED → COMPLETED → 200', `Gerçek: ${rComplete.status}`);

  // 8f. COMPLETED → CANCELLED as secretary → 409
  const rFromCompleted = await PATCH(`/api/appointments/${tempAppt.id}`, { status: 'CANCELLED' }, CLINIC_A_ID, 'secretary');
  assert(rFromCompleted.status === 409, '8f. Sekreter COMPLETED → CANCELLED → 409 (terminal durum)', `Gerçek: ${rFromCompleted.status}`);

  // Cleanup
  await prisma.appointment.delete({ where: { id: tempAppt.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { clinicId: CLINIC_A_ID, phoneNumber: '+905550022001' } }).catch(() => {});
}

// ── DB Cleanup ────────────────────────────────────────────────────────────────
async function dbCleanup() {
  section('TEMİZLİK — HTTP test kayıtları siliniyor');
  const d1 = await prisma.appointment.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  const d2 = await prisma.patient.deleteMany({ where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  const d3 = await prisma.doctor.deleteMany({ where: { id: { in: [DOCTOR_A_ID, DOCTOR_B_ID] } } });
  const d4 = await prisma.clinic.deleteMany({ where: { id: { in: [CLINIC_A_ID, CLINIC_B_ID] } } });
  console.log(`  🗑  Randevu: ${d1.count}  Hasta: ${d2.count}  Doktor: ${d3.count}  Klinik: ${d4.count}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RECALL V2 — HTTP Güvenlik Entegrasyon Test Süiti           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    await dbSetup();

    // Test 6 doesn't need the test server (it spawns its own processes)
    await test6_ProductionGuard();

    // Start test server for HTTP tests
    const started = await startServer();
    if (!started) {
      console.error('\n  ❌ Test sunucusu başlatılamadı. HTTP testleri atlandı.\n');
      ['1','2','3','4','5','7','8'].forEach(n => fail(`Bölüm ${n}`, 'Test sunucusu başlatılamadı'));
    } else {
      console.log(`  ✔ Test sunucusu hazır: ${BASE}`);
      await wait(500); // brief settle time

      await test1_AuthGuards();
      await test2_ClinicIdInjection();
      await test3_IDOR();
      await test4_ConflictDetection();
      await test5_UserScenarios();
      await test7_ClinicIdConsistency();
      await test8_FinalStateGuard();
    }
  } finally {
    stopServer();
    await dbCleanup();
    await prisma.$disconnect();
  }

  console.log(`\n${'═'.repeat(62)}\n  SONUÇ\n${'═'.repeat(62)}`);
  console.log(`  ✅ Geçen     : ${passed}`);
  console.log(`  ❌ Başarısız : ${failed}`);
  console.log(`  ⏭  Atlanan   : ${skipped}`);
  if (failures.length) { console.log('\n  Başarısız testler:'); failures.forEach(f => console.log(`    • ${f}`)); }
  if (failed > 0) process.exit(1);
  else {
    console.log('\n  🎉 Tüm HTTP güvenlik testleri başarıyla geçti!\n');
    process.exit(0);
  }
}

main().catch(err => { stopServer(); prisma.$disconnect(); console.error('Süit çöktü:', err); process.exit(1); });
