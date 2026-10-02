# RECALL V2 - Curl Test Paketi

Bu klasör (`scripts/curl/`), Recall V2 çok klinikli sesli randevu asistanı backend'i için uçtan uca HTTP ve Vapi Server URL protokol doğrulama testlerini içerir.

> [!WARNING]
> **ÖNEMLİ UYARI: TEST VERİSİ ÜRETİMİ**
> Bu testler gerçek veritabanı üzerinde randevu (`appointments`), hasta (`patients`) ve çağrı kaydı (`call_logs`) oluşturur.
> Testleri **yalnızca yerel (localhost) veya preview/staging ortamında** ve **yalnızca bir test kliniği** kimliğiyle çalıştırınız. Canlı (production) klinik kimlikleri ile çalıştırmayınız.

---

## 1. Ortam Değişkenleri (Environment Variables)

Scriptler aşağıdaki ortam değişkenlerini okur:

| Değişken Adı | Zorunlu mu? | Varsayılan Değer | Açıklama |
|---|---|---|---|
| `BASE_URL` | Hayır | `http://localhost:3001` | Test edilecek backend servis adresi |
| `VAPI_SERVER_SECRET` | **Evet** | - | `/api/vapi/server` webhook koruma secret anahtarı (`Authorization: Bearer <secret>`) |
| `CLINIC_ID` | **Evet** | - | Testin hedefleyeceği klinik ID'si (Örn: seed edilen test kliniği) |
| `AI_INBOUND_NUMBER` | Opsiyonel | - | `ai_inbound_number` eşleşmesi testi için atanmış numara |
| `SIP_USERNAME` | Opsiyonel | - | Vapi SIP kullanıcı adı eşleşmesi testi için kullanıcı adı (Örn: `recalltest-4829`) |
| `LEGACY_PHONE_NUMBER`| Opsiyonel | - | `phone_number` legacy yedekleme testi için santral numarası |
| `CONFIRM_REMOTE` | Şartlı | - | `BASE_URL` localhost/127.0.0.1 dışında bir sunucuya işaret ediyorsa, güvenlik gereği `"yes"` olarak atanmalıdır |

---

## 2. Hızlı Başlangıç

### Örnek Ortam Hazırlığı (Bash):

```bash
export BASE_URL="http://localhost:3001"
export VAPI_SERVER_SECRET="test-vapi-secret-key"
export CLINIC_ID="cmujsx0740000uyq8jo95ywjg"

# Opsiyonel:
export AI_INBOUND_NUMBER="+902125550101"
export SIP_USERNAME="recalltest-4829"
export LEGACY_PHONE_NUMBER="+902125550101"
```

### Tüm Testleri Çalıştırma:

```bash
bash scripts/curl/run-all.sh
```

### Tek Bir Scripti Çalıştırma:

```bash
bash scripts/curl/01-health.sh
bash scripts/curl/02-assistant-request.sh
bash scripts/curl/03-check-availability.sh
bash scripts/curl/04-book-appointment.sh
bash scripts/curl/05-lookup-cancel-reschedule.sh
bash scripts/curl/06-end-of-call-report.sh
bash scripts/curl/07-auth-negative.sh
```

---

## 3. Test Scriptleri ve Beklenen Çıktılar

### `01-health.sh`
- **İstek:** `GET /api/health`
- **Beklenen Çıktı:** `HTTP 200`, `{"status":"ok","database":true}`
- Veritabanı havuzunun ayakta olduğunu ve sunucunun çalıştığını doğrular.

### `02-assistant-request.sh`
- **İstek:** `POST /api/vapi/server` (`assistant-request`)
- **Varyasyonlar:**
  1. `clinicId` query parametresi (`?clinicId=...`)
  2. `AI_INBOUND_NUMBER` ile (opsiyonel yoksa SKIP)
  3. `SIP_USERNAME` ile (`sip:<user>@sip.vapi.ai`, opsiyonel yoksa SKIP)
  4. `LEGACY_PHONE_NUMBER` ile (opsiyonel yoksa SKIP)
  5. Bilinmeyen hat senaryosu (`to: +909999999999`)
- **Beklenen Çıktı:** Başarılı varyasyonlarda `assistantId`, `assistantOverrides`, `firstMessage`; bilinmeyen hat senaryosunda güvenli `{"error":"..."}` yanıtı (asla boş `{}` değil).

### `03-check-availability.sh`
- **İstek:** `POST /api/vapi/server?clinicId=...` (`check_availability` tool çağrısı)
- **Beklenen Çıktı:**
  1. Geçerli klinik için müsaitlik listesi.
  2. Yabancı/farklı bir kliniğe ait `doctorId` ile çağrıldığında tenant izolasyonu engeli: `"Belirtilen hekim bu kliniğe ait değil veya bulunamadı."`

### `04-book-appointment.sh`
- **İstek:** `POST /api/vapi/server?clinicId=...` (`book_appointment` tool çağrısı)
- **Hasta Adı:** `"CURL TEST HASTA"`, Telefon: `"05321112233"`
- **Beklenen Çıktı:**
  1. İlk istekte randevu onay mesajı.
  2. Aynı slota ikinci istekte slot çakışması ve dolu uyarısı (`"dolu"`, `"müsait değil"`).

### `05-lookup-cancel-reschedule.sh`
- **İstekler:**
  1. `lookup_appointment`: 04'te alınan randevuyu sorgular ve teyit eder.
  2. `reschedule_appointment`: Randevuyu yeni tarih/saate erteler.
  3. `cancel_appointment`: Randevuyu iptal eder.
- **Beklenen Çıktı:** Her adımda ilgili işlemin başarıyla tamamlandığına dair Türkçe sesli asistan yanıtı.

### `06-end-of-call-report.sh`
- **İstek:** `POST /api/vapi/server?clinicId=...` (`end-of-call-report` webhook)
- **Call ID:** Her çalıştırmada benzersiz `curl-test-<timestamp>-<rand>`
- **Beklenen Çıktı:** `HTTP 200`, `{}`
- **Veritabanında Doğrulama:**
  `/api/call-logs` endpoint'i Clerk kullanıcı oturumu gerektirdiğinden, arka planda oluşturulan `call_logs` kaydını doğrulamak için veritabanında şu sorguyu çalıştırabilirsiniz:
  ```sql
  SELECT id, clinic_id, vapi_call_id, summary, category, created_at
  FROM call_logs
  WHERE vapi_call_id LIKE 'curl-test-%'
  ORDER BY created_at DESC LIMIT 5;
  ```

### `07-auth-negative.sh`
- **İstek:** `POST /api/vapi/server`
- **Senaryolar:**
  1. Auth başlığı olmadan -> `HTTP 401 Unauthorized`
  2. Yanlış Bearer secret ile -> `HTTP 401 Unauthorized`
  3. Yanlış `x-vapi-secret` başlığı ile -> `HTTP 401 Unauthorized`

---

## 4. Test Verilerini Temizleme (`99-cleanup.sql`)

Curl testleri tamamlandıktan sonra oluşturulan test hastası, ilişkili randevular ve çağrı kayıtları `99-cleanup.sql` dosyası ile temizlenebilir.

### psql İle Temizleme:

```bash
psql "$DATABASE_URL" -v clinic_id="'<CLINIC_ID>'" -f scripts/curl/99-cleanup.sql
```

### Neon SQL Console / GUI İle Temizleme:
`scripts/curl/99-cleanup.sql` dosyasını açıp `:'clinic_id'` ifadesi yerine test kliniğinizin ID'sini yazarak SQL editöründe çalıştırınız.
