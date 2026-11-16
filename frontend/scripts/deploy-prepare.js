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

        // Seed Sample Clients
        const client1 = await prisma.client.upsert({
          where: { id: 'client-bright-bakery' },
          update: { name: 'Bright Bakery', company: 'Bright Bakery Co.', email: 'orders@brightbakery.com' },
          create: {
            id: 'client-bright-bakery',
            accountId: account.id,
            name: 'Bright Bakery',
            company: 'Bright Bakery Co.',
            email: 'orders@brightbakery.com',
            phone: '+1 (555) 234-5678',
            notes: 'Preferred client. Weekly sync on Thursdays.',
          },
        });

        const client2 = await prisma.client.upsert({
          where: { id: 'client-apex-logistics' },
          update: { name: 'Apex Logistics', company: 'Apex Global Freight LLC', email: 'dispatch@apexlogistics.com' },
          create: {
            id: 'client-apex-logistics',
            accountId: account.id,
            name: 'Apex Logistics',
            company: 'Apex Global Freight LLC',
            email: 'dispatch@apexlogistics.com',
            phone: '+1 (555) 987-6543',
            notes: 'Enterprise contract client.',
          },
        });

        // Assign Employee to Client 1
        await prisma.clientAssignment.upsert({
          where: {
            clientId_userId: {
              clientId: client1.id,
              userId: 'user-employee-alpha',
            },
          },
          update: {},
          create: {
            accountId: account.id,
            clientId: client1.id,
            userId: 'user-employee-alpha',
          },
        });

        // Seed Sample Project
        await prisma.project.upsert({
          where: { id: 'proj-bakery-redesign' },
          update: { stage: 'IN_PROGRESS' },
          create: {
            id: 'proj-bakery-redesign',
            accountId: account.id,
            clientId: client1.id,
            name: 'Bakery E-Commerce Redesign',
            description: 'Full Next.js storefront migration with online ordering and checkout.',
            stage: 'IN_PROGRESS',
            budgetHours: 60,
            hourlyRateCents: 9500,
          },
        });

        // Seed Default Settings
        await prisma.officeSchedule.upsert({
          where: { id: 'default-schedule' },
          update: {},
          create: {
            id: 'default-schedule',
            accountId: account.id,
            openingTime: '09:00',
            closingTime: '18:00',
            workingDays: 'MON,TUE,WED,THU,FRI',
            timezone: 'Asia/Kolkata',
            allowOutsideHours: true,
            autoCutoffEnabled: true,
          },
        });

        await prisma.screenshotSetting.upsert({
          where: { id: 'default-screenshot-setting' },
          update: {},
          create: {
            id: 'default-screenshot-setting',
            accountId: account.id,
            enabled: false,
            intervalMinutes: 60,
            retentionDays: 30,
            requireConsent: true,
          },
        });

        console.log('✅ [deploy-prepare] Seeded admin, employee, sample clients, projects & settings!');
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
