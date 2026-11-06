import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, accountId: session.accountId },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (session.role !== "ADMIN" && event.createdById !== session.userId) {
    return NextResponse.json({ error: "Forbidden: You can only delete your own events" }, { status: 403 });
  }

  await prisma.event.delete({
    where: { id },
  });

  return NextResponse.json({ success: true, message: "Event removed" });
}

