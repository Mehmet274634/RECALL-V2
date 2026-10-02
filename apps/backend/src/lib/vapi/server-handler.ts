import type { Request, Response } from 'express';

import { prisma } from '../db/client.js';
import { findClinicByPhoneNumber, findClinicByInboundNumber, normalizeToE164, legacyClinicSelect } from '../db/clinic.js';
import { normalizePhone } from '../phone.js';
import type { Clinic } from '@prisma/client';
import {
  handleCheckAvailability,
  handleBookAppointment,
  handleLookupAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleTransferCall,
} from './tools/index.js';
import { buildSystemPromptDetails } from './system-prompt.js';
import { buildFirstMessage } from './first-message.js';
import { captureBackendException } from '../logging/sentry.js';

/**
 * Central dispatcher for all Vapi Server URL messages (ADR-006).
 *
 * Routes based on `message.type`:
 * - Synchronous (must return JSON): tool-calls, assistant-request,
 *   transfer-destination-request, knowledge-base-request
 * - Fire-and-forget (return 200): status-update, end-of-call-report,
 *   speech-update, transcript, hang, etc.
 */
export async function handleServerMessage(req: Request, res: Response): Promise<void> {
  const body = req.body;
  const messageType: string | undefined = body?.message?.type;

  if (!messageType) {
    console.warn('[vapi] Received request without message.type');
    res.status(400).json({ error: 'Missing message.type' });
    return;
  }

  console.log(`[vapi] Received message.type: ${messageType}`);

  const query = req.query as Record<string, unknown> | undefined;

  switch (messageType) {
    // --- Synchronous message types (require JSON response) ---
    case 'tool-calls':
      await handleToolCalls(body, res, query);
      break;

    case 'assistant-request':
      await handleAssistantRequest(body, res, query);
      break;

    case 'transfer-destination-request':
      console.log('[vapi] transfer-destination-request received');
      res.status(200).json({
        destination: {
          type: 'assistant',
          message: 'Sekreterliğe aktarılıyorsunuz.',
        },
      });
      break;

    case 'knowledge-base-request':
      res.status(200).json({});
      break;

    // --- Fire-and-forget message types (return 200) ---
    case 'status-update':
      console.log(`[vapi] status-update: ${body?.message?.status || 'unknown'}`);
      res.status(200).json({});
      break;

    case 'end-of-call-report':
      await handleEndOfCallReport(body, query);
      res.status(200).json({});
      break;

    case 'speech-update':
    case 'transcript':
    case 'hang':
    case 'conversation-update':
      res.status(200).json({});
      break;

    default:
      console.log(`[vapi] Unhandled message.type: ${messageType} — acknowledged`);
      res.status(200).json({});
      break;
  }
}

/**
 * Masks a phone number for KVKK compliance before logging (e.g. +902125550101 -> +902******01).
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '[YOK]';
  const clean = phone.trim();
  if (clean.toLowerCase().startsWith('sip:')) {
    const atIndex = clean.indexOf('@');
    if (atIndex > 4) {
      const user = clean.slice(4, atIndex);
      const host = clean.slice(atIndex);
      const maskedUser =
        user.length <= 4
          ? '***'
          : `${user.slice(0, 2)}***${user.slice(-2)}`;
      return `sip:${maskedUser}${host}`;
    }
  }
  if (clean.length <= 4) return '***';
  const keepStart = clean.startsWith('+90') ? 5 : Math.min(4, Math.floor(clean.length / 2));
  const keepEnd = 2;
  const maskedLength = Math.max(3, clean.length - keepStart - keepEnd);
  return clean.slice(0, keepStart) + '*'.repeat(maskedLength) + clean.slice(-keepEnd);
}

/**
 * Extracts inbound phone number or clinic identifier from Vapi message payload or request query.
 * Priority:
 * 1. variableValues / metadata clinicId (from Vapi payload)
 * 2. req.query.clinicId / clinic_id (from Vapi Server URL query parameters)
 * 3. Inbound dialed number (to)
 */
