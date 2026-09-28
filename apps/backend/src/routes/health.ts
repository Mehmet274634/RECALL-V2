import { Router } from 'express';
import { prisma } from '../lib/db/client.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      select: { id: true, name: true, specialty: true },
      orderBy: { name: 'asc' },
    });
    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'recall-backend',
      database: {
        connected: true,
        clinicsCount: clinics.length,
        doctorsCount: doctors.length,
        clinics,
        doctors,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      service: 'recall-backend',
      database: {
        connected: false,
        error: 'Database connection failed',
      },
    });
  }
});
