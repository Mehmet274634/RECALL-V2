import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';

import { initBackendSentry } from './lib/logging/sentry.js';
import { vapiRouter } from './routes/vapi/server.js';
import { healthRouter } from './routes/health.js';
import { appointmentsRouter } from './routes/appointments.js';
import { callLogsRouter } from './routes/call-logs.js';
import { doctorsRouter } from './routes/doctors.js';
import { statsRouter } from './routes/stats.js';
import { clinicRouter } from './routes/clinic.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// --- Production Safety Guard ---
// Must run before any route setup. Terminates immediately if security config is unsafe.
if (process.env.NODE_ENV === 'production') {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey === 'placeholder' || secretKey.startsWith('dev-')) {
    console.error(
      '[FATAL] CLERK_SECRET_KEY is not properly configured for production. Server cannot start safely.',
    );
    process.exit(1);
  }
  if (process.env.ALLOW_DEV_CLINIC_FALLBACK === 'true') {
    console.error(
      '[FATAL] ALLOW_DEV_CLINIC_FALLBACK=true is not permitted in production. Server cannot start safely.',
    );
    process.exit(1);
  }
  if (process.env.TEST_AUTH_OVERRIDE === 'true') {
    console.error(
      '[FATAL] TEST_AUTH_OVERRIDE=true is not permitted in production. Server cannot start safely.',
    );
    process.exit(1);
  }
}

// --- Initialize Sentry before all imports/express app setup ---
initBackendSentry();

const app = express();

// --- Reverse Proxy Configuration (Vercel / Cloudflare) ---
app.set('trust proxy', 1);

// --- Security Headers (Helmet) ---
app.use(helmet());

// --- Rate Limiting for Panel APIs (Vapi Webhook routes /api/vapi/* are completely exempt) ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.' },
  skip: (req) => {
    return req.path.startsWith('/api/vapi') || req.originalUrl.startsWith('/api/vapi');
  },
});

app.use('/api', apiLimiter);

// --- CORS Configuration ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn(
    '[CORS] ALLOWED_ORIGINS ortam değişkeni boş veya tanımlanmamış. Production ortamında tarayıcı kaynaklı tüm CORS istekleri engellenecektir.',
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, mobile, Vapi webhooks)
      if (!origin) return callback(null, true);

      // In production, strictly allow only explicitly configured origins
      if (process.env.NODE_ENV === 'production') {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      }

      // Development / non-production fallback (allow localhost or vercel preview/prod domains)
      if (
        allowedOrigins.includes(origin) ||
        origin.includes('localhost') ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

// --- Body Parsing ---
app.use(express.json());


// --- Route Mounts ---
app.use('/api/health', healthRouter);
app.use('/api/vapi/server', vapiRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/call-logs', callLogsRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/clinic', clinicRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);

// --- Sentry Error Handling Middleware ---
Sentry.setupExpressErrorHandler(app);

// --- Global Fallback Error Handler ---
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server:error]', err);
  const status =
    typeof (err as { status?: number })?.status === 'number'
      ? (err as { status?: number }).status
      : 500;
  const message = err instanceof Error ? err.message : 'Sunucu içi beklenmeyen bir hata oluştu.';
  res.status(status || 500).json({ error: message });
});

// --- Start Server (only when running standalone, not in Vercel serverless) ---
const PORT = process.env.PORT || 3001;

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[backend] Server running on http://localhost:${PORT}`);
    console.log(`[backend] Health check: http://localhost:${PORT}/api/health`);
    console.log(`[backend] Vapi Server URL: http://localhost:${PORT}/api/vapi/server`);
  });
}

export default app;