export function extractPhoneNumberOrClinic(
  body: Record<string, unknown>,
  query?: Record<string, unknown>,
): {
  dialedNumber?: string;
  callerNumber?: string;
  phoneNumber?: string;
  clinicId?: string;
} {
  const message = body?.message as Record<string, unknown> | undefined;
  const call = (message?.call || body?.call) as Record<string, unknown> | undefined;
  const customer = (message?.customer || call?.customer) as Record<string, unknown> | undefined;
  const phoneNumberObj = (message?.phoneNumber || call?.phoneNumber) as Record<string, unknown> | undefined;

  // 1. Inbound dialed number (to)
  const dialedNumber =
    (phoneNumberObj?.number as string) ||
    (call?.phoneNumber as string) ||
    (call?.to as string) ||
    (message?.to as string);

  // 2. Custom metadata, assistant overrides, or query parameters
  // Priority: 1. variableValues/metadata clinicId, 2. query clinicId
  const assistantOverrides = call?.assistantOverrides as Record<string, unknown> | undefined;
  const variableValues = assistantOverrides?.variableValues as Record<string, unknown> | undefined;
  const metadata = (variableValues || call?.metadata || message?.metadata) as Record<string, unknown> | undefined;
  const metadataClinicId = (metadata?.clinicId || metadata?.clinic_id) as string | undefined;
  const queryClinicId = (query?.clinicId || query?.clinic_id) as string | undefined;
  const clinicId = metadataClinicId || queryClinicId;

  // 3. Customer number (caller)
  const callerNumber = customer?.number as string | undefined;

  return {
    dialedNumber,
    callerNumber,
    phoneNumber: dialedNumber,
    clinicId,
  };
}

export interface CallerInfo {
  rawCallerNumber: string | null;
  normalizedCallerNumber: string | null;
  maskedCallerNumber: string;
  patientId: string | null;
  patient: { id: string; fullName: string; phoneNumber: string } | null;
}

/**
 * Extracts, normalizes and logs caller ID (customer.number) with KVKK-safe masking.
 * Optionally attempts to look up an existing Patient record in the given clinic.
 * Does NOT alter tool flow, ready for future caller ID identification.
 */
export async function resolveCallerInfo(
  body: Record<string, unknown>,
  clinicId?: string,
): Promise<CallerInfo> {
  const message = body?.message as Record<string, unknown> | undefined;
  const call = (message?.call || body?.call) as Record<string, unknown> | undefined;
  const customer = (message?.customer || call?.customer) as Record<string, unknown> | undefined;

  const raw = (customer?.number as string | undefined)?.trim() || null;
  if (!raw) {
    return {
      rawCallerNumber: null,
      normalizedCallerNumber: null,
      maskedCallerNumber: '[YOK]',
      patientId: null,
      patient: null,
    };
  }

  const normalized = normalizeToE164(raw) || normalizePhone(raw);
  const masked = maskPhoneNumber(normalized || raw);

  console.log(`[vapi:caller] Inbound caller identified: ${masked} (clinicId: ${clinicId || 'unresolved'})`);

  let patient: { id: string; fullName: string; phoneNumber: string } | null = null;
  if (clinicId && normalized) {
    try {
      patient = await prisma.patient.findFirst({
        where: {
          clinicId,
          phoneNumber: normalized,
        },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      });
      if (patient) {
        console.log(`[vapi:caller] Matching patient found for caller ${masked}: ${patient.id}`);
      }
    } catch (err) {
      console.error('[vapi:caller] Error matching patient for caller:', err);
    }
  }

  return {
    rawCallerNumber: raw,
    normalizedCallerNumber: normalized,
    maskedCallerNumber: masked,
    patientId: patient?.id || null,
    patient,
  };
}

