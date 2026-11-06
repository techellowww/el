import path from 'path';

const prismaClientDir = path.join(process.cwd(), 'src/generated/prisma-client');
if (typeof (globalThis as any).__dirname === 'undefined') {
  (globalThis as any).__dirname = prismaClientDir;
}
if (typeof (globalThis as any).__filename === 'undefined') {
  (globalThis as any).__filename = path.join(prismaClientDir, 'index.js');
}

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
