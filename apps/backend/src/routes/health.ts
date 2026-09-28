import { Router } from 'express';
import { prisma } from '../lib/db/client.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      database: true,
    });
  } catch {
    res.status(503).json({
      status: 'error',
      database: false,
    });
  }
});

