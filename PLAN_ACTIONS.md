# PLAN_ACTIONS.md

> **Son güncelleme:** 2026-09-27 (Faz 1 — Uçtan Uca Randevu Akışı ve Sekreter Dashboard'u tamamlandı)
> **Bu dosya AKTİF OLARAK GÜNCELLENİR.** Her session başında buradan devam et, her session sonunda güncelle. Fazların genel açıklaması için `PLAN.md`'ye bakınız.

## Tamamlanan Faz: Faz 0 — Altyapı Kurulumu (bkz. `PLAN.md#faz-0`)

- [x] 7 dokümantasyon dosyasının (CLAUDE, ARCHITECTURE, PLAN, PLAN_ACTIONS, PROGRESS, DECISIONS, CONVENTIONS) oluşturulması
- [x] Sesli ajan platformu kararı: Retell → **Vapi** (bkz. `DECISIONS.md#adr-005`)
- [x] Tech stack seçimlerinin (Postgres/Prisma, Clerk) kullanıcı tarafından onaylanması (bkz. `DECISIONS.md` ADR-003/004)
- [x] Vapi webhook/tool-call ayrımının netleştirilmesi: **tek Server URL**, `message.type`'a göre dispatch (bkz. `DECISIONS.md#adr-006`, `ARCHITECTURE.md` § 3)
- [x] Framework kararının düzeltilmesi: Next.js yerine **Vite frontend + Express backend (monorepo)** (bkz. `DECISIONS.md#adr-007`)
- [x] `pnpm-workspace.yaml` ve kök `package.json` kurulumu (workspaces: `apps/*`)
- [x] `apps/frontend` Vite + React + TS + Tailwind v4 + Framer Motion ile iskeletin oluşturulması ve Design System'in uygulanması
- [x] `apps/backend` iskeletinin oluşturulması: Node + TypeScript + Express
- [x] İki ayrı Vercel projesinin oluşturulması ve GitHub repo'suna bağlanması (`apps/frontend` ve `apps/backend`)
- [x] Express'in Vercel serverless fonksiyon modeline uyarlanması (`@vercel/node` catch-all handler — bkz. `DECISIONS.md#adr-008`)
- [x] ESLint + Prettier konfigürasyonunun her iki pakette de kurulması (bkz. `CONVENTIONS.md`)
- [x] Neon veritabanı değişkenlerinin (`DATABASEV2_DATABASE_URL` ve `DATABASEV2_DATABASE_URL_UNPOOLED`) tanımlanması (bkz. `DECISIONS.md#adr-009`)
- [x] Prisma kurulumu ve şemanın (`Clinic`, `Doctor`, `Patient`, `Appointment`, `CallLog` modelleri) yazılması
- [x] İlk veritabanı migration'ının çalıştırılması (`prisma/migrations/20260927113431_init`)
- [x] Vapi assistant'ının Server URL ve `VAPI_SERVER_SECRET` doğrulamasıyla bağlanması

---

## Tamamlanan Faz: Faz 1 — Uçtan Uca Randevu Akışı + Sekreter Dashboard'u (bkz. `PLAN.md#faz-1`)

- [x] Veritabanı seed script'inin hazırlanması ve çalıştırılması (`pnpm --filter backend db:seed`) — test kliniği, 3 uzman hekim, örnek hastalar ve randevular
- [x] Randevu mantığı (`apps/backend/src/lib/scheduling/`):
  - [x] `availability.ts`: doktor mesai saatleri ve mevcut randevulara göre boş slot hesaplama
  - [x] `booking.ts`: işlem içi (transaction) çakışma kontrolü ile güvenli randevu kaydı ve hasta eşleştirme
  - [x] `lookup.ts`: telefon/isim ile randevu sorgulama
  - [x] `cancellation.ts`: randevu iptali ve yeniden planlama (reschedule)
- [x] Vapi Tool Handlers (`apps/backend/src/lib/vapi/tools/`):
  - [x] `check-availability.ts`: Zod validasyonlu müsaitlik sorgusu
  - [x] `book-appointment.ts`: Zod validasyonlu randevu oluşturma
  - [x] `lookup-appointment.ts`: Zod validasyonlu randevu bulma
  - [x] `cancel-appointment.ts`: Zod validasyonlu randevu iptali
  - [x] `reschedule-appointment.ts`: Zod validasyonlu saat değişikliği
  - [x] `transfer-call.ts`: sekretere yönlendirme stub'ı
- [x] Vapi Server URL Dispatcher genişletilmesi (`server-handler.ts`):
  - [x] Tool çağrılarının (`check_availability`, `book_appointment` vb.) senkron JSON ile yanıtlanması
  - [x] `end-of-call-report` webhook'u ile `CallLog` kaydının oluşturulması, operasyonel kategori etiketi ve oluşturulan randevu ile bağlantı kurulması
- [x] Dashboard REST API (`apps/backend/src/routes/`):
  - [x] `GET /api/appointments`, `GET /api/appointments/:id`, `POST /api/appointments`, `PATCH /api/appointments/:id`
  - [x] `GET /api/call-logs`, `GET /api/call-logs/:id`
  - [x] `GET /api/doctors`
  - [x] `GET /api/stats/dashboard`
  - [x] Clerk JWT kimlik doğrulama middleware'i (`requireAuth`)
- [x] Frontend Sekreter Dashboard'u (`apps/frontend/src/pages/dashboard/`):
  - [x] `SecretaryLayout.tsx`: sol sabit sidebar, navigasyon, klinik bilgisi, çıkış yap aksiyonu
  - [x] `DashboardPage.tsx`: 4 özet istatistik kartı, gelişmiş tarih/doktor/durum filtreleri, randevu tablosu, manuel randevu ekleme modalı
  - [x] `CallsPage.tsx`: sesli çağrı geçmişi, kategori rozetleri, konuşma transkripti inceleme modalı
  - [x] `DoctorsPage.tsx`: doktor kartları, uzmanlık branşları, mesai saatleri ve bugünkü randevu sayıları
- [x] Uçtan Uca Simülasyon Testi:
  - [x] Vapi tool çağrısı (`check_availability` -> `book_appointment` -> `end-of-call-report`) simülasyonu
  - [x] Neon veritabanında atomik randevu ve arama kaydı teyidi
  - [x] Sekreter dashboard arayüzünde "Vapi AI" kanallı yeni randevunun görsel teyidi
- [x] Kararların belgelenmesi (`DECISIONS.md#adr-010`)

---

## Aktif Faz: Faz 2 — Gerçek Telefon Hattı & Vapi Talk Entegrasyonu

- [x] Vapi asistanı sistem prompt'unun klinik kurallarına (hekim isimleri, branşlar, iptal kuralları, acil durum 112 yönlendirmesi) göre optimize edilmesi (`apps/backend/src/lib/vapi/system-prompt.ts`)
- [ ] **🔵 ŞU AN ÜZERİNDE ÇALIŞILIYOR:** Vapi Talk üzerinden canlı sesli telefon görüşmesi ile randevu alma senaryosunun denenmesi
- [ ] Sekreter panelinde randevu detay düzenleme modalının genişletilmesi
- [ ] Vercel production ortamında canlı API ve frontend uçtan uca testinin doğrulanması

---

### Kullanım Notu
- Görevler tamamlandıkça `- [ ]` → `- [x]` olarak işaretlenir.
- "🔵 ŞU AN ÜZERİNDE ÇALIŞILIYOR" etiketi sıradaki görevi gösterir.
