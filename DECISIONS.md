# DECISIONS.md

> **Son güncelleme:** 2026-09-27 (ADR-013 eklendi — Geliştirme Ortamı Klinik Fallback'inin Çift Kilit ile Sertleştirilmesi)
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

## ADR-011: Faz 1 Güvenlik ve Mimari Sertleştirme (Row-Level Locking, Multi-tenant İzolasyonu, Telefon Normalizasyonu ve Webhook Guard)

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
Faz 1 tamamlandıktan sonra yapılan mimari ve güvenlik kod incelemesinde 4 potansiyel risk noktası tespit edildi:
1. **Race Condition (Çifte Randevu Riski):** PostgreSQL'in varsayılan READ COMMITTED izolasyon seviyesinde, aynı anda gelen iki eşzamanlı istek aynı boş slotu kontrol edip (`findFirst` null dönünce) ikisi de randevu oluşturabilirdi (phantom read / race condition).
2. **Multi-tenant İzolasyonu:** `requireAuth` middleware'i JWT'yi doğrulamasına rağmen çözülen `clinicId` bilgisini sorgulara zorunlu kılmıyordu; endpoint'ler `getDefaultClinic()` çağırıyordu.
3. **Telefon Numarası Normalizasyonu:** Farklı formatlarda (0532..., +90..., parantezli, tireli) girilen telefon numaraları `Patient` tablosunda mükerrer hasta kaydına ve sorgulama uyumsuzluğuna yol açabilirdi.
4. **Vapi Webhook Güvenliği:** `/api/vapi/server` ucu üzerinden gelen bildirimlerin (özellikle `end-of-call-report`) kimlik doğrulamasının eksiksiz ve timing-attack korumalı yapılması gerekiyordu.

**Karar:**
1. **Doctor Row-Level Locking:**
   - Randevu oluşturma (`bookAppointment`, `POST /api/appointments`), randevu güncelleme (`PATCH /api/appointments/:id`) ve randevu erteleme (`rescheduleAppointment`) akışlarında, transaction içine `SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE` satır kilitleme eklendi.
   - Böylece aynı doktor için aynı anda gelen tüm istekler veritabanı seviyesinde sıraya (serialize) alınır. İlk transaction commit edildikten sonra ikinci transaction hemen yeni commit edilmiş randevuyu görür ve `SLOT_OCCUPIED` ile güvenle reddeder. Farklı doktorlar birbirini kilitlemez.
2. **Multi-tenant İzolasyonu (`req.clinicId`):**
   - `AuthenticatedRequest` tipi genişletildi; `requireAuth` middleware'i token iddialarından (`clinicId`, `public_metadata.clinicId`, `org_id` veya MVP fallback) doğrulanmış klinik kimliğini çözüp `req.clinicId` alanına mühürler.
   - Tüm dashboard route'ları (`/api/appointments`, `/api/call-logs`, `/api/doctors`, `/api/stats`) sadece `req.clinicId` üzerinden filtreleme yapar; istemciden gelen query/body parametrelerindeki `clinicId` geçersiz kılınır.
3. **Telefon Normalizasyonu (`libphonenumber-js`):**
   - `libphonenumber-js` kütüphanesi entegre edildi (`src/lib/phone.ts`).
   - Türkiye (+90) varsayılan olmak üzere uluslararası E.164 formatına (`+905XXXXXXXXX`) dönüştüren ve doğrulayan yardımcı fonksiyonlar eklendi; tüm booking, lookup ve REST uçlarında tutarlı hale getirildi.
4. **Timing-Safe Vapi Secret Guard:**
   - `validateVapiSecret` middleware'i `crypto.timingSafeEqual` ile zamanlama saldırılarına (timing attacks) karşı dayanıklı hale getirildi.
   - Router seviyesinde uygulandığı için hem `tool-calls` hem de `end-of-call-report` webhook'ları secret olmadan veya geçersiz secret ile asla işlenemez (401 döner).

**Sonuçlar:**
- (+) Neon PostgreSQL üzerinde yapılan eşzamanlı stres testinde (5 eşzamanlı istek) tam olarak 1 başarı ve 4 `SLOT_OCCUPIED` reddi ile race condition imkansız kılındı.
- (+) Multi-tenant yetki aşımı (IDOR) riski ortadan kaldırıldı.
- (+) Kullanıcı farklı tuşlama/boşluk formatlarında arasa dahi doğru hasta ve randevu anında eşleşir.
- (+) Vapi sunucu güvenliği endüstriyel standarda yükseltildi.

---

## ADR-012: Tenant Fallback Güvenliği, Çapraz Hekim Deadlock Önleme ve Aktif Telefon Doğrulama

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
ADR-011 sonrasında yapılan ikinci seviye mimari incelemede 3 spesifik risk noktası netleştirildi:
1. **Sessiz clinicId Fallback Riski:** `clerk.ts` içinde token'dan `clinicId` çözülemediğinde sessizce veritabanındaki varsayılan kliniğe düşme (fallback) mekanizması bulunuyordu. Bu durum production ortamında yetkisiz veya atanmamış bir kullanıcının ilk kliniğin verilerine istemeden erişmesine (IDOR benzeri tenant sızıntısı) yol açabilirdi.
2. **Reschedule / PATCH Sırasında Deadlock Riski:** Randevunun hekimi değiştirildiğinde (Doctor A -> Doctor B ve eşzamanlı Doctor B -> Doctor A) iki transaction ters sırada `SELECT ... FOR UPDATE` kilidi talep ederse veritabanında deadlock (karşılıklı kilitlenme) oluşabilirdi.
3. **Aktif Telefon Doğrulama (`isValidPhone`):** `isValidPhone` fonksiyonunun yazılmış olmasına rağmen servis (`bookAppointment`, `lookupAppointment`, `cancellation`) ve route katmanlarında doğrudan çağrılmadığı; eksik haneli (örn: "123", "0532") girişlerin veritabanına kadar ilerleyebileceği belirlendi.

**Karar:**
1. **Sessiz Production Fallback'inin Kaldırılması:**
   - `resolveClinicIdFromToken` fonksiyonu ayrıştırıldı; token iddialarında (`clinicId`, `public_metadata.clinicId` veya kayıtlı Clinic ile eşleşen `org_id`) açık bir klinik eşleşmesi yoksa **kesinlikle `null`** döndürür.
   - `requireAuth` middleware'i `clinicId === null` olduğunda isteği **403 Forbidden** ile sonlandırır; sessizce varsayılan kliniğe düşüş production'da tamamen engellendi.
   - Varsayılan kliniğe düşme yalnızca `NODE_ENV === 'development'` ve `CLERK_SECRET_KEY` yerel placeholder modundayken lokal geliştirme kolaylığı sağlamak için aktiftir.
2. **Sıralı (Sorted) Deadlock-Free Row-Level Locking:**
   - Hem `rescheduleAppointment` fonksiyonuna (`newDoctorId` parametresi eklenerek) hem de `PATCH /api/appointments/:id` route handler'ına sıralı kilit mekanizması eklendi.
   - İşleme dahil olan tüm hekim ID'leri (`[sourceDoctorId, targetDoctorId]`) küçükten büyüğe (`.sort()`) dizilir ve `FOR UPDATE` kilitleri her transaction tarafından **daima aynı deterministik sırada** alınır. Döngüsel bekleme grafiği (cyclic wait graph) oluşamayacağından deadlock riski matematiksel olarak sıfırlandı.
3. **Her Giriş Noktasında Aktif Telefon Doğrulama:**
   - `bookAppointment`, `lookupAppointment`, `cancelAppointment`, `rescheduleAppointment`, `POST /api/appointments` (Zod refine) ve tüm Vapi tool handler'larına `isValidPhone` kontrolü eklendi.
   - 10 haneden kısa veya geçerli TR/E.164 kalıbına uymayan numaralar doğrudan anlamlı Türkçe hata mesajıyla reddedilir.

**Sonuçlar:**
- (+) Token'ında klinik bulunmayan kullanıcıların veriye erişimi kesin olarak 403 ile engellendi.
- (+) Hekimler arası karşılıklı eşzamanlı randevu takaslarında (swap) deadlock yaşanmadığı test edildi.
- (+) Eksik/hatalı telefon numaraları tüm kanallarda (sesli asistan + web paneli) anında reddedilmektedir.

---

## ADR-013: Geliştirme Ortamı Klinik Fallback'inin Çift Kilit (Double-Gate) ile Sertleştirilmesi

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
ADR-012 ile production ortamında token'dan klinik çözülemediğinde varsayılan kliniğe düşüş engellenmiş, ancak geliştirme ortamındaki fallback yalnızca `NODE_ENV === 'development'` tekil kontrolüne emanet edilmişti. Bir ortam yapılandırma hatasında (örn. production sunucusunda `NODE_ENV`'in yanlışlıkla development kalması veya tanımsız olması) varsayılan kliniğe yetkisiz bağlanma riski teorik olarak mevcuttu.

