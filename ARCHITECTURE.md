# ARCHITECTURE.md

> **Son güncelleme:** 2026-09-27 (Vite frontend + Express backend monorepo mimarisine geçiş — bkz. ADR-007)
> **Bu dosya:** Sistemin nasıl çalıştığını açıklayan, sık değişmeyen referans dosyasıdır. Genel proje bilgisi için `CLAUDE.md`, kararların gerekçeleri için `DECISIONS.md`'ye bakınız. Görsel/stil kuralları için `Recall — Design System.md`'ye bakınız.

## 1. Yüksek Seviye Mimari

```
                         ┌─────────────────────┐
                         │       Hasta          │
                         │   (telefon araması)  │
                         └──────────┬───────────┘
                                    │ PSTN / telefon hattı
                                    ▼
                         ┌─────────────────────┐
                         │        Vapi           │
                         │  (STT + LLM + TTS +   │
                         │   telefoni orkestr.)  │
                         └──────────┬───────────┘
                    tool-call        │   ▲  server message (status-update /
                    (JSON, senkron)  │   │   end-of-call-report vb.)
                                     ▼   │
                         ┌─────────────────────────┐
                         │  apps/backend (Express)   │
                         │  Vercel'de ayrı proje      │
                         │  /api/vapi/server          │◄──────┐
                         │  (tek Server URL;          │       │
                         │   message.type'a göre      │       │
                         │   dispatch)                │       │
                         └──────────┬─────────────────┘       │
                                    │ Prisma ORM               │
                                    ▼                          │
                         ┌─────────────────────┐               │
                         │  PostgreSQL (Neon /   │              │
                         │  Vercel Postgres)     │              │
                         │  - clinics            │              │
                         │  - doctors            │              │
                         │  - patients           │              │
                         │  - appointments       │              │
                         │  - call_logs          │              │
                         └──────────┬───────────┘               │
                                    │ REST API (fetch)           │
                                    ▼                            │
                         ┌─────────────────────┐                │
                         │ apps/frontend (Vite)  │────────────────┘
                         │ Vercel'de ayrı proje  │  (auth: Clerk,
                         │ Sekreter Paneli       │   React SDK)
                         │ - randevuları görür   │
                         │ - transkriptleri okur │
                         │ - manuel düzenleme    │
                         │ (+ Landing sayfası)   │
                         └─────────────────────┘
```

> **Not:** Frontend (`apps/frontend`) ve backend (`apps/backend`) aynı monorepo içinde ama **iki ayrı Vercel projesi** olarak deploy edilir; frontend, backend'e CORS üzerinden REST API çağrıları yapar. Detay: `DECISIONS.md#adr-007`.

## 2. Katmanlar ve Sorumlulukları

