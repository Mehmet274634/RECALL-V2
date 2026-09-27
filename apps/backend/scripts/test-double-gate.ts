import 'dotenv/config';
import { requireAuth, type AuthenticatedRequest } from '../src/lib/auth/clerk.js';
import type { Response, NextFunction } from 'express';

// Helper to mock express req, res, next
function createMockHttp() {
  const req: Partial<AuthenticatedRequest> = {
    headers: {},
  };
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;

  const res: Partial<Response> = {
    status(code: number) {
      statusCode = code;
      return this as Response;
    },
    json(data: any) {
      responseData = data;
      return this as Response;
    },
  };

  const next: NextFunction = () => {
    nextCalled = true;
  };

  return {
    req: req as AuthenticatedRequest,
    res: res as Response,
    next,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
    wasNextCalled: () => nextCalled,
  };
}

async function runDoubleGateTests() {
  console.log('=====================================================');
  console.log('  TESTING DOUBLE-GATED DEV CLINIC FALLBACK');
  console.log('=====================================================\n');

  // Preserve original environment variables
  const origNodeEnv = process.env.NODE_ENV;
  const origFallback = process.env.ALLOW_DEV_CLINIC_FALLBACK;
  const origClerkKey = process.env.CLERK_SECRET_KEY;

  try {
    // ---------------------------------------------------------------
    // Scenario 1: NODE_ENV=development + ALLOW_DEV_CLINIC_FALLBACK=true
    // Expected: Fallback activates, next() called, req.clinicId set.
    // ---------------------------------------------------------------
    console.log('--- SCENARIO 1: NODE_ENV=development + ALLOW_DEV_CLINIC_FALLBACK=true ---');
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_CLINIC_FALLBACK = 'true';
    process.env.CLERK_SECRET_KEY = 'placeholder';

    const mock1 = createMockHttp();
    await requireAuth(mock1.req, mock1.res, mock1.next);

    console.log(`next() called: ${mock1.wasNextCalled()}, req.clinicId: ${mock1.req.clinicId}`);
    if (!mock1.wasNextCalled() || !mock1.req.clinicId) {
      throw new Error('Scenario 1 FAILED: Fallback should have succeeded!');
    }
    console.log('✅ Scenario 1 passed: Fallback successfully activated under double key.\n');

    // ---------------------------------------------------------------
    // Scenario 2: NODE_ENV=development + ALLOW_DEV_CLINIC_FALLBACK=false / undefined
    // Expected: Fallback BLOCKED, 403 Forbidden returned, next() NOT called.
    // ---------------------------------------------------------------
    console.log('--- SCENARIO 2: NODE_ENV=development + ALLOW_DEV_CLINIC_FALLBACK=false ---');
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_CLINIC_FALLBACK = 'false';
    process.env.CLERK_SECRET_KEY = 'placeholder';

    const mock2 = createMockHttp();
    await requireAuth(mock2.req, mock2.res, mock2.next);

    console.log(`Status code: ${mock2.getStatusCode()} (Expected: 403), next() called: ${mock2.wasNextCalled()}`);
    console.log(`Response error: "${mock2.getResponseData()?.error}"`);
    if (mock2.getStatusCode() !== 403 || mock2.wasNextCalled()) {
      throw new Error('Scenario 2 FAILED: Fallback should have been blocked with 403!');
    }
    console.log('✅ Scenario 2 passed: Missing/false ALLOW_DEV_CLINIC_FALLBACK blocked fallback.\n');

    // ---------------------------------------------------------------
    // Scenario 3: NODE_ENV=production (even with ALLOW_DEV_CLINIC_FALLBACK=true)
    // Expected: Fallback NEVER activates in production, 403 returned.
    // ---------------------------------------------------------------
    console.log('--- SCENARIO 3: NODE_ENV=production + ALLOW_DEV_CLINIC_FALLBACK=true ---');
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_CLINIC_FALLBACK = 'true';
    process.env.CLERK_SECRET_KEY = 'placeholder';

    const mock3 = createMockHttp();
    await requireAuth(mock3.req, mock3.res, mock3.next);

    console.log(`Status code: ${mock3.getStatusCode()} (Expected: 403), next() called: ${mock3.wasNextCalled()}`);
    console.log(`Response error: "${mock3.getResponseData()?.error}"`);
    if (mock3.getStatusCode() !== 403 || mock3.wasNextCalled()) {
      throw new Error('Scenario 3 FAILED: Production should NEVER allow fallback!');
    }
    console.log('✅ Scenario 3 passed: Production strictly rejects fallback regardless of flags.\n');

    console.log('=====================================================');
    console.log('  ALL 3 DOUBLE-GATE SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('=====================================================');
  } finally {
    // Restore environment variables
    process.env.NODE_ENV = origNodeEnv;
    process.env.ALLOW_DEV_CLINIC_FALLBACK = origFallback;
    process.env.CLERK_SECRET_KEY = origClerkKey;
  }
}

runDoubleGateTests().catch((err) => {
  console.error('Double-gate test failed:', err);
  process.exit(1);
});
