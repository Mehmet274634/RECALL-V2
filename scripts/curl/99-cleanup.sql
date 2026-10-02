-- ==============================================================================
-- 99-cleanup.sql
-- Curl test paketi tarafından üretilen test verilerini temizleme scripti.
-- 
-- Hedeflenen Veriler:
-- 1. "CURL TEST HASTA" isimli test hastasına ait randevu kayıtları
-- 2. "CURL TEST HASTA" isimli test hastası kaydı
-- 3. 'curl-test-%' ön ekiyle oluşturulmuş çağrı kayıtları (call_logs)
--
-- KULLANIM:
-- psql ortamında parametre ile çalıştırmak için:
--   psql "$DATABASE_URL" -v clinic_id="'<CLINIC_ID>'" -f 99-cleanup.sql
--
-- Veya aşağıdaki :clinic_id ifadesini test kliniğinizin ID'si ile değiştirerek
-- doğrudan Neon SQL Console / psql üzerinden çalıştırabilirsiniz.
-- ==============================================================================

BEGIN;

-- 1. Test hastasına ait randevuları sil (İlişkili randevu kayıtları)
DELETE FROM "appointments"
WHERE "clinic_id" = :'clinic_id'
  AND "patient_id" IN (
    SELECT "id" FROM "patients"
    WHERE "clinic_id" = :'clinic_id'
      AND "full_name" ILIKE '%CURL TEST HASTA%'
  );

-- 2. Test hastasını sil
DELETE FROM "patients"
WHERE "clinic_id" = :'clinic_id'
  AND "full_name" ILIKE '%CURL TEST HASTA%';

-- 3. Curl testleri sırasında oluşturulmuş çağrı kayıtlarını sil
DELETE FROM "call_logs"
WHERE "clinic_id" = :'clinic_id'
  AND "vapi_call_id" LIKE 'curl-test-%';

COMMIT;
