# PROGRESS.md

> **Son güncelleme:** 2026-09-27 (KICKOFF_PROMPT.md eklendi)
> **Bu dosya AKTİF OLARAK GÜNCELLENİR.** Kronolojik geliştirme günlüğüdür — en yeni girdi en üstte. Yeni bir session'a başlarken son 1-2 girdiyi okuyarak kaldığın yerden devam edebilirsin.

---

## 2026-09-27 — Faz 0 Altyapı İskeletinin Kurulması

**Ne yapıldı:**
- Monorepo (`pnpm-workspace.yaml`) kök dizini kuruldu ve bağımlılıklar yapılandırıldı.
- `apps/frontend` sıfırdan Vite + React + TS ile oluşturuldu; Design System kurallarına (`index.css` Tailwind v4 HSL tokenları) uygun biçimde temel LandingPage, LoginPage ve SecretaryLayout bileşenleri kodlandı.
- `apps/backend` Node.js + Express iskeletiyle oluşturuldu; Vapi webhook'larını karşılamak üzere `server-handler.ts` (dispatcher) ve `validate-secret.ts` eklendi.
- ADR-008 ile Express'in Vercel'e `@vercel/node` ile entegrasyonu belgelendi ve `api/index.ts` yapılandırıldı.
- Prisma modelleri (şema) oluşturuldu ve ESLint/Prettier yapılandırmaları tüm workspace için tamamlandı.

**Karşılaşılan sorun / açık nokta:**
- Veritabanı henüz ortada olmadığı (kullanıcı tarafından Vercel Postgres/Neon hesabı oluşturulması gerektiği) için Prisma'nın ilk migration komutu başarısız oldu.
- Clerk ve Vapi servis hesapları, ilgili API anahtarları henüz tanımlanmadı.

**Nasıl çözüldü / sonraki adım:**
- Kod tabanındaki (repo bazlı) yapısal Faz 0 görevleri tamamlandı.
- Sonraki adım: Kullanıcının Vercel, Vapi, Clerk servis hesaplarını açıp, veritabanını kurması, ortam değişkenlerini (ENV) doldurması ve migration işlemini manuel olarak yapması (veya erişim sağlaması).

---

## 2026-09-27 — Faz 0 Kickoff Prompt'u Hazırlandı

**Ne yapıldı:**
- `KICKOFF_PROMPT.md` oluşturuldu: yeni bir geliştirme agent'ına (Claude Code vb.) ilk mesaj olarak gönderilecek, Faz 0'ı uçtan uca kapsayan, teknik detaylara inen bir başlangıç promptu. Okuma sırası, mevcut frontend kodunun durumunun doğrulanması gerekliliği, monorepo/backend/Vercel/Prisma/Vapi/Clerk kurulum adımları, taslak Prisma şeması, kesin kurallar ve session sonu rutini içeriyor.
- `CLAUDE.md`'nin referans haritasına bu dosya eklendi.

**Karşılaşılan sorun / açık nokta:**
- Yok.

**Nasıl çözüldü / sonraki adım:**
- `KICKOFF_PROMPT.md`'deki blok kopyalanıp agent'a gönderilecek; agent'ın ilk somut işi PLAN_ACTIONS.md'deki 🔵 işaretli görev (mevcut frontend kodunun repo durumunun doğrulanması).

---

## 2026-09-27 — Framework Düzeltmesi: Next.js → Vite Frontend + Express Backend (Monorepo)

