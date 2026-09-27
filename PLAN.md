# PLAN.md

> **Son güncelleme:** 2026-09-27 (Faz 0 Vite/Express monorepo mimarisine göre güncellendi — bkz. ADR-007)
> **Bu dosya:** Projenin uzun vadeli yol haritasıdır. Somut, checkbox'lı görevler için `PLAN_ACTIONS.md`'ye bakınız.

## 1. Proje Hedefleri ve Kapsamı

**Vizyon:** Tıbbi kliniklerin telefon trafiğini yapay zeka ile karşılayarak randevu alma/iptal/değiştirme süreçlerini otomatikleştirmek; personelin telefon başında harcadığı zamanı azaltmak, randevu kaçırma (no-show) oranını düşürmek.

**Kapsam içi (MVP ve sonrası):**
- Inbound sesli aramaları karşılayan AI assistant (Vapi)
- Randevu oluşturma, iptal etme, değiştirme
- Müsaitlik/çakışma kontrolü
- Klinik personeli için web dashboard (randevu ve arama geçmişi görüntüleme)
- SMS/email hatırlatmaları
- Çoklu klinik desteği (multi-tenant)

**Kapsam dışı (şimdilik):**
- Outbound (dışarı giden) hatırlatma aramaları — Faz 5'e kadar ertelendi
- Tıbbi teşhis/tavsiye içeren herhangi bir konuşma — RECALL yalnızca randevu lojistiği ile ilgilenir, sağlık tavsiyesi vermez
- Ödeme/faturalandırma entegrasyonu
- Mobil native uygulama (dashboard yalnızca web)

## 2. Fazlar

### Faz 0 — Altyapı Kurulumu
**Hedef:** Geliştirmeye başlamak için gereken tüm temel altyapının hazır olması.
- GitHub repo oluşturma, Vercel projesine bağlama
- Vite frontend + Express backend proje iskeleti (monorepo, `apps/frontend` + `apps/backend`)
- Prisma + Postgres bağlantısı, ilk şema
- Vapi hesabı açma, test assistant'ı oluşturma
- Ortam değişkenlerinin (env) tanımlanması
- 7 dokümantasyon dosyasının kurulması (bu dosyalar)

**Bitti sayılma kriteri:** `pnpm dev` lokal olarak çalışıyor, Vercel'e boş bir "hello world" deploy edilmiş, Vapi test hesabından örnek bir arama yapılıp `end-of-call-report` webhook'unun Vercel'e ulaştığı doğrulanmış.

### Faz 1 — MVP: Tek Klinik, Temel Randevu Akışı
**Hedef:** Tek bir klinik için inbound aramayla randevu alma/iptal/değiştirme uçtan uca çalışsın.
- Veritabanı şeması: clinics, doctors, patients, appointments, call_logs
- `check_availability`, `book_appointment`, `cancel_appointment`, `reschedule_appointment` tool (function) endpoint'leri
- Vapi assistant prompt/konuşma akışı tasarımı (Türkçe), model/voice/transcriber seçimi
- Temel hata durumları (müsait saat yok, geçersiz tarih vb.)

**Bitti sayılma kriteri:** Gerçek bir test telefonuyla aranıp randevu oluşturulabiliyor, iptal edilebiliyor, değiştirilebiliyor; tüm bu işlemler veritabanında doğru şekilde görünüyor.

### Faz 2 — Dashboard
**Hedef:** Klinik personeli randevuları ve arama geçmişini web üzerinden görüp yönetebilsin.
- Clerk ile auth
- Randevu listesi/takvim görünümü
- Arama geçmişi + transkript görüntüleme
- Manuel randevu ekleme/düzenleme/iptal

**Bitti sayılma kriteri:** Personel giriş yapıp o günün/haftanın randevularını görebiliyor, bir aramanın transkriptini okuyabiliyor, manuel değişiklik yapabiliyor.

### Faz 3 — Bildirimler
**Hedef:** Randevu onayı ve hatırlatmalarıyla no-show oranını azaltmak.
- SMS (Twilio) ile randevu onay mesajı
- Randevudan N saat önce otomatik hatırlatma (Vercel Cron)
- Email bildirimi (Resend) — opsiyonel kanal

**Bitti sayılma kriteri:** Randevu oluşturulduğunda otomatik SMS gidiyor, randevudan önce hatırlatma tetikleniyor.

### Faz 4 — Çoklu Klinik Desteği (Multi-tenant)
**Hedef:** Sistem birden fazla kliniği izole şekilde desteklesin.
- `clinic_id` bazlı veri izolasyonu (tüm tablolarda)
- Klinik bazlı Vapi assistant konfigürasyonu (her klinik kendi telefon numarası/prompt'u)
- Klinik yöneticisi rolü, personel rolü ayrımı

**Bitti sayılma kriteri:** İki farklı test kliniği bağımsız olarak sisteme eklenip birbirinin verisini görmeden çalışabiliyor.

### Faz 5 — Analitik ve Outbound Aramalar
**Hedef:** Raporlama ve proaktif hatırlatma aramalarıyla değeri artırmak.
- Dashboard'da temel metrikler (arama sayısı, randevu dönüşüm oranı, no-show oranı)
- Outbound hatırlatma/onay aramaları (Vapi outbound call API)

**Bitti sayılma kriteri:** Belirlenecek — bu faz detaylandırılmadı.

## 3. Şu An Hangi Fazdayız

**Faz 0 — Altyapı Kurulumu** (dokümantasyon sistemi tamamlandı, sesli ajan platformu Vapi olarak karara bağlandı — bkz. `DECISIONS.md#adr-005`; framework kararı Next.js'ten Vite frontend + Express backend (monorepo) mimarisine düzeltildi — bkz. ADR-007; sıradaki adım mevcut frontend kodunun/repo durumunun doğrulanması ve monorepo kurulumu).

Somut görev listesi için: **PLAN_ACTIONS.md**
