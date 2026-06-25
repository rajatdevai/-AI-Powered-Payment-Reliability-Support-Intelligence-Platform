import { PrismaClient } from '@prisma/client';
import { env } from '../env';

// Singleton Prisma client — one connection pool for the entire service
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export async function connectDb(): Promise<void> {
  await db.$connect();
}

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}
