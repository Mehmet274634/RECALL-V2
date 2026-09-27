# RECALL — Yeni Klinik Onboarding Kılavuzu

Bu doküman, RECALL multi-tenant SaaS sistemine yeni bir klinik ve ilgili klinik sekreteri/kullanıcısı eklenirken izlenecek standart, tekrarlanabilir operasyonel süreci açıklamaktadır.

---

## 📌 Genel Bakış ve Mimari İlke

RECALL mimarisinde tüm veritabanı kayıtları (`doctors`, `patients`, `appointments`, `call_logs`) ve gelen Vapi çağrıları `clinicId` üzerinden kesin olarak izole edilir.
- **Backend Güvenliği:** Clerk oturumu açan sekreterin JWT token'ında veya `public_metadata` alanında `clinicId` bulunması zorunludur. Aksi halde tüm API istekleri `403 Forbidden` ile reddedilir.
- **Sesli Asistan:** Gelen telefon numarasından (`Clinic.phoneNumber`) veya Vapi metadata'sından ilgili kliniğin dinamik sistem promptu ve ses kimliği yüklenir.

Bu nedenle yeni bir klinik ekleme süreci **2 ana aşamadan** oluşur:
1. **Veritabanı Kaydı:** CLI Onboarding Sihirbazı ile klinik ve hekim kadrosunun oluşturulması.
2. **Kullanıcı Tanımlama:** Clerk Dashboard üzerinden sekreter hesabının açılıp `clinicId` atanması.

---

## 🚀 Adım Adım Onboarding Süreci

### Adım 1: Onboarding Script'ini Çalıştırın

Terminalde projenin kök dizininde veya backend dizininde şu komutu çalıştırın:

```bash
# Proje kökünden:
pnpm --filter backend clinic:onboard

# Veya backend dizininden:
cd apps/backend
npx tsx scripts/onboard-clinic.ts
```

*(Otomatik demo/test için `npx tsx scripts/onboard-clinic.ts --sample-marmara` komutu da kullanılabilir).*

---

### Adım 2: İnteraktif Soruları Yanıtlayın

Script çalıştığında aşağıdaki bilgileri sırayla soracaktır:

1. **Klinik Tam Adı:**
   - Örnek: `Marmara Fizik Tedavi Merkezi`
2. **Santral Telefon Numarası:**
   - *Önemli Not:* Eğer Netgsm/Vapi gerçek santral numarası henüz tahsis edilmediyse, script'in sunduğu geçici (placeholder) rastgele numarayı kabul edebilir veya geçici bir değer girebilirsiniz (örn: `+902123330303`). Hat hazır olduğunda bu numara güncellenecektir.
3. **Sesli Karşılama Cümlesi (`greetingMessage`):**
   - Asistanın telefonu açtığında söyleyeceği ilk cümle.
   - Boş bırakılırsa sistem varsayılan şablonu otomatik üretir:
     `"Merhaba, [Klinik Adı]'na hoş geldiniz. Ben yapay zeka asistanınız, randevunuz için nasıl yardımcı olabilirim?"`
4. **Randevu İptal / Erteleme Minimum Bildirim Süresi (`cancellationPolicyHours`):**
   - Randevudan kaç saat öncesine kadar hastanın sesli asistan üzerinden iptal/erteleme yapabileceğini belirler.
   - Varsayılan: `2` (Saat).
5. **Kliniğe Özel Kurallar ve Talimatlar (`specialInstructions`):**
   - Sigorta anlaşmaları, yanlarında getirmeleri gereken evraklar, otopark, randevuya erken gelme uyarısı vb. (Opsiyonel, Enter ile boş geçilebilir).
   - Örnek: `"SGK anlaşmalıdır. TC kimlik kartı ve varsa güncel MR sonuçlarınızı yanınızda getiriniz."`
6. **Ses Tercihi (`voiceId`):**
   - `1`: Sarah (ElevenLabs Doğal Kadın Sesi — `EXAVITQu4vr4xnSDxMaL`) [Varsayılan]
   - `2`: Brian (ElevenLabs Güven Veren Erkek Sesi — `nPczCjzI2devNBz1zQrb`)
   - `3`: Özel Voice ID girin veya Vapi varsayılanı için boş bırakın.
