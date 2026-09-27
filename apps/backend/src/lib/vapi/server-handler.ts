import type { Request, Response } from 'express';

/**
 * Central dispatcher for all Vapi Server URL messages (ADR-006).
 *
 * Routes based on `message.type`:
 * - Synchronous (must return JSON): assistant-request, tool-calls,
 *   transfer-destination-request, knowledge-base-request
 * - Fire-and-forget (return 200): status-update, end-of-call-report,
 *   speech-update, transcript, hang, etc.
 *
 * Business logic lives in lib/vapi/tools/* and lib/scheduling/*.
 * This handler only dispatches.
 */
export function handleServerMessage(req: Request, res: Response): void {
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
      handleToolCalls(body, res);
      break;

    case 'assistant-request':
      // Faz 1+: Dynamic assistant config
      console.log('[vapi] assistant-request received — not yet implemented');
      res.status(200).json({});
      break;

    case 'transfer-destination-request':
      // Faz 1+: Call transfer handling
      console.log('[vapi] transfer-destination-request received — not yet implemented');
      res.status(200).json({});
      break;

    case 'knowledge-base-request':
      // Faz 1+: Knowledge base lookup
      console.log('[vapi] knowledge-base-request received — not yet implemented');
      res.status(200).json({});
      break;

    // --- Fire-and-forget message types (return 200) ---
    case 'status-update':
      console.log(`[vapi] status-update: ${body?.message?.status || 'unknown'}`);
      res.status(200).json({});
      break;

    case 'end-of-call-report':
      handleEndOfCallReport(body);
      res.status(200).json({});
      break;

    case 'speech-update':
    case 'transcript':
    case 'hang':
    case 'conversation-update':
      console.log(`[vapi] ${messageType} received — acknowledged`);
      res.status(200).json({});
      break;

    default:
      console.log(`[vapi] Unknown message.type: ${messageType} — acknowledged`);
      res.status(200).json({});
      break;
  }
}

/**
 * Handles tool-calls message type.
 * Dispatches to the appropriate tool handler based on function name.
 *
 * Faz 0: Skeleton only — logs the call and returns a placeholder result.
 * Faz 1: Will dispatch to lib/vapi/tools/{check-availability,book-appointment,...}.ts
 */
function handleToolCalls(body: Record<string, unknown>, res: Response): void {
  const message = body?.message as Record<string, unknown> | undefined;
  const toolCallList = message?.toolCallList as Array<Record<string, unknown>> | undefined;

  if (!toolCallList || toolCallList.length === 0) {
    console.warn('[vapi] tool-calls received but toolCallList is empty');
    res.status(200).json({ results: [] });
    return;
  }

  const results = toolCallList.map((toolCall) => {
    const toolCallId = toolCall.id as string;
    const functionCall = toolCall.function as Record<string, unknown> | undefined;
    const functionName = functionCall?.name as string | undefined;

    console.log(`[vapi] tool-call: ${functionName || 'unknown'} (id: ${toolCallId})`);

    // Faz 0: Return placeholder — real dispatch in Faz 1
    // Faz 1 will: switch on functionName → dispatch to lib/vapi/tools/*
    return {
      toolCallId,
      result: `Tool "${functionName}" is not yet implemented (Faz 0 skeleton).`,
    };
  });

  res.status(200).json({ results });
}

/**
 * Handles end-of-call-report.
 * Faz 0: Logs basic info. Faz 1: Will write transcript/recording/summary to call_logs.
 */
function handleEndOfCallReport(body: Record<string, unknown>): void {
  const message = body?.message as Record<string, unknown> | undefined;
  const endedReason = message?.endedReason as string | undefined;

  // Do NOT log patient personal data (name, phone, TC) — CONVENTIONS.md §5
  console.log(`[vapi] end-of-call-report: endedReason=${endedReason || 'unknown'}`);
  // Faz 1: Save to call_logs table via Prisma
}
