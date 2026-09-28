# PROGRESS.md

> **Son güncelleme:** 2026-09-28 (Faz 5 — Analitik / Raporlama Modülü, Saat Dilimi Gruplaması ve No-Show Metrikleri Tamamlandı)
> **Bu dosya AKTİF OLARAK GÜNCELLENİR.** Kronolojik geliştirme günlüğüdür — en yeni girdi en üstte. Yeni bir session'a başlarken son 1-2 girdiyi okuyarak kaldığın yerden devam edebilirsin.

---

## 2026-09-28 — Faz 5: Analitik & Raporlama Modülü (Recharts, No-Show Metrikleri, Timezone Gruplaması ve Admin Platform Özeti)

**Ne yapıldı:**
1. **Veri Modeli ve İndeks İyileştirmeleri:**
   - `CallLog` modeline `durationSeconds` (çağrı süresi) ve `category` (Randevu Talebi, İptal, Genel Bilgi) alanları eklendi.
   - Analitik sorgu performansı için `appointments([clinicId, startsAt])`, `appointments([clinicId, status])`, `call_logs([clinicId, createdAt])`, `call_logs([clinicId, category])` indeksleri eklendi.
   - Prisma migrasyonu (`20260928085101_add_analytics_indexes_and_fields`) Neon PostgreSQL veritabanına uygulandı.
   - `NO_SHOW` (Gelmedi) durumu doğrulandı; sekreter randevu tablosuna mevcut Tamamla/İptal/Yeniden Planla aksiyonlarının yanına kehribar renkli "Gelmedi" butonu (`UserX`) eklendi.