| Katman | Sorumluluk |
|---|---|
| **Vapi** | Telefon hattını karşılamak (assistant), konuşmayı doğal dilde yürütmek, gerekli anlarda tanımlı bir **tool** (function) çağırarak backend'e istek atmak (müsaitlik sorgusu, randevu oluşturma vb.), görüşme sonunda transcript/recording ve `end-of-call-report` üretmek. Tüm bu mesajları **tek bir Server URL**'e (`apps/backend`'in `/api/vapi/server` route'u) POST eder; hangi mesaj olduğu gövdedeki `message.type` alanından anlaşılır. |
| **apps/backend (Express, Vercel'de ayrı proje)** | `/api/vapi/server` altında tek bir route: gelen isteği `message.type`'a göre dispatch eder. `tool-calls` tipi için `src/lib/vapi/tools/*` altındaki ilgili fonksiyonu (`src/lib/scheduling` üzerinden) çalıştırıp senkron JSON (`results: [{ toolCallId, result }]`) döner. `status-update`, `end-of-call-report` gibi bildirim tipli mesajları DB'ye kaydedip `200` döner. Ayrıca sekreter paneli için REST API (randevu/arama listeleme, manuel düzenleme) sunar; Clerk backend SDK ile gelen isteklerin JWT'sini doğrular. |
| **PostgreSQL (Prisma)** | Klinik, doktor, hasta, randevu ve arama kayıtlarının kalıcı deposu. Tek doğruluk kaynağı (source of truth). Şema `apps/backend/prisma/schema.prisma` altında. |
| **apps/frontend (Vite + React, Vercel'de ayrı proje)** | İki yüzey barındırır: **Landing sayfası** (pazarlama) ve **Sekreter paneli** (klinik personelinin randevuları, arama geçmişini ve transkriptleri görüntülediği, gerektiğinde manuel düzenleme yaptığı dashboard). Clerk React SDK ile kimlik doğrulama; backend'e REST API üzerinden bağlanır. Görsel tasarım kuralları için bkz. `Recall — Design System.md`. |
| **Bildirim katmanı (Faz 3+)** | Randevu onayı/hatırlatması için SMS (Twilio) ve email (Resend) gönderimi. `apps/backend/src/lib/notifications` altında. Şu an aktif değil. |

## 3. Veri Akışı (Randevu Alma Senaryosu)

> **Önemli:** Vapi'de webhook (bildirim) ve tool-call (senkron fonksiyon çağrısı) ayrı endpoint'ler değildir — ikisi de aynı **Server URL**'e (`apps/backend`'in `/api/vapi/server` route'u) gelir, gövdedeki `message.type` alanına göre ayrışır. Dört mesaj tipi (`assistant-request`, `tool-calls`, `transfer-destination-request`, `knowledge-base-request`) senkron JSON yanıt gerektirir; geri kalanı (`status-update`, `end-of-call-report` vb.) fire-and-forget bildirimdir, `200` dönmek yeterlidir. Server URL; tool → assistant → phone number → org sırasıyla override edilebilir (bkz. `DECISIONS.md#adr-006`) — RECALL MVP'sinde tek bir assistant-level Server URL kullanılıyor.

1. Hasta klinik numarasını arar → Vapi inbound assistant görüşmeyi karşılar.
2. Assistant, konuşma akışı içinde uygun anda `check_availability` tool'unu çağırır → Vapi, `apps/backend`'in `POST /api/vapi/server` route'una istek gönderir; gövdede `message.type === "tool-calls"` ve `toolCallId` bulunur.
3. Route, `message.type`'a bakıp isteği `src/lib/vapi/tools/check-availability.ts`'e dispatch eder; bu fonksiyon `src/lib/scheduling` üzerinden Prisma ile ilgili doktorun/kliniğin müsaitlik durumunu hesaplar. Route, Vapi'nin beklediği `{ "results": [{ "toolCallId": "...", "result": "..." }] }` formatında senkron yanıt döner.
4. Vapi bu bilgiyi hastaya sesli olarak sunar, hasta bir saat seçer.
5. Assistant `book_appointment` tool'unu çağırır → aynı route, `message.type === "tool-calls"` içindeki `toolCalls[].function.name` alanına bakıp `src/lib/vapi/tools/book-appointment.ts`'e yönlendirir; çakışma kontrolü yapılıp `appointments` tablosuna kayıt açılır, sonuç Vapi'ye döner ("randevunuz oluşturuldu" onayı için).
6. Görüşme bittiğinde Vapi, `message.type === "end-of-call-report"` olan bir bildirimi yine aynı route'a gönderir; route bunu `tool-calls`'tan ayırt edip (senkron yanıt beklemeden) transcript, kayıt (recording) URL'si ve özeti `call_logs` tablosuna yazar, `200` döner.
7. Klinik personeli, `apps/frontend`'deki sekreter panelinden (backend'in REST API'sini çağırarak) yeni randevuyu ve ilgili görüşme kaydını görür.

**Kimlik doğrulama (Vapi → backend):** Vapi, Server URL'e gelen her isteğe `VAPI_SERVER_SECRET` değerini opsiyonel olarak `Authorization: Bearer <secret>` (veya legacy `X-Vapi-Secret`) header'ı ile ekleyebilir; route bu header'ı doğrulamadan hiçbir isteği işlemez (bkz. `CONVENTIONS.md` yasaklı pattern'ler).

**Kimlik doğrulama (frontend → backend):** Sekreter paneli istekleri Clerk React SDK'nın ürettiği JWT'yi `Authorization: Bearer <token>` olarak backend'e taşır; backend Clerk backend SDK ile doğrular.

**State yönetimi:** Görüşme sırasında geçici state Vapi tarafında (assistant'ın konuşma belleği / call state) tutulur; kalıcı state her zaman Postgres'tedir. Backend route'ları stateless'tır — her istek kendi başına DB'den okuyup yazar.

## 4. Dış Servisler / Entegrasyonlar

| Servis | Amaç | Bağlantı yönü |
|---|---|---|
| **Vapi** | Sesli ajan, telefoni | Vapi → `apps/backend` (tool-call, server message); `apps/backend` → Vapi (assistant config API, gerekirse outbound call tetikleme) |
| **GitHub** | Kaynak kod, versiyon kontrolü | Vercel, `apps/frontend` ve `apps/backend` projelerinin ikisi için de bu repo'yu izler |
| **Vercel** | Hosting — **iki ayrı proje**: `apps/frontend` (statik Vite build) ve `apps/backend` (Node/Express, serverless'e uyarlanmış) | `main` push → her iki proje de production deploy |
| **Vercel Postgres / Neon** | Veritabanı | `apps/backend`'den Prisma üzerinden |
| **Clerk** | Kimlik doğrulama | `apps/frontend`: React SDK (SPA). `apps/backend`: backend SDK ile JWT doğrulama |
| **Twilio (Faz 3+, opsiyonel telefon numarası sağlayıcısı)** | SMS bildirimleri; ayrıca Vapi'ye kendi Twilio numaranızı bağlamak isterseniz telefon hattı sağlayıcısı olarak da kullanılabilir | `apps/backend/src/lib/notifications`, Vapi phone number import |
| **Resend (Faz 3+)** | Email bildirimleri | `apps/backend/src/lib/notifications` |

> Ortam değişkenleri (`VAPI_API_KEY`, `VAPI_SERVER_SECRET`, `DATABASEV2_URL`, `CLERK_SECRET_KEY`, frontend tarafı için `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` vb.) ilgili Vercel proje ayarlarında (frontend/backend ayrı ayrı) tutulur, koda asla hardcode edilmez. `VAPI_SERVER_SECRET`, gelen webhook/tool-call isteklerinin gerçekten Vapi'den geldiğini doğrulamak için kullanılır.

## 5. Kritik Tasarım Kararları (özet)

- **Neden Vapi?** Kod-öncelikli, esnek bir orkestrasyon katmanı sunuyor; STT/LLM/TTS bileşenlerini ayrı ayrı seçebilme imkânı ve olgun tool-calling desteğiyle backend entegrasyonunu basitleştiriyor. Detay ve alternatif değerlendirmesi: `DECISIONS.md#adr-005` (önceki karar için `DECISIONS.md#adr-001`).
- **Neden ayrı Vite frontend + Express backend (monorepo)?** Mevcut frontend kod tabanı zaten Vite ile yazılmış durumda (bkz. `Recall — Design System.md`); Next.js'e taşımak yerine gerçek kod tabanına uygun mimari benimsendi. Detay: `DECISIONS.md#adr-007` (önceki karar için `DECISIONS.md#adr-002`).
- **Neden Postgres + Prisma?** İlişkisel veri (klinik–doktor–hasta–randevu) net foreign key ilişkileri gerektiriyor; Prisma tip güvenliği sağlıyor. Detay: `DECISIONS.md#adr-003`.
- **Neden Clerk?** Kimlik doğrulamayı hızlı kurmak için; hem SPA (React SDK) hem backend (JWT doğrulama) tarafında hazır destek sunuyor. Detay: `DECISIONS.md#adr-004`.
- **Neden tek Vapi Server URL?** Vapi zaten webhook/tool-call ayrımını `message.type` ile tek uçta yapıyor; bu modele karşı gereksiz bir endpoint ayrımı zorlamak yerine Vapi'nin doğal modeli izleniyor. Detay: `DECISIONS.md#adr-006`.

Tüm kararların tam bağlamı, değerlendirilen alternatifler ve trade-off'lar için: **DECISIONS.md**