**Ne yapıldı:**
- Kullanıcı, mevcut frontend uygulamasının görsel tasarım/stil kurallarını tanımlayan **"Recall — Design System.md"** dosyasını paylaştı ve "buna göre projeyi güncelle" dedi.
- Bu dosya incelenince kritik bir çelişki ortaya çıktı: `DECISIONS.md`'de ADR-002 ile onaylanmış olan **Next.js (tek uygulama)** kararı, Design System'in tarif ettiği gerçeklikle uyuşmuyordu — belge **React + TypeScript + Vite** kullanan, `apps/frontend/src/...` altında gerçek dosyalara (`pages/landing/LandingPage.tsx`, `pages/LoginPage.tsx`, `components/layout/SecretaryLayout.tsx`) sahip, **mevcut** bir frontend uygulamasını belgeliyordu.
- Kullanıcıya bu çelişki açıkça belirtildi ve en olası yorumun hangisi olduğu soruldu; kullanıcı "en mantıklı seçeneği sen seç" dedi. Karar: proje zaten Vite+React ile başlamış, Next.js kararı (ADR-002) gerçekle örtüşmüyor — mimari buna göre düzeltildi.
- `DECISIONS.md`'ye **ADR-007** eklendi: monorepo mimarisine geçiş — `apps/frontend` (Vite + React + TS + Tailwind + Radix UI + Framer Motion) ve `apps/backend` (Node + TypeScript + **Express**, Vapi Server URL + Prisma burada). ADR-002 "değiştirildi" olarak işaretlenip ADR-007'ye referans verecek şekilde güncellendi (silinmedi, tarihsel kayıt korundu).
- `CLAUDE.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `PLAN.md`, `PLAN_ACTIONS.md` bu yeni mimariye göre baştan revize edildi: klasör yapısı, komutlar (`pnpm --filter frontend/backend ...`), veri akışı diyagramı, dış servisler tablosu (iki ayrı Vercel projesi), isimlendirme kuralları, yasaklı pattern'ler.
- `Recall — Design System.md` dosyası proje köküne eklendi ve diğer 7 MD dosyasından referans verilir hale getirildi (CLAUDE.md § 6 referans haritasına eklendi).

**Karşılaşılan sorun / açık nokta:**
- Design System dosyası yalnızca frontend'in **var olduğunu** gösteriyor; bu kodun hangi repoda, hangi durumda (GitHub'a push edilmiş mi, hâlâ lokal mi) olduğu netleştirilmedi. `PLAN_ACTIONS.md`'ye bunu doğrulayacak bir görev eklendi (🔵 aktif görev).
- Express'in Vercel'in serverless fonksiyon modeline nasıl uyarlanacağı (örn. `@vercel/node` catch-all handler) henüz netleştirilmedi — `PLAN_ACTIONS.md`'de somut görev olarak not edildi, ADR-007'nin açık noktası olarak da kayıtlı.
- ADR-004'ün (Clerk) metni hâlâ Next.js middleware varsayımıyla yazılmıştı; Clerk kararının özü değişmediği için yeni ADR açılmadı, sadece ADR-007'de entegrasyon farkı (React SDK + backend SDK) not edildi.

**Nasıl çözüldü / sonraki adım:**
- Karar ve gerekçe kaydı: `DECISIONS.md#adr-007`.
- Sıradaki somut görev (`PLAN_ACTIONS.md`, 🔵 işaretli): mevcut `apps/frontend` kodunun repo/monorepo durumunun doğrulanması, ardından `pnpm-workspace.yaml` ve `apps/backend` iskeletinin kurulması.

---

## 2026-09-27 — Tech Stack Onayı ve Vapi Server URL Netleştirmesi

**Ne yapıldı:**
- Kullanıcı, kalan tech stack önerilerini (Next.js, PostgreSQL + Prisma, Clerk) onayladı. `DECISIONS.md`'de ADR-002, ADR-003, ADR-004'ün durumu "Önerildi"den "✅ Kabul edildi"ye güncellendi; `CLAUDE.md`'deki ilgili not da buna göre düzeltildi.
- Vapi'de webhook ve tool-call'un aynı Server URL'e mi geldiği sorusu araştırıldı (Vapi dokümantasyonu). Sonuç: **tek Server URL** var, ayrı `webhook`/`functions` endpoint'i yok — tüm mesajlar (`tool-calls`, `status-update`, `end-of-call-report`, `assistant-request` vb.) gövdedeki `message.type` alanına göre ayrışıyor; dördü senkron JSON yanıt gerektiriyor, geri kalanı fire-and-forget bildirim.
- Bu bulgu `DECISIONS.md`'ye **ADR-006** olarak eklendi. `ARCHITECTURE.md` § 3 (veri akışı) ve dış servisler tablosu, `CLAUDE.md` klasör yapısı, `CONVENTIONS.md` API route örneği, `PLAN_ACTIONS.md` Faz 0 görevleri buna göre revize edildi: `app/api/vapi/webhook/` + `app/api/vapi/functions/*` yapısı, tek bir `app/api/vapi/server/route.ts` + `lib/vapi/server-handler.ts` (message.type dispatch) + `lib/vapi/tools/*` yapısıyla değiştirildi.

**Karşılaşılan sorun / açık nokta:**
- Yok — önceki session'da açık bırakılan Vapi webhook/tool-call ayrımı sorusu bu girdiyle kapatıldı.

**Nasıl çözüldü / sonraki adım:**
- Karar ve gerekçe kaydı: `DECISIONS.md#adr-006`.
- Sıradaki somut görev (`PLAN_ACTIONS.md`, 🔵 işaretli): GitHub repo'sunun (`recall`, private) oluşturulması, ardından Vercel'e bağlanması ve Next.js iskeletinin kurulması.

---

## 2026-09-27 — Vapi'ye Geçiş

