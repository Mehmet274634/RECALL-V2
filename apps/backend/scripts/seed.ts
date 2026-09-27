/**
 * Database seed script.
 *
 * Usage: pnpm --filter backend db:seed
 *
 * Creates sample data for local development:
 * - A test clinic
 * - A doctor
 * - A few patients
 * - Sample appointments
 *
 * Will be implemented in Faz 1 when scheduling logic is ready.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] Starting database seed...');

  // Faz 1: Add seed data here
  console.log('[seed] Seed script is a placeholder — will be populated in Faz 1.');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
