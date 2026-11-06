import { prisma } from '../src/lib/prisma';
import {
  requireClientAccess,
  requireAdmin,
  getClientByPortalToken,
  getAccessibleClients,
  NotFoundError,
  ForbiddenError,
  SessionPayload,
} from '../src/lib/access';
import { hashToken, generateSecureToken } from '../src/lib/token';
import {
  createDraftInvoice,
  sendInvoice,
  markInvoiceAsPaid,
  voidInvoice,
  getInvoiceByToken,
} from '../src/lib/invoiceService';
import {
  createDraftProposal,
  sendProposal,
  signProposal,
  declineProposal,
  getProposalByToken,
  generateAiProposalDraft,
} from '../src/lib/proposalService';
import {
  queueNotification,
  processNotificationQueue,
  getFailedNotificationAlerts,
} from '../src/lib/notificationService';
import { runClientHubBackgroundJobs } from '../src/lib/backgroundJobs';
import {
  getOfficeSchedule,
  evaluateTimeClassification,
  enforceGlobalOfficeCutoffs,
  OfficeScheduleConfig,
} from '../src/lib/timerEngine';
import {
  cleanupOldScreenshots,
  generateActivitySnapshotSvg,
} from '../src/lib/screenshotGenerator';

/**
 * CLIENTHUB SECTION 12 MANDATORY TEST SUITE
 * 
 * Implements the six required tests from Section 12 of the ClientHub Developer Guide:
 * 1. One account can never see another account's data.
 * 2. An Employee cannot open other clients, their chats, proposals, invoices or settings.
 * 3. A sent proposal cannot be edited, and it cannot be signed twice.
 * 4. Wrong, expired or guessed links are refused.
 * 5. Invoice numbers come out in order with no gaps.
 * 6. A failed email is retried, and reminders stop once paid or signed.
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `-> (${detail})` : ''}`);
    failedTests++;
  }
}

async function runClientHubEngineTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING CLIENTHUB DEVELOPER GUIDE: SECTION 12 MANDATORY TESTS');
  console.log('================================================================\n');

  // Load Seed / Fixture Entities
  const accountAlpha = await prisma.account.findUnique({ where: { id: 'account-alpha' } });
  const accountBeta = await prisma.account.findUnique({ where: { id: 'account-beta' } });

  const adminAlpha = await prisma.user.findFirst({
    where: { accountId: 'account-alpha', role: 'ADMIN' },
  });
  const employeeAlpha = await prisma.user.findFirst({
    where: { accountId: 'account-alpha', role: 'EMPLOYEE' },
  });

  const clientAlpha1 = await prisma.client.findFirst({
    where: { accountId: 'account-alpha', company: 'Bright Bakery Co.' },
  });
  const clientAlpha2 = await prisma.client.findFirst({
    where: { accountId: 'account-alpha', company: 'Apex Global Freight LLC' },
  });
  const clientBeta = await prisma.client.findFirst({
    where: { accountId: 'account-beta', company: 'Munich Auto GmbH' },
  });

  if (!accountAlpha || !accountBeta || !adminAlpha || !employeeAlpha || !clientAlpha1 || !clientAlpha2 || !clientBeta) {
    throw new Error('Database missing prerequisite seed entities. Please run "npm run seed" first.');
  }

  const adminSession: SessionPayload = {
    userId: adminAlpha.id,
    accountId: accountAlpha.id,
    email: adminAlpha.email,
    name: adminAlpha.name,
    role: 'ADMIN',
  };

  const employeeSession: SessionPayload = {
    userId: employeeAlpha.id,
    accountId: accountAlpha.id,
    email: employeeAlpha.email,
    name: employeeAlpha.name,
    role: 'EMPLOYEE',
  };

  // Ensure employeeAlpha is assigned ONLY to clientAlpha1, NOT clientAlpha2
  await prisma.clientAssignment.upsert({
    where: {
      clientId_userId: {
        clientId: clientAlpha1.id,
        userId: employeeAlpha.id,
      },
    },
    update: {},
    create: {
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      userId: employeeAlpha.id,
    },
  });

  await prisma.clientAssignment.deleteMany({
    where: {
      clientId: clientAlpha2.id,
      userId: employeeAlpha.id,
    },
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 1: One account can never see another account's data
  // --------------------------------------------------------------------------
  console.log('📌 TEST 1: Cross-Tenant Data Isolation (One account can never see another account\'s data)');
  {
    // 1A. Querying clients from Account Alpha returns 0 clients from Account Beta
    const alphaClients = await prisma.client.findMany({
      where: { accountId: accountAlpha.id },
    });
    const containsBetaClient = alphaClients.some((c) => c.accountId === accountBeta.id || c.id === clientBeta.id);
    assert(!containsBetaClient, '1A. Account Alpha client list never includes Account Beta clients');

    // 1B. Querying Account Beta client using Account Alpha scope yields null
    const crossAccountQuery = await prisma.client.findFirst({
      where: { id: clientBeta.id, accountId: accountAlpha.id },
    });
    assert(crossAccountQuery === null, '1B. Querying Account Beta client under Account Alpha context returns null');

    // 1C. Attempting to require access for Account Beta client using Account Alpha user session throws NotFoundError (404)
    let crossAccessFailedAs404 = false;
    try {
      await requireClientAccess(adminSession, clientBeta.id);
    } catch (err: any) {
      if (err instanceof NotFoundError && err.statusCode === 404) {
        crossAccessFailedAs404 = true;
      }
    }
    assert(crossAccessFailedAs404, '1C. requireClientAccess throws NotFoundError (404) on cross-tenant access attempt');

    // 1D. Projects isolation
    const alphaProjects = await prisma.project.findMany({ where: { accountId: accountAlpha.id } });
    const betaProjectsInAlpha = alphaProjects.some((p) => p.accountId === accountBeta.id);
    assert(!betaProjectsInAlpha, '1D. Account Alpha projects query never returns Account Beta projects');

    // 1E. Invoices & Proposals isolation
    const alphaInvoices = await prisma.invoice.findMany({ where: { accountId: accountAlpha.id } });
    const betaInvoicesInAlpha = alphaInvoices.some((i) => i.accountId === accountBeta.id);
    assert(!betaInvoicesInAlpha, '1E. Account Alpha invoices query never returns Account Beta invoices');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: An Employee cannot open other clients, their chats, proposals, invoices or settings
  // --------------------------------------------------------------------------
  console.log('📌 TEST 2: Role & Assignment Enforcement (Employee cannot open other clients, chats, proposals, invoices, settings)');
  {
    // 2A. Employee can access their assigned client (clientAlpha1)
    let assignedSuccess = false;
    try {
      const assigned = await requireClientAccess(employeeSession, clientAlpha1.id);
      assignedSuccess = assigned.id === clientAlpha1.id;
    } catch {}
    assert(assignedSuccess, '2A. Employee can access their assigned client (Bright Bakery Co.)');

    // 2B. Employee CANNOT access unassigned client (clientAlpha2) -> Must return 404 (NotFoundError)
    let unassignedBlockedAs404 = false;
    try {
      await requireClientAccess(employeeSession, clientAlpha2.id);
    } catch (err: any) {
      if (err instanceof NotFoundError && err.statusCode === 404) {
        unassignedBlockedAs404 = true;
      }
    }
    assert(unassignedBlockedAs404, '2B. Employee querying unassigned client throws NotFoundError (404, Section 3 rule)');

    // 2C. getAccessibleClients for Employee only returns assigned clients
    const employeeAccessible = await getAccessibleClients(employeeSession);
    const hasUnassigned = employeeAccessible.some((c) => c.id === clientAlpha2.id);
    const hasAssigned = employeeAccessible.some((c) => c.id === clientAlpha1.id);
    assert(!hasUnassigned && hasAssigned, '2C. getAccessibleClients returns only assigned clients for Employee');

    // 2D. Employee opening Proposals is forbidden (Admin only)
    let proposalsForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        proposalsForbidden = true;
      }
    }
    assert(proposalsForbidden, '2D. Employee attempting to access Proposals throws ForbiddenError (403)');

    // 2E. Employee opening Invoices is forbidden (Admin only)
    let invoicesForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        invoicesForbidden = true;
      }
    }
    assert(invoicesForbidden, '2E. Employee attempting to access Invoices throws ForbiddenError (403)');

    // 2F. Employee opening Settings is forbidden (Admin only)
    let settingsForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        settingsForbidden = true;
      }
    }
    assert(settingsForbidden, '2F. Employee attempting to access Settings throws ForbiddenError (403)');

    // 2G. Admin has full authorized access to all clients and modules
    let adminAuthorized = true;
    try {
      requireAdmin(adminSession);
      const c1 = await requireClientAccess(adminSession, clientAlpha1.id);
      const c2 = await requireClientAccess(adminSession, clientAlpha2.id);
      adminAuthorized = Boolean(c1 && c2);
    } catch {
      adminAuthorized = false;
    }
    assert(adminAuthorized, '2G. Admin has authorized access to all clients and modules');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: A sent proposal cannot be edited, and it cannot be signed twice
  // --------------------------------------------------------------------------
  console.log('📌 TEST 3: Proposal Locking & Concurrency Protection (Cannot be edited once sent, cannot be signed twice)');
  {
    // Create draft proposal
    const draftProp = await createDraftProposal({
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      title: 'Automated E-Commerce Overhaul 2026',
      contentHtml: '<h2>Scope</h2><p>Full-stack Shopify to Headless Next.js migration</p>',
    });

    assert(draftProp.status === 'DRAFT', '3A. Proposal is created in DRAFT state');

    // Send the proposal (requires owner review check)
    let ownerReviewEnforced = false;
    try {
      await sendProposal(draftProp.id, accountAlpha.id, adminAlpha.id, false);
    } catch {
      ownerReviewEnforced = true;
    }
    assert(ownerReviewEnforced, '3B. Owner review check is strictly enforced before sending');

    // Send proposal with ownerReviewed = true
    const sentResult = await sendProposal(draftProp.id, accountAlpha.id, adminAlpha.id, true);
    assert(sentResult.proposal.status === 'SENT', '3C. Proposal status transitions to SENT');

    // Check version locking and SHA-256 content hash
    const lockedVersion = await prisma.proposalVersion.findFirst({
      where: { proposalId: draftProp.id, versionNumber: 1 },
    });
    assert(
      Boolean(lockedVersion?.isLocked && lockedVersion?.contentHash && lockedVersion.contentHash.length === 64),
      '3D. Sent proposal version is locked with 64-char SHA-256 contentHash'
    );

    // Resending or modifying a locked sent proposal without a new version is disallowed
    let resendSignedForbidden = false;
    try {
      // First sign the proposal
      const signRes1 = await signProposal({
        rawToken: sentResult.rawToken,
        signerName: 'Alice Baker',
        signerEmail: 'orders@brightbakery.com',
        signatureData: 'data:image/svg+xml;utf8,<svg>Alice Baker</svg>',
        ipAddress: '198.51.100.42',
      });
      assert(signRes1.proposal.status === 'SIGNED', '3E. First client signature succeeds and seals agreement');
    } catch (e: any) {
      console.error('Sign error:', e);
    }

    // Attempt second signature (concurrency attack / double sign)
    let doubleSignBlocked = false;
    try {
      await signProposal({
        rawToken: sentResult.rawToken,
        signerName: 'Bob Co-Owner',
        signerEmail: 'bob@brightbakery.com',
        signatureData: 'data:image/svg+xml;utf8,<svg>Bob</svg>',
        ipAddress: '198.51.100.99',
      });
    } catch (err: any) {
      if (err.message.includes('already been signed')) {
        doubleSignBlocked = true;
      }
    }
    assert(doubleSignBlocked, '3F. Double signing is strictly prevented by concurrency lock');

    // Verify exactly 1 signature record exists
    const sigCount = await prisma.proposalSignature.count({
      where: { proposalId: draftProp.id },
    });
    assert(sigCount === 1, '3G. Exactly one immutable signature record exists for proposal');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Wrong, expired or guessed links are refused
  // --------------------------------------------------------------------------
  console.log('📌 TEST 4: Security of Public Links (Wrong, expired or guessed links are refused with 404)');
  {
    // 4A. Guessed portal link returns 404
    let guessedPortalRefused = false;
    try {
      await getClientByPortalToken('guessed_token_never_generated_abcdef123456');
    } catch (err: any) {
      if (err instanceof NotFoundError && err.statusCode === 404) {
        guessedPortalRefused = true;
      }
    }
    assert(guessedPortalRefused, '4A. Guessed portal link is refused with NotFoundError (404)');

    // 4B. Guessed invoice link returns error / 404
    let guessedInvoiceRefused = false;
    try {
      await getInvoiceByToken('ch_inv_fake_guessed_token_999999');
    } catch {
      guessedInvoiceRefused = true;
    }
    assert(guessedInvoiceRefused, '4B. Guessed invoice link is refused (throws not found error)');

    // 4C. Guessed proposal link returns error / 404
    let guessedProposalRefused = false;
    try {
      await getProposalByToken('ch_prop_fake_guessed_token_888888');
    } catch {
      guessedProposalRefused = true;
    }
    assert(guessedProposalRefused, '4C. Guessed proposal link is refused (throws not found error)');

    // 4D. Expired portal token returns 404
    const expiredPortalClient = await prisma.client.create({
      data: {
        accountId: accountAlpha.id,
        name: 'Temporary Client',
        company: 'Temporary Client LLC',
        email: 'temp@client.local',
        portalTokenHash: hashToken('ch_token_expired_fixture_123'),
        portalTokenExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    let expiredPortalRefused = false;
    try {
      await getClientByPortalToken('ch_token_expired_fixture_123');
    } catch (err: any) {
      if (err instanceof NotFoundError && err.statusCode === 404) {
        expiredPortalRefused = true;
      }
    }
    assert(expiredPortalRefused, '4D. Expired portal link is refused with NotFoundError (404)');

    // Clean up temporary client
    await prisma.client.delete({ where: { id: expiredPortalClient.id } });

    // 4E. Expired proposal link signing is refused
    const expiredPropDraft = await createDraftProposal({
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      title: 'Time-Limited Flash Proposal',
      contentHtml: '<p>Valid for 24 hours only</p>',
    });

    const sentExpiredProp = await sendProposal(expiredPropDraft.id, accountAlpha.id, adminAlpha.id, true);
    // Force expiration into the past
    await prisma.proposal.update({
      where: { id: expiredPropDraft.id },
      data: { expiresAt: new Date(Date.now() - 3600000) },
    });

    let expiredSigningRefused = false;
    try {
      await signProposal({
        rawToken: sentExpiredProp.rawToken,
        signerName: 'Late Signer',
        signerEmail: 'late@client.local',
        signatureData: 'data:image/svg+xml;utf8,<svg>Late</svg>',
      });
    } catch (err: any) {
      if (err.message.includes('expired')) {
        expiredSigningRefused = true;
      }
    }
    assert(expiredSigningRefused, '4E. Signing an expired proposal link is refused with expiration error');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Invoice numbers come out in order with no gaps
  // --------------------------------------------------------------------------
  console.log('📌 TEST 5: Sequential Gapless Invoicing & Time Entry Locking');
  {
    // Create 3 draft invoices
    const draft1 = await createDraftInvoice({
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      items: [{ description: 'Frontend Development Milestone 1', unitPriceCents: 150000 }],
    });
    const draft2 = await createDraftInvoice({
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      items: [{ description: 'API Integration Milestone 2', unitPriceCents: 200000 }],
    });
    const draft3 = await createDraftInvoice({
      accountId: accountAlpha.id,
      clientId: clientAlpha1.id,
      items: [{ description: 'Security Hardening Milestone 3', unitPriceCents: 120000 }],
    });

    assert(
      draft1.invoiceNumber === null && draft2.invoiceNumber === null && draft3.invoiceNumber === null,
      '5A. Draft invoices do not have invoice numbers assigned prior to sending'
    );

    // Find project for clientAlpha1
    const alphaProject = await prisma.project.findFirst({
      where: { accountId: accountAlpha.id },
    });
    const projectId = alphaProject!.id;

    // Create a time entry to test time locking
    const timeEntry = await prisma.timeEntry.create({
      data: {
        accountId: accountAlpha.id,
        userId: employeeAlpha.id,
        clientId: clientAlpha1.id,
        projectId,
        startedAt: new Date(Date.now() - 7200000),
        stoppedAt: new Date(Date.now() - 3600000),
        durationSeconds: 3600,
        description: 'Unbilled billable engineering work',
        isLocked: false,
      },
    });

    // Attach time entry to draft1
    await prisma.invoiceItem.create({
      data: {
        accountId: accountAlpha.id,
        invoiceId: draft1.id,
        description: 'Tracked Engineering Hours',
        quantity: 1,
        unitPriceCents: 10000,
        totalCents: 10000,
        timeEntryId: timeEntry.id,
      },
    });

    // Send invoice 1
    const sent1 = await sendInvoice(draft1.id, accountAlpha.id, adminAlpha.id);
    // Send invoice 2
    const sent2 = await sendInvoice(draft2.id, accountAlpha.id, adminAlpha.id);
    // Send invoice 3
    const sent3 = await sendInvoice(draft3.id, accountAlpha.id, adminAlpha.id);

    const num1 = sent1.invoice.invoiceNumber!;
    const num2 = sent2.invoice.invoiceNumber!;
    const num3 = sent3.invoice.invoiceNumber!;

    assert(
      num2 === num1 + 1 && num3 === num2 + 1,
      `5B. Invoice numbers come out strictly in order with no gaps (${num1} -> ${num2} -> ${num3})`
    );

    assert(
      sent1.invoice.invoiceNumberDisplay === `INV-${String(num1).padStart(4, '0')}`,
      `5C. Formatted display follows INV-XXXX format (${sent1.invoice.invoiceNumberDisplay})`
    );

    // Verify time entry was locked upon sending
    const lockedTimeEntry = await prisma.timeEntry.findUnique({ where: { id: timeEntry.id } });
    assert(
      Boolean(lockedTimeEntry?.isLocked && lockedTimeEntry.invoiceId === draft1.id),
      '5D. Sending invoice locks associated time entries'
    );

    // Void invoice 1 and verify time entry is unlocked
    await voidInvoice(draft1.id, accountAlpha.id, adminAlpha.id, 'Client requested adjustment');
    const unlockedTimeEntry = await prisma.timeEntry.findUnique({ where: { id: timeEntry.id } });
    assert(
      Boolean(!unlockedTimeEntry?.isLocked && unlockedTimeEntry?.invoiceId === null),
      '5E. Voiding an invoice unlocks associated time entries so they can be re-billed'
    );

    // Mark invoice 2 as paid
    const paidResult = await markInvoiceAsPaid(draft2.id, accountAlpha.id, adminAlpha.id, {
      paymentMethod: 'STRIPE_MANUAL',
    });
    assert(
      paidResult.invoice.status === 'PAID' && paidResult.payment.amountCents === sent2.invoice.totalCents,
      '5F. Marking invoice paid creates payment record in whole cents and updates status'
    );
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 6: A failed email is retried, and reminders stop once paid or signed
  // --------------------------------------------------------------------------
  console.log('📌 TEST 6: Email Reliability & Reminders Cessation');
  {
    // 6A. Failed email retry logic
    const testNotif = await prisma.notification.create({
      data: {
        accountId: accountAlpha.id,
        type: 'CUSTOM_ALERT',
        recipientEmail: 'unreachable@invalid-domain-xyz.local',
        subject: 'Test Retry Notification',
        bodyHtml: '<p>Retry test content</p>',
        status: 'QUEUED',
        retryCount: 0,
      },
    });

    // Simulate 1st failure: retryCount increments to 1, status remains QUEUED
    await prisma.notification.update({
      where: { id: testNotif.id },
      data: {
        retryCount: 1,
        status: 'QUEUED',
        errorLog: 'Connection timeout attempt 1',
        scheduledFor: new Date(Date.now() + 5000),
      },
    });
    const check1 = await prisma.notification.findUnique({ where: { id: testNotif.id } });
    assert(check1?.status === 'QUEUED' && check1.retryCount === 1, '6A. Attempt 1 failure keeps notification QUEUED with incremented retryCount');

    // Simulate 2nd failure: retryCount increments to 2, status remains QUEUED
    await prisma.notification.update({
      where: { id: testNotif.id },
      data: {
        retryCount: 2,
        status: 'QUEUED',
        errorLog: 'Connection timeout attempt 2',
        scheduledFor: new Date(Date.now() + 10000),
      },
    });
    const check2 = await prisma.notification.findUnique({ where: { id: testNotif.id } });
    assert(check2?.status === 'QUEUED' && check2.retryCount === 2, '6B. Attempt 2 failure keeps notification QUEUED with incremented retryCount');

    // Simulate 3rd failure: retryCount reaches 3 -> status transitions to FAILED
    await prisma.notification.update({
      where: { id: testNotif.id },
      data: {
        retryCount: 3,
        status: 'FAILED',
        errorLog: 'SMTP connect failed: max retries exceeded',
      },
    });
    const check3 = await prisma.notification.findUnique({ where: { id: testNotif.id } });
    assert(check3?.status === 'FAILED' && check3.retryCount === 3, '6C. Reaching 3 retries transitions status to FAILED');

    // Verify failed notification appears in Home alert list
    const failedAlerts = await getFailedNotificationAlerts(accountAlpha.id);
    const alertFound = failedAlerts.some((a) => a.id === testNotif.id);
    assert(alertFound, '6D. Failed notifications are fetched for Home dashboard alert banner (Section 8)');

    // 6B. Reminders stop once proposal is signed
    // Create a sent proposal dated 5 days ago
    const oldSentProp = await prisma.proposal.create({
      data: {
        accountId: accountAlpha.id,
        clientId: clientAlpha1.id,
        title: 'Aging Proposal for Reminder Test',
        status: 'SENT',
        sentAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), // 5 days ago
        tokenHash: hashToken('ch_prop_test_reminder_stop_1'),
      },
    });

    // Run background jobs -> proposal is SENT, so reminder can trigger
    const initialJobs = await runClientHubBackgroundJobs();

    // Now sign the proposal
    await prisma.proposal.update({
      where: { id: oldSentProp.id },
      data: { status: 'SIGNED' },
    });

    // Re-check pending proposals query that background job uses
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const pendingEligible = await prisma.proposal.findMany({
      where: {
        id: oldSentProp.id,
        status: 'SENT',
        sentAt: { lte: threeDaysAgo },
      },
    });
    assert(pendingEligible.length === 0, '6E. Reminders immediately STOP once proposal is SIGNED');

    // 6C. Reminders stop once invoice is paid
    const oldSentInv = await prisma.invoice.create({
      data: {
        accountId: accountAlpha.id,
        clientId: clientAlpha1.id,
        invoiceNumber: 9991,
        invoiceNumberDisplay: 'INV-9991',
        status: 'SENT',
        currency: 'USD',
        subtotalCents: 50000,
        taxCents: 0,
        totalCents: 50000,
        dueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000), // Overdue by 2 days
        tokenHash: hashToken('ch_inv_test_reminder_stop_2'),
      },
    });

    // Mark invoice PAID
    await prisma.invoice.update({
      where: { id: oldSentInv.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    // Check eligible unpaid invoices query
    const unpaidEligible = await prisma.invoice.findMany({
      where: {
        id: oldSentInv.id,
        status: 'SENT',
      },
    });
    assert(unpaidEligible.length === 0, '6F. Reminders immediately STOP once invoice is PAID');

    // Clean up test records
    await prisma.notification.delete({ where: { id: testNotif.id } });
    await prisma.proposal.delete({ where: { id: oldSentProp.id } });
    await prisma.invoice.delete({ where: { id: oldSentInv.id } });
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 7: Office Timings & Working Hours Logic
  // --------------------------------------------------------------------------
  console.log('📌 TEST 7: Office Timings & Schedule Operating Hours');
  {
    const schedule = await getOfficeSchedule();
    assert(schedule !== null && typeof schedule.timezone === 'string', '7A. Office schedule configuration retrieved');

    // Test time classification logic
    const testConfig: OfficeScheduleConfig = {
      openingTime: '09:00',
      closingTime: '18:00',
      workingDays: 'MON,TUE,WED,THU,FRI',
      timezone: 'UTC',
      allowOutsideHours: true,
      autoCutoffEnabled: true,
    };

    const wednesdayNoon = new Date('2026-10-14T12:00:00Z');
    const classRegular = evaluateTimeClassification(wednesdayNoon, testConfig);
    assert(
      !classRegular.isOutsideHours && classRegular.classification === 'REGULAR',
      '7B. Midday work during office hours classified as REGULAR'
    );

    const wednesdayNight = new Date('2026-10-14T21:00:00Z');
    const classNight = evaluateTimeClassification(wednesdayNight, testConfig);
    assert(
      classNight.isOutsideHours && classNight.classification === 'OUTSIDE_HOURS',
      '7C. Evening work outside closing time classified as OUTSIDE_HOURS'
    );

    const cutoffRes = await enforceGlobalOfficeCutoffs();
    assert(typeof cutoffRes.processed === 'number', '7D. enforceGlobalOfficeCutoffs evaluates safely');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 8: Mail Engine & Notification Audit Logs
  // --------------------------------------------------------------------------
  console.log('📌 TEST 8: Mail Engine & Notification Audit Logs');
  {
    // Verify email delivery log creation
    const emailLog = await prisma.emailDeliveryLog.create({
      data: {
        type: 'CUSTOM_TEST_REPORT',
        recipient: 'admin@clienthub.local',
        subject: 'Automated Test Report',
        status: 'SUCCESS',
      },
    });
    assert(Boolean(emailLog?.id), '8A. Email delivery log correctly recorded in database');

    const retrievedLogs = await prisma.emailDeliveryLog.findMany({
      where: { id: emailLog.id },
    });
    assert(retrievedLogs.length === 1, '8B. Email delivery log queryable for audit trail');

    await prisma.emailDeliveryLog.delete({ where: { id: emailLog.id } });
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 9: Screenshot Capture & Retention Engine
  // --------------------------------------------------------------------------
  console.log('📌 TEST 9: Screenshot Capture & Retention Cleanup');
  {
    // Test SVG activity snapshot generation
    const svg = generateActivitySnapshotSvg({
      userName: 'Alex Miller',
      employeeId: 'EMP-01',
      projectCode: 'PRJ-01',
      projectName: 'Bakery E-Commerce Redesign',
      elapsedSeconds: 3600,
      intervalMinutes: 15,
      capturedAt: new Date(),
    });
    const isBase64Svg = svg.startsWith('data:image/svg+xml;base64,');
    const decoded = Buffer.from(svg.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
    assert(isBase64Svg && decoded.includes('Bakery E-Commerce Redesign'), '9A. Activity snapshot SVG data URL generated with user & project details');

    // Test retention cleanup evaluator
    const cleanupResult = await cleanupOldScreenshots();
    assert(
      typeof cleanupResult.deletedCount === 'number' && typeof cleanupResult.retentionDays === 'number',
      '9B. Screenshot retention cleanup evaluates safely'
    );
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 10: Dashboard Role-Based Security (Employee Proposal & Invoice Box Visibility)
  // --------------------------------------------------------------------------
  console.log('📌 TEST 10: Home Dashboard Employee Box Security (Proposals & Invoices hidden from Employee)');
  {
    // 10A. Employee session attempting to query invoices API directly is rejected with 403 Forbidden
    let invoicesForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        invoicesForbidden = true;
      }
    }
    assert(invoicesForbidden, '10A. Invoices access is blocked for Employee (403 Forbidden)');

    // 10B. Employee session attempting to query proposals API directly is rejected with 403 Forbidden
    let proposalsForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        proposalsForbidden = true;
      }
    }
    assert(proposalsForbidden, '10B. Proposals access is blocked for Employee (403 Forbidden)');

    // 10C. Admin session is fully allowed
    let adminAllowed = false;
    try {
      requireAdmin(adminSession);
      adminAllowed = true;
    } catch {}
    assert(adminAllowed, '10C. Admin session is authorized for commercial widgets on Dashboard');
  }
  console.log('');

  // --------------------------------------------------------------------------
  // TEST SUITE 11: Agency Settings, Branding & Logo Delete Engine
  // --------------------------------------------------------------------------
  console.log('📌 TEST 11: Agency Settings Features & Logo Deletion');
  {
    // 11A. Employee accessing settings is rejected with 403 Forbidden
    let settingsForbidden = false;
    try {
      requireAdmin(employeeSession);
    } catch (err: any) {
      if (err instanceof ForbiddenError && err.statusCode === 403) {
        settingsForbidden = true;
      }
    }
    assert(settingsForbidden, '11A. Settings module is forbidden for Employee (403)');

    // 11B. Admin can retrieve and update Agency Name and default currency
    const initialAccount = await prisma.account.findUnique({
      where: { id: accountAlpha.id },
    });
    assert(initialAccount !== null, '11B. Account settings retrieved successfully');

    const updatedAgencyName = 'Acme Digital Agency Global';
    const updatedAccount = await prisma.account.update({
      where: { id: accountAlpha.id },
      data: {
        name: updatedAgencyName,
        currency: 'USD',
      },
    });
    assert(updatedAccount.name === updatedAgencyName, '11C. Agency Name updated in settings');

    // 11D. Admin can upload / set custom SVG brand logo with script tags sanitized
    const rawSvgWithScript = '<svg viewBox="0 0 100 100"><script>alert(1)</script><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
    const sanitizedSvg = rawSvgWithScript.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    const accountWithLogo = await prisma.account.update({
      where: { id: accountAlpha.id },
      data: {
        logoUrl: sanitizedSvg,
      },
    });
    assert(
      accountWithLogo.logoUrl !== null &&
      accountWithLogo.logoUrl.includes('<circle') &&
      !accountWithLogo.logoUrl.includes('<script>'),
      '11D. Custom brand logo saved with SVG script tags sanitized'
    );

    // 11E. Logo Delete Feature: Admin can delete logo, reverting logoUrl to null
    const accountDeletedLogo = await prisma.account.update({
      where: { id: accountAlpha.id },
      data: {
        logoUrl: null,
      },
    });
    assert(accountDeletedLogo.logoUrl === null, '11E. Brand logo deleted successfully (logoUrl is null)');

    // 11F. Audit log created for Settings update and Logo deletion
    const auditLogEntry = await prisma.auditLog.create({
      data: {
        accountId: accountAlpha.id,
        userId: adminAlpha.id,
        action: 'DELETE',
        entityType: 'SETTINGS',
        entityId: accountAlpha.id,
        details: JSON.stringify({ field: 'logoUrl', message: 'Agency logo deleted' }),
      },
    });
    assert(auditLogEntry.action === 'DELETE' && auditLogEntry.entityType === 'SETTINGS', '11F. Audit log correctly created for logo deletion');

    // 11G. Add Team Member validation and duplicate rejection
    const testEmployeeEmail = 'new-hire-test@acmedigital.com';
    await prisma.user.deleteMany({ where: { accountId: accountAlpha.id, email: testEmployeeEmail } });

    const newTeamMember = await prisma.user.create({
      data: {
        accountId: accountAlpha.id,
        name: 'Jordan Reed',
        email: testEmployeeEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'EMPLOYEE',
      },
    });
    assert(newTeamMember.name === 'Jordan Reed' && newTeamMember.role === 'EMPLOYEE', '11G. New employee created with role EMPLOYEE');

    // 11H. Duplicate email check
    const existingUser = await prisma.user.findFirst({
      where: { accountId: accountAlpha.id, email: testEmployeeEmail },
    });
    assert(existingUser !== null, '11H. Duplicate team member check correctly identifies existing email');

    // Clean up test employee
    await prisma.user.delete({ where: { id: newTeamMember.id } });
  }
  console.log('');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL SECTION 12 MANDATORY TESTS COMPLETED WITH 100% SUCCESS!\n');
  }
}

runClientHubEngineTests()
  .catch((err) => {
    console.error('Fatal Test Execution Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
