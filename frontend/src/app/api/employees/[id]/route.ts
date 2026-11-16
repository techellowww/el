import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PATCH /api/employees/[id]
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
  const targetUser = await prisma.user.findFirst({
    where: { id, accountId: session.accountId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, role, isActive, password, assignedClientIds } = body;

  let passwordHash: string | undefined = undefined;
  if (password && typeof password === "string" && password.trim().length > 0) {
    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(password.trim(), salt);
  }

  // If employee is being deactivated, stop any running timer they currently have
  if (isActive === false) {
    await prisma.timeEntry.updateMany({
      where: {
        accountId: session.accountId,
        userId: id,
        isRunning: true,
      },
      data: {
        isRunning: false,
        stoppedAt: new Date(),
      },
    });
  }

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      name: name ?? undefined,
      role: role ?? undefined,
      isActive: isActive !== undefined ? isActive : undefined,
      passwordHash: passwordHash ?? undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });

  // If assignedClientIds is provided, sync client assignments
  if (Array.isArray(assignedClientIds)) {
    // Delete existing assignments
    await prisma.clientAssignment.deleteMany({
      where: {
        accountId: session.accountId,
        userId: id,
      },
    });

    // Create new assignments
    if (assignedClientIds.length > 0) {
      await prisma.clientAssignment.createMany({
        data: assignedClientIds.map((clientId: string) => ({
          accountId: session.accountId,
          clientId,
          userId: id,
        })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      accountId: session.accountId,
      userId: session.userId,
      action: "UPDATE",
      entityType: "EMPLOYEE",
      entityId: id,
      details: JSON.stringify({ name, role, isActive }),
    },
  });

  return NextResponse.json({ employee: updatedUser });
}

// DELETE /api/employees/[id]
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

  if (id === session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own admin account." },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: { id, accountId: session.accountId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  await prisma.user.delete({
    where: { id },
  });

  await prisma.auditLog.create({
    data: {
      accountId: session.accountId,
      userId: session.userId,
      action: "DELETE",
      entityType: "EMPLOYEE",
      entityId: id,
      details: JSON.stringify({ email: targetUser.email, name: targetUser.name }),
    },
  });

  return NextResponse.json({ success: true, message: "Employee removed successfully" });
}
