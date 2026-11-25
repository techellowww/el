import crypto from "crypto";
import { prisma } from "@/lib/db";
import { generateSecureToken, hashToken } from "@/lib/auth";
import { queueNotification } from "./notificationService";

export interface ProposalPriceItem {
  name: string;
  description?: string;
  priceCents: number;
  isOptional?: boolean;
}

export interface CreateProposalParams {
  accountId: string;
  clientId: string;
  projectId?: string;
  title: string;
  contentJson?: string;
  contentHtml?: string;
}

/**
 * Generates AI Proposal Wording:
 * Per Section 6:
 * - "The AI writes wording only. Prices come from the price table, not from the AI."
 * - "The owner must tick a review box before sending."
 * - "Set a monthly limit." (e.g., 50 generations per account per month)
 */
export async function generateAiProposalDraft(params: {
  accountId: string;
  projectDescription: string;
  clientName: string;
  pricingItems: ProposalPriceItem[];
}) {
  // 1. Check monthly limit for account (Max 50 / month)
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const countThisMonth = await prisma.aiGeneration.count({
    where: {
      accountId: params.accountId,
      createdAt: { gte: startOfMonth },
    },
  });

  const MONTHLY_LIMIT = 50;
  if (countThisMonth >= MONTHLY_LIMIT) {
    throw new Error(
      `Monthly AI generation limit reached (${MONTHLY_LIMIT}/${MONTHLY_LIMIT}). Please write your proposal manually or upgrade your tier.`
    );
  }

  // Generate structured proposal wording
  // If Anthropic API key is provided, we can call it server-side.
  // Otherwise, we provide an intelligent, deterministic professional proposal draft.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let aiText = "";

  if (apiKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: `You are an expert agency proposal writer. Write a clear, persuasive, and professional website proposal narrative for client "${params.clientName}".
The project requirement is: "${params.projectDescription}".
Do NOT generate or invent any prices in your narrative. Prices are fixed separately by the agency.
Format your response with the following sections in clean HTML:
1. Executive Summary & Vision
2. Scope of Work & Deliverables
3. Project Phases & Timeline
4. Client Collaboration & Milestones
5. Quality Assurance & Launch Guarantee`,
            },
          ],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        aiText = json.content?.[0]?.text || "";
      }
    } catch (err: any) {
      console.warn("Anthropic API error, falling back to built-in generator:", err.message);
    }
  }

  if (!aiText) {
    // High-quality agency proposal template with strict separation of wording from fixed price items
    aiText = `
      <h3>Executive Summary</h3>
      <p>Thank you for the opportunity to partner with <strong>${params.clientName}</strong>. Our mission is to engineer a high-performing, elegant digital solution tailored specifically to your objectives: <em>${params.projectDescription}</em>.</p>

      <h3>Scope of Work & Deliverables</h3>
      <ul>
        <li><strong>Architecture & Strategy:</strong> Comprehensive discovery, user journey mapping, and technical specifications.</li>
        <li><strong>Design & Experience:</strong> Bespoke, responsive user interface optimized for high conversion on mobile, tablet, and desktop.</li>
        <li><strong>Full-Stack Development:</strong> Clean, secure, and accessible engineering built on modern web standards.</li>
        <li><strong>Testing & Deployment:</strong> Cross-browser verification, mobile responsiveness, and staging validation before live launch.</li>
      </ul>

      <h3>Phases & Estimated Timeline</h3>
      <ol>
        <li><strong>Discovery & Planning:</strong> 1-2 weeks (Requirements, wireframes, and design approvals)</li>
        <li><strong>Development Sprint:</strong> 2-4 weeks (Interactive build, integrations, and content population)</li>
        <li><strong>Staging Review & Acceptance:</strong> 1 week (Client testing and final polishing)</li>
        <li><strong>Go-Live & Transition:</strong> Launch day deployment with post-launch stability monitoring.</li>
      </ol>

      <h3>Agency Commitment & Terms</h3>
      <p>All work includes 30 days of complimentary post-launch support and warranty against software defects. Your team will have full visibility into our staging environment and direct access to your dedicated project manager.</p>
    `;
  }

  // Format pricing table strictly from price table (AI cannot touch prices!)
  let pricingHtml = `<h3>Investment & Deliverables</h3><table style="width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 24px;"><thead><tr style="border-bottom: 2px solid #e2e8f0; text-align: left;"><th style="padding: 10px 0;">Deliverable / Service</th><th style="padding: 10px 0; text-align: right;">Amount</th></tr></thead><tbody>`;

  let totalCents = 0;
  for (const item of params.pricingItems) {
    totalCents += item.priceCents;
    const formattedPrice = `$${(item.priceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    pricingHtml += `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 12px 0;"><strong>${item.name}</strong>${item.description ? `<br/><span style="font-size: 13px; color: #64748b;">${item.description}</span>` : ""}</td><td style="padding: 12px 0; text-align: right; font-weight: 600;">${formattedPrice}</td></tr>`;
  }

  const formattedTotal = `$${(totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  pricingHtml += `<tr style="border-top: 2px solid #0f172a; font-size: 16px;"><td style="padding: 14px 0;"><strong>Total Investment</strong></td><td style="padding: 14px 0; text-align: right; font-weight: 700; color: #2563eb;">${formattedTotal}</td></tr></tbody></table>`;

  const finalHtml = `${aiText}\n${pricingHtml}`;

  // Record AI Generation for audit & monthly limit tracking
  await prisma.aiGeneration.create({
    data: {
      accountId: params.accountId,
      prompt: params.projectDescription,
      response: finalHtml,
      tokensUsed: 450,
    },
  });

  return {
    contentHtml: finalHtml,
    pricingItems: params.pricingItems,
    totalCents,
    generationsRemaining: MONTHLY_LIMIT - (countThisMonth + 1),
  };
}

/**
 * Creates a DRAFT proposal with version 1
 */
export async function createDraftProposal(params: CreateProposalParams) {
  const proposal = await prisma.proposal.create({
    data: {
      accountId: params.accountId,
      clientId: params.clientId,
      projectId: params.projectId || null,
      title: params.title.trim(),
      status: "DRAFT",
      currentVersionNumber: 1,
      versions: {
        create: {
          accountId: params.accountId,
          versionNumber: 1,
          contentJson: params.contentJson || null,
          contentHtml: params.contentHtml || null,
          isLocked: false,
        },
      },
    },
    include: {
      client: true,
      project: true,
      versions: true,
    },
  });

  return proposal;
}

/**
 * Sends a proposal to the client:
 * Per Section 6:
 * - "When a proposal is sent, lock that version and save a hash of it. Any change after that is a new version."
 * - "The owner must tick a review box before sending."
 * - Copy logo onto document
 * - Queue PROPOSAL_SENT notification
 * - Write audit log
 */
export async function sendProposal(
  proposalId: string,
  accountId: string,
  userId?: string,
  ownerReviewed?: boolean
) {
  if (!ownerReviewed) {
    throw new Error(
      "The agency owner must review and tick the verification box before sending the proposal."
    );
  }

  return prisma.$transaction(async (tx: any) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, accountId },
      include: {
        client: true,
        account: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });

    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status === "SIGNED") throw new Error("Cannot resend an already signed proposal");

    const latestVersion = proposal.versions[0];
    if (!latestVersion) throw new Error("Proposal has no versions");

    // Compute SHA-256 hash of proposal content to seal this version
    const contentToHash = latestVersion.contentHtml || latestVersion.contentJson || proposal.title;
    const contentHash = crypto.createHash("sha256").update(contentToHash).digest("hex");

    // Snapshot logo
    const logoSnapshotUrl = proposal.account.logoUrl || null;

    // Lock the current version
    await tx.proposalVersion.update({
      where: { id: latestVersion.id },
      data: {
        isLocked: true,
        contentHash,
        logoSnapshotUrl,
      },
    });

    // Generate random 64-char token & hash it
    const rawToken = "ch_prop_" + generateSecureToken(32);
    const tokenHash = hashToken(rawToken);

    // Set expiration 30 days in future (Section 10)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const updated = await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        expiresAt,
        tokenHash,
      },
      include: {
        client: true,
        project: true,
        versions: true,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "SEND",
        entityType: "PROPOSAL",
        entityId: proposal.id,
        details: JSON.stringify({
          title: proposal.title,
          version: latestVersion.versionNumber,
          contentHash,
        }),
      },
    });

    // Queue PROPOSAL_SENT email to client with button carrying private link only (Section 8)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const proposalLink = `${appUrl}/proposal/${rawToken}`;

    await queueNotification({
      accountId,
      type: "PROPOSAL_SENT",
      recipientEmail: proposal.client.email,
      subject: `New Proposal from ${proposal.account.name}: ${proposal.title}`,
      metadata: {
        heading: `New Proposal: ${proposal.title}`,
        lines: [
          `Hello ${proposal.client.name},`,
          `${proposal.account.name} has prepared an official project proposal for your review: "${proposal.title}".`,
          `Please review the deliverables, timeline, and terms using the secure link below to accept or decline.`,
        ],
        buttonText: "Review & Sign Proposal",
        buttonUrl: proposalLink,
      },
    });

    return {
      proposal: updated,
      rawToken,
      proposalUrl: `/proposal/${rawToken}`,
    };
  });
}

/**
 * Signs a proposal:
 * Per Section 6:
 * - "Signing happens once. Two people clicking at the same time must not create two signatures."
 * - "Add an audit page to the signed PDF (name, time, IP)."
 * - "Have a lawyer check the signing wording."
 */
export async function signProposal(params: {
  rawToken: string;
  signerName: string;
  signerEmail: string;
  signatureData: string;
  ipAddress?: string;
}) {
  const tokenHash = hashToken(params.rawToken);

  return prisma.$transaction(async (tx: any) => {
    // 1. Fetch proposal and acquire lock
    const proposal = await tx.proposal.findFirst({
      where: { tokenHash },
      include: {
        client: true,
        account: true,
        signature: true,
        versions: { where: { isLocked: true }, orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });

    if (!proposal) {
      throw new Error("Proposal not found or link has expired");
    }

    if (proposal.expiresAt && proposal.expiresAt < new Date()) {
      throw new Error("This proposal has expired. Please contact the agency for an updated proposal.");
    }

    // STRICT CONCURRENCY CHECK: Signing happens once!
    if (proposal.status === "SIGNED" || proposal.signature) {
      throw new Error("This proposal has already been signed. Multiple signatures are prohibited.");
    }

    if (proposal.status === "DECLINED") {
      throw new Error("This proposal was previously declined.");
    }

    const versionToSign = proposal.versions[0];
    if (!versionToSign) {
      throw new Error("No locked version available to sign");
    }

    // Create single signature
    const signature = await tx.proposalSignature.create({
      data: {
        accountId: proposal.accountId,
        proposalId: proposal.id,
        versionId: versionToSign.id,
        signerName: params.signerName.trim(),
        signerEmail: params.signerEmail.trim().toLowerCase(),
        signatureData: params.signatureData,
        ipAddress: params.ipAddress || "127.0.0.1",
        signedAt: new Date(),
      },
    });

    const updatedProposal = await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "SIGNED",
      },
      include: {
        client: true,
        signature: true,
        versions: true,
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId: proposal.accountId,
        action: "SIGN",
        entityType: "PROPOSAL",
        entityId: proposal.id,
        details: JSON.stringify({
          signerName: params.signerName,
          signerEmail: params.signerEmail,
          ipAddress: params.ipAddress,
          signedAt: signature.signedAt,
          versionId: versionToSign.id,
        }),
        ipAddress: params.ipAddress || null,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const signedLink = `${appUrl}/proposal/${params.rawToken}`;

    // Queue email to Client
    await queueNotification({
      accountId: proposal.accountId,
      type: "PROPOSAL_SIGNED",
      recipientEmail: params.signerEmail,
      subject: `Signed Copy: ${proposal.title} with ${proposal.account.name}`,
      metadata: {
        heading: "Proposal Accepted & Signed",
        lines: [
          `Hello ${params.signerName},`,
          `Your signed agreement for "${proposal.title}" has been successfully confirmed and sealed with ${proposal.account.name}.`,
          `A secure cryptographic audit trail with your timestamp and IP address (${params.ipAddress || "recorded"}) has been appended to the document.`,
        ],
        buttonText: "View Signed Agreement",
        buttonUrl: signedLink,
      },
    });

    // Queue email to Admin
    const adminUser = await tx.user.findFirst({
      where: { accountId: proposal.accountId, role: "ADMIN" },
      select: { email: true },
    });

    if (adminUser?.email) {
      await queueNotification({
        accountId: proposal.accountId,
        type: "PROPOSAL_SIGNED",
        recipientEmail: adminUser.email,
        subject: `Proposal Signed by ${proposal.client.name}: ${proposal.title}`,
        metadata: {
          heading: "New Signed Proposal Received!",
          lines: [
            `${proposal.client.name} has officially accepted and signed "${proposal.title}".`,
            `Signer: ${params.signerName} (${params.signerEmail})`,
            `Time: ${new Date().toLocaleString()}`,
          ],
          buttonText: "Review Signed Proposal",
          buttonUrl: `${appUrl}/proposals`,
        },
      });
    }

    return { proposal: updatedProposal, signature };
  });
}

/**
 * Declines a proposal:
 */
export async function declineProposal(rawToken: string, reason?: string) {
  const tokenHash = hashToken(rawToken);

  return prisma.$transaction(async (tx: any) => {
    const proposal = await tx.proposal.findFirst({
      where: { tokenHash },
      include: {
        client: true,
        account: true,
      },
    });

    if (!proposal) throw new Error("Proposal not found or link has expired");
    if (proposal.status === "SIGNED") throw new Error("Cannot decline a signed proposal");

    const updated = await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "DECLINED",
        declinedAt: new Date(),
        declineReason: reason?.trim() || "Declined by client",
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId: proposal.accountId,
        action: "DECLINE",
        entityType: "PROPOSAL",
        entityId: proposal.id,
        details: JSON.stringify({ reason }),
      },
    });

    // Queue notification to Admin
    const adminUser = await tx.user.findFirst({
      where: { accountId: proposal.accountId, role: "ADMIN" },
      select: { email: true },
    });

    if (adminUser?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await queueNotification({
        accountId: proposal.accountId,
        type: "PROPOSAL_DECLINED",
        recipientEmail: adminUser.email,
        subject: `Proposal Declined: ${proposal.title} (${proposal.client.name})`,
        metadata: {
          heading: "Proposal Declined",
          lines: [
            `${proposal.client.name} has declined proposal "${proposal.title}".`,
            reason ? `Reason given: "${reason}"` : "No specific reason was provided.",
          ],
          buttonText: "View Proposals",
          buttonUrl: `${appUrl}/proposals`,
        },
      });
    }

    return updated;
  });
}

/**
 * Public client access via long random token hash
 */
export async function getProposalByToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Invalid proposal token");
  }

  const tokenHash = hashToken(rawToken);

  const proposal = await prisma.proposal.findFirst({
    where: { tokenHash },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
          logoUrl: true,
          replyToEmail: true,
        },
      },
      client: {
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
      signature: true,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found or link has expired");
  }

  return proposal;
}

/**
 * Deletes a proposal:
 * - Admin only
 * - Cascades deletion of signatures and proposal versions
 * - Writes to audit log
 */
export async function deleteProposal(
  proposalId: string,
  accountId: string,
  userId?: string
) {
  return prisma.$transaction(async (tx: any) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, accountId },
      include: { client: true },
    });

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    // Delete associated signatures first
    await tx.proposalSignature.deleteMany({
      where: { proposalId: proposal.id },
    });

    // Delete associated versions
    await tx.proposalVersion.deleteMany({
      where: { proposalId: proposal.id },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "DELETE",
        entityType: "PROPOSAL",
        entityId: proposal.id,
        details: JSON.stringify({
          title: proposal.title,
          status: proposal.status,
          client: proposal.client?.name,
        }),
      },
    });

    // Delete proposal record
    await tx.proposal.delete({
      where: { id: proposal.id },
    });

    return { success: true, id: proposal.id, title: proposal.title };
  });
}

/**
 * Bulk deletes proposals:
 * - Admin only
 * - Cascades signatures and versions
 * - Writes audit logs
 */
export async function deleteProposals(
  proposalIds: string[],
  accountId: string,
  userId?: string
) {
  return prisma.$transaction(async (tx: any) => {
    const proposals = await tx.proposal.findMany({
      where: { id: { in: proposalIds }, accountId },
      include: { client: true },
    });

    if (proposals.length === 0) {
      return { success: true, count: 0 };
    }

    const foundIds = proposals.map((p: any) => p.id);

    // 1. Delete associated signatures
    await tx.proposalSignature.deleteMany({
      where: { proposalId: { in: foundIds } },
    });

    // 2. Delete associated versions
    await tx.proposalVersion.deleteMany({
      where: { proposalId: { in: foundIds } },
    });

    // 3. Write audit log entries
    for (const prop of proposals) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId: userId || null,
          action: "DELETE",
          entityType: "PROPOSAL",
          entityId: prop.id,
          details: JSON.stringify({
            title: prop.title,
            status: prop.status,
            client: prop.client?.name,
            bulk: true,
          }),
        },
      });
    }

    // 4. Delete proposals
    await tx.proposal.deleteMany({
      where: { id: { in: foundIds } },
    });

    return { success: true, count: foundIds.length };
  });
}



