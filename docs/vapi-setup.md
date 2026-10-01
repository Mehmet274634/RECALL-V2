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

## 4. Asistan Sistem Promptu: Dinamik `assistant-request` Akışı

### Genel Bakış
RECALL backend'i, çağrı bağlandığında Vapi'nin gönderdiği `assistant-request` webhook'una `assistantId + assistantOverrides` şeklinde yanıt verir. Bu yöntemde Dashboard asistanının araç (tools) tanımları **korunur**; sadece sistem promptu, `firstMessage` ve `variableValues` dinamik olarak üretilir.

### Yanıt Yapısı
```json
{
  "assistantId": "<VAPI_BASE_ASSISTANT_ID>",
  "assistantOverrides": {
    "firstMessage": "Merhaba, Recall Sağlık Kliniği...",
    "model": {
      "messages": [{ "role": "system", "content": "<dinamik klinik prompt>" }]
    },
    "voice": { "voiceId": "...", "provider": "..." },
    "variableValues": { "clinicId": "<id>" },
    "metadata":       { "clinicId": "<id>" }
  }
}
```
- **`assistantId`:** Dashboard'daki base asistanın ID'si. Araçlar (tools) bu asistandan gelir.
- **`variableValues.clinicId` + `metadata.clinicId`:** Sonraki `tool-calls` isteklerinde kliniği çözmek için kullanılır.

### Zorunlu Ortam Değişkeni
```
VAPI_BASE_ASSISTANT_ID="va_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```
Değer eksikse backend hata loglar ve `{ "error": "..." }` döner; asistan konuşmayı güvenli şekilde bitirir.

### Sistem Promptu (Dinamik)
Klinik bulunduğunda [`system-prompt.ts`](../apps/backend/src/lib/vapi/system-prompt.ts) doktorları, mesai saatlerini, branşları ve iptal politikasını veritabanından okuyarak derler. Klinik güncellendiğinde Vapi Dashboard'da **hiçbir şey değiştirmenize gerek yoktur**.

---

## 5. Klinik Çözümleme Önceliği ve SIP Arama

Backend, her Vapi isteğinde kliniği şu sırayla tespit eder:

| Öncelik | Kaynak | Örnek |
|---------|--------|-------|
| 1 | `variableValues.clinicId` veya `metadata.clinicId` | Çağrı başlatılırken `assistantOverrides` ile gönderilir |
| 2 | `req.query.clinicId` (URL parametresi) | `?clinicId=cmujsx0740000uyq8jo95ywjg` |
| 3 | Aranan numara (`phoneNumber.number` / `call.to` / `message.to`) | `+902125550101` → DB'de eşlenir |

**SIP adresleri:** `sip:xxx@sip.vapi.ai` formatındaki numaralar E.164 normalizeye sokulMaz; telefon araması atlanır. Bu durumda klinik `variableValues/metadata.clinicId` veya `query.clinicId` ile çözülmelidir.

**Klinik bulunamazsa:** `{ error: "..." }` döner, asistan güvenli şekilde konuşmayı bitirir. Yedek/fallback klinik yoktur.

### Vapi Dashboard — Web Testi

1. Asistan sayfasında **Test / Talk** panelini açın.
2. **Variable Values** bölümüne tıklayın.
3. `clinicId` değişkenini ekleyin:
   ```json
   { "clinicId": "cmujsx0740000uyq8jo95ywjg" }
   ```
4. Konuşma başlar başlamaz backend ilgili kliniğin doktorlarına ve takvimine bağlanır.

### SIP Numarası ile Canlı Test

Vapi panelindeki SIP numarasını (`sip:recalltest-4829@sip.vapi.ai`) kullanıyorsanız asistanın **Assistant** alanını boş bırakın ve **Server URL**'yi `assistant-request` döndürecek şekilde yapılandırın. Backend, `VAPI_BASE_ASSISTANT_ID` + klinike ait `assistantOverrides` ile yanıt verir.

---

## 6. Yayınlama (Publish) ve Canlıya Alma

1. Tüm ayarları tamamladıktan sonra sağ üst köşedeki **Publish** butonuna tıklayın.
2. Asistanınızın canlı telefon numarasını (Phone Numbers menüsünden Netgsm / Twilio SIP Trunk veya Vapi numarası) bu asistana bağlayın.
3. Test için santral numarasını arayarak:
   - "Yarın dahiliye için randevu almak istiyorum"
   - "Müsait saatler nelerdir?"
   - "Ahmet Bey'e saat 10:00'a randevu yazın"
   senaryolarını canlı sesli görüşmede test edin.
