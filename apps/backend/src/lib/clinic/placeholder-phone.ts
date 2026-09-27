import { prisma } from '../db/client.js';

/**
 * Generates a collision-proof, unmistakable placeholder phone number.
 * Uses "+90000" (an unallocated, non-routable prefix in Turkey)
 * combined with a zero-padded counter and database-level uniqueness check.
 * E.g., +900000000001, +900000000002, etc.
 */
export async function generatePlaceholderPhoneNumber(): Promise<string> {
  const count = await prisma.clinic.count();
  let candidate = `+90000${String(count + 1).padStart(7, '0')}`;
  let exists = await prisma.clinic.findUnique({ where: { phoneNumber: candidate } });
  let offset = 1;

  while (exists) {
    candidate = `+90000${String(count + 1 + offset).padStart(7, '0')}`;
    exists = await prisma.clinic.findUnique({ where: { phoneNumber: candidate } });
    offset++;
  }

  return candidate;
}
