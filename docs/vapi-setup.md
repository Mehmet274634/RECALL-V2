# RECALL V2 — Vapi Entegrasyon ve Kurulum Kılavuzu

Bu doküman, RECALL yapay zeka klinik asistanının Vapi platformu (vapi.ai) üzerinde kurulumu, araç (tools) tanımları, sunucu bağlantısı ve test adımlarını içerir.

---

## 1. Mimari Genel Bakış

RECALL backend'i, Vapi ile **Tek Server URL** (ADR-006) mimarisiyle entegre çalışır. Webhook bildirimleri (`status-update`, `end-of-call-report`) ve senkron yapay zeka araç çağrıları (`tool-calls`, `assistant-request`) aynı uç nokta üzerinden işlenir.

- **Uç Nokta:** `POST https://<BACKEND_DOMAIN>/api/vapi/server`
- **Desteklenen Mesaj Tipleri:** `tool-calls`, `assistant-request`, `end-of-call-report`, `status-update`, `transfer-destination-request`

---

## 2. Server URL ve Kimlik Doğrulama (Secret) Ayarları

Vapi'den backend'inize gelen tüm istekler güvenli bir paylaşımlı gizli anahtar (`VAPI_SERVER_SECRET`) ile korunur.

1. **Vapi Dashboard**'a giriş yapın (`dashboard.vapi.ai`).
2. Sol menüden **Assistants** sekmesine gidin ve klinik asistanınızı seçin (veya yeni bir asistan oluşturun).
3. **Server** bölümüne gelin:
   - **Server URL:** `https://<YOUR_BACKEND_DOMAIN>/api/vapi/server` (örn. `https://recall-backend.up.railway.app/api/vapi/server`)
   - **Secret:** Backend ortam değişkenlerindeki `VAPI_SERVER_SECRET` değeri ile birebir aynı olan güçlü gizli anahtarı girin.
4. **Header Doğrulaması:** Vapi, bu gizli anahtarı `Authorization: Bearer <secret>` başlığıyla iletir. Backend bu değeri timing-safe karşılaştırma ile doğrular; eşleşmeyen istekler `401 Unauthorized` ile reddedilir.

---

## 3. Randevu Araçlarının (Tools) Eklenmesi

Asistanın randevu sorgulama, alma, iptal ve erteleme yapabilmesi için Custom Tools tanımlanmalıdır.

1. Sol menüden **Tools** sekmesine gidin -> **Create Tool** seçeneğini tıklayın.
2. `Type` olarak **Function** seçin.
3. [`docs/vapi-tools.json`](./vapi-tools.json) dosyasındaki 5 aracı tek tek veya toplu olarak sisteme ekleyin:
   - **`check_availability`:** Belirli bir tarih, doktor adı veya branş için müsait randevu saatlerini listeler.
   - **`book_appointment`:** Hasta adı, telefon, tarih ve saat alarak veritabanında randevuyu oluşturur. Çakışma varsa alternatif saatler önerir.
   - **`lookup_appointment`:** Telefon numarasıyla hastanın mevcut randevusunu sorgular.
   - **`cancel_appointment`:** Hastanın randevusunu iptal eder.
   - **`reschedule_appointment`:** Randevunun gün veya saatini günceller.
4. Her aracın **Server** ayarında:
   - URL: `https://<YOUR_BACKEND_DOMAIN>/api/vapi/server`
   - Secret: `VAPI_SERVER_SECRET` değerinizi ekleyin.
5. Asistanınızın sayfasına dönüp **Tools** bölümünden oluşturduğunuz bu 5 aracı asistana bağlayın.
6. (Opsiyonel) Vapi'nin varsayılan nezaketle çağrı sonlandırma aracı olan `end_call_politely` aracını koruyabilirsiniz.

---

## 4. Asistan Sistem Promptu: Statik vs. Dinamik Yapı

### Yöntem A: Dinamik Prompt (Önerilen — `assistant-request`)
RECALL backend'i, çağrı bağlandığı anda Vapi'nin gönderdiği `assistant-request` webhook'una yanıt olarak o kliniğin en güncel doktor kadrosunu, mesai saatlerini, branşlarını ve iptal politikasını içeren dinamik bir prompt döndürür ([`system-prompt.ts`](../apps/backend/src/lib/vapi/system-prompt.ts)).
- **Avantajı:** Klinikte doktor eklendiğinde, çalışma saatleri değiştiğinde veya yeni bir klinik açıldığında Vapi Dashboard'da prompt güncellemeniz **gerekmez**. Sistem veritabanından dinamik beslenir.

### Yöntem B: Statik Prompt (Yedek / Manuel)
Eğer asistanın `assistant-request` beklemeden doğrudan sabit bir prompt ile konuşmasını isterseniz, [`apps/backend/src/lib/vapi/system-prompt.ts`](../apps/backend/src/lib/vapi/system-prompt.ts) dosyasındaki şablon metni kopyalayarak Vapi Dashboard'daki **Model -> System Prompt** alanına yapıştırabilirsiniz.

---

## 5. Web Testi ve Çoklu Klinik Eşleşmesi (`variableValues.clinicId`)

Telefon aramalarında aranan numara (+90...) üzerinden klinik otomatik tespit edilir. Ancak Vapi Dashboard üzerindeki **"Talk" (Web Test)** widget'ında gerçek bir telefon numarası bulunmaz.

- **Web testinde belirli bir kliniği test etmek için:**
  1. Vapi Dashboard -> Asistan sayfasında sağdaki **Test / Talk** panelini açın.
  2. **Assistant Overrides** veya **Variable Values** bölümüne gidin.
  3. Değişken olarak test edeceğiniz kliniğin ID'sini ekleyin:
     ```json
     {
       "clinicId": "cmujsx0740000uyq8jo95ywjg"
     }
     ```
  4. Bu sayede web araması doğrudan ilgili kliniğin doktorlarına ve takvimine bağlanır.
- **Eğer `clinicId` belirtilmezse:** Backend güvenlik uyarısı loglayarak (`[vapi] Inbound request missing phoneNumber and clinicId metadata...`) otomatik olarak veritabanındaki varsayılan kliniğe (Recall Sağlık Kliniği) düşer.

---

## 6. Yayınlama (Publish) ve Canlıya Alma

1. Tüm ayarları tamamladıktan sonra sağ üst köşedeki **Publish** butonuna tıklayın.
2. Asistanınızın canlı telefon numarasını (Phone Numbers menüsünden Netgsm / Twilio SIP Trunk veya Vapi numarası) bu asistana bağlayın.
3. Test için santral numarasını arayarak:
   - "Yarın dahiliye için randevu almak istiyorum"
   - "Müsait saatler nelerdir?"
   - "Ahmet Bey'e saat 10:00'a randevu yazın"
   senaryolarını canlı sesli görüşmede test edin.
