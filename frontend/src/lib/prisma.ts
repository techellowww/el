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

// Support standard database env aliases (preferring pooled connections on Vercel / serverless)
const rawDbUrl =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.VERCEL_POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

// Optimize connection pool limits for serverless lambdas to prevent remote PostgreSQL pool exhaustion
function configurePrismaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('connection_limit=')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=3&pool_timeout=15`;
}

const dbUrl = configurePrismaUrl(rawDbUrl);

if (!process.env.DATABASE_URL && dbUrl) {
  process.env.DATABASE_URL = dbUrl;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@/generated/prisma-client');

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

const SCHEMA_VERSION = '2026-11-19-profile-v1';

export const prisma =
  (globalForPrisma.prisma && globalForPrisma.prisma._schemaVersion === SCHEMA_VERSION)
    ? globalForPrisma.prisma
    : (() => {
        const client = new PrismaClient({
          datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
          log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
        });
        client._schemaVersion = SCHEMA_VERSION;
        globalForPrisma.prisma = client;
        return client;
      })();

// Ensure Prisma client is cached globally across all environments (including serverless execution contexts)
globalForPrisma.prisma = prisma;

export default prisma;
