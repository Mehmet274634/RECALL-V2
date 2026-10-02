#!/usr/bin/env bash
# ==============================================================================
# 03-check-availability.sh: check_availability Tool Call & Tenant İzolasyon Testi
#
# Senaryolar:
# 1. Geçerli klinik için müsaitlik sorgulama
# 2. Başka kliniğe ait / geçersiz doctorId ile sorgulama (Tenant izolasyonu doğrulaması)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_secret
require_clinic_id

log_header "03-check-availability.sh: check_availability & Tenant İzolasyonu"

ENDPOINT="${BASE_URL}/api/vapi/server?clinicId=${CLINIC_ID}"

# Hedef tarih: bugünden 3 gün sonra
TARGET_DATE=$(date -d "+3 days" "+%Y-%m-%d" 2>/dev/null || date -v+3d "+%Y-%m-%d" 2>/dev/null || echo "2026-10-10")

# ------------------------------------------------------------------------------
# 1. Genel Müsaitlik Sorgulaması
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 1] Geçerli Klinik İçin Müsaitlik Sorgulama ---"
payload_valid=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-avail-1",
      "customer": { "number": "+905321112233" }
    },
    "toolCallList": [
      {
        "id": "tc-avail-1",
        "function": {
          "name": "check_availability",
          "arguments": "{\"date\":\"${TARGET_DATE}\"}"
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
  -d "${payload_valid}")
code1=$(echo "${res1}" | tail -n1)
body1=$(echo "${res1}" | sed '$d')

if [ "${code1}" = "200" ]; then
  log_pass "Müsaitlik sorgusu HTTP 200 döndürdü"
else
  log_fail "Müsaitlik sorgusu HTTP kodu" "Beklenen: 200, Alınan: ${code1}"
fi

if echo "${body1}" | grep -q '"results"'; then
  log_pass "Yanıt yapısında 'results' listesi mevcut"
else
  log_fail "Yanıt yapısı doğrulaması" "Gövde: ${body1}"
fi

if echo "${body1}" | grep -q 'tc-avail-1'; then
  log_pass "Sonuç toolCallId ile doğru eşleşti"
else
  log_fail "toolCallId eşleşmesi" "Gövde: ${body1}"
fi

# ------------------------------------------------------------------------------
# 2. Tenant İzolasyonu (Farklı Kliniğe Ait / Geçersiz doctorId)
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 2] Farklı Kliniğe Ait doctorId İle Tenant İzolasyonu ---"
FOREIGN_DOCTOR_ID="foreign-doc-cross-clinic-id-999"

payload_isolation=$(cat <<EOF
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "curl-avail-2",
      "customer": { "number": "+905321112233" }
    },
    "toolCallList": [
      {
        "id": "tc-avail-iso",
        "function": {
          "name": "check_availability",
          "arguments": "{\"doctorId\":\"${FOREIGN_DOCTOR_ID}\",\"date\":\"${TARGET_DATE}\"}"
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
  -d "${payload_isolation}")
code2=$(echo "${res2}" | tail -n1)
body2=$(echo "${res2}" | sed '$d')

if [ "${code2}" = "200" ]; then
  log_pass "Tenant izolasyonu sorgusu HTTP 200 döndürdü (Vapi protokol uyumu)"
else
  log_fail "Tenant izolasyon HTTP kodu" "Beklenen: 200, Alınan: ${code2}"
fi

# Kontrol: Belirtilen hekim bu kliniğe ait değil veya bulunamadı
if echo "${body2}" | grep -q 'Belirtilen hekim bu kliniğe ait değil veya bulunamadı'; then
  log_pass "Tenant izolasyonu başarılı: Yabancı doktor açıkça reddedildi"
else
  log_fail "Tenant izolasyon hata mesajı" "Beklenen hata mesajı bulunamadı. Gövde: ${body2}"
fi

print_summary "03-check-availability.sh"
exit $?