**Ne yapıldı:**
- Kullanıcı, sesli ajan platformu olarak Retell yerine **Vapi** ile devam edileceğine karar verdi.
- Tüm 7 dokümantasyon dosyası bu karara göre güncellendi: `CLAUDE.md`, `ARCHITECTURE.md`, `PLAN.md`, `PLAN_ACTIONS.md`, `CONVENTIONS.md` içindeki tüm Retell referansları Vapi terminolojisiyle (assistant, tool/function, server message) değiştirildi.
- `DECISIONS.md`'ye yeni bir ADR (**ADR-005**) eklendi; eski karar (**ADR-001**) silinmedi, "değiştirildi" olarak işaretlenip ADR-005'e referans verecek şekilde güncellendi (ADR formatının gereği: kararlar silinmez, üzerine yazılmaz).
- Klasör yapısı planı güncellendi: `lib/retell/` → `lib/vapi/`, `app/api/retell/*` → `app/api/vapi/*`.
- Ortam değişkeni ismi güncellendi: `RETELL_API_KEY` → `VAPI_API_KEY`; ayrıca istek doğrulaması için `VAPI_SERVER_SECRET` env değişkeni planlandı.
- `PLAN_ACTIONS.md`'deki Faz 0 görev listesi Vapi'ye göre revize edildi (Vapi hesabı/assistant kurulumu, Server URL yapılandırması, secret doğrulaması gibi görevler eklendi).

**Karşılaşılan sorun / açık nokta:**
- Vapi'de webhook (server message) ve tool-call mekanizmasının Retell'deki kadar net iki ayrı endpoint'e ayrılıp ayrılmadığı (Vapi'de her ikisi de tek bir "Server URL"e, mesaj tipine göre gelebiliyor) henüz kod seviyesinde doğrulanmadı — bu, Faz 0/1'de `/api/vapi/webhook` ve `/api/vapi/functions/*` kurulurken netleştirilecek.

**Nasıl çözüldü / sonraki adım:**
- Karar ve gerekçe kaydı: `DECISIONS.md#adr-005`.
- Sıradaki somut görev değişmedi: `PLAN_ACTIONS.md`'deki Faz 0 listesi — kalan tech stack seçimlerinin (Next.js, Postgres, Clerk) onayı, ardından GitHub repo ve Next.js iskeletinin kurulumu.

---

## 2026-09-27

**Ne yapıldı:**
- RECALL projesi için 7 parçalı dokümantasyon sistemi (`CLAUDE.md`, `ARCHITECTURE.md`, `PLAN.md`, `PLAN_ACTIONS.md`, `PROGRESS.md`, `DECISIONS.md`, `CONVENTIONS.md`) sıfırdan oluşturuldu.
- Proje kapsamı belirlendi: Retell + GitHub + Vercel kullanılarak tıbbi klinikler için sesli randevu asistanı.
- Tech stack, kullanıcı tarafından yalnızca "Retell + GitHub + Vercel" olarak belirtildiği için geri kalan katmanlar (dil, framework, veritabanı, auth) proje ekibi tarafından önerildi: Next.js (TypeScript), PostgreSQL + Prisma, Clerk. Bkz. `DECISIONS.md`.
- Fazlar (Faz 0–5) tanımlandı, aktif faz olarak Faz 0 (Altyapı Kurulumu) belirlendi.

**Karşılaşılan sorun / açık nokta:**
- Kullanıcının talimatı içinde çelişki vardı: bir yandan "eksik bilgi varsa sor, varsayım yapıp geçme", diğer yandan "tüm ilgili detayları sen oluştur ve planla". İkinci, daha spesifik talimat esas alınarak ilerlendi; ancak yapılan tüm teknik seçimler öneri/varsayım olarak işaretlendi ve kullanıcı onayı bekleniyor.
- Retell'e alternatif platformlar hakkında kullanıcıya kısa bir karşılaştırma sunuldu (Vapi, Bland AI, ElevenLabs, Synthflow, Vocode, Telnyx). Bu konuda henüz kesin bir karar alınmadı; Retell ile devam ediliyor.

**Nasıl çözüldü / sonraki adım:**
- Kullanıcıdan tech stack seçimlerini (Next.js, Postgres, Clerk) onaylaması veya değiştirmesi isteniyor.
- Detaylı gerekçeler için bkz. `DECISIONS.md` (ADR-001 – ADR-004).
- Sıradaki somut görev: `PLAN_ACTIONS.md`'deki Faz 0 listesi — GitHub repo kurulumu ve Next.js iskeletinin oluşturulması.

---

<!--
YENİ GİRDİ EKLEME ŞABLONU (her session sonunda kopyala, doldur, en üste ekle):

## YYYY-MM-DD

**Ne yapıldı:**
-

**Karşılaşılan sorun / açık nokta:**
-

**Nasıl çözüldü / sonraki adım:**
- (Önemli bir mimari/teknik karar alındıysa: bkz. `DECISIONS.md#adr-00X`)
-->
