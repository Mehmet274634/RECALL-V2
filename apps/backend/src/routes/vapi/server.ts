import { Router } from 'express';

import { validateVapiSecret } from '../../lib/vapi/validate-secret.js';
import { handleServerMessage } from '../../lib/vapi/server-handler.js';

export const vapiRouter = Router();

// VAPI_SERVER_SECRET validation MUST run before any dispatch (CONVENTIONS.md §5)
vapiRouter.use(validateVapiSecret);

/**
 * POST /api/vapi/server
 *
 * Single Server URL endpoint for Vapi (ADR-006).
 * This route ONLY dispatches to lib/vapi/server-handler.ts based on message.type.
 * NO business logic is written here — ever.
 */
vapiRouter.post('/', async (req, res) => {
  await handleServerMessage(req, res);
});
