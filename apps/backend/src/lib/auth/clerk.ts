import { verifyToken, createClerkClient } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';

export interface AuthenticatedRequest extends Request {
  auth?: Record<string, unknown>;
  clinicId?: string;
  role?: 'admin' | 'secretary';
}

/**
 * Resolves the role for the authenticated user/session strictly from verified claims.
 * If user has role === 'admin' in direct claims or public_metadata, returns 'admin'.
 * Default fallback is 'secretary' (for all existing users or users without explicit admin role).
 */
export function resolveRoleFromToken(
  verifiedClaims?: Record<string, unknown>,
): 'admin' | 'secretary' {
  if (!verifiedClaims) {
    return 'secretary';
  }

  // 1. Direct claim: role
  if (verifiedClaims.role === 'admin') {
    return 'admin';
  }

  // 2. Metadata claim: public_metadata.role or publicMetadata.role
  const publicMetadata = (verifiedClaims.public_metadata ||
    verifiedClaims.publicMetadata) as Record<string, unknown> | undefined;

  if (publicMetadata && typeof publicMetadata === 'object' && publicMetadata.role === 'admin') {
    return 'admin';
  }

  return 'secretary';
}

/**
 * Resolves the clinicId for the authenticated user/session strictly from verified token claims.
 * Returns null if no clinic mapping can be determined from the token.
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
 * Returns an initialized Clerk Backend SDK client.
 * In development without a live key, provides a mock-safe interface.
 */
export function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    return {
      invitations: {
        createInvitation: async (params: {
          emailAddress: string;
          publicMetadata?: Record<string, unknown>;
          redirectUrl?: string;
          ignoreExisting?: boolean;
        }) => {
          console.log('[clerk:dev] Creating mock invitation:', params);
          return {
            id: `inv_mock_${Date.now()}`,
            emailAddress: params.emailAddress,
            publicMetadata: params.publicMetadata || {},
            status: 'pending',
            createdAt: Date.now(),
          };
        },
      },
    };
  }

  return createClerkClient({ secretKey });
}

/**
 * Express middleware to enforce Clerk JWT authentication for dashboard routes.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const authHeader = req.headers.authorization;

  const isDevEnv = process.env.NODE_ENV === 'development';
  const isDevFallbackAllowed = process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true';

  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    if (isDevEnv && isDevFallbackAllowed) {
      try {
        const defaultClinic = await getDefaultClinic();
        req.clinicId = defaultClinic.id;
        req.role = 'secretary';
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
    req.role = resolveRoleFromToken(verified as Record<string, unknown>);

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

/**
 * Express middleware to enforce Admin role for administrative routes (/api/admin/*).
 * Strictly requires role === 'admin'. Rejects secretary users with 403 Forbidden.
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const authHeader = req.headers.authorization;

  const isDevEnv = process.env.NODE_ENV === 'development';
  const isDevFallbackAllowed = process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true';

  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    if (isDevEnv && isDevFallbackAllowed) {
      // Support test-driven role simulation via x-mock-role header in dev mode (default to forbidden unless explicitly admin)
      const mockRole = req.headers['x-mock-role'];
      if (mockRole !== 'admin') {
        res.status(403).json({
          error: 'Erişim reddedildi: Bu işlem için Yönetici (Admin) yetkisi gereklidir.',
        });
        return;
      }
      req.role = 'admin';
      return next();
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
    const role = resolveRoleFromToken(verified as Record<string, unknown>);
    req.role = role;

    if (role !== 'admin') {
      res.status(403).json({
        error: 'Erişim reddedildi: Bu işlem için Yönetici (Admin) yetkisi gereklidir.',
      });
      return;
    }

    next();
  } catch (error) {
    console.warn('[auth] Clerk token validation failed for admin route:', error);
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş yetki oturumu.' });
  }
}