/**
 * Resolves Clinic instance from body or query.
 * Priority order:
 * 1. clinicId (metadata/variableValues or query.clinicId)
 * 2. Inbound dialed number (to) -> ai_inbound_number (including SIP username match)
 * 3. Inbound dialed number (to) -> phone_number (legacy backup)
 * Caller number (customer.number) is NEVER used to resolve clinic identity.
 * If clinic cannot be resolved, returns null (no fallback to default clinic).
 */
export async function resolveClinicForRequest(
  body: Record<string, unknown>,
  query?: Record<string, unknown>,
): Promise<Clinic | null> {
  const { dialedNumber, clinicId } = extractPhoneNumberOrClinic(body, query);

  // 1. clinicId (variableValues/metadata or query parameter) has absolute top priority
  if (clinicId) {
    try {
      const clinicById = await prisma.clinic.findUnique({
        where: { id: clinicId },
      });
      if (clinicById) return clinicById;
    } catch (error: any) {
      if (error?.code === 'P2022') {
        const clinicById = await prisma.clinic.findUnique({
          where: { id: clinicId },
          select: legacyClinicSelect,
        });
        if (clinicById) return clinicById as Clinic;
      } else {
        throw error;
      }
    }
  }

  // 2. Inbound dialed number (to) -> priority: ai_inbound_number > phone_number
  // SIP URIs check aiInboundNumber (SIP username or full URI) and skip phone/E.164 lookup
  if (dialedNumber) {
    const clinicByInbound = await findClinicByInboundNumber(dialedNumber);
    if (clinicByInbound) return clinicByInbound;
  }

  return null;
}

/**
 * Handles assistant-request: dynamically builds prompt, voice and firstMessage for the resolved clinic.
 * Returns assistantId + assistantOverrides to preserve base assistant tools & configuration.
 */
async function handleAssistantRequest(
  body: Record<string, unknown>,
  res: Response,
  query?: Record<string, unknown>,
): Promise<void> {
  const { dialedNumber, callerNumber } = extractPhoneNumberOrClinic(body, query);

  try {
    const clinic = await resolveClinicForRequest(body, query);
    if (!clinic) {
      const maskedDialed = maskPhoneNumber(dialedNumber);
      const maskedCaller = maskPhoneNumber(callerNumber);
      console.warn(
        `[vapi] Clinic resolution failed for assistant-request (dialed: ${maskedDialed}, caller: ${maskedCaller})`,
      );
      res.status(200).json({
        error:
          'Aradığınız sağlık merkezine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyiniz.',
      });
      return;
    }

    const baseAssistantId =
      process.env.VAPI_BASE_ASSISTANT_ID || process.env.VAPI_ASSISTANT_ID;

    if (!baseAssistantId) {
      console.error(
        '[vapi] VAPI_BASE_ASSISTANT_ID is not configured in environment variables!',
      );
      res.status(200).json({
        error:
          'Aradığınız sağlık merkezine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyiniz.',
      });
      return;
    }

    const { prompt, voiceId, clinicName } = await buildSystemPromptDetails(clinic.id);
    const firstMessage = buildFirstMessage(clinic);

    console.log(
      `[vapi] assistant-request resolved for clinic: ${clinicName} (${clinic.id}, phone: ${clinic.phoneNumber})`,
    );

    const assistantOverrides: Record<string, unknown> = {
      firstMessage,
      model: {
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
      },
      variableValues: {
        clinicId: clinic.id,
      },
      metadata: {
        clinicId: clinic.id,
      },
    };

    if (voiceId) {
      assistantOverrides.voice = {
        provider: '11labs',
        model: 'eleven_multilingual_v2',
        voiceId,
      };
    }

    res.status(200).json({
      assistantId: baseAssistantId,
      assistantOverrides,
    });
  } catch (error) {
    console.error('[vapi] Error handling assistant-request:', error);
    res.status(200).json({
      error:
        'Aradığınız sağlık merkezine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyiniz.',
    });
  }
}