2. **Backend Analitik Motoru (`apps/backend/src/lib/analytics/summary.ts` & `src/routes/analytics.ts`):**
   - `GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: `requireAuth` ile korunan, kesin multi-tenant güvenli (`req.clinicId`) analitik uç noktası.
   - Maksimum 366 gün (1 yıl) tarih aralığı koruması eklendi.
   - Saat dilimi doğruluğu: Prisma UTC `timestamp without time zone` verileri PostgreSQL seviyesinde `(starts_at AT TIME ZONE 'UTC') AT TIME ZONE Clinic.timezone` (Europe/Istanbul) ile dönüştürüldü; gece yarısı (23:30 vs. 00:30 TR) randevularının doğru takvim günlerine düşmesi sağlandı.
   - Ağır hesaplamalar DB seviyesinde `$queryRaw` ile yapıldı; Node.js belleğinde satır satır sayma engellendi.
   - Formüller:
     - No-Show Oranı: `Gelmedi / (Tamamlandı + Gelmedi) * 100` (Payda 0 ise %0.0).
     - İptal Oranı: `İptal / Toplam * 100`.
     - Çağrı Randevu Dönüşüm Oranı: `Dönemde Oluşturulan Vapi Randevuları (created_at bazlı) / Toplam Çağrı * 100`. Gelecek tarihli randevuyu bugün alan çağrı bugünün dönüşümüne başarıyla yazılır.
     - Ortalama Çağrı Süresi: Ölçülemeyen / boş çağrılar ortalamayı bozmaması için `duration_seconds > 0` filtresiyle hesaplanır; kategorisi olmayanlar `Belirtilmemiş` olarak gruplanır.
     - Hekim Doluluk Oranı: Hekimin çalışma saatleri JSON'ından aktif mesai günleri taranıp toplam slot kapasitesi hesaplandı (`Aktif Randevu / Toplam Slot * 100`).
   - `GET /api/admin/analytics/clinics-overview`: Admin için platform geneli son 30 gün randevu ve çağrı hacmi karşılaştırma rotası (`requireAdmin` korumalı).
   - Vapi `end-of-call-report` webhook'u (`server-handler.ts`) gelen çağrı süresi (`durationSeconds`) ve analiz kategorisini (`category`) CallLog tablosuna otomatik yazacak şekilde güçlendirildi.
   - `test-analytics-verification.ts`: Tamamen izole geçici test klinikleri (`Automated Test Clinic`) açıp test sonrasında `finally` bloğunda kendi verisini %100 temizleyecek şekilde modernize edildi; canlı klinik verilerinin kirlenmesi engellendi.
3. **Frontend Raporlar Sayfası (`/dashboard/reports`) & Admin Karşılaştırma Tablosu:**
   - `recharts` grafik kütüphanesi entegre edildi.
   - Sol menüye "Raporlar" sekmesi (`BarChart3` ikonu) ve `/dashboard/reports` rotası eklendi.
   - 4 Özet KPI Kartı: Toplam Randevu, No-Show Oranı, İptal Oranı, Çağrı Randevu Dönüşüm Oranı.
   - Zengin interaktif grafikler: Günlük Randevu Trendi (AreaChart), Durum Dağılımı Donut (PieChart), Doktor Doluluk & Hacim (BarChart), Kanal Dağılımı (Vapi AI vs Manuel), En Yoğun Saatler & Günler, Arama Sebepleri & Süre Detayları.
   - Zaman filtresi: 7 gün, 30 gün (varsayılan), 90 gün ve özel takvim aralığı seçici.
   - Sıfıra bölme ve boş durum (empty state) dayanıklılığı: Yeni kliniklerde `NaN%` veya çökme yaşanmaz.
   - Admin panelinde (`AdminClinicsPage.tsx`) "Klinik Aktivite Karşılaştırması (Son 30 Gün)" tablosu eklendi.
4. **KVKK / Kişisel Veri Koruma Kuralı:**
   - Raporlama API yanıtlarında ve ekranlarında hasta adı, soyadı, telefon numarası veya sağlık şikayeti yer almaz; tamamen anonim/toplu istatistikler sunulur.
5. **Kapsamlı Doğrulama ve Test (`scripts/test-analytics-verification.ts`):**
   - Recall ve Anadolu klinikleri üzerinde farklı kanal, durum ve saatlerde seed verisi oluşturuldu.
   - No-show (%25.0), iptal (%16.7), dönüşüm (%50.0) ve süre (105 sn) formülleri otomatik testle doğrulandı.
   - Tenant izolasyonu test edildi: Recall sekreterine Anadolu'nun randevu veya çağrı verisinin sızmadığı kanıtlandı.
   - Timezone testi: 23:30 TR ve 00:30 TR randevularının yerel takvimde iki ayrı güne başarıyla ayrıldığı doğrulandı.
   - Boş veri testi: Verisi olmayan klinikte tüm oranların hatasız 0 döndüğü kanıtlandı.
   - Admin platform özeti tüm klinikler için doğrulandı.
6. **Dokümantasyon:**
   - `DECISIONS.md` dosyasına `ADR-020` eklendi.

---

## 2026-09-27 — Hata İzleme: Sentry Entegrasyonu ve KVKK Hassas Veri Maskelemesi

**Ne yapıldı:**
1. **Backend Entegrasyonu (`@sentry/node`):**
   - `apps/backend/src/lib/logging/sentry.ts` modülü oluşturuldu.
   - `src/index.ts` dosyasında Sentry tüm Express middleware ve route'larından önce initialize edildi (`initBackendSentry()`).
   - Express hata yakalama middleware'i `Sentry.setupExpressErrorHandler(app)` tüm route'ların sonuna bağlandı.
   - Vapi tool handler'ları (`handleToolCalls`), `requireAuth` ve `requireAdmin` beklenmeyen hataları Sentry'ye gönderecek şekilde try/catch ile sarıldı.
   - Sentry bağlantısını ve hata yakalamasını test etmek için `GET /api/debug/sentry-test` endpoint'i eklendi.
2. **Frontend Entegrasyonu (`@sentry/react`):**
   - `apps/frontend/src/lib/sentry.tsx` modülü oluşturuldu.
   - `main.tsx` içinde React render edilmeden önce Sentry başlatıldı (`initFrontendSentry()`).
   - Tüm uygulamayı kapsayan `<AppErrorBoundary>` bileşeni eklendi; beklenmeyen istemci çökmelerinde beyaz ekran yerine nazik, RECALL tasarım diline uygun bir hata ekranı (`ErrorFallbackUI`) gösterilir ve hata Sentry'ye iletilir.
   - `apps/frontend/src/lib/api.ts` istemcisine merkezi hata yakalama eklendi; 5xx sunucu hataları ve ağ kopmaları (Failed to fetch) Sentry'ye otomatik raporlanır.
3. **KVKK / GDPR Hassas Veri Maskelemesi (Öncelikli Güvenlik):**
   - Hem backend hem frontend için `beforeSend` kancaları (hooks) yazıldı.
   - Hasta telefon numarası (`patientPhone`, `phone`), adı soyadı (`patientName`, `fullName`), şikayetler (`complaints`, `medicalNotes`), yetkilendirme başlıkları (`authorization`) gibi PII alanları `[REDACTED]` ile maskelendi.
   - Serbest metinler içerisindeki telefon numaraları (`[REDACTED_PHONE]`) ve e-posta adresleri (`[REDACTED_EMAIL]`) regex ile temizlendi.
   - `apps/backend/src/lib/logging/sentry.test.ts` ile KVKK maskelemesinin doğruluğu birim testlerle kanıtlandı.
4. **Ortam Değişkenleri:**
   - `apps/backend/.env.example` içine `SENTRY_DSN` eklendi.
   - `apps/frontend/.env.example` içine `VITE_SENTRY_DSN` eklendi.
   - **ÖNEMLİ NOT (Kullanıcı Tarafı):** Sentry.io üzerinde oluşturulacak iki projenin DSN adresleri Vercel Dashboard'daki ortam değişkenlerine (`SENTRY_DSN` backend projesine, `VITE_SENTRY_DSN` frontend projesine) eklenmelidir.
5. **Dokümantasyon:**
   - `DECISIONS.md` içerisine `ADR-019` eklendi.

---

## 2026-09-27 — Faz 4: Admin Paneli, Rol Tabanlı Erişim (RBAC) & Otomatik Sekreter Daveti

**Ne yapıldı:**
1. **Rol Tabanlı Erişim ve Yetkilendirme (RBAC):**
   - Clerk `public_metadata` üzerinde `role: "admin"` vs. `role: "secretary"` desteği kuruldu.
   - `apps/backend/src/lib/auth/clerk.ts` içerisine `requireAdmin` middleware'i yazıldı. Yetkisiz sekreter istekleri `403 Forbidden` ile reddedilir.
2. **Backend Admin API (`/api/admin/*`):**
   - `GET /api/admin/clinics`: Platformdaki tüm klinikleri, hekim kadrosunu ve sayaçları listeler.
   - `POST /api/admin/clinics`: Yeni klinik oluşturur (placeholder telefon üretimi ve hekim kadrosuyla).
   - `POST /api/admin/clinics/:clinicId/doctors`: Kliniğe ek hekim tanımlar.
   - `POST /api/admin/clinics/:clinicId/invite-secretary`: Clerk Backend SDK (`createInvitation`) ile otomatik davet gönderir, davete `{ "clinicId": "...", "role": "secretary" }` metadata'sını iliştirir. Manuel JSON yapıştırma ihtiyacı ortadan kaldırıldı.
3. **Frontend Admin Paneli (`/admin`):**
   - `AdminLayout.tsx`: Sadece admin rolünün erişebildiği koyu temalı platform yönetim kabuğu. Sekreter rolü erişmeye çalıştığında 403 uyarısı gösterilir.
   - `AdminClinicsPage.tsx`: Tüm klinikleri, hekim sayılarını ve aktivite istatistiklerini listeler; tek tıkla sekreter davet modalı içerir.
   - `AdminNewClinicPage.tsx`: En az 1 hekim zorunluluğu olan yeni klinik kayıt formu ve kayıt sonrası sekreter davet akışı.
4. **4. Test Kliniği ("Ege Çocuk Sağlığı ve Hastalıkları Kliniği"):**
   - Admin API ve Web UI üzerinden başarıyla oluşturuldu, hekim eklendi ve sekreter daveti iletildi.
5. **Dokümantasyon:**
   - `ONBOARDING.md` admin paneli akışıyla güncellendi.
   - `ADR-018` `DECISIONS.md` dosyasına eklendi.

---

## 2026-09-27 — Faz 2: Çoklu Klinik Onboarding Akışı ve Dashboard Klinik Ayarları

**Ne yapıldı:**
1. **İnteraktif CLI Onboarding Scripti (`apps/backend/scripts/onboard-clinic.ts`):**
   - Yeni klinik ekleme sürecini tek ve hatasız bir CLI sihirbazına dönüştürdü (`pnpm --filter backend clinic:onboard`).
   - Sırasıyla klinik adı, telefon numarası (placeholder desteğiyle), özel karşılama mesajı, iptal politikası saati, özel talimatlar, ses kimliği (`voiceId`) ve döngüsel doktor kadrosunu (isim, branş, çalışma saatleri, ilgilendiği şikayetler) toplayıp Neon PostgreSQL'e kaydeder.
   - Script sonunda oluşturulan `clinicId`'yi ve Clerk Dashboard'a girilecek hazır JSON metadata'yı (`{ "clinicId": "..." }`) ekrana yazdırır.
2. **Dashboard'da Klinik Bilgisi Görünürlüğü (Klinik Ayarları):**
   - Backend'de `GET /api/clinic/current` endpoint'i yazıldı (`apps/backend/src/routes/clinic.ts`), `req.clinicId` bazında kliniğin tüm profilini ve hekim kadrosunu döner.
   - Frontend'de `SecretaryLayout` menüsüne "Klinik Ayarları" eklendi ve `ClinicSettingsPage.tsx` oluşturuldu.
   - Sekreter, kliniğin telefon numarasını, karşılama mesajını, iptal politikasını, ses kimliğini, özel klinik talimatlarını ve hekim kadrosunu salt-okunur (read-only) kartlar halinde inceleyebilir.
3. **Üçüncü Test Kliniği Onboarding Edildi:**
   - Script ile 3. klinik ("Marmara Fizik Tedavi Merkezi", `+902123330303`, FTR ve Ortopedi branşlarında 2 hekim, 3 saat iptal kuralı, SGK ve MR talimatları) veritabanına eklendi.
   - `scripts/test-dynamic-prompts.ts` genişletilerek 3 kliniğin (Recall, Anadolu, Marmara) dinamik sistem promptları eşzamanlı test edildi; tam izolasyon ve sıfır veri sızıntısı doğrulandı.
4. **Dokümantasyon:**
   - Standart operasyon rehberi olarak `ONBOARDING.md` oluşturuldu.
   - `ADR-017` `DECISIONS.md` dosyasına eklendi.

---

## 2026-09-27 — Faz 2: Çoklu Klinik (Multi-tenant) Dinamik Sistem Promptu Mimarisi

**Ne yapıldı:**
1. **Şema Genişletmesi (`Clinic` Modeli & Neon Migration):**
   - `prisma/schema.prisma` dosyasındaki `Clinic` modeline `greetingMessage`, `specialInstructions`, `cancellationPolicyHours` (default 2), ve `voiceId` alanları eklendi.
   - `20260927141634_add_clinic_prompt_fields` migration'ı hem lokal hem üretim (Neon) veritabanına uygulandı ve Prisma Client güncellendi.
2. **Dinamik Prompt Oluşturucu (`buildSystemPromptDetails`):**
   - `apps/backend/src/lib/vapi/system-prompt.ts` statik yapıdan arındırıldı.
   - Sabit iskelet (112 acil durum triage'ı, şeffaflık, samimi Türkçe konuşma kuralları ve tool adımları) %100 korunarak, kliniğin hekim kadrosu, uzmanlıkları, karşılama mesajı, iptal politikası ve özel duyuruları veritabanından dinamik olarak enjekte edildi.
3. **Vapi Webhook Tenant Routing:**
   - `server-handler.ts` içerisinde aranan telefon numarası (`call.phoneNumber` veya `phoneNumber.number`) veya `metadata.clinicId` üzerinden dinamik klinik çözümü (`resolveClinicForRequest`) kuruldu.
   - `assistant-request`: Kliniğe özel üretilmiş dinamik sistem promptu ve varsa ses kimliği (`voiceId`) Vapi'ye döndürüldü.
   - `tool-calls`: Çözülen `clinicId` tüm tool handler'lara (`checkAvailability`, `bookAppointment`, `lookupAppointment`, `cancelAppointment`, `rescheduleAppointment`) delege edildi.
   - `end-of-call-report`: Çağrı logu doğru kliniğe bağlandı.
4. **Çoklu Klinik Test Doğrulaması:**
   - İkinci test kliniği ("Anadolu Tıp Merkezi", +902164440202, Dermatoloji & Göz hekimleri, 4 saat iptal kuralı, SGK ve otopark özel talimatları) veritabanına eklendi.
   - `scripts/test-dynamic-prompts.ts` ile simülasyon çalıştırıldı:
     - Recall Sağlık Kliniği ve Anadolu Tıp Merkezi için üretilen promptlar karşılaştırıldı.
     - Sabit iskeletin her ikisinde de eksiksiz korunduğu, her kliniğin kendi doktorlarını ve kurallarını doğru aldığı ve sıfır veri sızıntısı olduğu doğrulandı.
5. **Belgeleme:**
   - `ADR-016` [DECISIONS.md](file:///c:/Users/ev/Desktop/RECALL%20V2/DECISIONS.md) dosyasına eklendi.
   - [ARCHITECTURE.md](file:///c:/Users/ev/Desktop/RECALL%20V2/ARCHITECTURE.md) güncellendi.

---

## 2026-09-27 — Faz 2: Vapi Sistem Prompt Optimizasyonu, Klinik Triage & 112 Acil Yönlendirmesi

**Ne yapıldı:**
1. **Merkezi Sistem Prompt Dosyası:**
   - `apps/backend/src/lib/vapi/system-prompt.ts` oluşturuldu; Vapi asistanının kişiliği, kuralları ve konuşma akışları tek bir yerde toplandı.
   - `apps/backend/src/lib/vapi/server-handler.ts` içerisindeki `assistant-request` webhook handler'ı güncellenerek gelen konfigürasyon isteklerine dinamik olarak güncel sistem promptunun dönmesi sağlandı.
2. **Kritik Acil Durum Triage (112 Güvenlik Protokolü):**
   - Göğüs ağrısı, nefes darlığı, inme, ani bilinç kaybı ve şiddetli kanama gibi hayati tehlike içeren durumlarda asistanın randevu akışını anında durdurması ve hastayı derhal 112 Acil Çağrı Merkezi'ne yönlendirmesi en yüksek öncelikle kurala bağlandı.
3. **Klinik Kadrosu ve Çalışma Saatleri Entegrasyonu:**
   - 3 hekimin mesai saatleri (Ahmet Yılmaz: 09:00-17:00 Dahiliye, Zeynep Kaya: 09:00-16:00 Kardiyoloji, Mehmet Demir: 10:00-18:00 KBB) ve 30 dakikalık muayene slotları asistana tanıtıldı.
   - Randevudan en az 2 saat önce iptal/erteleme kuralı eklendi.
   - Kliniğin kapsamı dışındaki branşlar (Diş vb.) için açık fallback ve sekretere aktarma kuralı tanımlandı.
4. **Türkçe Doğallık & Etik Şeffaflık:**
   - Yapay zeka olduğunu dürüstçe açıklama, klinik ismini her cümlede tekrarlamama, saatleri Türkçe konuşma diline uygun söyleme ve dolu saatlerde yardımsever alternatifler sunma kuralları uygulandı.
5. **Belgeleme:**
   - `ADR-015` [DECISIONS.md](file:///c:/Users/ev/Desktop/RECALL%20V2/DECISIONS.md) dosyasına eklendi.
   - `PLAN_ACTIONS.md` güncellendi.

---

## 2026-09-27 — clinicId Onboarding Sorunu & Frontend 403 Görsel Uyarıları

**Bulunan Sorun:**
- Faz 1 review'ında eklenen çoklu-kiracı (multi-tenant) veri izolasyonu (`req.clinicId` zorunluluğu) nedeniyle, Clerk üzerinde yeni açılan sekreter/test hesaplarının `public_metadata.clinicId` alanı boş olduğunda backend tüm dashboard API isteklerini (`/api/doctors`, `/api/appointments`, `/api/call-logs`, `/api/stats`) 403 Forbidden ile reddetmekteydi.
- Frontend tarafında bu hata sessizce konsola düştüğünden dolayı tablolar ve yeni randevu modalındaki doktor dropdown'ı boş listeleniyor, kullanıcının "veritabanında doktor yok mu" şüphesine yol açıyordu.

**Yapılan Çözüm & İyileştirmeler:**
1. **Veritabanı Durumu Doğrulandı:** Neon PostgreSQL üretim veritabanı incelendi; "Recall Sağlık Kliniği" (`cmujsx0740000uyq8jo95ywjg`) ve 3 hekimin (Dr. Ahmet Yılmaz, Dr. Zeynep Kaya, Dr. Mehmet Demir) veritabanında eksiksiz ve doğru `clinicId` ile kayıtlı olduğu teyit edildi.
2. **Geçici Onboarding Prosedürü:** Clerk Dashboard üzerinden test kullanıcısının `public_metadata` alanına manuel olarak `{ "clinicId": "cmujsx0740000uyq8jo95ywjg" }` ataması yapılması kurala bağlandı ve `ADR-014` olarak belgelendi.
3. **Frontend 403 Görünür Hata Uyarısı:**
   - `apps/frontend/src/lib/api.ts` içine HTTP durum kodunu taşıyan `ApiError` sınıfı eklendi.
   - `DashboardPage`, `DoctorsPage` ve `CallsPage` bileşenlerinde 403 hatası yakalandığında ekranın üstünde görünür bir sarı/amber uyarı kutusu gösterilmesi sağlandı: *"Hesabınıza henüz bir klinik atanmamış. Lütfen yöneticinizle iletişime geçin veya Clerk profilinize klinik kimliği tanımlanmasını isteyin."*
   - Randevu ekleme modalındaki doktor seçim kutusunda liste boş olduğunda yetki eksikliği açıkça belirtildi.
4. **Uçtan Uca Doğrulama:** Vapi AI (sesli asistan simülasyonu) ve Panel (sekreter arayüzünden manuel) üzerinden randevu oluşturma kanalları başarıyla test edildi, randevuların ve çağrı loglarının dashboard'da doğru rozetlerle listelendiği doğrulandı.

---

## 2026-09-27 — Faz 1 Son Sertleştirme: Çift Kilitli (Double-Gate) Dev Fallback

**Ne yapıldı:**
1. **Çift Kilitli Fallback (Fail-Safe Güvenlik):**
   - `clerk.ts` içindeki geliştirme ortamı fallback'i, tek başına `NODE_ENV === 'development'` kontrolüne güvenmek yerine açık bir ortam bayrağıyla çift kilitli (`process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true'`) hale getirildi.
   - Bayraklardan herhangi biri eksik, false veya tanımsızsa istek anında **403 Forbidden** ile reddedilir.
2. **Ortam Değişkenleri:**
   - `.env.example` dosyasına `ALLOW_DEV_CLINIC_FALLBACK=false` eklendi; production ortamlarında (Vercel) kesinlikle tanımlanmaması gerektiği belgelendi.
   - Vercel production ortam değişkenlerinde bu bayrağın bulunmadığı (tanımsız olduğu) teyit edildi.
3. **Belgeleme & Test:**
   - `ADR-013` [DECISIONS.md](file:///c:/Users/ev/Desktop/RECALL%20V2/DECISIONS.md) dosyasına eklendi.
   - `apps/backend/scripts/test-double-gate.ts` ile tüm 3 durum test edildi:
     - `NODE_ENV=development` + `ALLOW_DEV_CLINIC_FALLBACK=true` -> Fallback başarılı.
     - `NODE_ENV=development` + `ALLOW_DEV_CLINIC_FALLBACK=false` -> 403 Forbidden ile engellendi.
     - `NODE_ENV=production` (flag true olsa dahi) -> 403 Forbidden ile engellendi.

---

## 2026-09-27 — Faz 1 Review Takip: Tenant Güvenliği, Deadlock Önleme ve Aktif Telefon Doğrulama

**Ne yapıldı:**
1. **Sessiz Production Fallback'inin Kaldırılması:**
   - `clerk.ts` içinde token'dan `clinicId` çözülemediğinde varsayılan kliniğe sessizce düşen fallback production'da tamamen kaldırıldı. Token'ında açık bir klinik claim'i (`clinicId`, `public_metadata.clinicId`, `org_id`) bulunmayan kullanıcılar doğrudan **403 Forbidden** ile engellenmektedir.
   - Sadece `NODE_ENV === 'development'` ve placeholder anahtarlar varken lokal geliştirme için fallback aktiftir.
2. **Reschedule & Cross-Doctor Deadlock Önleme:**
   - Hekimler arası karşılıklı randevu takaslarında ters sıralı `FOR UPDATE` alımından kaynaklanabilecek deadlock riskine karşı sıralı kilitleme (`doctorIdsToLock = Array.from(new Set([srcId, targetId])).sort()`) mekanizması hem `rescheduleAppointment` hem de `PATCH /api/appointments/:id` içerisine uygulandı.
   - Eşzamanlı çapraz hekim takası testi ile deadlock yaşanmadığı doğrulandı.
3. **Aktif Telefon Doğrulama (`isValidPhone`):**
   - `bookAppointment`, `lookupAppointment`, `cancelAppointment`, `rescheduleAppointment`, `POST /api/appointments` (Zod refine) ve tüm Vapi tool'larına `isValidPhone` aktif kontrolü entegre edildi.
   - Eksik/geçersiz numaralar ("123", "0532" vb.) doğrudan anlamlı hata mesajıyla reddedildi.
4. **Belgeleme & Test:**
   - `ADR-012` [DECISIONS.md](file:///c:/Users/ev/Desktop/RECALL%20V2/DECISIONS.md) dosyasına eklendi.
   - `apps/backend/scripts/test-followup-review.ts` ile tüm 3 madde otomatik senaryolarla test edildi ve başarıyla geçti.

---

## 2026-09-27 — Faz 1 Code Review: Güvenlik, Concurrency ve Multi-tenant Sertleştirme

**Ne yapıldı:**
1. **Randevu Çakışması — Concurrency / Race Condition Koruması:**
   - PostgreSQL `READ COMMITTED` izolasyon seviyesinde eşzamanlı boş slot kontrolünün yaratabileceği phantom read/race condition riski giderildi.
   - Randevu oluşturma (`bookAppointment`, `POST /api/appointments`), güncelleme (`PATCH /api/appointments/:id`) ve erteleme (`rescheduleAppointment`) transaction'larına `SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE` satır kilitleme eklendi.
   - 5 eşzamanlı istek ile Neon DB üzerinde yapılan testte 1 kabul, 4 `SLOT_OCCUPIED` reddi ile çifte randevu imkansız kılındı.
2. **Multi-tenant İzolasyonu (Clerk Middleware & REST Routes):**
   - `AuthenticatedRequest` genişletildi; `requireAuth` middleware'i doğrulanmış JWT iddialarından (`clinicId`, `public_metadata.clinicId`, `org_id` veya MVP fallback) `req.clinicId` alanını garantiye alacak şekilde güncellendi.
   - `/api/appointments`, `/api/call-logs`, `/api/doctors`, `/api/stats` endpoint'leri sadece `req.clinicId` kullanacak şekilde kilitlendi; client parametreleri üzerinden klinik değiştirme (IDOR) riski önlendi.
3. **Telefon Numarası Normalizasyonu (`libphonenumber-js`):**
   - `libphonenumber-js` paketi kuruldu ve `src/lib/phone.ts` helper'ı oluşturuldu.
   - Tüm telefon girdileri uluslararası E.164 (`+90...`) formatına normalize edildi. Farklı formatlarda arama (`0 (532) ...`, `555...`) ile DB eşleşmesi doğrulandı.
4. **Vapi Webhook Güvenliği (Timing-Safe Secret Guard):**
   - `validateVapiSecret` middleware'i `crypto.timingSafeEqual` ile zamanlama saldırılarına karşı güvenli hale getirildi.
   - Router seviyesinde `/api/vapi/server` korunduğu için hem `tool-calls` hem de `end-of-call-report` dahil hiçbir Vapi mesajı secret olmadan geçemez.
5. **Belgeleme & Test:**
   - `ADR-011` eklendi.
   - `apps/backend/scripts/test-phase1-review.ts` ile tüm 4 senaryo otomatik test edildi ve başarıyla geçti.

---

## 2026-09-27 — Faz 1: Uçtan Uca Randevu Akışı ve Sekreter Dashboard'u Tamamlandı

**Ne yapıldı:**
1. **Veritabanı Hazırlığı:**
   - Neon PostgreSQL üzerinde veritabanı seed script'i çalıştırıldı (`pnpm --filter backend db:seed`).
   - "Recall Sağlık Kliniği", 3 uzman hekim (Dahiliye, Kardiyoloji, KBB), örnek hastalar ve başlangıç randevu kayıtları oluşturuldu.
2. **Scheduling Katmanı & Randevu Mantığı:**
   - `apps/backend/src/lib/scheduling/`:
     - `availability.ts`: Hekimlerin mesai saatleri (09:00-17:00 vb.) ve gün içindeki mevcut randevuları taranarak boş 30 dakikalık slotları dinamik hesaplayan yapı kuruldu.
     - `booking.ts`: Hasta eşleştirme/oluşturma ve Prisma `$transaction` içinde çakışma (overlap) kontrolü ile atomik randevu kaydı gerçekleştirildi.
     - `lookup.ts`: Hasta telefon/isim ile aktif randevuları sorgulama fonksiyonu yazıldı.
     - `cancellation.ts`: Randevu iptali ve yeniden planlama (reschedule) işlemleri geliştirildi.
3. **Vapi Tool Handlers & Dispatcher:**
   - `src/lib/vapi/tools/`: `check_availability`, `book_appointment`, `lookup_appointment`, `cancel_appointment`, `reschedule_appointment`, `transfer_call` fonksiyonları Zod validasyonu ile kodlandı.
   - `src/lib/vapi/server-handler.ts`: Gelen `tool-calls` istekleri ilgili tool'lara delege edilip senkron Türkçe yanıt dönecek şekilde genişletildi.
   - `end-of-call-report` webhook'u ile çağrı bittiğinde `CallLog` tablosuna kayıt açılması, özetin kategoriye göre sınıflandırılması ("Randevu Talebi", "Randevu İptali", "Genel Bilgi") ve görüşmede oluşturulan randevunun `createdViaCallId` ile bağlanması sağlandı.
4. **Dashboard REST API:**
   - `GET /api/appointments`, `GET /api/appointments/:id`, `POST /api/appointments`, `PATCH /api/appointments/:id` (filtreli ve manuel yönetim).
   - `GET /api/call-logs`, `GET /api/call-logs/:id` (arama geçmişi ve transkript detayları).
   - `GET /api/doctors` (hekim listesi ve bugünkü randevu sayıları).
   - `GET /api/stats/dashboard` (özet istatistik sayıları).
   - Clerk JWT kimlik doğrulaması (`requireAuth`) middleware'i kuruldu.
5. **Frontend Sekreter Dashboard'u:**
   - `apps/frontend/src/components/layout/SecretaryLayout.tsx`: Design System'e uygun sabit sol sidebar, klinik kimliği, sekreter profil alanı ve çıkış aksiyonu.
   - `apps/frontend/src/pages/dashboard/DashboardPage.tsx`: Günlük özet kartları, hızlı tarih filtreleri (Bugün, Yarın, Tüm Tarihler), doktor ve durum filtreleri, arama kutusu, randevu tablosu ve "+ Yeni Randevu" modalı.
   - `apps/frontend/src/pages/dashboard/CallsPage.tsx`: Sesli arama geçmişi, kategori rozetleri ve çift taraflı (Hasta/Asistan) konuşma transkripti inceleme modalı.
   - `apps/frontend/src/pages/dashboard/DoctorsPage.tsx`: Hekimlerin uzmanlık, mesai saatleri ve bugünkü randevu sayılarını gösteren modern kartlar.
   - `LoginPage.tsx`: Giriş formu panelle entegre edildi.
6. **Uçtan Uca Test ve Simülasyon:**
   - `simulate-vapi-call.ts` script'i ile tam bir sesli asistan görüşmesi simüle edildi: `check_availability` -> `book_appointment` -> `end-of-call-report`.
   - Çakışma kontrolü test edildi (aynı saate ikinci randevu denenip engellendi).
   - Yeni oluşturulan randevu ve arama kaydının dashboard'da "Vapi AI" kanal rozetiyle anında listelendiği tarayıcıda görsel olarak teyit edildi.
   - Mimari kararlar `DECISIONS.md#adr-010` altına kaydedildi.

**Karşılaşılan sorun / açık nokta:**
- Yok. Tüm testler ve monorepo build'i (`pnpm -r build`) hatasız tamamlandı.

**Nasıl çözüldü / sonraki adım:**
- Faz 1 başarıyla tamamlandı. Sıradaki adım: Canlı Vapi Talk / telefon hattı entegrasyonu ve klinik kurallarına göre asistan prompt optimizasyonu (Faz 2).

---

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
