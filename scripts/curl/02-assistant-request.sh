#!/usr/bin/env bash
# ==============================================================================
# 02-assistant-request.sh: Vapi assistant-request Beş Varyasyon Testi
#
# Varyasyonlar:
# a) clinicId query parametresi ile
# b) dialedNumber = AI_INBOUND_NUMBER ile (ai_inbound_number eşleşmesi)
# c) SIP kullanıcı adı = SIP_USERNAME ile (sip:<kullanıcı>@sip.vapi.ai formatı)
# d) dialedNumber = LEGACY_PHONE_NUMBER ile (phone_number yedeği)
# e) Hiçbir kimlik yokken güvenli hata senaryosu (error mesajı beklenir)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_secret
require_clinic_id

log_header "02-assistant-request.sh: Vapi assistant-request Varyasyonları"

ENDPOINT="${BASE_URL}/api/vapi/server"

# Yardımcı: assistant-request yanıtını doğrula
verify_assistant_response() {
  local label="$1"
  local http_code="$2"
  local body="$3"

  if [ "${http_code}" != "200" ]; then
    log_fail "${label} - HTTP 200 Yanıtı" "Beklenen: 200, Alınan: ${http_code}"
    return 1
  fi
  log_pass "${label} - HTTP 200 alındı"

  if echo "${body}" | grep -q '"assistantId"'; then
    log_pass "${label} - assistantId mevcut"
  else
    log_fail "${label} - assistantId kontrolü" "Gövdede assistantId alanı bulunamadı. Gövde: ${body}"
  fi

  if echo "${body}" | grep -q '"assistantOverrides"'; then
    log_pass "${label} - assistantOverrides mevcut"
  else
    log_fail "${label} - assistantOverrides kontrolü" "Gövdede assistantOverrides bulunamadı."
  fi

  if echo "${body}" | grep -q '"firstMessage"'; then
    log_pass "${label} - firstMessage mevcut"
  else
    log_fail "${label} - firstMessage kontrolü" "firstMessage alanı bulunamadı."
  fi
}

# ------------------------------------------------------------------------------
# a) clinicId query ile
# ------------------------------------------------------------------------------
echo -e "\n--- [Varyasyon a] clinicId Query Parametresi İle ---"
payload_a='{"message":{"type":"assistant-request","call":{"id":"curl-call-a","to":"+900000000000"}}}'
res_a=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}?clinicId=${CLINIC_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_a}")
code_a=$(echo "${res_a}" | tail -n1)
body_a=$(echo "${res_a}" | sed '$d')
verify_assistant_response "Varyasyon (a) query.clinicId" "${code_a}" "${body_a}"

# ------------------------------------------------------------------------------
# b) dialedNumber = AI_INBOUND_NUMBER ile
# ------------------------------------------------------------------------------
echo -e "\n--- [Varyasyon b] ai_inbound_number İle ---"
if [ -z "${AI_INBOUND_NUMBER}" ]; then
  log_skip "Varyasyon (b) ai_inbound_number" "AI_INBOUND_NUMBER ortam değişkeni tanımlı değil"
else
  payload_b="{\"message\":{\"type\":\"assistant-request\",\"call\":{\"id\":\"curl-call-b\",\"to\":\"${AI_INBOUND_NUMBER}\"}}}"
  res_b=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
    -d "${payload_b}")
  code_b=$(echo "${res_b}" | tail -n1)
  body_b=$(echo "${res_b}" | sed '$d')
  verify_assistant_response "Varyasyon (b) ai_inbound_number" "${code_b}" "${body_b}"
fi

# ------------------------------------------------------------------------------
# c) SIP kullanıcı adı = SIP_USERNAME ile
# ------------------------------------------------------------------------------
echo -e "\n--- [Varyasyon c] SIP URI İle ---"
if [ -z "${SIP_USERNAME}" ]; then
  log_skip "Varyasyon (c) SIP_USERNAME" "SIP_USERNAME ortam değişkeni tanımlı değil"
else
  sip_uri="sip:${SIP_USERNAME}@sip.vapi.ai"
  payload_c="{\"message\":{\"type\":\"assistant-request\",\"call\":{\"id\":\"curl-call-c\",\"to\":\"${sip_uri}\"}}}"
  res_c=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
    -d "${payload_c}")
  code_c=$(echo "${res_c}" | tail -n1)
  body_c=$(echo "${res_c}" | sed '$d')
  verify_assistant_response "Varyasyon (c) SIP URI" "${code_c}" "${body_c}"
fi

# ------------------------------------------------------------------------------
# d) dialedNumber = LEGACY_PHONE_NUMBER ile (phone_number yedeği)
# ------------------------------------------------------------------------------
echo -e "\n--- [Varyasyon d] Legacy phone_number İle ---"
if [ -z "${LEGACY_PHONE_NUMBER}" ]; then
  log_skip "Varyasyon (d) LEGACY_PHONE_NUMBER" "LEGACY_PHONE_NUMBER ortam değişkeni tanımlı değil"
else
  payload_d="{\"message\":{\"type\":\"assistant-request\",\"call\":{\"id\":\"curl-call-d\",\"to\":\"${LEGACY_PHONE_NUMBER}\"}}}"
  res_d=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
    -d "${payload_d}")
  code_d=$(echo "${res_d}" | tail -n1)
  body_d=$(echo "${res_d}" | sed '$d')
  verify_assistant_response "Varyasyon (d) legacy phone_number" "${code_d}" "${body_d}"
fi

# ------------------------------------------------------------------------------
# e) Hiçbir kimlik yokken güvenli hata senaryosu
# ------------------------------------------------------------------------------
echo -e "\n--- [Varyasyon e] Bilinmeyen Hat Hata Senaryosu ---"
payload_e='{"message":{"type":"assistant-request","call":{"id":"curl-call-e","to":"+909999999999"}}}'
res_e=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VAPI_SERVER_SECRET}" \
  -d "${payload_e}")
code_e=$(echo "${res_e}" | tail -n1)
body_e=$(echo "${res_e}" | sed '$d')

if [ "${code_e}" = "200" ]; then
  log_pass "Varyasyon (e) bilinmeyen hat HTTP 200 döndürdü (Vapi protokol uyumu)"
else
  log_fail "Varyasyon (e) HTTP kodu" "Beklenen: 200, Alınan: ${code_e}"
fi

if echo "${body_e}" | grep -q '"error"'; then
  log_pass "Varyasyon (e) yanıtında güvenli error mesajı döndü"
else
  log_fail "Varyasyon (e) hata mesajı kontrolü" "Gövdede error bulunamadı: ${body_e}"
fi

# Asla boş süslü parantez {} dönmemeli
if [ "${body_e}" = "{}" ]; then
  log_fail "Varyasyon (e) boş obje döndü" "Boş {} yanıtı Vapi'de sessiz arıza oluşturur."
else
  log_pass "Varyasyon (e) yanıtı boş {} değil"
fi

print_summary "02-assistant-request.sh"
exit $?