/**
 * Handles tool-calls message type.
 * Dispatches to the appropriate tool handler based on function name and tenant clinicId.
 */
async function handleToolCalls(
  body: Record<string, unknown>,
  res: Response,
  query?: Record<string, unknown>,
): Promise<void> {
  const message = body?.message as Record<string, unknown> | undefined;
  const toolCallList = message?.toolCallList as Array<Record<string, unknown>> | undefined;
  const call = (message?.call || body?.call) as Record<string, unknown> | undefined;
  const callId = (call?.id || message?.callId) as string | undefined;
  const customer = (message?.customer || call?.customer) as Record<string, unknown> | undefined;
  const customerNumber = (customer?.number as string | undefined)?.trim();

  if (!toolCallList || toolCallList.length === 0) {
    console.warn('[vapi] tool-calls received but toolCallList is empty');
    res.status(200).json({ results: [] });
    return;
  }

  const { dialedNumber, callerNumber } = extractPhoneNumberOrClinic(body, query);
  const clinic = await resolveClinicForRequest(body, query);

  if (!clinic) {
    const maskedDialed = maskPhoneNumber(dialedNumber);
    const maskedCaller = maskPhoneNumber(customerNumber || callerNumber);
    console.warn(
      `[vapi] Clinic resolution failed for tool-calls (callId: ${callId || 'unknown'}, dialed: ${maskedDialed}, caller: ${maskedCaller})`,
    );

    const errorMessage =
      'Şu an işleminizi tamamlayamıyorum, lütfen kliniği doğrudan arayarak sekreterliğe ulaşınız.';
    const results = toolCallList.map((toolCall) => ({
      toolCallId: toolCall.id as string,
      result: errorMessage,
    }));
    res.status(200).json({ results });
    return;
  }

  const clinicId = clinic.id;

  const results = await Promise.all(
    toolCallList.map(async (toolCall) => {
      const toolCallId = toolCall.id as string;
      const functionCall = toolCall.function as Record<string, unknown> | undefined;
      const rawName = functionCall?.name as string | undefined;
      const functionName = (rawName || '').trim();

      // Parse arguments (can be object or stringified JSON)
      let args: unknown = {};
      if (typeof functionCall?.arguments === 'string') {
        try {
          args = JSON.parse(functionCall.arguments);
        } catch {
          args = {};
        }
      } else if (typeof functionCall?.arguments === 'object' && functionCall?.arguments !== null) {
        args = functionCall.arguments;
      }

      console.log(
        `[vapi] Executing tool: ${functionName} (id: ${toolCallId}, clinicId: ${clinicId})`,
      );

      let resultText = '';

      try {
        switch (functionName) {
          case 'check_availability':
          case 'checkAvailability':
            resultText = await handleCheckAvailability(args, clinicId);
            break;

          case 'book_appointment':
          case 'bookAppointment':
            resultText = await handleBookAppointment(args, callId, clinicId, customerNumber);
            break;

          case 'lookup_appointment':
          case 'lookupAppointment':
            resultText = await handleLookupAppointment(args, clinicId, customerNumber);
            break;

          case 'cancel_appointment':
          case 'cancelAppointment':
            resultText = await handleCancelAppointment(args, clinicId, customerNumber);
            break;

          case 'reschedule_appointment':
          case 'rescheduleAppointment':
            resultText = await handleRescheduleAppointment(args, clinicId, customerNumber);
            break;

          case 'transfer_call':
          case 'transferCall':
            resultText = await handleTransferCall(args);
            break;

          default:
            console.warn(`[vapi] Unknown tool function called: ${functionName}`);
            resultText = `İstediğiniz "${functionName}" fonksiyonu sistemde tanımlı değil.`;
            break;
        }
      } catch (toolError) {
        console.error(`[vapi] Unexpected error executing tool ${functionName}:`, toolError);
        captureBackendException(toolError, {
          source: 'vapi_tool_execution',
          functionName,
          clinicId,
          toolCallId,
          args,
        });
        resultText = 'Üzgünüm, işleminizi gerçekleştirirken sistemsel bir hata oluştu. Lütfen biraz sonra tekrar deneyiniz.';
      }

      return {
        toolCallId,
        result: resultText,
      };
    }),
  );

  res.status(200).json({ results });
}

