# CONVENTIONS.md

> **Son güncelleme:** 2026-09-27 (Vite frontend + Express backend monorepo mimarisine geçiş — bkz. ADR-007)
> **Bu dosya:** Kod tutarlılığını sağlayan stil rehberidir. Tech stack tercihleri için `CLAUDE.md`, bu tercihlerin gerekçeleri için `DECISIONS.md`, görsel/UI stil kuralları (renk, tipografi, bileşen görünümü) için `Recall — Design System.md`'ye bakınız — bu dosya yalnızca kod/isimlendirme/format kurallarını kapsar.

## 1. İsimlendirme Kuralları

| Öğe | Kural | Örnek |
|---|---|---|
| Dosya adı (genel) | `kebab-case.ts` | `check-availability.ts` |
| React bileşen dosyası | `PascalCase.tsx` | `AppointmentList.tsx` |
| React bileşen adı | `PascalCase` | `function AppointmentList() {}` |
| Değişken / fonksiyon | `camelCase` | `getAvailableSlots()` |
| Sabitler (constant) | `UPPER_SNAKE_CASE` | `MAX_APPOINTMENT_DURATION_MIN` |
| TypeScript tip / interface | `PascalCase` | `type Appointment = {...}` |
| Klasör adı | `kebab-case` | `apps/backend/src/lib/scheduling` |
| Prisma model adı | `PascalCase`, tekil | `model Appointment {}` |
| Veritabanı tablo/kolon (Prisma `@@map`) | `snake_case` | `appointments`, `patient_id` |
| Express route dosyası (`apps/backend/src/routes/`) | `kebab-case.ts` | `apps/backend/src/routes/vapi/server.ts` (tek route, dispatcher — bkz. `ARCHITECTURE.md` § 3) |
| Vapi tool handler dosyası (`src/lib/vapi/tools/`) | `kebab-case.ts` | `apps/backend/src/lib/vapi/tools/check-availability.ts` |
| Vapi tool (function) adı | `snake_case` | `check_availability`, `book_appointment` |
| Frontend sayfa dosyası (`apps/frontend/src/pages/`) | `PascalCase.tsx` | `LoginPage.tsx`, `landing/LandingPage.tsx` |
| Frontend workspace paket adı | `kebab-case`, `@recall/*` öneki (opsiyonel) | `frontend`, `backend` |

## 2. Commit Mesaj Formatı

**Conventional Commits** kullanılır, kapsam (scope) olarak workspace paketi belirtilir:

```
<tip>(<paket>/<kapsam>): <kısa açıklama>

[isteğe bağlı detaylı gövde]

[isteğe bağlı footer, örn: Refs: PLAN_ACTIONS.md#faz-1]
```

