# DECISIONS.md

> **Son güncelleme:** 2026-09-27 (ADR-010 eklendi — Faz 1 Vapi Tool Handlers, Randevu Çakışma Yönetimi ve Dashboard REST API)
> **Bu dosya:** Mimari/teknik kararların ADR (Architecture Decision Record) formatında gerekçeli kaydıdır. Kararlar silinmez; durumu değişirse (örn. "değiştirildi") yeni bir ADR eklenir ve eskisi "değiştirildi" olarak işaretlenip yeni olana referans verir.

---

## ADR-001: Sesli ajan platformu olarak Retell AI'nin seçilmesi

- **Tarih:** 2026-09-27
- **Durum:** ⚠️ Değiştirildi → bkz. **ADR-005** (Vapi'ye geçiş). Bu ADR, kararın geldiği bağlamı korumak amacıyla tarihsel kayıt olarak bırakılmıştır, artık yürürlükte değildir.

**Bağlam:**
RECALL'in çekirdek işlevi, hastalarla telefon üzerinden doğal dilde konuşabilen bir sesli yapay zeka ajanı gerektiriyor. Bu, konuşma tanıma (STT), dil modeli (LLM), sese çevirme (TTS) ve telefoni altyapısının bir arada orkestre edilmesini gerektirir.

**Karar:**
Retell AI kullanılacak. Retell, bu dört bileşeni (STT+LLM+TTS+telefoni) tek bir API/dashboard üzerinden yönetilebilir hale getiren bir orkestrasyon platformu. Fonksiyon çağırma (custom function/tool calling) desteği sayesinde backend'imizle (Vercel API route'ları) doğrudan entegre olabiliyor.

**Alternatifler:**
- **Vapi**: Kod-öncelikli orkestrasyon katmanı, Retell'e çok benzer bir model. Geçiş maliyeti düşük olurdu ama başlangıç için Retell'den ayıran belirgin bir avantajı yok.
- **Bland AI**: Yüksek hacimli outbound arama senaryolarında güçlü, ama RECALL'in odağı inbound randevu yönetimi; Bland'in güçlü olduğu alan bu MVP için öncelikli değil.
- **ElevenLabs Conversational AI**: Ses kalitesi/gerçekçilik açısından en güçlü seçeneklerden biri, ancak fonksiyon çağırma ve telefoni entegrasyonu tarafında Retell kadar olgun/dokümante değil (2026 itibarıyla).
- **Vocode (açık kaynak)**: Tam kontrol sağlıyor ama kendi altyapımızda barındırma ve bakım yükü MVP için gereksiz karmaşıklık katardı.
- **Twilio ConversationRelay + kendi LLM'imiz**: Daha fazla mühendislik kontrolü sağlar ama sıfırdan konuşma orkestrasyonu yazmak gerekir; MVP hızını yavaşlatır.

