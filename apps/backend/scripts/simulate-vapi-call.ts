/**
 * End-to-end simulation of a Vapi call flow:
 * 1. tool-call: check_availability
 * 2. tool-call: book_appointment
 * 3. end-of-call-report
 */

const SERVER_URL = 'http://localhost:3001/api/vapi/server';
const SECRET = process.env.VAPI_SERVER_SECRET || 'dev-secret-change-me';

async function sendVapiMessage(payload: Record<string, unknown>) {
  const res = await fetch(SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi request failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function runSimulation() {
  console.log('=== VAPI END-TO-END APPOINTMENT BOOKING SIMULATION ===\n');

  const testCallId = `vapi-e2e-call-${Date.now()}`;

  // Step 1: Assistant checks availability
  console.log('1. Simulating Vapi assistant calling tool "check_availability"...');
  const checkRes = await sendVapiMessage({
    message: {
      type: 'tool-calls',
      call: { id: testCallId },
      toolCallList: [
        {
          id: 'call_tool_check_1',
          type: 'function',
          function: {
            name: 'check_availability',
            arguments: JSON.stringify({
              doctorName: 'Ahmet',
              date: '2026-09-30',
            }),
          },
        },
      ],
    },
  });

  console.log('Vapi received tool result:');
  console.log(checkRes.results[0].result);
  console.log('\n----------------------------------------------------\n');

  // Step 2: Caller chooses time, Assistant books appointment
  console.log('2. Simulating Vapi assistant calling tool "book_appointment"...');
  const bookRes = await sendVapiMessage({
    message: {
      type: 'tool-calls',
      call: { id: testCallId },
      toolCallList: [
        {
          id: 'call_tool_book_2',
          type: 'function',
          function: {
            name: 'book_appointment',
            arguments: JSON.stringify({
              patientName: 'Zeynep Demir',
              patientPhone: '+905338887766',
              doctorName: 'Ahmet',
              date: '2026-09-30',
              time: '10:00',
            }),
          },
        },
      ],
    },
  });

  console.log('Vapi received booking confirmation:');
  console.log(bookRes.results[0].result);
  console.log('\n----------------------------------------------------\n');

  // Step 3: Call finishes, Vapi sends end-of-call-report
  console.log('3. Simulating Vapi sending "end-of-call-report"...');
  const endReportRes = await sendVapiMessage({
    message: {
      type: 'end-of-call-report',
      call: {
        id: testCallId,
        endedReason: 'customer-ended-call',
      },
      transcript:
        'Hasta: Merhaba, 30 Eylül için Dr. Ahmet Bey\'e randevu almak istiyorum.\nAsistan: Tabii, 09:00, 09:30 ve 10:00 saatleri müsait. Hangisini istersiniz?\nHasta: 09:30 olsun lütfen.\nAsistan: Adınız ve telefon numaranız nedir?\nHasta: Zeynep Demir, 0533 888 77 66.\nAsistan: Sayın Zeynep Demir, Dr. Ahmet Yılmaz ile 30 Eylül Çarşamba saat 09:30 için randevunuz oluşturuldu.',
      summary:
        'Hasta Zeynep Demir arayarak Dr. Ahmet Yılmaz için 30 Eylül 09:30 randevusu aldı. Randevu onaylandı.',
    },
  });

  console.log('End of call report acknowledged:', endReportRes);
  console.log('\n=== SIMULATION COMPLETED SUCCESSFULLY! ===');
}

runSimulation().catch(console.error);
