# RECALL — Yeni Klinik Onboarding Kılavuzu

Bu doküman, RECALL multi-tenant SaaS platformuna yeni bir klinik ve ilgili klinik sekreteri/kullanıcısı eklenirken izlenecek standart operasyonel süreci açıklamaktadır.

---

## 📌 Genel Bakış ve Mimari İlke

RECALL mimarisinde tüm veritabanı kayıtları (`doctors`, `patients`, `appointments`, `call_logs`) ve gelen Vapi çağrıları `clinicId` üzerinden kesin olarak izole edilir.
- **Rol Tabanlı Yetkilendirme (RBAC):**
  - `role: "admin"`: Sistemin genel yöneticisi. Tüm klinikleri görüntüler, yeni klinik tanımlar ve sekreter davetleri gönderir (`/admin`).
  - `role: "secretary"`: Belirli bir kliniğe atanmış kullanıcı (`public_metadata.clinicId`). Yalnızca kendi kliniğinin randevularını, çağrı kayıtlarını ve hekim kadrosunu yönetir (`/dashboard`).
- **Otomatik Metadata Bağlama:** Clerk Backend Invitations API sayesinde sekretere gönderilen davetler, oluşturulan `clinicId` ve `role: "secretary"` metadata'sını otomatik taşır. Sekreter daveti kabul ettiğinde elle Clerk Dashboard'a girip JSON yapıştırma adımı tamamen ortadan kalkar.

---

## 🚀 1. Birincil Yöntem: Web Admin Paneli ile Onboarding (Önerilen)

### Adım 0: İlk Admin Kullanıcısını Bootstrap Etme (Tek Seferlik)
Sistemin ilk yöneticisi (kurucu/yönetici) için Clerk Dashboard üzerinde tek seferlik manuel yetkilendirme yapılır:
1. [Clerk Dashboard](https://dashboard.clerk.com) -> **Users** sekmesinde admin kullanıcısını seçin.
2. **Metadata** -> **Public Metadata** alanına şunu yazıp kaydedin:
   ```json
   {
     "role": "admin"
   }
   ```
*(Not: Admin kullanıcısı platformdaki tüm klinikleri yönettiği için `clinicId` atamasına ihtiyaç duymaz).*

---

### Adım 1: Admin Paneline Giriş Yapın
1. Web tarayıcınızdan `http://localhost:5173/admin` (veya üretim adresine) gidin.
2. Eğer sekreter rolündeyseniz ekran 403 Yetkisiz Erişim uyarısı verecektir. Admin hesabınızla giriş yaptığınızda sistem klinikleri genel bakış ekranı açılır.

---

### Adım 2: Yeni Klinik ve Doktor Kadrosunu Tanımlayın
1. Sağ üstteki **"Yeni Klinik Ekle"** butonuna tıklayın (`/admin/new`).
2. **Klinik Temel Bilgilerini** doldurun:
   - **Klinik Adı:** Örn. `Ege Çocuk Sağlığı ve Hastalıkları Kliniği`
   - **Santral Telefon Numarası:** Eğer gerçek Netgsm santral numarası henüz tahsis edilmediyse boş bırakabilirsiniz; sistem otomatik olarak çakışmasız, güvenli bir `+90000XXXXXXX` placeholder numarası atar.
   - **Sesli Karşılama Cümlesi:** Asistanın telefonu açış cümlesi (boş bırakılırsa varsayılan atanır).
   - **İptal / Erteleme Minimum Bildirim Süresi:** Varsayılan 2 saat.
   - **Ses Tercihi:** Sarah (Kadın) veya Brian (Erkek) ElevenLabs kimliği.
   - **Özel Kurallar / Duyurular:** Sigorta, aşı kartı, evrak uyarıları vb.
3. **Hekim Kadrosunu** belirleyin:
   - En az 1 hekim eklenmesi zorunludur (yapay zeka bu hekim kadrosuna göre randevu verecektir).
   - Her hekim için Adı Soyadı, Branşı, İlgilendiği Şikayetler (opsiyonel) ve Mesai Saatlerini girin.
   - `+ Doktor Ekle` butonuyla dilediğiniz kadar hekim ekleyin.
4. **"Kliniği ve Hekimleri Kaydet"** butonuna basarak işlemi tamamlayın.

---

### Adım 3: Sekreter Davetini Gönderin (Otomatik E-Posta & Metadata)
Klinik kaydedildiği anda ekran başarı durumuna geçer:
1. Açılan alanda sekreterin e-posta adresini girin (örn: `sekreter@klinik.com`).
2. **"Davet Gönder"** butonuna basın.
3. **Arka Planda Ne Olur?**
   - Backend, Clerk Invitations API'sini çağırır (`POST /api/admin/clinics/:clinicId/invite-secretary`).
   - Davet nesnesine şu metadata otomatik enjekte edilir:
     ```json
     {
       "clinicId": "cmuk7n80g...",
       "role": "secretary"
     }
     ```
   - Sekreterin e-posta kutusuna davet linki gider.
   - Sekreter bağlantıya tıklayıp şifresini belirlediğinde, hesabı hiçbir manuel ayara gerek kalmadan doğrudan doğru kliniğe bağlı olarak açılır.

---

## 🛠️ 2. İkincil Yöntem: CLI Script ile Onboarding (Acil Durum / Yedek)

Web admin panelinin kullanılamadığı acil durumlarda veya toplu terminal işlemlerinde CLI script'i yedek yöntem olarak korunmuştur:

```bash
# Backend dizininde:
pnpm --filter backend clinic:onboard

# Veya otomatik örnek:
npx tsx scripts/onboard-clinic.ts --sample-marmara
```

Script sonunda oluşturulan `clinicId` terminale yazdırılır. Bu yöntem kullanıldığında sekreter kullanıcısı Clerk Dashboard üzerinden elle açılarak `public_metadata.clinicId` alanı yapıştırılmalıdır.

---

## 📞 3. Gerçek Santral Telefon Numarası Tahsisi (Netgsm Hazır Olduğunda)

Placeholder (`+90000...`) olarak oluşturulan klinikler için gerçek hat devreye girdiğinde:
1. Netgsm veya santral sağlayıcısından numara tahsis edilir ve Vapi'ye bağlanır.
2. Veritabanındaki `Clinic.phoneNumber` alanı güncellenir:
   ```sql
   UPDATE clinics SET phone_number = '+90212XXXXXXX' WHERE id = 'CLINIC_ID';
   ```

---

## 🧪 Doğrulama ve Test Komutları

Admin API ve RBAC yetkilendirmesini test etmek için:

```bash
# apps/backend dizininde:
npx tsx scripts/test-admin-api.ts
```
