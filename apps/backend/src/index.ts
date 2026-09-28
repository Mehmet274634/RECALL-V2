import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';

import { initBackendSentry, captureBackendException } from './lib/logging/sentry.js';
import { vapiRouter } from './routes/vapi/server.js';
import { healthRouter } from './routes/health.js';
import { appointmentsRouter } from './routes/appointments.js';
import { callLogsRouter } from './routes/call-logs.js';
import { doctorsRouter } from './routes/doctors.js';
import { statsRouter } from './routes/stats.js';
import { clinicRouter } from './routes/clinic.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';

// --- Initialize Sentry before all imports/express app setup ---
initBackendSentry();

const app = express();

// --- CORS Configuration ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, mobile)
      if (!origin) return callback(null, true);
      // Allow localhost or vercel preview/prod domains
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
