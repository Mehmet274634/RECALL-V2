#!/usr/bin/env bash
# ==============================================================================
# 06-end-of-call-report.sh: Vapi end-of-call-report Webhook Testi
#
# Akış:
# 1. Benzersiz bir call id üretir (curl-test-<timestamp>-<rand>)
# 2. Vapi Server URL'e end-of-call-report webhook çağrısı gönderir
# 3. HTTP 200 ve boş JSON `{}` döndüğünü doğrular
# 4. call_logs kaydının veritabanında nasıl doğrulanacağını belirtir
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_secret
require_clinic_id

log_header "06-end-of-call-report.sh: Çağrı Sonu Raporu (end-of-call-report)"

ENDPOINT="${BASE_URL}/api/vapi/server?clinicId=${CLINIC_ID}"

# Benzersiz Call ID üretimi
RAND_PART=$((RANDOM % 9000 + 1000))
TIME_PART=$(date +%s 2>/dev/null || echo "1720000000")
UNIQUE_CALL_ID="curl-test-${TIME_PART}-${RAND_PART}"

echo "Üretilen Benzersiz Vapi Call ID: ${UNIQUE_CALL_ID}"

payload_report=$(cat <<EOF
{
  "message": {
    "type": "end-of-call-report",
    "callId": "${UNIQUE_CALL_ID}",
    "call": {
      "id": "${UNIQUE_CALL_ID}",
      "durationSeconds": 45,
      "endedReason": "customer-ended-call"
    },
    "transcript": "AI: Merhaba, Recall Kliniği. Nasıl yardımcı olabilirim?\nHasta: Randevu almak istemiştim.",
    "analysis": {
      "summary": "Hasta randevu talebinde bulundu."
    }
  }
}
EOF
)

response=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_report}")
http_code=$(echo "${response}" | tail -n1)
body=$(echo "${response}" | sed '$d')

if [ "${http_code}" = "200" ]; then
  log_pass "end-of-call-report webhook çağrısı HTTP 200 döndürdü"
else
  log_fail "end-of-call-report HTTP kodu" "Beklenen: 200, Alınan: ${http_code}"
fi

# Vapi protokolünde fire-and-forget mesajlar {} döner
if [ "${body}" = "{}" ]; then
  log_pass "Yanıt gövdesi Vapi standardına uygun: {}"
else
  log_fail "Yanıt gövdesi doğrulaması" "Beklenen: {}, Alınan: ${body}"
fi

echo ""
echo "Bilgi: '${UNIQUE_CALL_ID}' kimlikli çağrı kaydının veritabanında oluştuğunu doğrulamak için:"
echo "  SELECT id, clinic_id, vapi_call_id, summary, category, created_at"
echo "  FROM call_logs WHERE vapi_call_id = '${UNIQUE_CALL_ID}';"

print_summary "06-end-of-call-report.sh"
exit $?
