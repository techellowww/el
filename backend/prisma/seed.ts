import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function main() {
  console.log("🌱 Starting ClientHub Phase 0 & Phase 1 database seeding...");

  // 1. Password Hash
  const passwordHash = await bcrypt.hash("Password@123", 10);

  // 2. Account Alpha
  const accountAlpha = await prisma.account.upsert({
    where: { id: "account-alpha" },
    update: { name: "Acme Digital Agency", currency: "USD" },
    create: {
      id: "account-alpha",
      name: "Acme Digital Agency",
      currency: "USD",
      logoUrl: "https://placehold.co/200x50/3b82f6/ffffff?text=ACME+AGENCY",
    },
  });

  // 3. Admin User in Account Alpha
  const adminUser = await prisma.user.upsert({
    where: {
      accountId_email: {
        accountId: accountAlpha.id,
        email: "admin@clienthub.local",
      },
    },
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: {
      id: "user-admin-alpha",
      accountId: accountAlpha.id,
      email: "admin@clienthub.local",
      passwordHash,
      name: "Sarah Jenkins (Admin)",
      role: "ADMIN",
      isActive: true,
    },
  });

  // 4. Employee User in Account Alpha
  const employeeUser = await prisma.user.upsert({
    where: {
      accountId_email: {
        accountId: accountAlpha.id,
        email: "employee@clienthub.local",
      },
    },
    update: { passwordHash, role: "EMPLOYEE", isActive: true },
    create: {
      id: "user-employee-alpha",
      accountId: accountAlpha.id,
      email: "employee@clienthub.local",
      passwordHash,
      name: "Alex Miller (Employee)",
      role: "EMPLOYEE",
      isActive: true,
    },
  });

  // 5. Client 1 in Account Alpha: Bright Bakery (Assigned to Employee Alex Miller)
  const rawTokenClient1 = "ch_token_brightbakery_live_token_2026";
  const client1 = await prisma.client.upsert({
    where: { id: "client-bright-bakery" },
    update: {
      name: "Bright Bakery",
      company: "Bright Bakery Co.",
      email: "orders@brightbakery.com",
      portalTokenHash: hashToken(rawTokenClient1),
    },
    create: {
      id: "client-bright-bakery",
      accountId: accountAlpha.id,
      name: "Bright Bakery",
      company: "Bright Bakery Co.",
      email: "orders@brightbakery.com",
      phone: "+1 (555) 234-5678",
      notes: "Preferred bakery client. Weekly sync on Thursdays.",
      portalTokenHash: hashToken(rawTokenClient1),
      portalTokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  });

  // Assign Employee Alex Miller to Client 1
  await prisma.clientAssignment.upsert({
    where: {
      clientId_userId: {
        clientId: client1.id,
        userId: employeeUser.id,
      },
    },
    update: {},
    create: {
      accountId: accountAlpha.id,
      clientId: client1.id,
      userId: employeeUser.id,
    },
  });

  // 6. Client 2 in Account Alpha: Apex Logistics (Unassigned - Admin only)
  const rawTokenClient2 = "ch_token_apexlogistics_live_token_2026";
  const client2 = await prisma.client.upsert({
    where: { id: "client-apex-logistics" },
    update: {
      name: "Apex Logistics",
      company: "Apex Global Freight LLC",
      email: "dispatch@apexlogistics.com",
      portalTokenHash: hashToken(rawTokenClient2),
    },
    create: {
      id: "client-apex-logistics",
      accountId: accountAlpha.id,
      name: "Apex Logistics",
      company: "Apex Global Freight LLC",
      email: "dispatch@apexlogistics.com",
      phone: "+1 (555) 987-6543",
      notes: "Enterprise contract. Only Admin manages this client.",
      portalTokenHash: hashToken(rawTokenClient2),
      portalTokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  });

  // 7. Projects for Client 1 (Bright Bakery)
  const project1 = await prisma.project.upsert({
    where: { id: "proj-bakery-redesign" },
    update: { stage: "IN_PROGRESS" },
    create: {
      id: "proj-bakery-redesign",
      accountId: accountAlpha.id,
      clientId: client1.id,
      name: "Bakery E-Commerce Redesign",
      description: "Full Shopify to Next.js migration with online ordering and checkout.",
      stage: "IN_PROGRESS",
      budgetHours: 60,
      hourlyRateCents: 9500, // $95.00/hr
    },
  });

  const project2 = await prisma.project.upsert({
    where: { id: "proj-bakery-portal" },
    update: { stage: "AWAITING_REVIEW", stagingUrl: "https://staging.brightbakery.com" },
    create: {
      id: "proj-bakery-portal",
      accountId: accountAlpha.id,
      clientId: client1.id,
      name: "Mobile PWA & Loyalty Program",
      description: "Customer loyalty program and rewards web app.",
      stage: "AWAITING_REVIEW",
      stagingUrl: "https://staging.brightbakery.com",
      liveUrl: "https://brightbakery.com",
      budgetHours: 35,
      hourlyRateCents: 9500,
    },
  });

  // Status updates for Project 1 & 2
  await prisma.statusUpdate.createMany({
    data: [
      {
        accountId: accountAlpha.id,
        projectId: project1.id,
        userId: adminUser.id,
        title: "Sprint 1 Completed: Cart & Checkout Integration",
        body: "All payment gateways and custom checkout flows have passed initial testing on mobile and desktop.",
        notifyClient: true,
      },
      {
        accountId: accountAlpha.id,
        projectId: project2.id,
        userId: employeeUser.id,
        title: "Ready for Client Review on Staging",
        body: "Staging build deployed at https://staging.brightbakery.com. Please review the loyalty points calculation.",
        notifyClient: true,
      },
    ],
  });

  // Project for Client 2 (Apex Logistics)
  await prisma.project.upsert({
    where: { id: "proj-apex-fleet" },
    update: { stage: "DISCOVERY" },
    create: {
      id: "proj-apex-fleet",
      accountId: accountAlpha.id,
      clientId: client2.id,
      name: "Fleet Telematics & Route Optimization",
      description: "Real-time dispatch optimization for regional logistics vehicles.",
      stage: "DISCOVERY",
      budgetHours: 120,
      hourlyRateCents: 12000,
    },
  });

  // 8. Time Entries for Project 1
  await prisma.timeEntry.createMany({
    data: [
      {
        accountId: accountAlpha.id,
        userId: employeeUser.id,
        projectId: project1.id,
        clientId: client1.id,
        description: "Implemented responsive navigation and cart drawer",
        startedAt: new Date(Date.now() - 4 * 3600 * 1000),
        stoppedAt: new Date(Date.now() - 2 * 3600 * 1000),
        durationSeconds: 7200, // 2 hours
        isRunning: false,
      },
      {
        accountId: accountAlpha.id,
        userId: adminUser.id,
        projectId: project1.id,
        clientId: client1.id,
        description: "Architecture review and database schema tuning",
        startedAt: new Date(Date.now() - 8 * 3600 * 1000),
        stoppedAt: new Date(Date.now() - 6.5 * 3600 * 1000),
        durationSeconds: 5400, // 1.5 hours
        isRunning: false,
      },
    ],
  });

  // 9. Sample Proposal for Client 1 (Bright Bakery)
  const rawTokenProposal = "ch_prop_seed_bakery_redesign_2026";
  const proposal1 = await prisma.proposal.upsert({
    where: { id: "prop-bakery-ecommerce" },
    update: { status: "SENT" },
    create: {
      id: "prop-bakery-ecommerce",
      accountId: accountAlpha.id,
      clientId: client1.id,
      projectId: project1.id,
      title: "E-Commerce Re-Architecture & PWA Proposal",
      status: "SENT",
      tokenHash: hashToken(rawTokenProposal),
      currentVersionNumber: 1,
      sentAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() + 28 * 24 * 3600 * 1000),
      versions: {
        create: {
          accountId: accountAlpha.id,
          versionNumber: 1,
          isLocked: true,
          contentHash: hashToken("seed_proposal_content_version_1"),
          logoSnapshotUrl: accountAlpha.logoUrl,
          contentHtml: `
            <h3>Executive Summary</h3>
            <p>We are delighted to present this comprehensive e-commerce engineering proposal to <strong>Bright Bakery</strong>. Our deliverables focus on driving online pastry pre-orders with sub-second page performance.</p>
            <h3>Scope & Deliverables</h3>
            <ul>
              <li>Next.js Storefront with custom checkout workflow</li>
              <li>Live inventory synchronization and local pickup scheduling</li>
              <li>Mobile-first PWA experience with offline menu caching</li>
            </ul>
            <h3>Investment Schedule</h3>
            <p>Fixed investment: <strong>$6,000.00</strong> payable upon agreed milestone completion.</p>
          `,
        },
      },
    },
  });

  // 10. Sample Invoice for Client 1 (Bright Bakery)
  const rawTokenInvoice = "ch_inv_seed_bakery_invoice_2026";
  const invoice1 = await prisma.invoice.upsert({
    where: { id: "inv-bakery-sprint-1" },
    update: { status: "SENT" },
    create: {
      id: "inv-bakery-sprint-1",
      accountId: accountAlpha.id,
      clientId: client1.id,
      projectId: project1.id,
      invoiceNumber: 1001,
      invoiceNumberDisplay: "INV-1001",
      status: "SENT",
      tokenHash: hashToken(rawTokenInvoice),
      currency: "USD",
      subtotalCents: 350000,
      taxCents: 0,
      totalCents: 350000, // $3,500.00
      dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      sentAt: new Date(),
      logoSnapshotUrl: accountAlpha.logoUrl,
      notes: "Payment due within 14 days of invoice date. Thank you for your partnership!",
      items: {
        create: [
          {
            accountId: accountAlpha.id,
            description: "Phase 1 Frontend Architecture & Cart Workflow",
            quantity: 1,
            unitPriceCents: 200000,
            totalCents: 200000,
          },
          {
            accountId: accountAlpha.id,
            description: "Product Catalog Migration & Payment Gateway Testing",
            quantity: 1,
            unitPriceCents: 150000,
            totalCents: 150000,
          },
        ],
      },
    },
  });

  // 11. Sample Calendar Meeting
  const event1 = await prisma.event.upsert({
    where: { id: "evt-sprint-review" },
    update: {},
    create: {
      id: "evt-sprint-review",
      accountId: accountAlpha.id,
      createdById: adminUser.id,
      clientId: client1.id,
      projectId: project1.id,
      title: "Sprint 1 Review & Live Staging Demonstration",
      description: "Review checkout experience on staging.brightbakery.com with the bakery management team.",
      startTime: new Date(Date.now() + 24 * 3600 * 1000),
      endTime: new Date(Date.now() + 25 * 3600 * 1000),
      locationUrl: "https://meet.google.com/abc-defg-hij",
      attendees: {
        create: [
          {
            accountId: accountAlpha.id,
            email: "orders@brightbakery.com",
            name: "Bright Bakery Team",
            isClient: true,
          },
          {
            accountId: accountAlpha.id,
            email: "employee@clienthub.local",
            name: "Alex Miller",
            userId: employeeUser.id,
            isClient: false,
          },
        ],
      },
    },
  });

  // 12. Account Beta for Multi-Tenant Boundary Isolation
  const accountBeta = await prisma.account.upsert({
    where: { id: "account-beta" },
    update: { name: "Beta Creative Studio", currency: "EUR" },
    create: {
      id: "account-beta",
      name: "Beta Creative Studio",
      currency: "EUR",
    },
  });

  const clientBeta = await prisma.client.upsert({
    where: { id: "client-beta-target" },
    update: {},
    create: {
      id: "client-beta-target",
      accountId: accountBeta.id,
      name: "Munich Automotive Group",
      company: "Munich Auto GmbH",
      email: "contact@munichauto.de",
      portalTokenHash: hashToken("ch_token_beta_automotive_2026"),
    },
  });

  console.log("✅ ClientHub seeding completed successfully!");
  console.log(`- Account Alpha: ${accountAlpha.id} (Acme Digital Agency)`);
  console.log(`  * Admin: admin@clienthub.local / Password@123`);
  console.log(`  * Employee: employee@clienthub.local / Password@123`);
  console.log(`  * Client 1 (Assigned): Bright Bakery -> Portal: /portal/${rawTokenClient1}`);
  console.log(`  * Client 2 (Unassigned): Apex Logistics -> Portal: /portal/${rawTokenClient2}`);
  console.log(`- Account Beta: ${accountBeta.id} (Tenant Isolation verification)`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
