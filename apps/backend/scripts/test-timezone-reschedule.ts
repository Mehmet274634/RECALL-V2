import { parseIstanbulDate, getIstanbulDayRange } from '../src/lib/date-utils.js';

function runTimezoneTests() {
  console.log('🧪 Starting Timezone Reschedule Round-Trip Verification...\n');

  // Test 1: Frontend sends string with +03:00
  const inputDate = '2026-09-29';
  const inputTime = '17:40';
  const isoWithOffset = `${inputDate}T${inputTime}:00+03:00`;

  const parsedWithOffset = parseIstanbulDate(isoWithOffset);
  console.log(`Test 1: Input "${isoWithOffset}"`);
  console.log(`  UTC ISO: ${parsedWithOffset.toISOString()}`);
  if (parsedWithOffset.toISOString() !== '2026-09-29T14:40:00.000Z') {
    throw new Error(`Test 1 failed! Expected 2026-09-29T14:40:00.000Z, got ${parsedWithOffset.toISOString()}`);
  }
  console.log('  ✅ Correctly parsed to 14:40:00.000Z in UTC (17:40 TRT).\n');

  // Test 2: Backend receives timezone-naive string "2026-09-29T17:40:00"
  const naiveIso = `${inputDate}T${inputTime}:00`;
  const parsedNaive = parseIstanbulDate(naiveIso);
  console.log(`Test 2: Naive input "${naiveIso}"`);
  console.log(`  UTC ISO: ${parsedNaive.toISOString()}`);
  if (parsedNaive.toISOString() !== '2026-09-29T14:40:00.000Z') {
    throw new Error(`Test 2 failed! Expected 2026-09-29T14:40:00.000Z, got ${parsedNaive.toISOString()}`);
  }
  console.log('  ✅ Server interpreted naive string as Europe/Istanbul time!\n');

  // Test 3: Display formatting in Europe/Istanbul
  const dbSavedUtc = parsedWithOffset.toISOString(); // "2026-09-29T14:40:00.000Z"
  const formattedTime = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dbSavedUtc));

  console.log(`Test 3: Displaying "${dbSavedUtc}" in Europe/Istanbul:`);
  console.log(`  Formatted Time: ${formattedTime}`);
  if (formattedTime !== '17:40') {
    throw new Error(`Test 3 failed! Expected 17:40, got ${formattedTime}`);
  }
  console.log('  ✅ Formatted exactly as 17:40 in Turkish locale!\n');

  // Test 4: Modal extraction using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(dbSavedUtc));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const extractedDate = `${get('year')}-${get('month')}-${get('day')}`;
  const extractedTime = `${get('hour')}:${get('minute')}`;

  console.log(`Test 4: Modal field pre-population:`);
  console.log(`  Date input value: ${extractedDate}`);
  console.log(`  Time input value: ${extractedTime}`);
  if (extractedDate !== '2026-09-29' || extractedTime !== '17:40') {
    throw new Error(`Test 4 failed! Expected 2026-09-29 and 17:40, got ${extractedDate} ${extractedTime}`);
  }
  console.log('  ✅ Modal inputs pre-filled accurately with 2026-09-29 and 17:40!\n');

  // Test 5: Re-submitting from modal (simulating reschedule click)
  const resubmittedIso = `${extractedDate}T${extractedTime}:00+03:00`;
  const resubmittedParsed = parseIstanbulDate(resubmittedIso);
  console.log(`Test 5: Reschedule re-submit:`);
  console.log(`  Payload: ${resubmittedIso}`);
  console.log(`  Server parsed UTC: ${resubmittedParsed.toISOString()}`);
  if (resubmittedParsed.toISOString() !== dbSavedUtc) {
    throw new Error(`Test 5 failed! Time drift detected! ${dbSavedUtc} !== ${resubmittedParsed.toISOString()}`);
  }
  console.log('  ✅ Zero time drift! Saved timestamp unchanged upon re-save.\n');

  // Test 6: getIstanbulDayRange query boundary check
  const { startOfDay, endOfDay } = getIstanbulDayRange('2026-09-29');
  console.log(`Test 6: Day Range for 2026-09-29:`);
  console.log(`  startOfDay: ${startOfDay.toISOString()}`);
  console.log(`  endOfDay:   ${endOfDay.toISOString()}`);
  if (startOfDay.toISOString() !== '2026-09-28T21:00:00.000Z' || endOfDay.toISOString() !== '2026-09-29T20:59:59.999Z') {
    throw new Error(`Test 6 failed! Unexpected day range: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);
  }
  console.log('  ✅ Day range matches exactly 00:00:00 to 23:59:59 in Istanbul (21:00 to 20:59:59 UTC)!\n');

  console.log('🎉 ALL TIMEZONE TESTS PASSED SUCCESSFULLY!');
}

runTimezoneTests();
