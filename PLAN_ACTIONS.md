# PLAN_ACTIONS.md

> **Son güncelleme:** 2026-09-27 (Vite frontend + Express backend monorepo mimarisine geçiş — bkz. ADR-007)
> **Bu dosya AKTİF OLARAK GÜNCELLENİR.** Her session başında buradan devam et, her session sonunda güncelle. Fazların genel açıklaması için `PLAN.md`'ye bakınız.

## Aktif Faz: Faz 0 — Altyapı Kurulumu (bkz. `PLAN.md#faz-0`)

- [x] 7 dokümantasyon dosyasının (CLAUDE, ARCHITECTURE, PLAN, PLAN_ACTIONS, PROGRESS, DECISIONS, CONVENTIONS) oluşturulması
- [x] Sesli ajan platformu kararı: Retell → **Vapi** (bkz. `DECISIONS.md#adr-005`)
- [x] Tech stack seçimlerinin (Postgres/Prisma, Clerk) kullanıcı tarafından onaylanması (bkz. `DECISIONS.md` ADR-003/004)
- [x] Vapi webhook/tool-call ayrımının netleştirilmesi: **tek Server URL**, `message.type`'a göre dispatch (bkz. `DECISIONS.md#adr-006`, `ARCHITECTURE.md` § 3)
- [x] Framework kararının düzeltilmesi: Next.js yerine **Vite frontend + Express backend (monorepo)** — mevcut `apps/frontend` kod tabanı ve Design System dokümanıyla uyumlu hale getirildi (bkz. `DECISIONS.md#adr-007`)
- [x] Mevcut `apps/frontend` kodunun (Design System'de tarif edilen) hangi repoda/durumda olduğunun doğrulanması — sıfırdan oluşturulmasına karar verildi
- [ ] **🔵 ŞU AN ÜZERİNDE ÇALIŞILIYOR:** GitHub repo'sunun oluşturulması/doğrulanması (`recall` adıyla, private) ve Vercel projelerinin oluşturulması
- [x] `pnpm-workspace.yaml` ve kök `package.json` kurulumu (workspaces: `apps/*`)
- [x] `apps/frontend` Vite + React + TS + Tailwind v4 + Framer Motion ile sıfırdan iskeletin oluşturulması ve Design System'in (`index.css`) uygulanması
- [x] `apps/backend` iskeletinin oluşturulması: Node + TypeScript + Express
- [ ] İki ayrı Vercel projesinin oluşturulması ve GitHub repo'suna bağlanması: `apps/frontend` (statik Vite build) ve `apps/backend` (Node API)
- [x] Express'in Vercel serverless fonksiyon modeline nasıl uyarlanacağının netleştirilmesi (bkz. `DECISIONS.md#adr-008` — `@vercel/node` catch-all handler kuruldu)
- [x] ESLint + Prettier konfigürasyonunun her iki pakette de kurulması (bkz. `CONVENTIONS.md`)
- [ ] Neon veritabanı değişkenlerinin (`DATABASEV2_DATABASE_URL` ve `DATABASEV2_DATABASE_URL_UNPOOLED`) `apps/backend` Vercel proje env değişkeni olarak tanımlanması
- [x] Prisma kurulumu (`apps/backend/prisma`) ve ilk şemanın (`Clinic`, `Doctor`, `Patient`, `Appointment`, `CallLog` modelleri) yazılması
- [ ] İlk migration'ın çalıştırılması (`pnpm --filter backend prisma migrate dev --name init`) - (Veritabanı bekleniyor)
- [ ] Vapi hesabının açılması, bir test **assistant**'ının oluşturulması (model/voice/transcriber seçimi ile)
- [ ] Vapi'de kullanılacak telefon numarasının edinilmesi (Vapi'nin kendi sağladığı numara veya mevcut bir Twilio numarasının Vapi'ye bağlanması)
- [x] `apps/backend/src/routes/vapi/server.ts` tek route iskeletinin oluşturulması (şimdilik sadece `message.type`'ı loglayıp `200` dönen bir dispatcher)
- [x] `apps/backend/src/lib/vapi/server-handler.ts` içinde `message.type`'a göre dispatch iskeletinin kurulması (tool-calls → `lib/vapi/tools/*`, diğerleri → log/kaydet)
- [ ] Vapi assistant'ının **Server URL** ayarının `apps/backend`'in production/preview URL'i + `/api/vapi/server`'a yönlendirilmesi ve test aramasıyla doğrulanması
- [x] Gelen isteklerin gerçekten Vapi'den geldiğini doğrulamak için `VAPI_SERVER_SECRET` (`Authorization: Bearer` header) kontrolünün eklenmesi
- [ ] Clerk hesabının açılması; `apps/frontend`'e React SDK, `apps/backend`'e backend SDK (JWT doğrulama) entegrasyonu (Hesap/API Key bekleniyor)
- [ ] Her iki Vercel projesinin de ilk deploy'unun yapılması ("hello world" seviyesinde, production URL'ler çalışır durumda)

## Sıradaki Faz için Ön Hazırlık (henüz aktif değil — Faz 1, bkz. `PLAN.md#faz-1`)

- [ ] Vapi assistant'ı için Türkçe konuşma akışı/prompt taslağının yazılması
- [ ] `check_availability`, `book_appointment`, `cancel_appointment`, `reschedule_appointment` tool şemalarının (Vapi function/tool tanımları, JSON Schema formatında) tasarlanması

---

### Kullanım Notu
- Görevler tamamlandıkça `- [ ]` → `- [x]` olarak işaretlenir.
- Yeni görev keşfedilirse ilgili faz başlığı altına eklenir ve `PLAN.md`'deki faz referansı korunur.
- "🔵 ŞU AN ÜZERİNDE ÇALIŞILIYOR" etiketi her zaman tek bir göreve verilir; o görev bitince bir sonrakine taşınır.
- Önemli bir teknik karar bu görevler sırasında alınırsa, `DECISIONS.md`'ye yeni bir ADR olarak eklenir ve buradan referans verilir.
