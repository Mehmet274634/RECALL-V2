#!/usr/bin/env bash
# ==============================================================================
# 07-auth-negative.sh: Yetkilendirme Negatif Güvenlik Testleri
#
# Senaryolar:
# 1. Authorization başlığı olmadan istek atıldığında HTTP 401 dönmeli
# 2. Yanlış Bearer token ile istek atıldığında HTTP 401 dönmeli
# 3. Yanlış x-vapi-secret başlığı ile istek atıldığında HTTP 401 dönmeli
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

log_header "07-auth-negative.sh: Yetkilendirme Negatif Güvenlik Testleri"

ENDPOINT="${BASE_URL}/api/vapi/server"
DUMMY_PAYLOAD='{"message":{"type":"assistant-request","call":{"to":"+902125550101"}}}'

# ------------------------------------------------------------------------------
# 1. Başlıksız İstek (No Auth Header)
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 1] Auth Başlığı Olmadan İstek ---"
res1=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "${DUMMY_PAYLOAD}")
code1=$(echo "${res1}" | tail -n1)
body1=$(echo "${res1}" | sed '$d')

if [ "${code1}" = "401" ]; then
  log_pass "Yetkisiz istek HTTP 401 ile başarıyla engellendi"
else
  log_fail "Yetkisiz istek HTTP kodu" "Beklenen: 401, Alınan: ${code1}"
fi

if echo "${body1}" | grep -qi "unauthorized"; then
  log_pass "Yanıt gövdesinde 'Unauthorized' mesajı mevcut"
else
  log_fail "Yetkisiz yanıt içeriği" "Gövde: ${body1}"
fi

# ------------------------------------------------------------------------------
# 2. Yanlış Bearer Token İle İstek
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 2] Geçersiz Bearer Secret İle İstek ---"
res2=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kesinlikle-yanlis-bir-secret-token-xyz" \
  -d "${DUMMY_PAYLOAD}")
code2=$(echo "${res2}" | tail -n1)

if [ "${code2}" = "401" ]; then
  log_pass "Geçersiz Bearer secret HTTP 401 ile başarıyla engellendi"
else
  log_fail "Geçersiz secret HTTP kodu" "Beklenen: 401, Alınan: ${code2}"
fi

# ------------------------------------------------------------------------------
# 3. Yanlış x-vapi-secret Başlığı İle İstek
# ------------------------------------------------------------------------------
echo -e "\n--- [Senaryo 3] Geçersiz x-vapi-secret Başlığı İle İstek ---"
res3=$(curl -s -w "\n%{http_code}" -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: gecersiz-legacy-secret" \
  -d "${DUMMY_PAYLOAD}")
code3=$(echo "${res3}" | tail -n1)

if [ "${code3}" = "401" ]; then
  log_pass "Geçersiz legacy x-vapi-secret HTTP 401 ile başarıyla engellendi"
else
  log_fail "Geçersiz legacy secret HTTP kodu" "Beklenen: 401, Alınan: ${code3}"
fi

print_summary "07-auth-negative.sh"
exit $?
