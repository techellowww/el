import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess, requireAdmin, NotFoundError } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { getSubProjectsByProject } from "@/lib/server/subProjectService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, accountId: session.accountId },
    include: {
      client: {
        select: { id: true, name: true, company: true, email: true },
      },
      statusUpdates: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      timeEntries: {
        orderBy: { startedAt: "desc" },
        take: 10,
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    await requireClientAccess(session, project.clientId);
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const subProjects = await getSubProjectsByProject(project.id);
  return NextResponse.json({ project: { ...project, subProjects } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;

  const existingProject = await prisma.project.findFirst({
    where: { id, accountId: session.accountId },
  });

  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { clientId, name, description, stage, stagingUrl, liveUrl } = body;

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    if (clientId && clientId !== existingProject.clientId) {
      await requireClientAccess(session, clientId);
    }

    const targetStage = stage || existingProject.stage;
    const effectiveStagingUrl =
      stagingUrl !== undefined ? stagingUrl?.trim() : existingProject.stagingUrl;

    // Invariant: Staging URL is required before Awaiting review
    if (targetStage === "AWAITING_REVIEW" && (!effectiveStagingUrl || !effectiveStagingUrl.trim())) {
      return NextResponse.json(
        { error: "A staging URL is required before a project can enter Awaiting review." },
        { status: 400 }
      );
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        clientId: clientId || undefined,
        name: name !== undefined ? name.trim() : undefined,
        description: description !== undefined ? description?.trim() || null : undefined,
        stage: stage ?? undefined,
        stagingUrl: stagingUrl !== undefined ? stagingUrl?.trim() || null : undefined,
        liveUrl: liveUrl !== undefined ? liveUrl?.trim() || null : undefined,
      },
      include: {
        client: {
          select: { id: true, name: true, company: true, email: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: "UPDATE",
        entityType: "PROJECT",
        entityId: updated.id,
        details: JSON.stringify({ name: updated.name, stage: updated.stage }),
      },
    });

    return NextResponse.json({ project: updated });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Update project error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
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
    const existingProject = await prisma.project.findFirst({
      where: { id, accountId: session.accountId },
      select: { id: true, name: true, clientId: true },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: any) => {
      // Unlink optional project relations that do not have cascade configured
      await tx.event.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });

      await tx.invoice.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });

      await tx.message.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });

      await tx.proposal.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });

      // StatusUpdates and TimeEntries cascade automatically with Project
      await tx.project.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          accountId: session.accountId,
          userId: session.userId,
          action: "DELETE",
          entityType: "PROJECT",
          entityId: id,
          details: JSON.stringify({ name: existingProject.name }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete project error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
