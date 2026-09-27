# CLAUDE.md

> **Son güncelleme:** 2026-09-27 (Vite frontend + Express backend monorepo mimarisine geçiş — bkz. ADR-007; Design System dosyası eklendi)
> **Bu dosya:** Her yeni geliştirme session'ının başında okunması gereken proje anayasasıdır. Diğer dosyalara (6 MD dosyası + Design System) buradan referans verilir; detayları burada tekrar etme, ilgili dosyaya git.

## 1. Proje Özeti

**RECALL**, tıbbi klinikler için geliştirilmiş, telefon üzerinden çalışan yapay zeka destekli **randevu asistanıdır**. Hastalar kliniği aradığında sesli bir yapay zeka ajanı görüşmeyi karşılar; randevu oluşturma, iptal etme ve değiştirme işlemlerini insan personel müdahalesi olmadan gerçekleştirir.

## 2. Tech Stack

| Katman | Teknoloji | Not |
|---|---|---|
| Dil | TypeScript | Tüm proje boyunca (frontend + backend) |
| Mimari | **Monorepo** (`pnpm` workspaces) | `apps/frontend`, `apps/backend` — bkz. `DECISIONS.md#adr-007` |
| Frontend framework | **React + Vite** | Landing sayfası + sekreter paneli (dashboard) |
| Frontend stil | Tailwind CSS, Radix UI, Framer Motion (`motion`), `lucide-react` | Tasarım kuralları: **`Recall — Design System.md`** (proje kökü) |
| Backend framework | **Express** (Node.js) | API + Vapi Server URL (bkz. ADR-006, ADR-007) |
| Sesli Ajan / Telefoni | **Vapi** | STT+LLM+TTS+telefoni orkestrasyonu. Retell'den değiştirildi — bkz. `DECISIONS.md#adr-005` |
| Veritabanı | PostgreSQL (Vercel Postgres / Neon) | |
| ORM | Prisma | Şema: `apps/backend/prisma/schema.prisma` |
| Auth | Clerk | Frontend: Clerk React SDK (Vite/SPA). Backend: Clerk backend SDK ile JWT doğrulama |
| Hosting / Deploy | Vercel | **İki ayrı proje**: `apps/frontend` (statik Vite build), `apps/backend` (Node API) — bkz. `DECISIONS.md#adr-007` |
| Versiyon Kontrol | GitHub | `main` branch = production |
| Test | Vitest (unit), Playwright (e2e) | |
| Lint / Format | ESLint + Prettier | |
| Paket Yöneticisi | pnpm (workspaces) | |
| Bildirim (Faz 3+) | Twilio (SMS), Resend (email) | Henüz aktif değil |

