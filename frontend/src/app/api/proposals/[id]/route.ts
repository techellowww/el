import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { sendProposal, deleteProposal } from "@/lib/server/proposalService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const proposal = await prisma.proposal.findFirst({
    where: { id, accountId: session.accountId },
    include: {
      client: true,
      project: true,
      versions: { orderBy: { versionNumber: "desc" } },
      signature: true,
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json({ proposal });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, ownerReviewed, contentHtml, contentJson, title } = body;

  try {
    // ACTION: SEND
    if (action === "SEND") {
      const result = await sendProposal(id, session.accountId, session.userId, ownerReviewed);
      return NextResponse.json(result);
    }

    // ACTION: UPDATE / CREATE NEW VERSION
    // Per Section 6: "When a proposal is sent, lock that version and save a hash of it. Any change after that is a new version."
    const existing = await prisma.proposal.findFirst({
      where: { id, accountId: session.accountId },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    if (existing.status === "SIGNED") {
      return NextResponse.json(
        { error: "A signed proposal cannot be modified." },
        { status: 400 }
      );
    }

    const latest = existing.versions[0];
    if (latest && latest.isLocked) {
      // Create next version
      const nextVersionNumber = latest.versionNumber + 1;
      await prisma.proposalVersion.create({
        data: {
          accountId: session.accountId,
          proposalId: existing.id,
          versionNumber: nextVersionNumber,
          contentHtml: contentHtml ?? latest.contentHtml,
          contentJson: contentJson ?? latest.contentJson,
          isLocked: false,
        },
      });

      const updatedProposal = await prisma.proposal.update({
        where: { id: existing.id },
        data: {
          title: title ? title.trim() : existing.title,
          currentVersionNumber: nextVersionNumber,
          status: "DRAFT", // reset to draft until sent again
        },
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      });

      return NextResponse.json({ proposal: updatedProposal });
    } else if (latest) {
      // Current version is still draft/unlocked: update in place
      await prisma.proposalVersion.update({
        where: { id: latest.id },
        data: {
          contentHtml: contentHtml ?? latest.contentHtml,
          contentJson: contentJson ?? latest.contentJson,
        },
      });

      const updatedProposal = await prisma.proposal.update({
        where: { id: existing.id },
        data: {
          title: title ? title.trim() : existing.title,
        },
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      });

      return NextResponse.json({ proposal: updatedProposal });
    }

    return NextResponse.json({ error: "No version available to update" }, { status: 400 });
  } catch (err: any) {
    console.error(`Proposal action [${action}] error:`, err);
    return NextResponse.json(
      { error: err.message || "Failed to process proposal action" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await deleteProposal(id, session.accountId, session.userId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`Failed to delete proposal ${id}:`, err);
    return NextResponse.json(
      { error: err.message || "Failed to delete proposal" },
      { status: 400 }
    );
  }
}


