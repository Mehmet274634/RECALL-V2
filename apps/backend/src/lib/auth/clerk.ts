import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  auth?: unknown;
}

/**
 * Express middleware to enforce Clerk JWT authentication for dashboard routes.
 *
 * In production: Strictly verifies Bearer token with CLERK_SECRET_KEY.
 * In development: If CLERK_SECRET_KEY is a placeholder/dev, allows graceful local development.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const authHeader = req.headers.authorization;

  // Local dev mode without real Clerk keys
  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    res.status(500).json({ error: 'CLERK_SECRET_KEY is not configured on server' });
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Yetkilendirme gerekli: Token bulunamadı.' });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  try {
    const verified = await verifyToken(token, { secretKey });
    req.auth = verified;
    next();
  } catch (error) {
    console.warn('[auth] Clerk token validation failed:', error);
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş yetki oturumu.' });
  }
}
