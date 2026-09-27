import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware: Validates that incoming requests to /api/vapi/server
 * carry a valid VAPI_SERVER_SECRET in the Authorization header.
 *
 * Vapi sends: Authorization: Bearer <secret>
 * Legacy alternative: X-Vapi-Secret header
 *
 * If validation fails, returns 401 — no further processing occurs.
 */
export function validateVapiSecret(req: Request, res: Response, next: NextFunction): void {
  const serverSecret = process.env.VAPI_SERVER_SECRET;

  if (!serverSecret) {
    console.error('[vapi] VAPI_SERVER_SECRET is not configured — rejecting request');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // Check Authorization: Bearer <secret> header (primary)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === serverSecret) {
      return next();
    }
  }

  // Check legacy X-Vapi-Secret header (fallback)
  const legacySecret = req.headers['x-vapi-secret'];
  if (legacySecret === serverSecret) {
    return next();
  }

  console.warn('[vapi] Unauthorized request — invalid or missing secret');
  res.status(401).json({ error: 'Unauthorized' });
}
