import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';

export interface AuthenticatedRequest extends Request {
  auth?: Record<string, unknown>;
  clinicId?: string;
}

/**
 * Resolves the clinicId for the authenticated user/session strictly from verified token claims.
 * Returns null if no clinic mapping can be determined from the token.
 *
 * Priority:
 * 1. Token custom claim: clinicId / clinic_id
 * 2. Token public_metadata or metadata: clinicId
 * 3. Token organization ID (org_id / orgId) matching a registered Clinic
 *
 * In production: NEVER falls back silently to a default clinic. If the token
 * lacks a clinic claim, access is strictly rejected with 403 Forbidden.
 */
export async function resolveClinicIdFromToken(
  verifiedClaims?: Record<string, unknown>,
): Promise<string | null> {
  if (!verifiedClaims) {
    return null;
  }

  // 1. Direct claim: clinicId or clinic_id
  const directClinicId = verifiedClaims.clinicId || verifiedClaims.clinic_id;
  if (typeof directClinicId === 'string' && directClinicId.trim()) {
    return directClinicId.trim();
  }

  // 2. Metadata claim: public_metadata.clinicId or metadata.clinicId
  const publicMetadata = verifiedClaims.public_metadata || verifiedClaims.publicMetadata;
  if (publicMetadata && typeof publicMetadata === 'object' && 'clinicId' in publicMetadata) {
    const cid = (publicMetadata as Record<string, unknown>).clinicId;
    if (typeof cid === 'string' && cid.trim()) return cid.trim();
  }

  // 3. Organization ID matching Clinic
  const orgId = verifiedClaims.org_id || verifiedClaims.orgId;
  if (typeof orgId === 'string' && orgId.trim()) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: orgId.trim() },
    });
    if (clinic) return clinic.id;
  }

  return null;
}

/**
 * Express middleware to enforce Clerk JWT authentication for dashboard routes.
 *
 * In production: Strictly verifies Bearer token with CLERK_SECRET_KEY, resolves
 * the tenant's clinicId from token claims, and attaches it to req.clinicId.
 * Rejects with 403 Forbidden if no clinicId is associated with the token.
 *
 * In development: If CLERK_SECRET_KEY is a placeholder/dev, allows local development
 * by binding req.clinicId to the local seeded clinic.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const authHeader = req.headers.authorization;

  // Double-gated development fallback:
  // Fail-safe protection: requires BOTH NODE_ENV === 'development' AND ALLOW_DEV_CLINIC_FALLBACK === 'true'.
  // If either flag is absent or false, fallback is strictly disabled and rejected with 403 Forbidden.
  const isDevEnv = process.env.NODE_ENV === 'development';
  const isDevFallbackAllowed = process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true';

  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    if (isDevEnv && isDevFallbackAllowed) {
      try {
        const defaultClinic = await getDefaultClinic();
        req.clinicId = defaultClinic.id;
        return next();
      } catch {
        res.status(500).json({ error: 'Veritabanında kayıtlı klinik bulunamadı.' });
        return;
      }
    }
    res.status(403).json({
      error: 'Erişim reddedildi: CLERK_SECRET_KEY yapılandırılmamış veya ALLOW_DEV_CLINIC_FALLBACK bayrağı aktif değil.',
    });
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

    // Strict production tenant resolution: token MUST resolve to a clinicId
    const clinicId = await resolveClinicIdFromToken(verified as Record<string, unknown>);

    if (!clinicId) {
      res.status(403).json({
        error: 'Erişim reddedildi: Kullanıcı oturumuna atanmış geçerli bir klinik bulunamadı.',
      });
      return;
    }

    req.clinicId = clinicId;
    next();
  } catch (error) {
    console.warn('[auth] Clerk token validation failed:', error);
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş yetki oturumu.' });
  }
}