**Sonuçlar (trade-off'lar):**
- (+) Hızlı kurulum, dokümante fonksiyon çağırma modeli, MVP'yi hızlandırır.
- (–) Orkestrasyon katmanı olması nedeniyle bileşen bazlı maliyet (dakika başı gerçek maliyetin liste fiyatının üzerinde olabileceği biliniyor) ve ek gecikme (latency) riski var; hacim arttığında yeniden değerlendirilebilir.
- (–) Retell'e bağımlılık (vendor lock-in) oluşuyor; bu risk `lib/retell/` katmanının ince bir soyutlama olarak tasarlanmasıyla (bkz. ARCHITECTURE.md) kısmen azaltılıyor — ileride Vapi/ElevenLabs'e geçiş gerekirse bu katman değiştirilir.

---

## ADR-002: Framework olarak Next.js (tek uygulama, dashboard + API bir arada)

- **Tarih:** 2026-09-27
- **Durum:** ⚠️ Değiştirildi → bkz. **ADR-007** (Vite frontend + ayrı backend monorepo mimarisine geçiş). Bu ADR, kararın geldiği bağlamı korumak amacıyla tarihsel kayıt olarak bırakılmıştır, artık yürürlükte değildir.

**Bağlam:**
Vercel kullanılacağı kullanıcı tarafından belirtildi. Vercel'in en olgun desteği Next.js'e; hem dashboard (klinik personeli arayüzü) hem de Retell webhook/function-call endpoint'lerini barındıracak bir backend gerekiyor.

**Karar:**
Next.js 14+ (App Router), TypeScript ile. Dashboard ve API route'ları aynı repo/uygulama içinde.

**Alternatifler:**
- **Ayrı backend (Express/Fastify) + ayrı frontend (React/Vite)**: Daha esnek ama iki ayrı deployment, iki ayrı ortam değişkeni seti, iki ayrı CI/CD anlamına gelir — MVP için gereksiz operasyonel yük.
- **Remix**: Next.js'e benzer, ama Vercel'in birinci sınıf desteği ve ekosistem olgunluğu Next.js tarafında daha güçlü.
- **SvelteKit**: Daha hafif ama ekip/kütüphane olgunluğu (Retell SDK örnekleri, Clerk entegrasyonu vb. genelde React/Next.js odaklı) React tarafında daha iyi.

**Sonuçlar:**
- (+) Tek deployment, tek repo, Vercel ile sürtünmesiz entegrasyon.
- (+) API route'ları ve dashboard aynı TypeScript tiplerini paylaşabilir.
- (–) Uygulama büyüdükçe (çoklu klinik, yüksek trafik) dashboard ve API'yi ayırma ihtiyacı doğabilir — bu, Faz 4/5'te yeniden değerlendirilecek.

---

## ADR-003: Veritabanı olarak PostgreSQL + Prisma

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi (kullanıcı onayı: 2026-09-27)

**Bağlam:**
Klinik–doktor–hasta–randevu arasında net ilişkisel (foreign key) bağlar var; randevu çakışma kontrolü gibi sorgular ilişkisel veritabanı modeline uygun.

**Karar:**
PostgreSQL (Vercel Postgres veya Neon üzerinden), Prisma ORM ile.

**Alternatifler:**
- **MongoDB**: Şema esnekliği randevu/çakışma gibi ilişkisel sorgular için avantaj sağlamaz, tersine karmaşıklaştırır.
- **Supabase (Postgres + ek servisler)**: Gerçek zamanlı özellikler (realtime subscriptions) RECALL'in MVP'sinde gerekli değil; Vercel Postgres/Neon ile Vercel entegrasyonu daha sade.
- **PlanetScale (MySQL uyumlu)**: Foreign key kısıtlamaları (constraints) konusunda Postgres kadar güçlü değil; randevu bütünlüğü için Postgres tercih edildi.

**Sonuçlar:**
- (+) Güçlü ilişkisel bütünlük (foreign key, unique constraint ile çifte randevu önleme).
- (+) Prisma ile tip güvenli sorgular, migration yönetimi kolay.
- (–) Vercel serverless fonksiyonlarında Postgres bağlantı havuzu (connection pooling) yönetimi dikkat gerektirir (Prisma Accelerate veya PgBouncer değerlendirilmeli) — bu, Faz 1 sırasında somut bir görev olarak ele alınacak.

---

## ADR-004: Dashboard auth için Clerk

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi (kullanıcı onayı: 2026-09-27)

**Bağlam:**
Klinik personelinin dashboard'a güvenli şekilde giriş yapması gerekiyor; MVP aşamasında auth altyapısını sıfırdan yazmak zaman kaybı.

**Karar:**
Clerk kullanılacak (Next.js için hazır middleware ve bileşenler sunuyor).

**Alternatifler:**
- **NextAuth.js (Auth.js)**: Ücretsiz ve esnek, ama kurumsal SSO/rol yönetimi gibi ileri özellikler için daha fazla manuel yapılandırma gerektirir.
- **Kendi auth sistemimiz**: Güvenlik riski ve geliştirme süresi açısından MVP için uygun değil.

**Sonuçlar:**
- (+) Hızlı kurulum, hazır UI bileşenleri, rol/organizasyon yönetimi (multi-tenant için Faz 4'te faydalı olacak).
- (–) Üçüncü taraf servise bağımlılık ve ek maliyet (kullanıcı sayısı arttıkça); alternatif olarak NextAuth'a geçiş gerekirse auth katmanı `lib/auth` altında soyutlanarak yazılacak.

---

## ADR-005: Sesli ajan platformunun Retell AI'dan Vapi'ye değiştirilmesi

- **Tarih:** 2026-09-27
- **Durum:** Kabul edildi (kullanıcı talimatı: "tüm md leri vapi ile devam edeceğiz ona göre güncelle")

**Bağlam:**
ADR-001'de Retell AI seçilmişti. Kullanıcı, projenin Vapi ile devam edeceğine karar verdi. Gerekçe kullanıcı tarafından ayrıntılandırılmadı; talimat doğrudan bir platform değişikliği kararı olarak alındı. ADR-001'de not edilen genel değerlendirme (Vapi'nin Retell'e yapısal olarak en yakın, kod-öncelikli orkestrasyon alternatifi olduğu) bu kararla tutarlı.

**Karar:**
Sesli ajan / telefoni orkestrasyon platformu olarak **Vapi** kullanılacak. Bu değişiklik doğrultusunda:
- `lib/retell/` → `lib/vapi/` olarak yeniden adlandırılır.
- `app/api/retell/*` → `app/api/vapi/*` olarak yeniden adlandırılır.
- Terminoloji güncellendi: Retell'deki "agent" ve "custom function" kavramları, Vapi'de sırasıyla **assistant** ve **tool (function)** olarak adlandırılıyor; webhook mekanizması Vapi'de **server message** (`end-of-call-report`, `status-update` vb.) olarak geçiyor.
- Ortam değişkeni adı `RETELL_API_KEY` → `VAPI_API_KEY`; ayrıca Vapi tarafında istek doğrulaması için `VAPI_SERVER_SECRET` eklendi.
- Tüm dokümantasyon dosyaları (`CLAUDE.md`, `ARCHITECTURE.md`, `PLAN.md`, `PLAN_ACTIONS.md`, `CONVENTIONS.md`) bu değişikliğe göre güncellendi.

**Alternatifler:**
ADR-001'de değerlendirilen diğer seçenekler (Bland AI, ElevenLabs Conversational AI, Vocode, Twilio ConversationRelay) bu kararda yeniden değerlendirilmedi; kullanıcı doğrudan Vapi'yi belirledi. İleride gerekirse bu alternatifler ADR-001'deki analiz temel alınarak tekrar gündeme gelebilir.

**Sonuçlar (trade-off'lar):**
- (+) Vapi, kod-öncelikli/geliştirici kontrollü bir orkestrasyon katmanı sunar; STT/LLM/TTS bileşenlerini ayrı ayrı seçebilme esnekliği ADR-001'de Retell için belirtilenle benzer düzeyde korunuyor.
- (+) `lib/vapi/` katmanının ince bir soyutlama olarak tasarlanmış olması (bkz. ARCHITECTURE.md) sayesinde bu geçiş, iş mantığı kodunu (`lib/scheduling`) etkilemeden yapılabildi — sadece entegrasyon katmanı ve dokümantasyon değişti.
- (–) Faz 0'da henüz Retell'e özgü hiçbir canlı entegrasyon kurulmadığı için (yalnızca dokümantasyon ve planlama aşamasındaydık) bu geçişin gerçek kod tarafında maliyeti yoktu; ileride benzer bir platform değişikliği ihtiyacı doğarsa (örn. Vapi → ElevenLabs), bu ADR'nin izlediği yol (soyutlama katmanını koru, terminolojiyi ve env değişkenlerini güncelle, ADR ekle) referans alınabilir.
- (–) Vapi'nin webhook/tool-call ayrımı Retell'inkinden birebir aynı değil (Vapi'de her ikisi de aynı "Server URL"e, mesaj tipine göre ayrışan payload'lar olarak gelebilir); bu nokta Faz 0/1 görevlerinde somut olarak netleştirilecekti — **netleştirildi, bkz. ADR-006.**

---

## ADR-006: Vapi entegrasyonunda tek Server URL kullanılması (webhook/tool-call ayrımı yok)

- **Tarih:** 2026-09-27
- **Durum:** Kabul edildi

**Bağlam:**
ADR-005'te Retell'den Vapi'ye geçiş kararı alınırken, ARCHITECTURE.md ve PLAN_ACTIONS.md, Retell'in iki-endpoint modelinden (`webhook` + `functions/*`) kalan bir varsayımla yazılmıştı ve bu nokta "Faz 0/1'de netleştirilecek" olarak açık bırakılmıştı. Vapi dokümantasyonu incelendi.

**Karar:**
Vapi'de webhook (bildirim) ve tool-call (senkron fonksiyon çağrısı) ayrı endpoint'ler değildir. İkisi de assistant/tool üzerinde tanımlı tek bir **Server URL**'e POST edilir; hangi mesaj olduğu gövdedeki `message.type` alanından anlaşılır. Dört mesaj tipi (`assistant-request`, `tool-calls`, `transfer-destination-request`, `knowledge-base-request`) senkron JSON yanıt gerektirir ve Vapi bu yanıtı canlı görüşmeyi yönlendirmek için kullanır; geri kalan tipler (`status-update`, `end-of-call-report` vb.) fire-and-forget bildirimdir, `200` yeterlidir.

Bu doğrultuda RECALL için:
- `app/api/vapi/webhook/` + `app/api/vapi/functions/*` yapısı **tek bir** `app/api/vapi/server/route.ts` ile değiştirilir.
- Route içinde `message.type`'a göre dispatch yapan bir `lib/vapi/server-handler.ts` yazılır; `tool-calls` tipi, `toolCalls[].function.name` alanına bakılarak `lib/vapi/tools/{check-availability,book-appointment,cancel-appointment,reschedule-appointment}.ts` fonksiyonlarına yönlendirilir.
- Server URL, Vapi tarafında şu hiyerarşiyle çözülür: tool → assistant → phone number → org (ilk tanımlı olan kullanılır). RECALL MVP'sinde sadeliği korumak için tek bir **assistant-level** Server URL tanımlanacak; ileride belirli bir tool'un farklı bir uca gitmesi gerekirse bu hiyerarşi kullanılabilir.
- Kimlik doğrulama: Vapi, `VAPI_SERVER_SECRET` değerini `Authorization: Bearer <secret>` (veya legacy `X-Vapi-Secret`) header'ı ile gönderir; route bu header doğrulanmadan hiçbir isteği işlemez.

**Alternatifler:**
- **Retell'deki gibi iki ayrı endpoint korunsun, route içinde birbirine yönlendirilsin:** Gereksiz dolaylama (indirection) katar; Vapi zaten tek URL + `message.type` modeliyle çalıştığı için bu, kod tabanını Vapi'nin doğal modeline karşı zorlamak olurdu.
- **Her tool için ayrı bir route/URL tanımlanması** (`tool.server.url` override'ı kullanılarak): Vapi'nin desteklediği bir model, ama MVP aşamasında gereksiz karmaşıklık; tek route + iç dispatch yeterli ve `lib/vapi/tools/` altında aynı ayrıştırma zaten sağlanıyor.

**Sonuçlar (trade-off'lar):**
- (+) Daha az endpoint, daha az Vapi dashboard yapılandırması (tek Server URL girilir).
- (+) `message.type` dispatch mantığı `lib/vapi/server-handler.ts`'te merkezi olduğu için yeni bir mesaj tipi eklemek (örn. ileride `transfer-destination-request`) tek yerden yönetilir.
- (–) Tüm mesaj tiplerinin tek route'a düşmesi, route dosyasının zamanla şişmesi riski taşır — bu risk, iş mantığının `lib/vapi/` altında ayrıştırılmasıyla (route sadece dispatcher) azaltılıyor (bkz. `CONVENTIONS.md` § dosya organizasyonu).
- Bu karar, PLAN_ACTIONS.md'deki ilgili açık noktayı kapatır.

---

---

## ADR-007: Next.js yerine ayrı Vite frontend + Express backend (monorepo)

- **Tarih:** 2026-09-27
- **Durum:** Kabul edildi

**Bağlam:**
ADR-002'de Next.js (tek uygulama, dashboard + API bir arada) kararı proje ekibi tarafından öneri olarak alınmış ve sonradan kullanıcı tarafından onaylanmıştı. Ancak kullanıcının paylaştığı **"Recall — Design System.md"** dokümanı, "mevcut frontend uygulaması"nın zaten **React + TypeScript + Vite** ile yazıldığını ve `apps/frontend/src/...` altında gerçek dosyalar (`pages/landing/LandingPage.tsx`, `pages/LoginPage.tsx`, `components/layout/SecretaryLayout.tsx`) içerdiğini gösteriyor. Bu, projenin fiilen Next.js ile değil, `apps/` klasörlemesine sahip bir **monorepo** yapısıyla geliştirilmekte olduğuna işaret ediyor — yani ADR-002'deki varsayım gerçekle örtüşmüyor.

**Karar:**
Next.js'ten vazgeçilip şu monorepo mimarisine geçilir:
- **`apps/frontend/`** — React + TypeScript + Vite, Tailwind CSS, Framer Motion (`motion`), `lucide-react`, Radix UI tabanlı bileşenler. Landing sayfası ve sekreter paneli (dashboard) burada. Tasarım/stil kuralları için tek kaynak: **`Recall — Design System.md`** (proje kökünde, bkz. `CLAUDE.md` § 6).
- **`apps/backend/`** — Node.js + TypeScript API sunucusu (**Express**), Vapi Server URL (`/api/vapi/server`, bkz. ADR-006), Prisma + PostgreSQL erişimi, Clerk backend doğrulaması burada çalışır. ADR-002'de değerlendirilip o zaman "gereksiz operasyonel yük" gerekçesiyle elenen "ayrı backend + ayrı frontend" alternatifi, gerçek kod tabanıyla örtüştüğü için burada seçilen model oldu.
- `pnpm` workspaces (`pnpm-workspace.yaml`) ile tek repo içinde iki paket yönetilir; paylaşılan TypeScript tipleri gerekirse `packages/shared-types` altında tutulur (Faz 1+'ta değerlendirilecek, MVP için zorunlu değil).
- Vercel'de **iki ayrı proje** olarak deploy edilir: `apps/frontend` statik Vite build'i, `apps/backend` Node/Express API'si (Vercel'in serverless Node runtime'ına uyarlanması gerekir — bkz. Açık nokta).

**Alternatifler:**
- **Next.js'te ısrar edip mevcut Vite kodunu Next.js'e taşımak (migrate):** Zaten çalışan, tasarım sistemi belgelenmiş bir frontend'i yeniden yazmak anlamına gelirdi — gereksiz kayıp ve risk.
- **Design System'i yalnızca stil rehberi olarak alıp teknoloji notlarını (Vite/React) yok saymak:** Dosyada geçen somut dosya yolları (`apps/frontend/src/...`) bunun sadece bir stil şablonu olmadığını, gerçek bir kod tabanını belgelediğini gösteriyor; bu sinyali görmezden gelmek ilerideki oturumlarda ciddi bir context kaybına yol açardı.

**Sonuçlar (trade-off'lar):**
- (+) Dokümantasyon artık gerçek kod tabanıyla uyumlu; bir sonraki session context kaybı yaşamadan devam edebilir.
- (+) Frontend (tasarım-yoğun, Vite'ın hızlı HMR'ı) ve backend (Vapi/Prisma entegrasyonu) net şekilde ayrışıyor; ADR-002'nin öngördüğü "tek deployment" avantajı kayboluyor ama ekip zaten ayrı bir frontend inşa etmiş durumda.
- (–) İki ayrı Vercel projesi/deployment, iki ayrı env değişkeni seti, CORS yapılandırması gibi ek operasyonel yük getiriyor — bu, ADR-002'de tam olarak kaçınılmak istenen şeydi, ama artık kaçınılmaz.
- (–) **Açık nokta:** Express'in Vercel serverless fonksiyon modeline nasıl uyarlanacağı (örn. `@vercel/node` ile catch-all handler, ya da geleneksel Node sunucusu için farklı bir host) netleştirilmedi — bu, `PLAN_ACTIONS.md`'de somut bir Faz 0 görevi olarak eklendi.
- (–) Clerk entegrasyonu ADR-004'te Next.js middleware'i varsayıyordu; artık frontend'de Clerk React SDK (Vite/SPA), backend'de Clerk backend SDK ile JWT doğrulaması gerekiyor — ADR-004'ün metni bu detayda güncelliğini yitirdi ama kararın özü (Clerk kullanımı) değişmedi, bu yüzden yeni ADR açılmadı, sadece bu not düşüldü.

---

## ADR-008: Express'in Vercel serverless fonksiyon modeline uyarlanması

- **Tarih:** 2026-09-27
- **Durum:** Kabul edildi

**Bağlam:**
ADR-007'de Express backend'in Vercel'e nasıl deploy edileceği açık nokta olarak bırakılmıştı. Vercel'in Node.js runtime'ı geleneksel bir "sürekli çalışan sunucu" değil, istek başına tetiklenen serverless fonksiyonlar çalıştırır. Express uygulamasının bu modele uyarlanması gerekiyor.

**Karar:**
`apps/backend/api/index.ts` dosyasında Express app'i doğrudan `export default` ile dışa açan bir catch-all handler kullanılacak. Vercel'in `@vercel/node` builder'ı, Express/Connect uyumlu uygulamaları otomatik olarak serverless fonksiyona sarar. `apps/backend/vercel.json` dosyasında tüm istekleri (`/(.*)`) bu handler'a yönlendiren bir `rewrites` kuralı tanımlanır — böylece Express'in kendi route'ları (örn. `/api/vapi/server`, `/api/health`) normal şekilde çalışır.

Yapı:
```
apps/backend/
├── api/index.ts        ← Vercel serverless giriş noktası (Express app'i re-export eder)
├── vercel.json         ← builds + rewrites yapılandırması
└── src/index.ts        ← Express app tanımı (lokal geliştirmede doğrudan çalışır)
```

Lokal geliştirmede `tsx watch src/index.ts` ile geleneksel Express sunucusu çalışır; production'da Vercel `api/index.ts` üzerinden serverless olarak çalıştırır.

**Alternatifler:**
- **Vercel'den başka bir host (Railway, Render, Fly.io):** Express'i geleneksel sunucu olarak çalıştırmak daha doğal olurdu ama proje Vercel'e bağlı (kullanıcı kararı), iki farklı platform yönetimi istenmiyor.
- **Express yerine Vercel'in kendi fonksiyon modeli (api/ dizininde dosya-bazlı route'lar):** Vapi tek Server URL modeli (ADR-006) nedeniyle zaten tek bir endpoint var; Express'in middleware zinciri (CORS, auth, body parsing) ve gelecekte eklenecek REST endpoint'leri için Express'i korumak daha verimli.
- **`vercel-express` veya `@vercel/node-bridge` gibi üçüncü parti adaptörler:** Gereksiz bağımlılık; Vercel'in kendi Node.js runtime'ı Express'i doğrudan destekliyor.

**Sonuçlar (trade-off'lar):**
- (+) Lokal geliştirme ve production aynı Express app'i kullanır, davranış farkı minimum.
- (+) Ekstra bağımlılık yok; `@vercel/node` zaten Vercel'in varsayılan Node.js builder'ı.
- (–) Serverless'ın cold start süresi var (ilk istek ~1-3s); Vapi'nin tool-call'ları senkron yanıt beklediği için bu gecikme fark edilebilir — Vercel'in "Fluid Functions" veya minimum instance ayarı ile ileride azaltılabilir.
- (–) Express'in `app.listen()` çağrısı serverless'ta çalışmaz; `src/index.ts`'teki `listen()` sadece lokal geliştirme için aktif, `api/index.ts` sadece app'i export eder.
- Bu karar, ADR-007'deki açık noktayı kapatır.

---

## ADR-009: Neon entegrasyonu için DATABASEV2_DATABASE_URL ve directUrl (UNPOOLED) kullanımı

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
Vercel ve Neon entegrasyonu kurulurken varsayılan `DATABASE_URL` ortam değişkeni ismiyle çakışma yaşandığından entegrasyon `DATABASEV2` prefix'i ile yapılandırılmıştır. Neon bu prefix altında iki temel bağlantı dizesi sağlar:
1. `DATABASEV2_DATABASE_URL`: Connection pooler (PgBouncer) arkasındaki havuzlu bağlantı (sunucu/serverless istekleri için).
2. `DATABASEV2_DATABASE_URL_UNPOOLED`: Doğrudan (unpooled) PostgreSQL bağlantısı.

Prisma ORM, connection pooler arkasından migration (`prisma migrate`) çalıştırırken transaction advisory lock'lar ve şema değişiklikleri nedeniyle doğrudan bağlantıya ihtiyaç duyar. Neon + Vercel entegrasyonlarında standart pratik `directUrl` tanımlamaktır.

**Karar:**
`apps/backend/prisma/schema.prisma` dosyasındaki `datasource db` bloğu hem havuzlu URL'i hem de `directUrl`'i kullanacak şekilde yapılandırıldı:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASEV2_DATABASE_URL")
  directUrl = env("DATABASEV2_DATABASE_URL_UNPOOLED")
}
```
- `apps/backend/.env` ve `apps/backend/.env.example` dosyalarına `DATABASEV2_DATABASE_URL` ve `DATABASEV2_DATABASE_URL_UNPOOLED` anahtarları eklendi.
- İlgili tüm dokümantasyon referansları güncellendi.

**Alternatifler:**
- `directUrl` kullanmamak: Migration'lar connection pooler üzerinden çalıştığında kilitlenme veya "prepared statement" hataları riski oluşur.
- Değişken adını `DATABASE_URL` yapmak için Vercel entegrasyonunu silip sıfırdan zorlamak: Gereksiz risk ve operasyonel maliyet; `DATABASEV2_*` ile açık ve sorunsuz çalışır.

**Sonuçlar:**
- (+) Serverless API istekleri havuzlu bağlantıyı (`url`), Prisma migration'ları doğrudan bağlantıyı (`directUrl`) kullanarak optimum performansta ve hatasız çalışır.
- (+) Vercel / Neon otomatik değişken adlandırmasıyla birebir uyum sağlandı.
- (–) Lokal geliştiricilerin `.env` dosyasında her iki değişkeni de tanımlaması gerekir (`.env.example` güncellendi).

---

## ADR-010: Vapi Tool Handlers, Randevu Çakışma Yönetimi ve Sekreter Dashboard REST API Mimarisi

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
Faz 1 kapsamında RECALL'in çekirdek işlevi olan uçtan uca sesli randevu alma akışı (Vapi asistanı ile konuşma) ve bu verilerin klinik sekreteri tarafından yönetileceği dashboard arayüzü kurulmuştur. Bu kapsamda:
1. Vapi tool çağrılarının (`check_availability`, `book_appointment`, `lookup_appointment`, `cancel_appointment`, `reschedule_appointment`, `transfer_call`) işlenmesi,
2. Çifte randevu (çakışma) riskinin veritabanı seviyesinde engellenmesi,
3. Hasta gizliliği (KVKK) uyarınca çağrı kayıtlarında teşhis/sağlık verisi saklanmaması,
4. Sekreter paneli için REST CRUD API'larının Clerk JWT ile korunması gerekiyordu.

**Karar:**
1. **Tool Handlers & Giriş Doğrulama:**
   - Her tool handler (`src/lib/vapi/tools/*.ts`) Zod şeması ile parametreleri doğrular.
   - LLM'lerin parametre adlandırmasındaki değişkenliklerine karşı (örn. `doctorName` / `doctor_name`, `date` / `newDate`) toleranslı şemalar kullanıldı.
   - Tool yanıtları Vapi'nin doğrudan seslendirebileceği doğal Türkçe cümleler olarak formatlandı.
2. **Randevu Çakışma Önleme (Transactions):**
   - Tüm randevu oluşturma ve yeniden planlama işlemleri Prisma `$transaction` içinde çalıştırılır.
   - Belirlenen doktor ve zaman aralığı (`startsAt < newEndsAt && endsAt > newStartsAt`) kontrol edilir. Çakışma varsa `SLOT_OCCUPIED` hatası fırlatılarak işlem geri alınır (rollback) ve kullanıcıya kibar bir alternatif seçme mesajı dönülür.
3. **Çağrı Kaydı ve Gizlilik:**
   - `end-of-call-report` webhook'u ile `call_logs` tablosuna kayıt oluşturulur.
   - Özetler operasyonel kategori ("Randevu Talebi", "Randevu İptali", "Randevu Değişikliği", "Genel Bilgi") ile etiketlenir; hasta sağlık/teşhis detayları arındırılır.
   - Çağrı esnasında oluşturulan randevular, `CallLog` ID'si ile (`createdViaCallId`) ilişkilendirilir ve dashboard'da "Vapi AI" kanalı olarak etiketlenir.
4. **Dashboard REST API & Auth:**
   - `/api/appointments`, `/api/call-logs`, `/api/doctors`, `/api/stats` endpoint'leri Express üzerinde oluşturuldu.
   - Clerk backend SDK (`@clerk/backend`) ile `requireAuth` middleware'i eklendi; local geliştirmede placeholder anahtarlarla çalışmayı engellemeyecek dev fallback mekanizması kuruldu.

**Sonuçlar:**
- (+) Asistan ve sekreter aynı PostgreSQL veritabanını concurrency korumasıyla paylaşır; çifte randevu imkansız hale getirildi.
- (+) Sekreter dashboard'u tüm randevu, arama ve doktor kayıtlarını anlık filtrelerle yönetebilir.
- (+) KVKK ve veri minimizasyonu ilkelerine tam uyum sağlandı.

---

<!--
YENİ ADR EKLEME ŞABLONU:

## ADR-00X: <karar başlığı>

- **Tarih:** YYYY-MM-DD
- **Durum:** Kabul edildi / Reddedildi / Değiştirildi (bkz. ADR-00Y)

**Bağlam:**


**Karar:**


**Alternatifler:**


**Sonuçlar:**

-->