Kullanılabilecek tipler: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`.

Örnekler:
```
feat(backend/scheduling): randevu çakışma kontrolü eklendi
fix(backend/vapi-server): end-of-call-report eventi iki kez işlendiğinde tekrar kayıt oluşması engellendi
feat(frontend/secretary): randevu listesine filtre eklendi
docs(plan-actions): Faz 1 görevleri eklendi
```

- Kısa açıklama Türkçe yazılabilir, emir kipi kullanılmaz ("eklendi", "düzeltildi" gibi geçmiş zaman tercih edilir).
- Dokümantasyon dosyalarında (CLAUDE.md, PLAN.md vb.) değişiklik yapıldığında `docs:` tipi kullanılır.

## 3. Kod Formatlama

- **Prettier** varsayılan ayarlarla + şu özelleştirmeler: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`.
- **ESLint**: `apps/frontend`'de `plugin:react-hooks` + `@typescript-eslint/recommended`; `apps/backend`'de sade `@typescript-eslint/recommended` (Next.js'e özgü `next/core-web-vitals` artık kullanılmıyor).
- Her PR/commit öncesi `pnpm -r lint` ve `pnpm -r format` çalıştırılmalı (mümkünse pre-commit hook ile — Faz 0'da Husky eklenmesi değerlendirilecek, henüz zorunlu değil).
- Fonksiyonlar mümkün olduğunca küçük ve tek sorumluluklu tutulur; bir dosya 200-300 satırı geçiyorsa bölünmesi değerlendirilir.
- Frontend'de renk/boyut/radius değerleri Tailwind sınıfları ve tema token'ları üzerinden verilir; inline stil veya ham hex/px değeri yazılmaz (bkz. `Recall — Design System.md`).

## 4. Import Sıralaması ve Dosya Organizasyonu

Import sırası (aralarında boş satır ile gruplanır):
1. Node/harici paketler (`react`, `express`, `zod` vb.)
2. Proje içi mutlak importlar (`@/lib/...`, `@/components/...`)
3. Göreli importlar (`./`, `../`)
4. Tip importları (`import type {...}`) — mümkünse ayrı grup olarak en sonda

**Backend örneği:**
```ts
import express from 'express';
import { z } from 'zod';

import { prisma } from '@/lib/db/client';
import { checkSlotAvailability } from '@/lib/scheduling/availability';

import { formatDate } from './utils';

import type { Appointment } from '@prisma/client';
```

**Frontend örneği:**
```tsx
import { useState } from 'react';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { useAppointments } from '@/hooks/use-appointments';

import { formatSlotLabel } from './utils';

import type { Appointment } from '@/types/appointment';
```

Dosya organizasyonu:
- `apps/backend/src/routes/` altındaki her route dosyası sadece HTTP handler mantığını içerir; iş mantığı `src/lib/` altındaki fonksiyonlara delege edilir.
- `apps/backend/src/lib/` altındaki her alt klasör (`db`, `vapi`, `scheduling`, `notifications`) kendi sorumluluğuna ait fonksiyonları içerir, birbirine dairesel (circular) import yapmaz.
- `apps/frontend/src/pages/` sayfa bileşenlerini, `apps/frontend/src/components/` yeniden kullanılabilir UI parçalarını barındırır; sayfa bileşenleri veri çekme mantığını `hooks/` altına devreder.
- Test dosyaları, test ettikleri dosyayla aynı adı taşır ve `tests/unit` veya `tests/e2e` altında ayna (mirror) klasör yapısında durur.

## 5. Yasaklı / Kaçınılması Gereken Pattern'ler

- ❌ Hasta kişisel verisinin (ad-soyad, telefon, TC kimlik no) `console.log` veya herhangi bir log çıktısına açık metin olarak yazılması.
- ❌ API anahtarlarının, veritabanı bağlantı stringlerinin kod içine hardcode edilmesi — her zaman ortam değişkeni (backend: `process.env.*`, frontend: `import.meta.env.VITE_*`) kullanılır.
- ❌ Vapi tool-call endpoint'lerinde giriş doğrulaması (validation) yapılmadan doğrudan veritabanı işlemi yapılması — Zod şeması zorunlu.
- ❌ `VAPI_SERVER_SECRET` (`Authorization: Bearer` header) doğrulaması yapılmadan `/api/vapi/server`'a gelen herhangi bir isteğin işlenmesi — mesaj tipi ne olursa olsun bu kontrol dispatch'ten önce yapılır.
- ❌ `/api/vapi/server` route dosyasına iş mantığı yazılması — route yalnızca `message.type`'a göre `src/lib/vapi/` altındaki fonksiyonlara dispatch eder (bkz. `DECISIONS.md#adr-006`).
- ❌ `any` tipinin gerekçesiz kullanımı — gerekiyorsa `unknown` + tip daraltma (type narrowing) tercih edilir.
- ❌ Prisma migration'larının elle (manuel SQL ile) veritabanında düzenlenmesi — her değişiklik `prisma migrate` üzerinden yapılır.
- ❌ Aynı randevu zaman aralığına ikinci bir randevunun oluşturulabilmesine izin veren kontrolsüz "book" işlemleri — her booking işlemi transaction içinde çakışma kontrolüyle yapılır.
- ❌ Frontend'de backend'e Clerk JWT doğrulaması olmadan sekreter paneli verisine erişilebilecek bir endpoint bırakılması — her REST endpoint auth middleware'inden geçer.
- ❌ `Recall — Design System.md`'de tanımlı token'lar dışında ad-hoc renk/radius/font-weight değeri kullanılması.
- ❌ `PLAN_ACTIONS.md` güncellenmeden büyük bir özelliğin doğrudan kodlanması — görev önce listeye eklenir (bkz. `CLAUDE.md#7-session-başlangıç-rutini`).
