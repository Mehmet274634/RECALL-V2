import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * In development, we store the client on `globalThis` to prevent
 * creating multiple instances during hot-reload (tsx watch).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
