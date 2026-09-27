import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';

export interface AuthenticatedRequest extends Request {
  auth?: Record<string, unknown>;
  clinicId?: string;
}

/**
 * Resolves the clinicId for the authenticated user/session.
 * Priority:
 * 1. Token custom claim: clinicId
 * 2. Token publicMetadata or metadata: clinicId
 * 3. Token organization ID (org_id / orgId) matching Clinic
 * 4. Default registered clinic (MVP single-tenant fallback)
 */
async function resolveClinicId(verifiedClaims?: Record<string, unknown>): Promise<string> {
  if (verifiedClaims) {
    if (typeof verifiedClaims.clinicId === 'string' && verifiedClaims.clinicId) {
      return verifiedClaims.clinicId;
    }

    const publicMetadata = verifiedClaims.public_metadata || verifiedClaims.publicMetadata;
    if (publicMetadata && typeof publicMetadata === 'object' && 'clinicId' in publicMetadata) {
      const cid = (publicMetadata as Record<string, unknown>).clinicId;
      if (typeof cid === 'string' && cid) return cid;
    }

    const orgId = verifiedClaims.org_id || verifiedClaims.orgId;
    if (typeof orgId === 'string' && orgId) {
      const clinic = await prisma.clinic.findFirst({
        where: { id: orgId },
      });
      if (clinic) return clinic.id;
    }
  }

  // MVP single-tenant fallback: bind to the registered clinic
  const defaultClinic = await getDefaultClinic();
  return defaultClinic.id;
}

/**
 * Express middleware to enforce Clerk JWT authentication for dashboard routes.
 *
 * In production: Strictly verifies Bearer token with CLERK_SECRET_KEY, resolves
 * the tenant's clinicId, and attaches it securely to req.clinicId.
 *
 * In development: If CLERK_SECRET_KEY is a placeholder/dev, allows local development
 * while still securely stamping req.clinicId from the database.
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
      try {
        req.clinicId = await resolveClinicId();
        return next();
      } catch {
        res.status(500).json({ error: 'Veritabanında kayıtlı klinik bulunamadı' });
        return;
      }
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
    req.auth = verified as Record<string, unknown>;
    req.clinicId = await resolveClinicId(verified as Record<string, unknown>);

    if (!req.clinicId) {
      res.status(403).json({ error: 'Kullanıcıya atanmış geçerli bir klinik bulunamadı.' });
      return;
    }

    next();
  } catch (error) {
    console.warn('[auth] Clerk token validation failed:', error);
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş yetki oturumu.' });
  }
}
