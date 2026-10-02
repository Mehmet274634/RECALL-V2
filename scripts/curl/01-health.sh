#!/usr/bin/env bash
# ==============================================================================
# 01-health.sh: Health Check Endpoint Testi
# Beklenen: GET /api/health -> HTTP 200, {"status":"ok","database":true}
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

log_header "01-health.sh: Health Check Testi"

ENDPOINT="${BASE_URL}/api/health"

response=$(curl -s -w "\n%{http_code}" -X GET "${ENDPOINT}" -H "Accept: application/json")
http_code=$(echo "${response}" | tail -n1)
body=$(echo "${response}" | sed '$d')

if [ "${http_code}" != "200" ]; then
  log_fail "GET /api/health HTTP Kodu" "Beklenen: 200, Alınan: ${http_code}"
else
  log_pass "GET /api/health HTTP 200 yanıtı verdi"
fi

# Kontrol: status: ok
if echo "${body}" | grep -q '"status":"ok"'; then
  log_pass "Yanıt gövdesinde status: ok mevcut"
else
  log_fail "status: ok doğrulaması" "Gövde: ${body}"
fi

# Kontrol: database: true
if echo "${body}" | grep -q '"database":true'; then
  log_pass "Yanıt gövdesinde database: true mevcut (Veritabanı bağlantısı başarılı)"
else
  log_fail "database: true doğrulaması" "Gövde: ${body}"
fi

print_summary "Health Check"
exit $?
