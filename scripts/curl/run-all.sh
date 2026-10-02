#!/usr/bin/env bash
# ==============================================================================
# run-all.sh: Tüm Curl Testlerini Sırayla Çalıştıran Ana Orkestrasyon Scripti
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

echo -e "${COLOR_BLUE}################################################################${COLOR_NC}"
echo -e "${COLOR_BLUE}# RECALL V2 - End-to-End Curl Test Paketi                      #${COLOR_NC}"
echo -e "${COLOR_BLUE}# Hedef: ${BASE_URL}                                           #${COLOR_NC}"
echo -e "${COLOR_BLUE}################################################################${COLOR_NC}"

SUITE_SCRIPTS=(
  "01-health.sh"
  "02-assistant-request.sh"
  "03-check-availability.sh"
  "04-book-appointment.sh"
  "05-lookup-cancel-reschedule.sh"
  "06-end-of-call-report.sh"
  "07-auth-negative.sh"
)

TOTAL_SUITES=${#SUITE_SCRIPTS[@]}
PASSED_SUITES=0
FAILED_SUITES=0
FAILED_LIST=()

for script in "${SUITE_SCRIPTS[@]}"; do
  script_path="${SCRIPT_DIR}/${script}"
  if [ ! -f "${script_path}" ]; then
    echo -e "${COLOR_RED}[HATA] Script bulunamadı: ${script}${COLOR_NC}"
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_LIST+=("${script} (dosya yok)")
    continue
  fi

  bash "${script_path}"
  exit_code=$?

  if [ ${exit_code} -eq 0 ]; then
    PASSED_SUITES=$((PASSED_SUITES + 1))
  else
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_LIST+=("${script} (exit code: ${exit_code})")
  fi
done

echo ""
echo -e "${COLOR_BLUE}================================================================${COLOR_NC}"
echo -e "${COLOR_BLUE}>>> GENEL TEST KOŞUMU SONUÇ TABLOSU                            ${COLOR_NC}"
echo -e "${COLOR_BLUE}================================================================${COLOR_NC}"
echo -e "Toplam Test Paketi : ${TOTAL_SUITES}"
echo -e "Başarılı           : ${COLOR_GREEN}${PASSED_SUITES}${COLOR_NC}"
echo -e "Başarısız          : ${COLOR_RED}${FAILED_SUITES}${COLOR_NC}"

if [ ${FAILED_SUITES} -gt 0 ]; then
  echo ""
  echo -e "${COLOR_RED}Başarısız Olan Scriptler:${COLOR_NC}"
  for item in "${FAILED_LIST[@]}"; do
    echo -e "  - ${COLOR_RED}${item}${COLOR_NC}"
  done
  echo ""
  exit 1
fi

echo ""
echo -e "${COLOR_GREEN}Tüm test paketleri başarıyla tamamlandı.${COLOR_NC}"
exit 0