/**
 * Sanitizes a call summary by stripping or redacting sensitive medical data
 * (symptoms, diagnoses, complaints, treatments, medications) in compliance with KVKK / CONVENTIONS.md §5.
 * Category is stored in its own dedicated column (CallLog.category) and is not prepended to the summary text.
 */
export function sanitizeCallSummary(rawSummary: string, _category?: string): string {
  if (!rawSummary || !rawSummary.trim()) {
    return 'Randevu görüşmesi tamamlandı.';
  }

  // Regex for Turkish medical terms, complaints, symptoms, diagnoses, medications, treatments
  const medicalPattern = /\b(?:ağrı|sancı|ateş|öksürük|nefes\s+darlığı|çarpıntı|bulantı|kusma|baş\s+dönmesi|hastalık|teşhis|tanı|tedavi|ilaç|ameliyat|kanser|diyabet|şeker|tansiyon|enfeksiyon|iltihap|kanama|kırık|çıkık|fıtık|romatizma|depresyon|panik\s+atak|psikiyatr\w*|anjiyo|tahlil|rapor|grip|covid|şikayet\w*|semptom\w*|belirti\w*|alerji|lezyon|yaralanma|halsizlik|ishal|kabızlık)\b/i;

  // Split into sentences (handling Turkish punctuation: '.', '!', '?')
  const sentences = rawSummary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cleanedSentences: string[] = [];

  for (const sentence of sentences) {
    if (medicalPattern.test(sentence)) {
      cleanedSentences.push('[Tıbbi şikayet/bilgi KVKK gereği gizlendi]');
    } else {
      cleanedSentences.push(sentence);
    }
  }

  // Deduplicate consecutive redaction markers
  let cleanedText = cleanedSentences.join(' ');
  cleanedText = cleanedText.replace(/(\[Tıbbi şikayet\/bilgi KVKK gereği gizlendi\]\s*)+/g, '[Tıbbi şikayet/bilgi KVKK gereği gizlendi] ');

  return cleanedText.trim();
}

/**
 * Extracts only human/user utterances from a multi-line transcript.
 * Ignores assistant/bot greetings and responses so that assistant phrases
 * (like "Randevu hattına hoş geldiniz") don't distort category classification.
 */
export function extractUserTranscript(transcript: string | null): string {
  if (!transcript) return '';
  const lines = transcript.split('\n');
  const userLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(user|human|caller|hasta|arayan):\s*/i.test(trimmed)) {
      userLines.push(trimmed.replace(/^(user|human|caller|hasta|arayan):\s*/i, ''));
    }
  }

  return userLines.join(' ');
}

/**
 * Determines the call category based primarily on the structured call_summary,
 * falling back to user-only transcript statements if the summary is absent or ambiguous.
 *
 * Broad keywords like "kayıt" and "alındı" are avoided to prevent false positives from
 * telephony/KVKK audio disclosure phrases.
 */
