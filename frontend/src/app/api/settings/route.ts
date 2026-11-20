import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { invalidateBrandingCache } from "@/app/api/settings/branding/route";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// GET /api/settings (Admin only)
export async function GET(request?: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const [account, users, auditLogs, notificationStats] = await Promise.all([
    prisma.account.findUnique({
      where: { id: session.accountId },
    }),
    prisma.user.findMany({
      where: { accountId: session.accountId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        assignedClients: {
          include: {
            client: { select: { id: true, name: true, company: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { accountId: session.accountId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.notification.groupBy({
      by: ["status"],
      where: { accountId: session.accountId },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    account,
    users,
    auditLogs,
    notificationStats,
  });
}

// PATCH /api/settings (Branding update)
export async function PATCH(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { name, currency, logoUrl, replyToEmail, emailSettings } = body;

  let sanitizedLogoUrl = logoUrl;
  if (logoUrl === "" || logoUrl === null) {
    sanitizedLogoUrl = null;
  } else if (typeof logoUrl === "string" && logoUrl.includes("<svg")) {
    sanitizedLogoUrl = logoUrl
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/on\w+="[^"]*"/g, "");
  }

  const updatedAccount = await prisma.account.update({
    where: { id: session.accountId },
    data: {
      name: name ?? undefined,
      currency: currency ?? undefined,
      logoUrl: sanitizedLogoUrl !== undefined ? sanitizedLogoUrl : undefined,
      replyToEmail: replyToEmail !== undefined ? (replyToEmail?.trim() || null) : undefined,
      emailSettings: emailSettings !== undefined ? (typeof emailSettings === "string" ? emailSettings : JSON.stringify(emailSettings)) : undefined,
    },
  });

  invalidateBrandingCache(session.accountId);

  await prisma.auditLog.create({
    data: {
      accountId: session.accountId,
      userId: session.userId,
      action: "UPDATE",
      entityType: "SETTINGS",
      entityId: session.accountId,
      details: JSON.stringify({ name, currency, logoUpdated: logoUrl !== undefined }),
    },
  });

  return NextResponse.json({ account: updatedAccount });
}

// DELETE /api/settings (Delete agency logo)
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

  const url = new URL(request.url);
  const field = url.searchParams.get("field") || "logo";

  if (field === "logo" || field === "logoUrl") {
    const updatedAccount = await prisma.account.update({
      where: { id: session.accountId },
      data: { logoUrl: null },
    });

    invalidateBrandingCache(session.accountId);

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: "DELETE",
        entityType: "SETTINGS",
        entityId: session.accountId,
        details: JSON.stringify({ field: "logoUrl", message: "Agency logo deleted" }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Agency logo deleted successfully",
      account: updatedAccount,
    });
  }

  return NextResponse.json({ error: `Unsupported delete field: ${field}` }, { status: 400 });
}

// POST /api/settings (Create employee)
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

  const body = await request.json();
  const { name, email, password, role } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, email and password are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findFirst({
    where: { accountId: session.accountId, email: email.toLowerCase().trim() },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists in your agency." },
      { status: 400 }
    );
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const newUser = await prisma.user.create({
    data: {
      accountId: session.accountId,
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      accountId: session.accountId,
      userId: session.userId,
      action: "CREATE",
      entityType: "USER",
      entityId: newUser.id,
      details: JSON.stringify({ name, email, role: newUser.role }),
    },
  });

  return NextResponse.json({ user: newUser });
}
