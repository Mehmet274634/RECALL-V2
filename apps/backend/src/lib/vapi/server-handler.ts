import type { Request, Response } from 'express';

import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import {
  handleCheckAvailability,
  handleBookAppointment,
  handleLookupAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleTransferCall,
} from './tools/index.js';

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
      console.log('[vapi] assistant-request received — returning default assistant config');
      res.status(200).json({});
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
 * Handles tool-calls message type.
 * Dispatches to the appropriate tool handler based on function name.
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

      console.log(`[vapi] Executing tool: ${functionName} (id: ${toolCallId})`);

      let resultText = '';

      switch (functionName) {
        case 'check_availability':
        case 'checkAvailability':
          resultText = await handleCheckAvailability(args);
          break;

        case 'book_appointment':
        case 'bookAppointment':
          resultText = await handleBookAppointment(args, callId);
          break;

        case 'lookup_appointment':
        case 'lookupAppointment':
          resultText = await handleLookupAppointment(args);
          break;

        case 'cancel_appointment':
        case 'cancelAppointment':
          resultText = await handleCancelAppointment(args);
          break;

        case 'reschedule_appointment':
        case 'rescheduleAppointment':
          resultText = await handleRescheduleAppointment(args);
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
 * Saves summary, category, transcript, and recording to CallLog.
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

    const clinic = await getDefaultClinic();

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

    console.log(`[vapi] CallLog saved: ${callLog.id} (callId: ${vapiCallId}, category: ${category})`);
  } catch (error) {
    console.error('[vapi] Error saving end-of-call-report:', error);
  }
}
