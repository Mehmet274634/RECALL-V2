import type { Request, Response } from 'express';

import { prisma } from '../db/client.js';
import { getDefaultClinic, findClinicByPhoneNumber } from '../db/clinic.js';
import {
  handleCheckAvailability,
  handleBookAppointment,
  handleLookupAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleTransferCall,
} from './tools/index.js';
import { buildSystemPromptDetails } from './system-prompt.js';
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

  switch (messageType) {
    // --- Synchronous message types (require JSON response) ---
    case 'tool-calls':
      await handleToolCalls(body, res);
      break;

    case 'assistant-request':
      await handleAssistantRequest(body, res);
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
      await handleEndOfCallReport(body);
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
 * Extracts inbound phone number or clinic identifier from Vapi message payload.
 */
function extractPhoneNumberOrClinic(body: Record<string, unknown>): {
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

  // 2. Custom metadata or assistant overrides
  const assistantOverrides = call?.assistantOverrides as Record<string, unknown> | undefined;
  const variableValues = assistantOverrides?.variableValues as Record<string, unknown> | undefined;
  const metadata = (variableValues || call?.metadata || message?.metadata) as Record<string, unknown> | undefined;
  const clinicId = (metadata?.clinicId || metadata?.clinic_id) as string | undefined;

  // 3. Fallback to customer number if needed for testing
  const callerNumber = customer?.number as string | undefined;

  return {
    phoneNumber: dialedNumber || callerNumber,
    clinicId,
  };
}

/**
 * Resolves Clinic instance from body or defaults.
 */
async function resolveClinicForRequest(body: Record<string, unknown>) {
  const { phoneNumber, clinicId } = extractPhoneNumberOrClinic(body);

  if (clinicId) {
    const clinicById = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });
    if (clinicById) return clinicById;
  }

  if (phoneNumber) {
    const clinicByPhone = await findClinicByPhoneNumber(phoneNumber);
    if (clinicByPhone) return clinicByPhone;
  }

  return getDefaultClinic();
}

/**
 * Handles assistant-request: dynamically builds prompt and config for the resolved clinic.
 */
async function handleAssistantRequest(body: Record<string, unknown>, res: Response): Promise<void> {
  try {
    const clinic = await resolveClinicForRequest(body);
    const { prompt, voiceId, clinicName } = await buildSystemPromptDetails(clinic.id);

    console.log(
      `[vapi] assistant-request resolved for clinic: ${clinicName} (${clinic.id}, phone: ${clinic.phoneNumber})`,
    );

    const assistantConfig: Record<string, unknown> = {
      model: {
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
      },
    };

    if (voiceId) {
      assistantConfig.voice = {
        provider: '11labs',
        model: 'eleven_multilingual_v2',
        voiceId,
      };
    }

    res.status(200).json({
      assistant: assistantConfig,
    });
  } catch (error) {
    console.error('[vapi] Error handling assistant-request:', error);
    res.status(200).json({});
  }
}

/**
 * Handles tool-calls message type.
 * Dispatches to the appropriate tool handler based on function name and tenant clinicId.
 */
async function handleToolCalls(body: Record<string, unknown>, res: Response): Promise<void> {
  const message = body?.message as Record<string, unknown> | undefined;
  const toolCallList = message?.toolCallList as Array<Record<string, unknown>> | undefined;
  const call = (message?.call || body?.call) as Record<string, unknown> | undefined;
  const callId = (call?.id || message?.callId) as string | undefined;

  if (!toolCallList || toolCallList.length === 0) {
    console.warn('[vapi] tool-calls received but toolCallList is empty');
    res.status(200).json({ results: [] });
    return;
  }

  const clinic = await resolveClinicForRequest(body);
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
            resultText = await handleBookAppointment(args, callId, clinicId);
            break;

          case 'lookup_appointment':
          case 'lookupAppointment':
            resultText = await handleLookupAppointment(args, clinicId);
            break;

          case 'cancel_appointment':
          case 'cancelAppointment':
            resultText = await handleCancelAppointment(args, clinicId);
            break;

          case 'reschedule_appointment':
          case 'rescheduleAppointment':
            resultText = await handleRescheduleAppointment(args, clinicId);
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
 * Handles end-of-call-report.
 * Saves summary, category, transcript, and recording to CallLog linked to resolved clinic.
 */
async function handleEndOfCallReport(body: Record<string, unknown>): Promise<void> {
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

    const rawSummary =
      (message?.summary as string) ||
      (analysis?.summary as string) ||
      'Randevu görüşmesi tamamlandı.';

    // Sanitize summary to general operational category (no medical diagnosis) — CONVENTIONS.md §5
    let category = 'Genel Bilgi';
    const lowerSummary = (rawSummary + (transcript || '')).toLowerCase();
    if (lowerSummary.includes('iptal') || lowerSummary.includes('vazgeç')) {
      category = 'Randevu İptali';
    } else if (lowerSummary.includes('randevu') || lowerSummary.includes('oluştur') || lowerSummary.includes('kayıt')) {
      category = 'Randevu Talebi';
    } else if (lowerSummary.includes('değiştir') || lowerSummary.includes('ertele')) {
      category = 'Randevu Değişikliği';
    }

    const summary = `Kategori: ${category}. ${rawSummary.trim()}`;

    const clinic = await resolveClinicForRequest(body);

    const callLog = await prisma.callLog.upsert({
      where: { vapiCallId },
      update: {
        transcript,
        recordingUrl,
        summary,
        endedReason,
      },
      create: {
        clinicId: clinic.id,
        vapiCallId,
        transcript,
        recordingUrl,
        summary,
        endedReason,
      },
    });

    console.log(
      `[vapi] CallLog saved: ${callLog.id} (clinic: ${clinic.name}, callId: ${vapiCallId}, category: ${category})`,
    );
  } catch (error) {
    console.error('[vapi] Error saving end-of-call-report:', error);
  }
}
