const { execSync } = require('child_process');
const path = require('path');

// 1. Resolve database URL from environment or aliases
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.VERCEL_POSTGRES_PRISMA_URL;

if (!dbUrl) {
  console.log('⚠️ [deploy-prepare] No DATABASE_URL found. Skipping database migration/seed.');
  process.exit(0);
}

// Make sure DATABASE_URL is set in environment for prisma CLI
process.env.DATABASE_URL = dbUrl;

try {
  console.log('🚀 [deploy-prepare] Pushing Prisma schema to database...');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    env: process.env,
    cwd: path.resolve(__dirname, '..'),
  });
  console.log('✅ [deploy-prepare] Database schema pushed successfully!');
} catch (err) {
  console.warn('⚠️ [deploy-prepare] prisma db push encountered an issue:', err.message);
}

try {
  console.log('🌱 [deploy-prepare] Checking and seeding initial users if empty...');
  const { PrismaClient } = require('../src/generated/prisma-client');
  const prisma = new PrismaClient();
  (async () => {
    try {
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        console.log('🌱 [deploy-prepare] Database is empty. Seeding default admin user...');
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash('Password@123', 10);

        const account = await prisma.account.upsert({
          where: { id: 'account-alpha' },
          update: { name: 'Acme Digital Agency', currency: 'USD' },
          create: {
            id: 'account-alpha',
            name: 'Acme Digital Agency',
            currency: 'USD',
            logoUrl: 'https://placehold.co/200x50/3b82f6/ffffff?text=ACME+AGENCY',
          },
        });

        await prisma.user.upsert({
          where: {
            accountId_email: {
              accountId: account.id,
              email: 'admin@clienthub.local',
            },
          },
          update: { passwordHash, role: 'ADMIN', isActive: true },
          create: {
            id: 'user-admin-alpha',
            accountId: account.id,
            email: 'admin@clienthub.local',
            passwordHash,
            name: 'Sarah Jenkins (Admin)',
            role: 'ADMIN',
            isActive: true,
          },
        });

        await prisma.user.upsert({
          where: {
            accountId_email: {
              accountId: account.id,
              email: 'employee@clienthub.local',
            },
          },
          update: { passwordHash, role: 'EMPLOYEE', isActive: true },
          create: {
            id: 'user-employee-alpha',
            accountId: account.id,
            email: 'employee@clienthub.local',
            passwordHash,
            name: 'Alex Miller (Employee)',
            role: 'EMPLOYEE',
            isActive: true,
          },
        });

        console.log('✅ [deploy-prepare] Initial admin (admin@clienthub.local) and employee seeded successfully!');
      } else {
        console.log(`ℹ️ [deploy-prepare] Database already contains ${userCount} users. Seeding skipped.`);
      }
    } catch (dbErr) {
      console.warn('⚠️ [deploy-prepare] Seed check warning:', dbErr.message);
    } finally {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    }
  })();
} catch (err) {
  console.warn('⚠️ [deploy-prepare] Seed runner warning:', err.message);
  process.exit(0);
}