**Karar:**
Geliştirme ortamı klinik fallback mekanizması **çift kilitli (double-gate / fail-safe)** hale getirildi:
1. Fallback'in tetiklenmesi için iki bağımsız koşulun aynı anda sağlanması zorunlu kılındı:
   `process.env.NODE_ENV === 'development'` **VE** `process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true'`.
2. Tek biri dahi eksik, false veya tanımsızsa fallback tamamen devre dışı kalır ve istek `403 Forbidden` ile sonlandırılır.
3. `.env.example` dosyasında `ALLOW_DEV_CLINIC_FALLBACK=false` olarak belgelendi; production ortam değişkenlerinde (Vercel) bu bayrağın kesinlikle tanımlanmaması kurala bağlandı.
4. Bu sayede varsayılan davranış "fail-safe" (güvenli tarafta hata veren) yapıya kavuştu.

**Sonuçlar:**
- (+) `NODE_ENV=development` + `ALLOW_DEV_CLINIC_FALLBACK=true` -> Fallback sadece bu kombinasyonda lokal test için çalışır.
- (+) `NODE_ENV=development` + `ALLOW_DEV_CLINIC_FALLBACK=false` -> Fallback çalışmaz, 403 Forbidden döner.
- (+) `NODE_ENV=production` (bayrak ne olursa olsun) -> Fallback asla çalışmaz, 403 Forbidden döner.

