#!/usr/bin/env bash
# ==============================================================================
# 04-book-appointment.sh: book_appointment & Çift Rezervasyon (Slot Conflict) Testi
#
# Senaryolar:
# 1. "CURL TEST HASTA" adına yeni randevu oluşturulması (başarılı)
# 2. Aynı slota ikinci kez randevu isteği gönderilmesi (SLOT_OCCUPIED / çakışma beklenir)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_secret
require_clinic_id

log_header "04-book-appointment.sh: Randevu Oluşturma ve Çakışma Testi"

ENDPOINT="${BASE_URL}/api/vapi/server?clinicId=${CLINIC_ID}"

# Test parametreleri (ileriki bir tarih ve saat)
TEST_PATIENT_NAME="CURL TEST HASTA"
TEST_PATIENT_PHONE="05321112233"
# Hedef tarih: Gelecek pazartesi veya 7 gün sonra
TARGET_DATE=$(date -d "+7 days" "+%Y-%m-%d" 2>/dev/null || date -v+7d "+%Y-%m-%d" 2>/dev/null || echo "2026-10-15")
TARGET_TIME="14:30"

echo -e "Test Tarihi: ${TARGET_DATE}, Saat: ${TARGET_TIME}, Hasta: ${TEST_PATIENT_NAME}"

# ------------------------------------------------------------------------------
# 1. İlk Randevu İsteği (Başarılı Olmalı)
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 1] İlk Randevu Kaydı Gönderiliyor ---"
payload_book_1=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-book-call-1",
      "customer": { "number": "${TEST_PATIENT_PHONE}" }
    },
    "toolCallList": [
      {
        "id": "tc-book-1",
        "function": {
          "name": "book_appointment",
          "arguments": "{\"patientName\":\"${TEST_PATIENT_NAME}\",\"patientPhone\":\"${TEST_PATIENT_PHONE}\",\"date\":\"${TARGET_DATE}\",\"time\":\"${TARGET_TIME}\"}"
        }
      }
    ]
  }
}
EOF
)

res1=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_book_1}")
code1=$(echo "${res1}" | tail -n1)
body1=$(echo "${res1}" | sed '$d')

if [ "${code1}" = "200" ]; then
  log_pass "İlk randevu isteği HTTP 200 döndürdü"
else
  log_fail "İlk randevu isteği HTTP kodu" "Beklenen: 200, Alınan: ${code1}"
fi

# Randevu onay mesajı kontrolü (oluşturuldu veya teyit kelimesi)
if echo "${body1}" | grep -q 'oluşturuldu'; then
  log_pass "Randevu başarıyla oluşturuldu teyidi alındı"
elif echo "${body1}" | grep -q 'Randevunuz'; then
  log_pass "Randevu yanıt mesajı alındı"
else
  log_fail "Randevu oluşturma onayı" "Gövde: ${body1}"
fi

# ------------------------------------------------------------------------------
# 2. Aynı Slota İkinci İstek (Çakışma / Dolu Slot Engeli)
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 2] Aynı Slota Çift Randevu İsteği Gönderiliyor ---"
payload_book_2=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-book-call-2",
      "customer": { "number": "${TEST_PATIENT_PHONE}" }
    },
    "toolCallList": [
      {
        "id": "tc-book-2",
        "function": {
          "name": "book_appointment",
          "arguments": "{\"patientName\":\"${TEST_PATIENT_NAME}\",\"patientPhone\":\"${TEST_PATIENT_PHONE}\",\"date\":\"${TARGET_DATE}\",\"time\":\"${TARGET_TIME}\"}"
        }
      }
    ]
  }
}
EOF
)

res2=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_book_2}")
code2=$(echo "${res2}" | tail -n1)
body2=$(echo "${res2}" | sed '$d')

if [ "${code2}" = "200" ]; then
  log_pass "Çakışma testi isteği HTTP 200 döndürdü"
else
  log_fail "Çakışma testi HTTP kodu" "Beklenen: 200, Alınan: ${code2}"
fi

# Kontrol: Dolu, müsait değil veya zaten oluşturulmuş uyarısı
if echo "${body2}" | grep -qiE "dolu|müsait değil|başka bir saat|uygun değil|zaten oluşturulmuş"; then
  log_pass "Aynı slot için çakışma başarıyla tespit edildi ve çift rezervasyon engellendi"
else
  log_fail "Çift rezervasyon engeli doğrulaması" "Çakışma mesajı tespit edilemedi. Gövde: ${body2}"
fi

print_summary "04-book-appointment.sh"
exit $?
