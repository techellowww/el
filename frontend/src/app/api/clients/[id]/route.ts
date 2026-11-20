import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess, requireAdmin, NotFoundError } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { invalidateClientsCache } from "../route";
import { invalidateProjectsCache } from "../../projects/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const client = await requireClientAccess(session, id);
    const fullClient = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        projects: {
          orderBy: { createdAt: "desc" },
          include: {
            statusUpdates: { orderBy: { createdAt: "desc" }, take: 5 },
            timeEntries: { orderBy: { startedAt: "desc" }, take: 10 },
          },
        },
      },
    });

    let chatLink = (fullClient as any)?.chatLink || null;
    if (!chatLink && fullClient?.notes) {
      const match = fullClient.notes.match(/(?:\[Chat Link\]|Chat Link|chatLink):\s*(https?:\/\/\S+|\S+)/i);
      if (match) chatLink = match[1].trim();
    }

    return NextResponse.json({
      client: {
        ...fullClient,
        chatLink,
      },
    });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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

  try {
    await requireClientAccess(session, id);
    const body = await request.json();
    const { name, company, email, phone, notes, chatLink, assignedUserIds } = body;

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Client name is required" }, { status: 400 });
    }
    if (email !== undefined && !email.trim()) {
      return NextResponse.json({ error: "Client email is required" }, { status: 400 });
    }

    let updatedNotes = notes !== undefined ? (notes?.trim() || "") : undefined;
    if (chatLink !== undefined) {
      if (updatedNotes !== undefined) {
        updatedNotes = updatedNotes.replace(/(?:\r?\n)?\[Chat Link\]:.*$/im, "").trim();
        if (chatLink?.trim()) {
          const linkTag = `[Chat Link]: ${chatLink.trim()}`;
          updatedNotes = updatedNotes ? `${updatedNotes}\n${linkTag}` : linkTag;
        }
      }
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      // If assignedUserIds is provided, sync team assignments
      if (Array.isArray(assignedUserIds)) {
        await tx.clientAssignment.deleteMany({
          where: { clientId: id },
        });

        if (assignedUserIds.length > 0) {
          await tx.clientAssignment.createMany({
            data: assignedUserIds.map((userId: string) => ({
              accountId: session.accountId,
              clientId: id,
              userId,
            })),
          });
        }
      }

      const client = await tx.client.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          company: company !== undefined ? company?.trim() || null : undefined,
          email: email !== undefined ? email.trim() : undefined,
          phone: phone !== undefined ? phone?.trim() || null : undefined,
          notes: updatedNotes !== undefined ? updatedNotes || null : undefined,
        },
        include: {
          assignments: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
          projects: {
            select: { id: true, name: true, stage: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          accountId: session.accountId,
          userId: session.userId,
          action: "UPDATE",
          entityType: "CLIENT",
          entityId: id,
          details: JSON.stringify({ name: client.name, email: client.email }),
        },
      });

      return client;
    });

    invalidateClientsCache(session.accountId);

    if (chatLink !== undefined) {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE ch_clients SET "chatLink" = $1 WHERE id = $2',
          chatLink?.trim() || null,
          id
        );
      } catch {}
    }

    return NextResponse.json({
      client: {
        ...updated,
        chatLink: chatLink !== undefined ? (chatLink?.trim() || null) : ((updated as any).chatLink || null),
      },
    });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Update client error:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
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
    const existingClient = await prisma.client.findFirst({
      where: { id, accountId: session.accountId },
      select: { id: true, name: true, email: true, company: true },
    });

    if (!existingClient || existingClient.company === "__INTERNAL_GENERAL_TEAM__") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: any) => {
      // Find all project IDs belonging to this client
      const clientProjects = await tx.project.findMany({
        where: { clientId: id },
        select: { id: true },
      });
      const projectIds = clientProjects.map((p: any) => p.id);

      // Stop running timers for this client or its projects
      await tx.timeEntry.updateMany({
        where: {
          OR: [
            { clientId: id },
            ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ],
          isRunning: true,
        },
        data: {
          isRunning: false,
          stoppedAt: new Date(),
        },
      });

      // Clean up subprojects in raw table ch_sub_projects
      if (projectIds.length > 0) {
        try {
          await tx.$executeRawUnsafe(
            `DELETE FROM clienthub.ch_sub_projects WHERE "projectId" = ANY($1::text[])`,
            projectIds
          );
        } catch {
          // ch_sub_projects might not exist in all environments
        }

        // Unlink project relations that don't cascade on delete
        await tx.event.updateMany({
          where: { projectId: { in: projectIds } },
          data: { projectId: null },
        });

        await tx.invoice.updateMany({
          where: { projectId: { in: projectIds } },
          data: { projectId: null },
        });

        await tx.message.updateMany({
          where: { projectId: { in: projectIds } },
          data: { projectId: null },
        });

        await tx.proposal.updateMany({
          where: { projectId: { in: projectIds } },
          data: { projectId: null },
        });
      }

      // 1. Clean up time entries linked by clientId or by any of this client's projects
      await tx.timeEntry.deleteMany({
        where: {
          OR: [
            { clientId: id },
            ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ],
        },
      });

      // Clean up events linked directly to clientId or its projects
      await tx.event.deleteMany({
        where: {
          OR: [
            { clientId: id },
            ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          ],
        },
      });

      // 2. Delete the client (cascades to assignments, projects, status updates, invoices, messages, proposals)
      await tx.client.delete({
        where: { id },
      });

      // 3. Write audit log
      await tx.auditLog.create({
        data: {
          accountId: session.accountId,
          userId: session.userId,
          action: "DELETE",
          entityType: "CLIENT",
          entityId: id,
          details: JSON.stringify({ name: existingClient.name, email: existingClient.email }),
        },
      });
    });

    invalidateClientsCache(session.accountId);
    invalidateProjectsCache(session.accountId);

    return NextResponse.json({
      success: true,
      message: "Client deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete client error:", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
