import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { prisma } from '../src/lib/db/client.js';
import { buildPanelSystemPrompt } from '../src/lib/vapi/system-prompt.js';
import {
  canonicalizeJson,
  canonicalizeAndStringify,
  hasToolSchemaDiff,
} from '../src/lib/vapi/schema-canonicalize.js';

export {
  canonicalizeJson,
  canonicalizeAndStringify,
  hasToolSchemaDiff,
};

// Target tools to synchronize
const TARGET_TOOL_NAMES = [
  'book_appointment',
  'lookup_appointment',
  'cancel_appointment',
  'reschedule_appointment',
] as const;

type TargetToolName = (typeof TARGET_TOOL_NAMES)[number];

interface ToolDefinition {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  server?: Record<string, unknown>;
}

interface BackupPayload {
  timestamp: string;
  clinicId: string;
  assistantId: string;
  assistant: Record<string, unknown>;
  tools: Record<string, { id: string; data: Record<string, unknown> }>;
}

// Simple ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Builds the assistant's First Message including KVKK audio recording notice.
 * Preserves the clinic's existing greeting while ensuring legal compliance across all clinics.
 */
export function buildFirstMessage(clinic: { name: string; greetingMessage?: string | null }): string {
  const RECORDING_NOTICE = 'Görüşmelerimiz kalite ve hizmet standartları gereği kaydedilmektedir.';
  const rawGreeting = clinic.greetingMessage?.trim();

  if (!rawGreeting) {
    return `Merhaba, ${clinic.name}'na hoş geldiniz. ${RECORDING_NOTICE} Size nasıl yardımcı olabilirim?`;
  }

  if (rawGreeting.includes('kaydedilmektedir') || rawGreeting.includes('kayıt')) {
    return rawGreeting;
  }

  // Check if greeting contains a closing question/offer like "nasıl yardımcı olabilirim" or "yardımcı olabilirim"
  const assistMatch = rawGreeting.match(/(?:Ben yapay zeka asistanınız,\s*)?(?:randevunuz için |size )?nasıl yardımcı olabilirim\??/i);
  if (assistMatch && assistMatch.index !== undefined) {
    const before = rawGreeting.slice(0, assistMatch.index).trim();
    const assistPhrase = rawGreeting.slice(assistMatch.index).trim();
    const cleanBefore = before.endsWith('.') || before.endsWith('!') ? before : `${before}.`;
    return `${cleanBefore} ${RECORDING_NOTICE} ${assistPhrase}`;
  }

  const cleanGreeting = rawGreeting.endsWith('.') || rawGreeting.endsWith('!') ? rawGreeting : `${rawGreeting}.`;
  return `${cleanGreeting} ${RECORDING_NOTICE}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    apply: boolean;
    yes: boolean;
    mock: boolean;
    clinicId?: string;
    assistantId?: string;
    restoreFile?: string;
  } = {
    apply: false,
    yes: false,
    mock: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '--mock') {
      options.mock = true;
    } else if (arg === '--clinic' && i + 1 < args.length) {
      options.clinicId = args[++i];
    } else if (arg === '--assistant' && i + 1 < args.length) {
      options.assistantId = args[++i];
    } else if (arg === '--restore' && i + 1 < args.length) {
      options.restoreFile = args[++i];
    }
  }

  return options;
}

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${c.bold}${question}${c.reset} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes' || trimmed === 'evet');
    });
  });
}

function loadTargetToolDefinitions(): Map<TargetToolName, ToolDefinition> {
  const possiblePaths = [
    path.resolve(process.cwd(), 'docs/vapi-tools.json'),
    path.resolve(process.cwd(), '../../docs/vapi-tools.json'),
    path.resolve(process.cwd(), '../docs/vapi-tools.json'),
  ];

  let rawJson = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      rawJson = fs.readFileSync(p, 'utf-8');
      break;
    }
  }

  if (!rawJson) {
    throw new Error('docs/vapi-tools.json dosyası bulunamadı. Lütfen repo kökünden çalıştırınız.');
  }

  const parsed = JSON.parse(rawJson) as ToolDefinition[];
  const toolMap = new Map<TargetToolName, ToolDefinition>();

  for (const item of parsed) {
    const name = item.function?.name as TargetToolName;
    if (TARGET_TOOL_NAMES.includes(name)) {
      toolMap.set(name, item);
    }
  }

  for (const target of TARGET_TOOL_NAMES) {
    if (!toolMap.has(target)) {
      throw new Error(`docs/vapi-tools.json içinde '${target}' tanımı bulunamadı.`);
    }
  }

  return toolMap;
}

function printDiff(title: string, oldText: string, newText: string) {
  console.log(`\n${c.bold}========================================${c.reset}`);
  console.log(`${c.cyan}${title}${c.reset}`);
  console.log(`${c.bold}========================================${c.reset}`);

  if (oldText === newText) {
    console.log(`${c.green}✓ Değişiklik yok (Vapi ile kod birebir eşleşiyor).${c.reset}`);
    return false;
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  console.log(`${c.dim}Mevcut karakter sayısı: ${oldText.length} | Yeni karakter sayısı: ${newText.length}${c.reset}`);
  console.log(`${c.dim}Mevcut satır sayısı: ${oldLines.length} | Yeni satır sayısı: ${newLines.length}${c.reset}\n`);

  // Simple line diff snippet
  let diffCount = 0;
  const maxLine = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLine; i++) {
    const ol = oldLines[i];
    const nl = newLines[i];
    if (ol !== nl) {
      diffCount++;
      if (diffCount <= 12) {
        if (ol !== undefined) console.log(`${c.red}- [${i + 1}] ${ol}${c.reset}`);
        if (nl !== undefined) console.log(`${c.green}+ [${i + 1}] ${nl}${c.reset}`);
      }
    }
  }
  if (diffCount > 12) {
    console.log(`${c.yellow}... ve ${diffCount - 12} farklı satır daha.${c.reset}`);
  }

  return true;
}

async function performRestore(restorePath: string, apiKey: string) {
  if (!fs.existsSync(restorePath)) {
    throw new Error(`Geri yükleme dosyası bulunamadı: ${restorePath}`);
  }

  const raw = fs.readFileSync(restorePath, 'utf-8');
  const backup = JSON.parse(raw) as BackupPayload;

  console.log(`${c.yellow}Geri yüklenecek yedek: ${restorePath}${c.reset}`);
  console.log(`Yedek tarihi: ${backup.timestamp}`);
  console.log(`Assistant ID: ${backup.assistantId}`);

  const confirmed = await askConfirmation('Bu yedeği Vapi paneline geri yüklemek istiyor musunuz? (y/N)');
  if (!confirmed) {
    console.log('İptal edildi.');
    return;
  }

  // Restore Assistant system prompt
  console.log(`[RESTORE] Assistant güncelleniyor (${backup.assistantId})...`);
  const assistantPatch = {
    model: backup.assistant.model,
  };

  const asstRes = await fetch(`https://api.vapi.ai/assistant/${backup.assistantId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(assistantPatch),
  });

  if (!asstRes.ok) {
    throw new Error(`Assistant geri yüklenemedi: ${asstRes.status} ${await asstRes.text()}`);
  }
  console.log(`${c.green}✓ Assistant başarıyla geri yüklendi.${c.reset}`);

  // Restore Tools
  for (const [toolName, toolObj] of Object.entries(backup.tools)) {
    console.log(`[RESTORE] Tool '${toolName}' güncelleniyor (${toolObj.id})...`);
    const toolRes = await fetch(`https://api.vapi.ai/tool/${toolObj.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        function: (toolObj.data as { function?: unknown }).function,
      }),
    });
    if (!toolRes.ok) {
      throw new Error(`Tool ${toolName} geri yüklenemedi: ${toolRes.status} ${await toolRes.text()}`);
    }
    console.log(`${c.green}✓ Tool '${toolName}' başarıyla geri yüklendi.${c.reset}`);
  }

  console.log(`\n${c.green}🎉 Tüm yedek Vapi'ye başarıyla geri yüklendi!${c.reset}`);
}

async function main() {
  const options = parseArgs();

  console.log(`${c.bold}${c.cyan}====================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}           RECALL V2 -> VAPI SYNC SCRIPT            ${c.reset}`);
  console.log(`${c.bold}${c.cyan}====================================================${c.reset}`);
  console.log(`Mod: ${options.apply ? `${c.red}${c.bold}APPLY (CANLI GÜNCELLEME)${c.reset}` : `${c.green}${c.bold}DRY-RUN (SADECE KARŞILAŞTIRMA)${c.reset}`}`);

  const apiKey = (process.env.VAPI_API_KEY || '').trim();

  // If restore is requested
  if (options.restoreFile) {
    if (!apiKey) {
      throw new Error('VAPI_API_KEY ortam değişkeni tanımlanmalıdır.');
    }
    await performRestore(options.restoreFile, apiKey);
    return;
  }

  // 1. Clinic validation
  if (!options.clinicId) {
    // List available clinics in DB to help the user
    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, phoneNumber: true },
    });
    console.error(`\n${c.red}Hata: --clinic <id> parametresi zorunludur.${c.reset}`);
    console.log('Veritabanında kayıtlı klinikler:');
    for (const cl of clinics) {
      console.log(`  - ${cl.name} (ID: ${c.bold}${cl.id}${c.reset}, Tel: ${cl.phoneNumber})`);
    }
    console.log(`\nÖrnek kullanım: pnpm sync:vapi --clinic ${clinics[0]?.id || '<CLINIC_ID>'}`);
    process.exit(1);
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: options.clinicId },
  });
  if (!clinic) {
    throw new Error(`Belirtilen klinik bulunamadı: ID "${options.clinicId}"`);
  }
  console.log(`Hedef Klinik: ${c.bold}${clinic.name}${c.reset} (${clinic.id})`);

  // 2. Build local panel prompt and load tool definitions
  console.log('\n[1/4] Koddan güncel Vapi Panel promptu ve tool şemaları üretiliyor...');
  const newPanelPrompt = await buildPanelSystemPrompt(clinic.id);
  const localTools = loadTargetToolDefinitions();
  console.log(`${c.green}✓ Panel promptu üretildi (${newPanelPrompt.length} karakter).${c.reset}`);
  console.log(`${c.green}✓ ${localTools.size} adet hedef tool şeması docs/vapi-tools.json dosyasından okundu.${c.reset}`);

  console.log(`\n${c.bold}========================================${c.reset}`);
  console.log(`${c.cyan}GÜNCEL ÜRETİLEN SİSTEM PROMPTU (VAPI PANEL):${c.reset}`);
  console.log(`${c.bold}========================================${c.reset}`);
  console.log(newPanelPrompt);
  console.log(`${c.bold}========================================${c.reset}\n`);

  // 3. Fetch or mock current Vapi state
  let currentAssistant: Record<string, unknown> | null = null;
  let currentTools: Map<string, { id: string; data: Record<string, unknown> }> = new Map();
  let assistantId = options.assistantId || process.env.VAPI_ASSISTANT_ID;

  if (options.mock) {
    console.log(`\n${c.yellow}[BİLGİ] Mock modunda çalışılıyor (Vapi API çağrısı yapılmıyor).${c.reset}`);
    // Load docs/vapi-system-prompt.txt as baseline mock
    const possiblePromptPaths = [
      path.resolve(process.cwd(), 'docs/vapi-system-prompt.txt'),
      path.resolve(process.cwd(), '../../docs/vapi-system-prompt.txt'),
      path.resolve(process.cwd(), '../docs/vapi-system-prompt.txt'),
    ];
    let mockPrompt = '';
    for (const pp of possiblePromptPaths) {
      if (fs.existsSync(pp)) {
        mockPrompt = fs.readFileSync(pp, 'utf-8');
        break;
      }
    }

    currentAssistant = {
      id: assistantId || 'mock-assistant-id',
      name: `${clinic.name} Asistanı`,
      firstMessage: clinic.greetingMessage || `Merhaba, ${clinic.name}'na hoş geldiniz. Size nasıl yardımcı olabilirim?`,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [{ role: 'system', content: mockPrompt }],
      },
    };

    for (const [name, def] of localTools.entries()) {
      currentTools.set(name, {
        id: `mock-tool-id-${name}`,
        data: def as unknown as Record<string, unknown>,
      });
    }
  } else {
    // Real Vapi API mode
    if (!apiKey || apiKey === 'placeholder' || apiKey.startsWith('dev-')) {
      throw new Error(
        'apps/backend/.env dosyasında VAPI_API_KEY tanımlı değil veya "placeholder" durumunda.\nLütfen Vapi hesabınızdan Private API Key\'inizi apps/backend/.env dosyasına ekleyiniz.',
      );
    }

    // Auto-discover assistant if not provided
    if (!assistantId) {
      console.log('\n[2/4] VAPI_ASSISTANT_ID tanımlı değil. Asistanlar Vapi API üzerinden taranıyor...');
      const listAsstRes = await fetch('https://api.vapi.ai/assistant', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!listAsstRes.ok) {
        throw new Error(`Vapi asistan listesi alınamadı: ${listAsstRes.status} ${await listAsstRes.text()}`);
      }
      const assistants = (await listAsstRes.json()) as Array<{ id: string; name?: string }>;
      const matching = assistants.filter((a) => {
        const n = (a.name || '').trim().toLowerCase();
        return (
          n === 'recall klinik sekreteri' ||
          n === 'recall sağlık kliniği' ||
          (n.includes('recall') && (n.includes('klinik') || n.includes('sekreter')))
        );
      });

      if (matching.length === 0) {
        console.error(`${c.red}Hata: "Recall Klinik Sekreteri" / "Recall Sağlık Kliniği" adında bir asistan bulunamadı.${c.reset}`);
        console.log('Hesabınızdaki mevcut asistanlar:');
        for (const a of assistants) {
          console.log(`  - ID: ${a.id}, İsim: "${a.name || 'İsimsiz'}"`);
        }
        throw new Error('Hedef asistan bulunamadı. Lütfen --assistant <id> parametresiyle belirtiniz.');
      } else if (matching.length > 1) {
        console.error(`${c.red}Hata: Eşleşen birden fazla (${matching.length}) asistan bulundu.${c.reset}`);
        console.log('Eşleşen asistanlar:');
        for (const a of matching) {
          console.log(`  - ID: ${a.id}, İsim: "${a.name}"`);
        }
        throw new Error('Birden fazla eşleşme olduğundan tahmin yapılamıyor. Lütfen hedef ID\'yi --assistant <id> ile belirtiniz.');
      }

      // Exactly one match
      assistantId = matching[0].id;
      console.log(`${c.green}✓ Asistan bulundu: "${matching[0].name}" (${assistantId})${c.reset}`);

      // Save to .env
      const envPaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), 'apps/backend/.env'),
        path.resolve(process.cwd(), '../backend/.env'),
      ];
      for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
          let content = fs.readFileSync(envPath, 'utf-8');
          if (content.includes('VAPI_ASSISTANT_ID=')) {
            content = content.replace(/VAPI_ASSISTANT_ID=.*/g, `VAPI_ASSISTANT_ID="${assistantId}"`);
          } else {
            content += `\nVAPI_ASSISTANT_ID="${assistantId}"\n`;
          }
          fs.writeFileSync(envPath, content, 'utf-8');
          console.log(`${c.dim}[BİLGİ] Asistan ID'si ${envPath} dosyasına kaydedildi.${c.reset}`);
          break;
        }
      }
    } else {
      console.log(`\n[2/4] Asistan ID: ${assistantId}`);
    }

    console.log('Vapi API üzerinden mevcut asistan ve tool şemaları okunuyor...');
    const asstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!asstRes.ok) {
      throw new Error(`Vapi Assistant alınamadı (${assistantId}): ${asstRes.status} ${await asstRes.text()}`);
    }
    currentAssistant = (await asstRes.json()) as Record<string, unknown>;

    // Fetch tools from Vapi
    const toolsRes = await fetch('https://api.vapi.ai/tool', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!toolsRes.ok) {
      throw new Error(`Vapi Tools listelenemedi: ${toolsRes.status} ${await toolsRes.text()}`);
    }
    const allVapiTools = (await toolsRes.json()) as Array<{ id: string; function?: { name?: string } }>;
    for (const t of allVapiTools) {
      const name = t.function?.name as TargetToolName | undefined;
      if (name && TARGET_TOOL_NAMES.includes(name)) {
        currentTools.set(name, { id: t.id, data: t as Record<string, unknown> });
      }
    }

    // Verify all 4 target tools are found in Vapi
    for (const requiredName of TARGET_TOOL_NAMES) {
      if (!currentTools.has(requiredName)) {
        throw new Error(
          `Vapi üzerinde '${requiredName}' adlı tool bulunamadı. Lütfen Vapi Dashboard'da tool'un oluşturulduğundan emin olunuz.`,
        );
      }
    }
  }

  // 4. Compare and display diffs
  console.log('\n[3/4] Kod ile Vapi mevcut durumu karşılaştırılıyor...');

  const modelObj = (currentAssistant.model as Record<string, unknown>) || {};
  const messages = (modelObj.messages as Array<{ role: string; content: string }>) || [];
  const systemMsg = messages.find((m) => m.role === 'system');
  const currentPromptContent = systemMsg?.content || '';

  const promptHasDiff = printDiff('ASSISTANT SYSTEM PROMPT FARKI', currentPromptContent, newPanelPrompt);

  const newFirstMessage = buildFirstMessage(clinic);
  const currentFirstMessage = ((currentAssistant?.firstMessage as string) || '').trim();
  const firstMessageHasDiff = printDiff(
    'ASSISTANT FIRST MESSAGE (KVKK AYDINLATMA) FARKI',
    currentFirstMessage,
    newFirstMessage,
  );

  let toolsHaveDiff = false;
  for (const toolName of TARGET_TOOL_NAMES) {
    const localDef = localTools.get(toolName)!;
    const vapiTool = currentTools.get(toolName);
    const vapiParams =
      ((vapiTool?.data as { function?: { parameters?: unknown } })?.function?.parameters) || {};

    const localParamsJson = canonicalizeAndStringify(localDef.function.parameters);
    const vapiParamsJson = canonicalizeAndStringify(vapiParams);

    const hasDiff = printDiff(`TOOL PARAMETRELERİ: ${toolName}`, vapiParamsJson, localParamsJson);
    if (hasDiff) toolsHaveDiff = true;
  }

  // 5. Handle Apply vs Dry-Run
  if (!options.apply) {
    console.log(`\n${c.bold}====================================================${c.reset}`);
    console.log(`${c.green}${c.bold}DRY-RUN TAMAMLANDI (Vapi'ye hiçbir istek yazılmadı).${c.reset}`);
    if (promptHasDiff || toolsHaveDiff || firstMessageHasDiff) {
      console.log(`${c.yellow}Farklar tespit edildi. Bu değişiklikleri Vapi'ye uygulamak için:${c.reset}`);
      console.log(`  ${c.cyan}pnpm sync:vapi --clinic ${clinic.id} --apply${c.reset}`);
    } else {
      console.log(`${c.green}Harika! Vapi paneli ile kod şemaları zaten %100 senkron.${c.reset}`);
    }
    console.log(`${c.bold}====================================================${c.reset}\n`);
    return;
  }

  // APPLY MODE
  if (!promptHasDiff && !toolsHaveDiff && !firstMessageHasDiff) {
    console.log(`\n${c.green}Değişiklik bulunamadı, Vapi zaten güncel.${c.reset}`);
    return;
  }

  if (!options.yes) {
    const confirmed = await askConfirmation('\nBu değişiklikleri Vapi paneline CANLI olarak uygulamak istiyor musunuz? (y/N)');
    if (!confirmed) {
      console.log('İşlem kullanıcı tarafından iptal edildi.');
      return;
    }
  }

  // 6. Create Backup
  console.log('\n[4/4] Yedek alınıyor ve Vapi güncelleniyor...');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `vapi-${nowStr}.json`;
  const backupFilePath = path.join(backupDir, backupFilename);

  const backupPayload: BackupPayload = {
    timestamp: new Date().toISOString(),
    clinicId: clinic.id,
    assistantId: assistantId!,
    assistant: currentAssistant,
    tools: Object.fromEntries(currentTools.entries()),
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  console.log(`${c.green}✓ Mevcut Vapi durumu yedeklendi:${c.reset} ${backupFilePath}`);

  // 7. Execute PATCH for Assistant (only if prompt or firstMessage changed)
  if (promptHasDiff || firstMessageHasDiff) {
    const updatedMessages = messages.filter((m) => m.role !== 'system');
    updatedMessages.unshift({ role: 'system', content: newPanelPrompt });

    const asstPatchPayload: Record<string, unknown> = {
      firstMessage: newFirstMessage,
      model: {
        ...modelObj,
        messages: updatedMessages,
      },
    };

    console.log(`[PATCH] Assistant (${assistantId}) system prompt güncelleniyor...`);
    const patchAsstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(asstPatchPayload),
    });

    if (!patchAsstRes.ok) {
      throw new Error(`Assistant güncellenemedi: ${patchAsstRes.status} ${await patchAsstRes.text()}`);
    }
    console.log(`${c.green}✓ Assistant system promptu başarıyla güncellendi.${c.reset}`);
  } else {
    console.log(`${c.dim}[ATLANDI] Assistant system prompt ve firstMessage zaten güncel.${c.reset}`);
  }

  // 8. Execute PATCH for each Tool that actually has diff
  for (const toolName of TARGET_TOOL_NAMES) {
    const vapiTool = currentTools.get(toolName)!;
    const localDef = localTools.get(toolName)!;
    const vapiParams =
      ((vapiTool.data as { function?: { parameters?: unknown } })?.function?.parameters) || {};

    if (!hasToolSchemaDiff(vapiParams, localDef.function.parameters)) {
      console.log(`${c.dim}[ATLANDI] Tool '${toolName}' parametreleri zaten güncel, PATCH atlanıyor.${c.reset}`);
      continue;
    }

    console.log(`[PATCH] Tool '${toolName}' (${vapiTool.id}) parametreleri güncelleniyor...`);
    const toolPatchPayload = {
      function: {
        ...(vapiTool.data as { function?: Record<string, unknown> }).function,
        parameters: localDef.function.parameters,
      },
    };

    const patchToolRes = await fetch(`https://api.vapi.ai/tool/${vapiTool.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolPatchPayload),
    });

    if (!patchToolRes.ok) {
      throw new Error(`Tool '${toolName}' güncellenemedi: ${patchToolRes.status} ${await patchToolRes.text()}`);
    }
    console.log(`${c.green}✓ Tool '${toolName}' başarıyla güncellendi.${c.reset}`);
  }

  console.log(`\n${c.bold}${c.green}🎉 TEBRİKLER! Vapi paneli başarıyla güncellendi.${c.reset}`);
  console.log(`Olası bir sorunda geri almak için:`);
  console.log(`  ${c.cyan}pnpm sync:vapi --restore ${backupFilePath}${c.reset}\n`);
}

main()
  .catch((err) => {
    console.error(`\n${c.red}[HATA] ${err.message}${c.reset}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
