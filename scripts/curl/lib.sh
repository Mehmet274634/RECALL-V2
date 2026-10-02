#!/usr/bin/env bash
# ==============================================================================
# RECALL V2 - Curl Test Suite Common Library (lib.sh)
# ==============================================================================

set -o pipefail

# ANSI color codes
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_NC='\033[0m' # No Color

# Defaults
BASE_URL="${BASE_URL:-http://localhost:3001}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Remote host protection
check_remote_guard() {
  case "$BASE_URL" in
    *localhost*|*127.0.0.1*)
      ;;
    *)
      if [ "${CONFIRM_REMOTE}" != "yes" ]; then
        echo -e "${COLOR_RED}[BLOCKED]${COLOR_NC} BASE_URL is set to a non-localhost target (${BASE_URL})."
        echo "To execute against remote/staging/preview servers, set CONFIRM_REMOTE=yes explicitly."
        exit 1
      fi
      ;;
  esac
}

# Requirement checks
require_secret() {
  if [ -z "${VAPI_SERVER_SECRET}" ]; then
    echo -e "${COLOR_RED}[FAIL]${COLOR_NC} VAPI_SERVER_SECRET ortam değişkeni tanımlı değil."
    echo "Lütfen VAPI_SERVER_SECRET=<secret> olarak export ediniz."
    exit 1
  fi
}

require_clinic_id() {
  if [ -z "${CLINIC_ID}" ]; then
    echo -e "${COLOR_RED}[FAIL]${COLOR_NC} CLINIC_ID ortam değişkeni tanımlı değil."
    echo "Lütfen test kliniğinin ID'sini CLINIC_ID=<id> olarak export ediniz."
    exit 1
  fi
}

log_header() {
  local title="$1"
  echo -e "\n${COLOR_BLUE}================================================================${COLOR_NC}"
  echo -e "${COLOR_BLUE}>>> ${title}${COLOR_NC}"
  echo -e "${COLOR_BLUE}================================================================${COLOR_NC}"
}

log_pass() {
  local name="$1"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  PASSED_TESTS=$((PASSED_TESTS + 1))
  echo -e "  [${COLOR_GREEN}PASS${COLOR_NC}] ${name}"
}

log_fail() {
  local name="$1"
  local details="$2"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  FAILED_TESTS=$((FAILED_TESTS + 1))
  echo -e "  [${COLOR_RED}FAIL${COLOR_NC}] ${name}"
  if [ -n "${details}" ]; then
    echo -e "         ${COLOR_YELLOW}Detay:${COLOR_NC} ${details}"
  fi
}

log_skip() {
  local name="$1"
  local reason="$2"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
  echo -e "  [${COLOR_YELLOW}SKIP${COLOR_NC}] ${name} (${reason})"
}

print_summary() {
  local suite_name="$1"
  echo ""
  echo "--- ${suite_name} Özeti ---"
  echo -e "Toplam: ${TOTAL_TESTS} | Geçen: ${COLOR_GREEN}${PASSED_TESTS}${COLOR_NC} | Başarısız: ${COLOR_RED}${FAILED_TESTS}${COLOR_NC} | Atlanan: ${COLOR_YELLOW}${SKIPPED_TESTS}${COLOR_NC}"
  if [ "${FAILED_TESTS}" -gt 0 ]; then
    return 1
  fi
  return 0
}

# Run safety check on load
check_remote_guard