export function determineCallCategory(rawSummary: string, transcript: string | null): string {
  const summaryLower = (rawSummary || '').trim().toLowerCase();

  // 1. Check structured call_summary first
  if (summaryLower) {
    // Cancellation
    if (summaryLower.includes('iptal') || summaryLower.includes('vazgeç')) {
      return 'Randevu İptali';
    }
    // Rescheduling
    if (
      summaryLower.includes('değiştir') ||
      summaryLower.includes('ertele') ||
      summaryLower.includes('saat değişikliği') ||
      summaryLower.includes('yeniden planla')
    ) {
      return 'Randevu Değişikliği';
    }
    // General Information: explicitly check for inquiry phrases
    if (
      summaryLower.includes('bilgi soruldu') ||
      summaryLower.includes('bilgi istendi') ||
      summaryLower.includes('bilgi verildi') ||
      summaryLower.includes('bilgi alındı') ||
      summaryLower.includes('soru soruldu') ||
      summaryLower.includes('çalışma saat') ||
      summaryLower.includes('mesai') ||
      summaryLower.includes('hizmet') ||
      summaryLower.includes('branş') ||
      summaryLower.includes('fiyat') ||
      summaryLower.includes('adres')
    ) {
      return 'Genel Bilgi';
    }
    // Appointment creation: specific targeted phrases only (avoid generic "kayıt" / "alındı")
    if (
      summaryLower.includes('randevu oluştur') ||
      summaryLower.includes('randevu alındı') ||
      summaryLower.includes('randevu verildi') ||
      summaryLower.includes('yeni randevu') ||
      summaryLower.includes('randevu kaydı oluşturuldu')
    ) {
      return 'Randevu Talebi';
    }
  }

  // 2. Fallback: inspect ONLY User statements in transcript (ignore AI greeting)
  const userText = extractUserTranscript(transcript).toLowerCase();

  if (userText.includes('iptal') || userText.includes('vazgeç')) {
    return 'Randevu İptali';
  }
  if (
    userText.includes('değiştir') ||
    userText.includes('ertele') ||
    userText.includes('saat değişikliği') ||
    userText.includes('farklı bir gün') ||
    userText.includes('farklı bir saat')
  ) {
    return 'Randevu Değişikliği';
  }
  if (
    userText.includes('randevu al') ||
    userText.includes('randevu oluştur') ||
    userText.includes('randevu istiyorum') ||
    userText.includes('müsait yer') ||
    userText.includes('müsaitlik') ||
    userText.includes('uygun saat')
  ) {
    return 'Randevu Talebi';
  }
  if (
    userText.includes('saat') ||
    userText.includes('nerede') ||
    userText.includes('doktor') ||
    userText.includes('branş') ||
    userText.includes('bilgi') ||
    userText.includes('nasıl gelinir') ||
    userText.includes('hizmet') ||
    userText.includes('ücret')
  ) {
    return 'Genel Bilgi';
  }

  if (summaryLower.includes('bilgi') || summaryLower.includes('danışma')) {
    return 'Genel Bilgi';
  }

  if (summaryLower.includes('randevu')) {
    return 'Randevu Talebi';
  }

  return 'Genel Bilgi';
}

/**
 * Extracts call_summary from Vapi Structured Outputs (artifact.structuredOutputs),
 * completely agnostic of the dynamic UUID key, mapping directly to name === 'call_summary'.
 */
export function extractStructuredCallSummary(
  artifact?: Record<string, unknown>,
  call?: Record<string, unknown>,
  message?: Record<string, unknown>,
): string | null {
  const outputs =
    artifact?.structuredOutputs ||
    (call?.artifact as Record<string, unknown> | undefined)?.structuredOutputs ||
    message?.structuredOutputs ||
    call?.structuredOutputs;

  if (!outputs) return null;

  if (typeof outputs === 'object' && !Array.isArray(outputs)) {
    for (const item of Object.values(outputs as Record<string, unknown>)) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        if (rec.name === 'call_summary' && rec.result != null) {
          const res = typeof rec.result === 'string' ? rec.result : JSON.stringify(rec.result);
          if (res.trim()) return res.trim();
        }
      }
    }
  } else if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        if (rec.name === 'call_summary' && rec.result != null) {
          const res = typeof rec.result === 'string' ? rec.result : JSON.stringify(rec.result);
          if (res.trim()) return res.trim();
        }
      }
    }
  }

  return null;
}