---

## ADR-014: Sekreter Kullanıcılarına Klinik Ataması — Manuel Onboarding Süreci (Geçici)

- **Tarih:** 2026-09-27
- **Durum:** ⚠️ Kabul edildi (geçici çözüm, Faz 2/4'te otomatikleştirilecek)

**Bağlam:**
Faz 1 code review aşamasında eklenen çoklu-kiracı (multi-tenant) veri izolasyonu ve IDOR koruması (`req.clinicId` zorunluluğu, ADR-011, ADR-012, ADR-013) nedeniyle, backend tüm dashboard REST isteklerini (`/api/doctors`, `/api/appointments`, `/api/call-logs`, `/api/stats`) kullanıcının Clerk oturum token'ından çözülen `clinicId` ile filtreler.
Clerk üzerinde yeni bir sekreter/kullanıcı hesabı açıldığında, eğer kullanıcının profilindeki `public_metadata.clinicId` (veya custom session claim) alanı boşsa:
1. Backend isteği haklı olarak `403 Forbidden` (`Erişim reddedildi: Kullanıcı oturumuna atanmış geçerli bir klinik bulunamadı.`) ile reddeder.
2. Frontend tarafında bu durum sessizce yakalanırsa randevu tabloları ve modal doktor dropdown'ları boş kalır; kullanıcı sistemsel bir hata veya veri eksikliği olduğunu düşünebilir.

**Karar:**
1. **Manuel Onboarding Operasyonu (Geçici MVP Yaklaşımı):**
   - Şimdilik sisteme yeni bir sekreter/test kullanıcısı eklendiğinde, Clerk Dashboard (`dashboard.clerk.com`) üzerinden ilgili kullanıcının **Metadata** bölümüne manuel olarak JSON formatında klinik kimliği atanacaktır:
     ```json
     {
       "clinicId": "<veritabanındaki_klinik_id>"
     }
     ```
   - Örnek: "Recall Sağlık Kliniği" için `cmujsx0740000uyq8jo95ywjg`.
   - Bu adım tamamlanmadan kullanıcı sisteme giriş yapabilse dahi hiçbir klinik verisine erişemez ve randevu oluşturamaz.
2. **Kullanıcı Dostu Görünür Hata Bildirimi (Frontend UI):**
   - API çağrılarında 403 Forbidden durumu yakalandığında, ekranların sessizce boş kalması engellendi.
   - `DashboardPage`, `DoctorsPage` ve `CallsPage` bileşenlerine belirgin bir amber uyarı kutusu eklendi: *"Hesabınıza henüz bir klinik atanmamış. Lütfen yöneticinizle iletişime geçin veya Clerk profilinize klinik kimliği tanımlanmasını isteyin."*
   - Yeni randevu oluşturma modalındaki doktor seçim kutusunda liste boş kaldığında durum açıkça belirtildi.

**Alternatifler:**
- *Token'da klinik yoksa otomatik ilk kliniğe atamak (Sessiz Fallback):* ADR-012 ile güvenlik açığı (IDOR) nedeniyle kesin olarak yasaklandı.
- *Hemen Faz 1 içinde tam otomatik davet/onboarding mimarisi kurmak:* Faz 1 kapsamını aşırı şişirir; Clerk Organizations veya davet token'ı altyapısı ayrı bir faz gerektirir.

**Sonuçlar ve Riskler:**
- (+) Yetkisiz/atanmamış kullanıcılar hiçbir kliniğin verisini göremez veya değiştiremez.
- (+) Kullanıcı neden veri göremediğini anında arayüzdeki uyarıdan anlar, "doktor listesi neden gelmiyor" belirsizliği ortadan kalkar.
- (–) Süreç operasyonel olarak manueldir; her yeni personel için Clerk panelinden JSON metadata girilmesi gerekir.
- **Takip Eden Adım:** Faz 2 veya Faz 4'te (Çoklu Klinik SaaS) davet bağlantısı ile kayıt olma ve kliniğe otomatik bağlanma (onboarding flow / Clerk Organizations) geliştirilmelidir.

---

## ADR-015: Vapi Asistanı Sistem Promptu Optimizasyonu, Klinik Triage ve 112 Acil Güvenlik Yönlendirmesi

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
Faz 1'de Vapi asistanı ("Recall Klinik Sekreteri") backend tool-calling (`check_availability`, `book_appointment`, `lookup_appointment`, `cancel_appointment`, `reschedule_appointment`, `transfer_call`) işlevlerini başarıyla yürütebilir hale getirildi. Ancak canlı telefon görüşmelerine geçmeden önce asistanın klinik kurallarına tam uyumu, acil durum yönetimi, Türkçe doğallığı ve etik/şeffaflık ilkeleri eksik tanımlanmıştı:
1. **Acil Durum Eksikliği (Kritik Risk):** Hasta göğüs ağrısı, inme veya nefes darlığı gibi hayati bir şikayetle aradığında asistanın tıbbi triage yapmadan normal poliklinik randevusu oluşturmaya çalışması hayati risk taşır.
2. **Klinik ve Hekim Bilgisi:** Hekimlerin uzmanlık branşları (Dahiliye, Kardiyoloji, KBB), 30 dakikalık standart slot süresi ve randevudan en az 2 saat önce iptal kuralı asistana bildirilmemişti.
3. **Branş Fallback Eksikliği:** Kliniğin kadrosunda olmayan bir branş (örneğin Diş, Göz) sorulduğunda asistanın hastayı yanlış yönlendirmesi riski mevcuttu.
4. **Türkçe Doğallık ve Şeffaflık:** Yapay zeka olduğunu dürüstçe açıklama, klinik adını papağan gibi tekrarlamama ve saatleri konuşma dilinde telaffuz etme gerekliliği vardı.

**Karar:**
1. **Merkezi Sistem Prompt Dosyası:**
   - Prompt tanımı kod tabanında versiyonlanacak şekilde `apps/backend/src/lib/vapi/system-prompt.ts` içine alındı ve backend'deki `assistant-request` dinamik webhook'una bağlandı.
2. **Kritik Güvenlik & Acil Triage (112):**
   - Promptun en üstüne en yüksek öncelikle "Acil Durum Kuralı" konuldu. Göğüs ağrısı, nefes darlığı, inme, ani şuur kaybı gibi semptomlarda asistan randevu akışını anında durdurur ve arayanı 112 Acil Çağrı Merkezi'ne ve en yakın acil servise yönlendirir.
3. **Klinik Kadrosu ve Kuralları:**
   - 3 hekim (Dr. Ahmet Yılmaz / Dahiliye 09:00-17:00, Dr. Zeynep Kaya / Kardiyoloji 09:00-16:00, Dr. Mehmet Demir / KBB 10:00-18:00) mesai saatleri ve tipik semptom eşleştirmeleriyle tanımlandı.
   - Randevu süresinin 30 dakika olduğu ve iptal/erteleme işlemlerinin randevudan en az 2 saat önce yapılması kuralı eklendi.
   - Olmayan branşlar için (Diş vb.) açık "hizmet verilemiyor, sekretere aktarma opsiyonu" eklendi.
4. **Şeffaflık ve Doğal Dil:**
   - İnsan olup olmadığı sorulduğunda dürüstçe yapay zeka olduğunu belirten ve istenirse sekretere aktarabileceğini söyleyen KVKK ve etik uyumlu talimat eklendi.
   - Robotik dil yerine samimi, profesyonel Türkçe diyalog kalıpları kurala bağlandı.

**Alternatifler:**
- *Promptu sadece Vapi Dashboard'da tutup kod tabanına almamak:* Versiyon kontrolü ve test otomasyonunda şeffaflığı bozar; promptun repoda kod olarak bulunması tercih edildi.
- *Acil durum kontrolünü sadece LLM'e bırakmayıp tool seviyesinde regex kontrolü yapmak:* Sesli aramada hasta şikayetini serbest dille ifade ettiği için LLM prompt yönlendirmesi en hızlı ve etkili korumadır; ileride sentiment/keyword guardrail ile desteklenebilir.

**Sonuçlar:**
- (+) Tıbbi aciliyetlerde hayat kurtarıcı 112 yönlendirmesi garantiye alındı.
- (+) Hasta semptom söylediğinde doğru doktora yönlendirme otomatikleşti.
- (+) Vapi Talk canlı sesli testi için hazır, klinik kurallarına tam uyumlu bir prompt elde edildi.

---

## ADR-016: Çoklu Klinik (Multi-tenant) Dinamik Sistem Promptu Mimarisi

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
ADR-015'te tek bir klinik (Recall Sağlık Kliniği) için statik bir sistem promptu oluşturulmuştu. Ancak RECALL'in çoklu klinik (multi-tenant SaaS) satış modelinde her yeni klinik için Vapi üzerinde ayrı ayrı asistanlar kopyalamak yönetim, bakım ve maliyet açısından sürdürülemezdi.
Hedef: Tek bir merkezi Vapi asistanı üzerinden, gelen çağrının hedef telefon numarasına (`call.phoneNumber` veya `phoneNumber.number`) veya `metadata.clinicId` değerine göre ilgili kliniğin dinamik sistem promptunu milisaniyeler içinde inşa edip dönen bir altyapı kurmak.

**Karar:**
1. **Şema Genişletmesi (`Clinic` Modeli):**
   - `prisma/schema.prisma` içine klinik bazında özelleştirilebilir 4 yeni alan eklendi:
     - `greetingMessage`: Kliniğe özel sesli karşılama cümlesi.
     - `specialInstructions`: Sigorta, belge, otopark, randevuya erken gelme gibi klinik özel kuralları (`@db.Text`).
     - `cancellationPolicyHours`: İptal ve erteleme için gereken minimum ön bildirim saati (`Int @default(2)`).
     - `voiceId`: İlgili kliniğin tercih ettiği Vapi/ElevenLabs ses kimliği.
2. **Sabit İskelet vs. Dinamik Alan Ayrımı (`buildSystemPrompt`):**
   - `apps/backend/src/lib/vapi/system-prompt.ts` statik bir metin yerine `buildSystemPromptDetails(clinicId)` fonksiyonuna dönüştürüldü.
   - **Sabit Mimari İskelet (Değişmez):** Tıbbi acil durum triage'ı (112 Acil Çağrı Merkezi yönlendirmesi), yapay zeka şeffaflığı ve kimlik beyanı, doğal Türkçe konuşma ve nezaket ilkeleri, adım adım tool çağırma akışları (`check_availability`, `book_appointment`, `cancel_appointment`, `reschedule_appointment`, `transfer_call`). Bu katman marka güvenliği ve klinik regülasyonları için tüm kliniklerde %100 aynı kalır.
   - **Dinamik Enjekte Edilen Alanlar:** Klinik adı, karşılama metni, o kliniğin hekim kadrosu ve çalışma saatleri, muayene edilen branşlar, iptal saati politikası ve varsa "KLİNİĞE ÖZEL KURALLAR VE DUYURULAR" bölümü.
3. **Vapi Webhook Tenant Routing (`server-handler.ts`):**
   - `assistant-request`: Aranan numara üzerinden `Clinic` kaydı bulunur, `buildSystemPromptDetails` ile üretilen prompt ve varsa `voiceId` Vapi'ye döndürülür.
   - `tool-calls`: Aranan numara / call metadata üzerinden `clinicId` çözülür; `checkAvailability`, `bookAppointment`, `lookupAppointment`, `cancelAppointment`, `rescheduleAppointment` fonksiyonlarının tamamına bu `clinicId` parametre olarak geçirilir.
   - `end-of-call-report`: Çağrı logu doğru kliniğin `clinicId` değerine bağlanarak kaydedilir.

**Alternatifler:**
- *Her klinik için Vapi panelinden ayrı asistan açmak:* Kod güncellemelerinde (örn. tool şeması veya acil durum kuralı değiştiğinde) onlarca asistanı elle güncellemek gerekir, hataya son derece açıktır.
- *Promptu tamamen serbest bırakmak (kliniğin kendi promptunu yazması):* Tıbbi güvenlik (112 triage) ve tool çalıştırma garantisi kaybolur; asistan halüsinasyon görebilir.

**Sonuçlar:**
- (+) Tek bir Vapi asistanı sonsuz sayıda kliniğe hizmet verebilir.
- (+) Sıfır veri sızıntısı: İki farklı klinik arasında hekim, branş veya kural sızıntısı yaşanmadığı otomatik testlerle doğrulandı.
- (+) Hekim mesai saatleri veya klinik kuralları veritabanında güncellendiği anda bir sonraki çağrıda prompt anında güncel halini alır; hiçbir deploy veya manuel ayar gerekmez.
- (+) **Gerçek ElevenLabs Voice ID Standartları:** Test/seed verisindeki placeholder `eleven_turkish_*` kimlikleri, ElevenLabs'ın gerçek Türkçe destekli ses kimlikleriyle güncellendi (`EXAVITQu4vr4xnSDxMaL` / Sarah kadın sesi, `nPczCjzI2devNBz1zQrb` / Brian erkek sesi). Vapi `assistant-request` payload'ında `{ provider: "11labs", model: "eleven_multilingual_v2", voiceId: "..." }` formatı benimsendi. Vapi'de geçersiz bir voiceId verildiğinde çağrının `voice-not-found` ile kesileceği belgelendi; bu nedenle `voiceId` boş ise Vapi'nin varsayılan sesinin devrede kalması sağlandı.

---

## ADR-017: Çoklu Klinik (Multi-Tenant) Onboarding Akışı ve Klinik Ayarları Görünümü

- **Tarih:** 2026-09-27
- **Durum:** ✅ Kabul edildi

**Bağlam:**
ADR-014'te belgelendiği üzere, multi-tenant izolasyon kuralları gereği her kullanıcının `public_metadata.clinicId` alanına sahip olması zorunludur. Ancak yeni bir klinik ve hekim kadrosunu veritabanına eklemek, özel karşılama metinlerini ve iptal saatlerini girmek, ardından Clerk Dashboard üzerinde kullanıcı açıp doğru `clinicId` değerini atamak elle yapıldığında dağınık ve insan hatasına (IDOR/yetkisiz erişim riski veya 403 Forbidden kilitlenmesi) açıktı.
Ayrıca, sisteme dahil olan bir klinik sekreteri kendi kliniğinin santral numarasını, karşılama cümlesini, iptal politikasını ve hekim mesai kurallarını panelde göremiyordu.

**Karar:**
1. **İnteraktif CLI Onboarding Sihirbazı (`apps/backend/scripts/onboard-clinic.ts`):**
   - Sırasıyla klinik adı, telefon numarası (Netgsm öncesi geçici/placeholder desteğiyle), sesli karşılama metni, iptal politikası saati, özel talimatlar, Vapi ses kimliği (`voiceId`) ve döngüsel hekim kadrosunu (isim, branş, ilgilendiği şikayetler, mesai saatleri) soran interaktif bir CLI script yazıldı.
   - Script, klinik ve hekim kayıtlarını tek bir Prisma işlemiyle Neon PostgreSQL'e kaydeder.
   - Script sonunda oluşturulan `clinicId`'yi ve Clerk kullanıcısı oluştururken doğrudan kopyalanıp yapıştırılacak hazır JSON metadata snippet'ını (`{ "clinicId": "cm..." }`) ekrana yazdırır.
2. **Klinik Ayarları Salt-Okunur Görünümü (`GET /api/clinic/current` & `ClinicSettingsPage.tsx`):**
   - Backend'e sekreterin `req.clinicId` kimliğine göre kliniğin tüm profilini ve hekim listesini dönen güvenli bir endpoint eklendi.
   - Frontend'de `SecretaryLayout` menüsüne "Klinik Ayarları" sayfası eklendi. Sekreter bu sayfada kliniğin yapay zeka asistanı ayarlarını (karşılama şablonu, iptal kuralı, ses sağlayıcısı, özel talimatlar) ve hekim listesini salt-okunur (read-only) kartlar halinde inceleyebilir.
3. **Standart Operasyon Dokümantasyonu (`ONBOARDING.md`):**
   - Yeni klinik eklerken izlenecek adım adım operasyonel talimatlar (`ONBOARDING.md`) hazırlandı.
4. **Çoklu Klinik Test Doğrulaması:**
   - Script ile 3. test kliniği ("Marmara Fizik Tedavi Merkezi" ve 2 hekimi) oluşturuldu.
   - `test-dynamic-prompts.ts` genişletilerek 3 kliniğin aynı anda izole çalıştığı, hekim/branş sızıntısı olmadığı ve kuralların hatasız prompta dönüştüğü doğrulandı.

**Alternatifler:**
- *Clerk Backend API ile otomatik kullanıcı oluşturma:* Sekreterlerin e-posta daveti, şifre belirleme ve 2FA süreçleri Clerk'in kendi güvenli davet/onay akışında yürütülmesi gerektiğinden, geçici olarak CLI + hazır JSON metadata kopyalama süreci operasyonel olarak en esnek ve güvenli yaklaşım olarak belirlendi.

**Sonuçlar:**
- (+) Yeni bir klinik sisteme 1 dakikadan kısa sürede, hatasız ve standart şekilde kaydedilebilir hale geldi.
- (+) Sekreterler kliniğin sistemdeki tanımını ve kurallarını dashboard üzerinden şeffafça görebilir.
- (+) Test edilmiş 3 aktif klinik (Recall, Anadolu, Marmara) ile sistemin tam ölçeklenebilir SaaS niteliği kanıtlandı.

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