> Bu seçimlerin gerekçeleri için bkz. **DECISIONS.md**. Tüm tech stack seçimleri onaylanmıştır (ADR-003 Postgres/Prisma, ADR-004 Clerk, ADR-005 Vapi, ADR-006 tek Server URL, ADR-007 monorepo/Vite/Express — ADR-002'nin (Next.js) yerini aldı).

## 3. Klasör Yapısı

```
recall/
├── CLAUDE.md, ARCHITECTURE.md, PLAN.md, PLAN_ACTIONS.md,
│   PROGRESS.md, DECISIONS.md, CONVENTIONS.md   # kök dizin dokümantasyonu
├── Recall — Design System.md   # tek kaynak: görsel tasarım/stil kuralları (renk, tipografi, bileşen stilleri)
├── pnpm-workspace.yaml
├── apps/
│   ├── frontend/                # React + TS + Vite (landing + sekreter paneli)
│   │   ├── src/
│   │   │   ├── index.css            # tema token'ları (bkz. Design System § Renk Sistemi)
│   │   │   ├── pages/
│   │   │   │   ├── landing/LandingPage.tsx
│   │   │   │   └── LoginPage.tsx
│   │   │   └── components/
│   │   │       └── layout/SecretaryLayout.tsx
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   └── backend/                 # Node + TS API sunucusu (Express)
│       ├── src/
│       │   ├── routes/
│       │   │   └── vapi/server.ts   # TEK Vapi Server URL endpoint'i (bkz. ARCHITECTURE.md § 3, ADR-006)
│       │   ├── lib/
│       │   │   ├── db/              # Prisma client singleton, db helper fonksiyonları
│       │   │   ├── vapi/             # server-handler (message.type dispatch), tools/, tip tanımları
│       │   │   ├── scheduling/       # Randevu mantığı, çakışma kontrolü, müsaitlik hesaplama
│       │   │   └── notifications/    # SMS/email gönderim helper'ları (Faz 3+)
│       │   └── index.ts             # Express app giriş noktası
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
├── packages/                    # (opsiyonel, Faz 1+) frontend/backend arası paylaşılan TS tipleri
├── tests/
│   ├── unit/
│   └── e2e/
└── scripts/                     # seed.ts, yardımcı script'ler
```

Mimarinin detaylı açıklaması, veri akışı ve dış servis entegrasyonları için: **ARCHITECTURE.md**

## 4. Komutlar

```bash
# Kurulum (kök dizinde, tüm workspace paketleri için)
pnpm install

# Frontend geliştirme sunucusu (apps/frontend)
pnpm --filter frontend dev

# Backend geliştirme sunucusu (apps/backend)
pnpm --filter backend dev

# Build (her iki paket)
pnpm -r build

# Lint (tüm workspace)
pnpm -r lint

# Format
pnpm -r format

# Unit testler
pnpm -r test

# E2E testler
pnpm --filter frontend test:e2e

# Prisma - şema değişikliği sonrası migration oluşturma (apps/backend içinde)
pnpm --filter backend prisma migrate dev --name <migration_adi>

# Prisma - client yeniden üretme
pnpm --filter backend prisma generate

# Veritabanı seed
pnpm --filter backend db:seed
```

Deploy: `main` branch'e push edildiğinde Vercel, `apps/frontend` ve `apps/backend` için tanımlı **iki ayrı proje**yi otomatik deploy eder (bkz. `DECISIONS.md#adr-007`). PR açıldığında her iki proje için de preview deployment üretilir. Vapi'nin **Server URL** ayarının (`apps/backend`'in production/preview URL'i + `/api/vapi/server`) her ortam için Vapi dashboard'ında güncel tutulması gerekir — bkz. `ARCHITECTURE.md` § Dış Servisler.

## 5. Kodlama Kuralları (özet)

Detaylar için **CONVENTIONS.md**; görsel/stil kuralları için **`Recall — Design System.md`**. Kısaca:

- Tüm kod TypeScript, `strict: true`.
- Dosya isimleri: `kebab-case.ts`, React bileşenleri: `PascalCase.tsx`.
- Commit mesajları: Conventional Commits formatı (`feat:`, `fix:`, `docs:`, ...).
- Her yeni özellik önce ilgili faza `PLAN_ACTIONS.md`'de görev olarak eklenir, sonra kodlanır.
- API route'larında input validasyonu zorunlu (Zod).
- `/api/vapi/server` route'u tek giriş noktasıdır; iş mantığı asla route dosyasına yazılmaz, `message.type`'a göre `lib/vapi/tools/*`'a dispatch edilir (bkz. `DECISIONS.md#adr-006`).
- Vapi tool/function-call endpoint'leri idempotent olmalı (aynı çağrı iki kez gelirse hata vermemeli).
- Hasta verisi (isim, telefon, TC kimlik vb.) log'lara asla açık şekilde yazılmaz.
- Frontend'de yeni bir bileşen/sayfa yazılırken önce **Design System** dosyasındaki token'lar (renk, radius, tipografi) kullanılır; ad-hoc renk/boyut değeri eklenmez.

## 6. Diğer Dosyalara Referans Haritası

| Dosya | Ne zaman oku | Ne zaman güncelle |
|---|---|---|
| **ARCHITECTURE.md** | Sisteme yeni katılırken veya mimariyi hatırlamak için | Mimaride köklü bir değişiklik olduğunda (yeni servis, katman değişimi) |
| **PLAN.md** | Hangi fazda olduğumuzu, genel yol haritasını görmek için | Faz tamamlandığında veya kapsam değiştiğinde |
| **PLAN_ACTIONS.md** | **Her session başında** — üzerinde çalışılacak görevi bulmak için | **Her session'da** — görev tamamlandıkça checkbox işaretlenir, yeni görev eklenir |
| **PROGRESS.md** | **Her session başında** — son nerede kalındığını anlamak için | **Her session sonunda** — o session'da ne yapıldığı eklenir |
| **DECISIONS.md** | Bir teknik kararın "neden"ini merak ettiğinde | Yeni bir mimari/teknik karar alındığında (yeni ADR eklenir, eskiler değiştirilmez, durumu güncellenir) |
| **CONVENTIONS.md** | Kod yazmadan önce stil kurallarını hatırlamak için | Ekip yeni bir kural üzerinde anlaştığında |
| **Recall — Design System.md** | Frontend'de yeni bir UI parçası yazmadan önce (renk, tipografi, bileşen stili) | Görsel tasarım sistemi değiştiğinde (yeni token, yeni bileşen varyantı) |
| **KICKOFF_PROMPT.md** | Yeni bir agent oturumu başlatırken, ilk mesaj olarak kopyalanacak metni bulmak için | Aktif faz değiştiğinde (yeni fazın somut adımlarını içeren yeni bir blok eklenir, eskisi silinmez) |

## 7. Session Başlangıç Rutini (öneri)

1. `PROGRESS.md`'nin son 1-2 girdisini oku.
2. `PLAN_ACTIONS.md`'de "şu an üzerinde çalışılıyor" işaretli görevi bul.
3. Gerekiyorsa `ARCHITECTURE.md`, `DECISIONS.md` veya (frontend işi ise) `Recall — Design System.md`'den ilgili bölüme bak.
4. Çalış, bitince `PLAN_ACTIONS.md` ve `PROGRESS.md`'yi güncelle.

> **Not:** `PLAN_ACTIONS.md` ve `PROGRESS.md` aktif olarak güncellenen dosyalardır; diğer dosyalar daha statiktir ve sadece köklü değişikliklerde güncellenir.