/**
 * Handles end-of-call-report.
 * Saves summary, category, transcript, and recording to CallLog linked to resolved clinic.
 */
async function handleEndOfCallReport(
  body: Record<string, unknown>,
  query?: Record<string, unknown>,
): Promise<void> {
  try {
    const message = body?.message as Record<string, unknown> | undefined;
    const call = (message?.call || body?.call) as Record<string, unknown> | undefined;

    const vapiCallId = (call?.id || message?.callId || `call-${Date.now()}`) as string;
    const endedReason = (message?.endedReason || call?.endedReason || 'completed') as string;

    const artifact = message?.artifact as Record<string, unknown> | undefined;
    const analysis = message?.analysis as Record<string, unknown> | undefined;

    const transcript =
      (message?.transcript as string) ||
      (artifact?.transcript as string) ||
      null;

    const recordingUrl =
      (message?.recordingUrl as string) ||
      (artifact?.recordingUrl as string) ||
      null;

    const structuredSummary = extractStructuredCallSummary(artifact, call, message);
    const rawSummary =
      structuredSummary ||
      (message?.summary as string) ||
      (analysis?.summary as string) ||
      (artifact?.summary as string) ||
      (call?.summary as string) ||
      ((call?.analysis as Record<string, unknown> | undefined)?.summary as string) ||
      'Randevu görüşmesi tamamlandı.';

    // Sanitize summary to general operational category (no medical diagnosis) — CONVENTIONS.md §5
    const category = determineCallCategory(rawSummary, transcript);
    const summary = sanitizeCallSummary(rawSummary, category);

    // Extract duration in seconds from Vapi end-of-call-report payload
    let durationSeconds: number | null = null;
    if (typeof call?.duration === 'number') {
      durationSeconds = Math.round(call.duration);
    } else if (typeof message?.duration === 'number') {
      durationSeconds = Math.round(message.duration as number);
    } else if (typeof (call as Record<string, unknown> | undefined)?.durationSeconds === 'number') {
      durationSeconds = Math.round((call as Record<string, unknown>).durationSeconds as number);
    } else if (call?.startedAt && call?.endedAt) {
      durationSeconds = Math.max(
        0,
        Math.round(
          (new Date(call.endedAt as string).getTime() -
            new Date(call.startedAt as string).getTime()) /
            1000,
        ),
      );
    } else if (message?.startedAt && message?.endedAt) {
      durationSeconds = Math.max(
        0,
        Math.round(
          (new Date(message.endedAt as string).getTime() -
            new Date(message.startedAt as string).getTime()) /
            1000,
        ),
      );
    }

    const { dialedNumber, callerNumber } = extractPhoneNumberOrClinic(body, query);
    const clinic = await resolveClinicForRequest(body, query);
    if (!clinic) {
      const maskedDialed = maskPhoneNumber(dialedNumber);
      const maskedCaller = maskPhoneNumber(callerNumber);
      console.warn(
        `[vapi] Clinic resolution failed for end-of-call-report (callId: ${vapiCallId}, dialed: ${maskedDialed}, caller: ${maskedCaller})`,
      );
      return;
    }

    const callLog = await prisma.callLog.upsert({
      where: { vapiCallId },
      update: {
        transcript,
        recordingUrl,
        summary,
        endedReason,
        category,
        durationSeconds: durationSeconds !== null ? durationSeconds : undefined,
      },
      create: {
        clinicId: clinic.id,
        vapiCallId,
        transcript,
        recordingUrl,
        summary,
        endedReason,
        category,
        durationSeconds: durationSeconds !== null ? durationSeconds : 0,
      },
    });

    console.log(
      `[vapi] CallLog saved: ${callLog.id} (clinic: ${clinic.name}, callId: ${vapiCallId}, category: ${category}, duration: ${durationSeconds}s)`,
    );
  } catch (error) {
    console.error('[vapi] Error saving end-of-call-report:', error);
  }
}
