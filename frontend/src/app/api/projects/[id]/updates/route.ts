import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

export async function POST(
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
    include: { client: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    await requireClientAccess(session, project.clientId);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, body: updateBody, notifyClient } = body;

  if (!title || !updateBody) {
    return NextResponse.json(
      { error: "Title and update body are required" },
      { status: 400 }
    );
  }

  const statusUpdate = await prisma.statusUpdate.create({
    data: {
      accountId: session.accountId,
      projectId: project.id,
      userId: session.userId,
      title,
      body: updateBody,
      notifyClient: Boolean(notifyClient),
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  // If notifyClient is checked, enqueue notification
  if (notifyClient && project.client.email) {
    await prisma.notification.create({
      data: {
        accountId: session.accountId,
        type: "STATUS_UPDATE",
        recipientEmail: project.client.email,
        subject: `Project Update: ${project.name} - ${title}`,
        status: "QUEUED",
      },
    });
  }

  return NextResponse.json({ statusUpdate });
}
