#!/usr/bin/env bash
# ==============================================================================
# 05-lookup-cancel-reschedule.sh: Randevu Sorgulama, Erteleme ve İptal Testi
#
# Akış:
# 1. 04-book-appointment.sh ile oluşturulmuş randevuyu sorgula (lookup_appointment)
# 2. Randevu tarih/saatini değiştir (reschedule_appointment)
# 3. Randevuyu iptal et (cancel_appointment)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_secret
require_clinic_id

log_header "05-lookup-cancel-reschedule.sh: Randevu Yaşam Döngüsü Testi"

ENDPOINT="${BASE_URL}/api/vapi/server?clinicId=${CLINIC_ID}"

TEST_PATIENT_NAME="CURL TEST HASTA"
TEST_PATIENT_PHONE="05321112233"

# Yeni ertelenecek hedef tarih: bugünden 9 gün sonra
NEW_TARGET_DATE=$(date -d "+9 days" "+%Y-%m-%d" 2>/dev/null || date -v+9d "+%Y-%m-%d" 2>/dev/null || echo "2026-10-17")
NEW_TARGET_TIME="16:00"

# ------------------------------------------------------------------------------
# 1. Randevu Sorgulama (lookup_appointment)
# ------------------------------------------------------------------------------
echo -e "\n--- [Adım 1] Randevu Sorgulanıyor (lookup_appointment) ---"
payload_lookup=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-lookup-call",
      "customer": { "number": "${TEST_PATIENT_PHONE}" }
    },
    "toolCallList": [
      {
        "id": "tc-lookup-1",
        "function": {
          "name": "lookup_appointment",
          "arguments": "{\"patientName\":\"${TEST_PATIENT_NAME}\",\"patientPhone\":\"${TEST_PATIENT_PHONE}\"}"
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
  -d "${payload_lookup}")
code1=$(echo "${res1}" | tail -n1)
body1=$(echo "${res1}" | sed '$d')

if [ "${code1}" = "200" ]; then
  log_pass "lookup_appointment isteği HTTP 200 döndürdü"
else
  log_fail "lookup_appointment HTTP kodu" "Beklenen: 200, Alınan: ${code1}"
fi

if echo "${body1}" | grep -qiE "randevu|tarihinde|saatinde"; then
  log_pass "Mevcut randevu başarıyla sorgulandı ve bulundu"
else
  log_fail "Randevu sorgulama yanıtı" "Gövde: ${body1}"
fi

# ------------------------------------------------------------------------------
# 2. Randevu Saati Değişikliği / Erteleme (reschedule_appointment)
# ------------------------------------------------------------------------------
echo -e "\n--- [Adım 2] Randevu Erteleniyor (reschedule_appointment) ---"
payload_reschedule=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-reschedule-call",
      "customer": { "number": "${TEST_PATIENT_PHONE}" }
    },
    "toolCallList": [
      {
        "id": "tc-resched-1",
        "function": {
          "name": "reschedule_appointment",
          "arguments": "{\"patientName\":\"${TEST_PATIENT_NAME}\",\"patientPhone\":\"${TEST_PATIENT_PHONE}\",\"newDate\":\"${NEW_TARGET_DATE}\",\"newTime\":\"${NEW_TARGET_TIME}\"}"
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
  -d "${payload_reschedule}")
code2=$(echo "${res2}" | tail -n1)
body2=$(echo "${res2}" | sed '$d')

if [ "${code2}" = "200" ]; then
  log_pass "reschedule_appointment isteği HTTP 200 döndürdü"
else
  log_fail "reschedule_appointment HTTP kodu" "Beklenen: 200, Alınan: ${code2}"
fi

if echo "${body2}" | grep -qiE "güncellen|ertelendi|değiştirildi|oluşturuldu"; then
  log_pass "Randevu başarıyla yeni tarihe güncellendi"
else
  log_fail "Randevu erteleme yanıtı" "Gövde: ${body2}"
fi

# ------------------------------------------------------------------------------
# 3. Randevu İptali (cancel_appointment)
# ------------------------------------------------------------------------------
echo -e "\n--- [Adım 3] Randevu İptal Ediliyor (cancel_appointment) ---"
payload_cancel=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-cancel-call",
      "customer": { "number": "${TEST_PATIENT_PHONE}" }
    },
    "toolCallList": [
      {
        "id": "tc-cancel-1",
        "function": {
          "name": "cancel_appointment",
          "arguments": "{\"patientName\":\"${TEST_PATIENT_NAME}\",\"patientPhone\":\"${TEST_PATIENT_PHONE}\"}"
        }
      }
    ]
  }
}
EOF
)

res3=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_cancel}")
code3=$(echo "${res3}" | tail -n1)
body3=$(echo "${res3}" | sed '$d')

if [ "${code3}" = "200" ]; then
  log_pass "cancel_appointment isteği HTTP 200 döndürdü"
else
  log_fail "cancel_appointment HTTP kodu" "Beklenen: 200, Alınan: ${code3}"
fi

if echo "${body3}" | grep -qiE "iptal|edildi"; then
  log_pass "Randevu başarıyla iptal edildi"
else
  log_fail "Randevu iptal yanıtı" "Gövde: ${body3}"
fi

print_summary "05-lookup-cancel-reschedule.sh"
exit $?