7. **Doktor Kadrosu (Döngüsel):**
   - Doktor Adı Soyadı (örn: `Dr. Hakan Demir`)
   - Uzmanlık Branşı (örn: `Fiziksel Tıp ve Rehabilitasyon`)
   - İlgilendiği Şikayetler/Belirtiler (örn: `Bel ve boyun fıtığı, kireçlenme, inme rehabilitasyonu`)
   - Mesai Saatleri (Başlangıç `09:00`, Bitiş `17:00`)
   - *"Başka bir doktor eklemek istiyor musunuz? (e/h)"* sorusuyla kliniğin tüm hekimlerini ekleyin.

---

### Adım 3: Üretilen `clinicId` ve Clerk Metadata Snippet'ını Alın

Script veritabanı kaydını başarıyla tamamladığında terminale aşağıdaki gibi bir çıktı verir:

```json
============================================================
📋 CLERK SEKRETER KULLANICISI OLUŞTURMA ADIMI (KOPYALAYIN):
============================================================
1. Clerk Dashboard'a (dashboard.clerk.com) gidin.
2. Users -> "Create User" ile klinik sekreteri için hesap açın.
3. Kullanıcının profiline girip "Metadata" -> "Public" alanına
   AŞAĞIDAKİ JSON'I KOPYALAYIP YAPIŞTIRIN:

{
  "clinicId": "cmujybck90000uyj8bx7jffsj"
}
============================================================
```

Bu `clinicId` değerini panoya kopyalayın.

---

### Adım 4: Clerk Dashboard'da Sekreter Kullanıcısını Oluşturun

1. [Clerk Dashboard](https://dashboard.clerk.com) adresine gidin.
2. Sol menüden **Users** sekmesini açın.
3. Sağ üstteki **Create User** butonuna tıklayın.
4. Sekreterin e-posta adresini ve geçici şifresini girip kullanıcıyı oluşturun.
5. Oluşturulan kullanıcının detay sayfasına girin.
6. Sayfayı aşağı kaydırıp **Metadata** bölümünü bulun.
7. **Public Metadata** alanına Adım 3'teki JSON kodunu yapıştırın:
   ```json
   {
     "clinicId": "cmujybck90000uyj8bx7jffsj"
   }
   ```
8. **Save** butonuna basarak kaydedin.

> ⚠️ **UYARI:** Eğer `public_metadata.clinicId` atanmazsa, kullanıcı dashboard'a girdiğinde randevu ve doktor listeleri boş görünecek ve tüm API istekleri `403 Forbidden` dönecektir (Bkz: `ADR-014`).

---

### Adım 5: Telefon Numarası / Netgsm Entegrasyonu (Numara Hazır Olduğunda)

Eğer Adım 2'de geçici/placeholder bir numara girildiyse:
1. Netgsm veya santral sağlayıcısından kliniğe özel telefon numarası satın alındığında veya yönlendirildiğinde,
2. Vapi Dashboard'da `Phone Numbers` sekmesinden bu numara Vapi'ye bağlanır.
3. Veritabanındaki `Clinic.phoneNumber` alanı ilgili yeni numarayla güncellenir:
   ```sql
   UPDATE clinics SET phone_number = '+90212XXXXXXX' WHERE id = 'cmujybck90000uyj8bx7jffsj';
   ```

---

### Adım 6: Sekreter Panelinde "Klinik Ayarları" Sayfasını Doğrulayın

Sekreter hesabı ile `http://localhost:5173` (veya production adresi) üzerinden giriş yapın:
1. Sol menüdeki **Klinik Ayarları** sekmesine tıklayın.
2. Açılan sayfada kliniğe ait:
   - Klinik adı, santral telefon numarası, saat dilimi
   - Vapi sesli karşılama metni (`greetingMessage`)
   - İptal politikası saati (`cancellationPolicyHours`)
   - Vapi ses sağlayıcısı ve Voice ID (`voiceId`)
   - Kliniğe özel kurallar (`specialInstructions`)
   - Kayıtlı hekim kadrosu ve mesai saatleri
3. Bilgilerin eksiksiz ve doğru göründüğünü teyit edin. Bu sayfa salt-okunur (read-only) güvenlik katmanına sahip olup sekreterin tanımları doğrudan görmesini sağlar.

---

## 🛠️ Doğrulama ve Test Komutları

Yeni bir klinik eklendikten sonra dinamik sistem promptunun ve multi-tenant izolasyonunun kusursuz çalıştığını test etmek için:

```bash
# apps/backend dizininde:
npx tsx scripts/test-dynamic-prompts.ts
```

Tüm testler yeşil yandığında klinik üretime hazırdır! 🎉
