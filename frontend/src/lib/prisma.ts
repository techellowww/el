import path from 'path';
import fs from 'fs';

function getPrismaClientDir(): string {
  const candidates = [
    path.join(process.cwd(), 'src/generated/prisma-client'),
    path.join(process.cwd(), 'frontend/src/generated/prisma-client'),
    typeof __dirname !== 'undefined' ? __dirname : '',
    typeof __dirname !== 'undefined' ? path.join(__dirname, '../src/generated/prisma-client') : '',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'schema.prisma'))) {
      return candidate;
    }
  }
  return path.join(process.cwd(), 'src/generated/prisma-client');
}

const prismaClientDir = getPrismaClientDir();
(globalThis as any).__dirname = prismaClientDir;
(globalThis as any).__filename = path.join(prismaClientDir, 'index.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@/generated/prisma-client');

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const prisma =
  (globalForPrisma.prisma && globalForPrisma.prisma.officeSchedule)
    ? globalForPrisma.prisma
    : new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
