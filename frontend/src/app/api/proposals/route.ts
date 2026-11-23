import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { createDraftProposal, generateAiProposalDraft, deleteProposals } from "@/lib/server/proposalService";
import { getServerCache, setServerCache, invalidateServerCache } from "@/lib/server/apiServerCache";

export function invalidateProposalsCache(accountId: string) {
  invalidateServerCache(`proposals:${accountId}`);
}

// GET /api/proposals (Admin only)
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const status = searchParams.get("status");

  const cacheKey = `proposals:${session.accountId}:${clientId || 'all'}:${status || 'all'}`;
  const cached = getServerCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const whereClause: any = {
    accountId: session.accountId,
  };

  if (clientId) whereClause.clientId = clientId;
  if (status) whereClause.status = status.toUpperCase();

  const proposals = await prisma.proposal.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true, email: true } },
      project: { select: { id: true, name: true } },
      signature: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  const responseData = { proposals };
  setServerCache(cacheKey, responseData, 30000);
  return NextResponse.json(responseData);
}

// POST /api/proposals (Admin only)
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { mode, clientId, projectId, title, contentJson, contentHtml, projectDescription, pricingItems } = body;

    // AI Generation Mode (Wording only; prices from fixed price table; monthly limit enforced)
    if (mode === "AI_DRAFT") {
      if (!projectDescription || !clientId) {
        return NextResponse.json(
          { error: "Client and project requirement description are required for AI drafting." },
          { status: 400 }
        );
      }

      const client = await prisma.client.findFirst({
        where: { id: clientId, accountId: session.accountId },
      });

      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }

      const aiDraft = await generateAiProposalDraft({
        accountId: session.accountId,
        clientName: client.name,
        projectDescription,
        pricingItems: Array.isArray(pricingItems) ? pricingItems : [],
      });

      return NextResponse.json(aiDraft);
    }

    // Standard Create Draft Proposal Mode
    if (!clientId || !title) {
      return NextResponse.json(
        { error: "Client ID and proposal title are required." },
        { status: 400 }
      );
    }

    const proposal = await createDraftProposal({
      accountId: session.accountId,
      clientId,
      projectId: projectId || undefined,
      title,
      contentJson,
      contentHtml,
    });

    invalidateProposalsCache(session.accountId);

    return NextResponse.json({ proposal });
  } catch (err: any) {
    console.error("Create proposal error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create proposal" },
      { status: 400 }
    );
  }
}

// DELETE /api/proposals (Admin only - bulk delete)
export async function DELETE(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No proposal IDs provided" }, { status: 400 });
    }

    const result = await deleteProposals(ids, session.accountId, session.userId);
    invalidateProposalsCache(session.accountId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Bulk delete proposals error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete proposals" },
      { status: 400 }
    );
  }
}


