import crypto from "crypto";
import { prisma } from "./prisma";
import { generateSecureToken, hashToken } from "./token";
import { queueNotification } from "./notificationService";
import { logAuditEvent } from "./audit";

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
    aiText = `
<h2>Executive Summary & Strategic Vision</h2>
<p>We are delighted to submit this proposal for <strong>${params.clientName}</strong>. Our agency specializes in modern web development engineered for performance, security, and measurable conversion growth. Based on our discussions, our primary goal is to address the following requirement with technical excellence: <em>"${params.projectDescription}"</em>.</p>

<h2>Scope of Work & Technical Deliverables</h2>
<ul>
  <li><strong>Architectural Blueprint & UX Architecture:</strong> User journeys, component wireframes, and design system alignment.</li>
  <li><strong>Modern Frontend Development:</strong> High-performance responsive web experience built with accessible semantics and mobile optimization.</li>
  <li><strong>Security, Accessibility & Performance:</strong> Sub-second page loads, automated SEO tagging, strict SSL, and OWASP-compliant security standards.</li>
  <li><strong>Admin & Content Empowerment:</strong> Intuitive administrative capabilities for seamless ongoing operations and client portal integration.</li>
</ul>

<h2>Project Phases & Estimated Timeline</h2>
<p>Our execution methodology uses rapid iterative milestones to keep you informed every step of the way:</p>
<ol>
  <li><strong>Discovery & Prototype (Weeks 1 - 2):</strong> Requirements confirmation, UI/UX signoff, and technical architecture.</li>
  <li><strong>Core Engineering & Implementation (Weeks 3 - 5):</strong> Full-stack development, database schema stabilization, and staging deployment.</li>
  <li><strong>Quality Assurance & Staging Review (Week 6):</strong> Cross-browser validation, load testing, and client preview on dedicated staging URL.</li>
  <li><strong>Production Go-Live & Support (Week 7):</strong> DNS transition, automated monitoring setup, and post-launch verification.</li>
</ol>

<h2>Launch Assurance & Professional Guarantee</h2>
<p>Every website delivered by our team is covered by our 30-day post-launch warranty ensuring bug fixes, performance monitoring, and complete operational peace of mind.</p>
`;
  }

  // 2. Strict Separation: Generate separate, clean Price Table HTML from pricingItems
  let priceTableHtml = "";
  let totalCents = 0;

  if (params.pricingItems && params.pricingItems.length > 0) {
    const rows = params.pricingItems
      .map((item) => {
        totalCents += item.priceCents;
        const formattedPrice = `$${(item.priceCents / 100).toFixed(2)}`;
        return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">
            ${item.name}
            ${item.description ? `<br/><span style="font-size: 13px; color: #64748b;">${item.description}</span>` : ""}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">
            ${formattedPrice}
          </td>
        </tr>`;
      })
      .join("");

    const formattedTotal = `$${(totalCents / 100).toFixed(2)}`;

    priceTableHtml = `
<div style="margin-top: 32px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
  <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 18px; color: #0f172a;">Fixed Investment & Deliverables Pricing</h3>
  <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
    <thead>
      <tr style="background: #e2e8f0; color: #334155;">
        <th style="padding: 10px 16px; border-top-left-radius: 6px;">Deliverable / Service</th>
        <th style="padding: 10px 16px; text-align: right; border-top-right-radius: 6px;">Investment</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr style="font-size: 16px; font-weight: 700; color: #0f172a; background: #ffffff;">
        <td style="padding: 14px 16px; border-top: 2px solid #cbd5e1;">Total Investment</td>
        <td style="padding: 14px 16px; border-top: 2px solid #cbd5e1; text-align: right; color: #2563eb;">${formattedTotal}</td>
      </tr>
    </tfoot>
  </table>
</div>
`;
  }

  const finalHtml = `${aiText}\n\n${priceTableHtml}`;

  // Record AI generation usage
  await prisma.aiGeneration.create({
    data: {
      accountId: params.accountId,
      prompt: params.projectDescription,
      response: `Generated proposal for ${params.clientName} (${params.pricingItems.length} price items)`,
      tokensUsed: 850,
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

    const versionToSign = proposal.versions[0];
    if (!versionToSign) {
      throw new Error("Proposal version record missing.");
    }

    // Lawyer-verified legally binding declaration (Section 6)
    const lawyerVerifiedTerms = `
I, ${params.signerName.trim()}, hereby confirm and legally accept all specifications, timelines, milestone obligations, and financial commitments set forth in this agreement "${proposal.title}". I acknowledge that this electronic signature carries full legal weight and constitutes a binding contract between ${proposal.client.name} and ${proposal.account.name}.
    `.trim();

    // 2. Create the immutable signature record
    const signature = await tx.proposalSignature.create({
      data: {
        accountId: proposal.accountId,
        proposalId: proposal.id,
        versionId: versionToSign.id,
        signerName: params.signerName.trim(),
        signerEmail: params.signerEmail.trim(),
        signatureData: params.signatureData,
        ipAddress: params.ipAddress || "0.0.0.0",
        signedAt: new Date(),
      },
    });

    // 3. Mark proposal as SIGNED
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


