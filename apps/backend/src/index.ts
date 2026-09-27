import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { vapiRouter } from './routes/vapi/server.js';
import { healthRouter } from './routes/health.js';

const app = express();

// --- CORS Configuration ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
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

// --- Start Server ---
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
  console.log(`[backend] Health check: http://localhost:${PORT}/api/health`);
  console.log(`[backend] Vapi Server URL: http://localhost:${PORT}/api/vapi/server`);
});

export default app;
