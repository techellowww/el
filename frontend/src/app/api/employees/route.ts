import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/employees
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [users, clients, timeAggregates] = await Promise.all([
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
        timeEntries: {
          where: { isRunning: true },
          select: {
            id: true,
            startedAt: true,
            description: true,
            project: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.client.findMany({
      where: {
        accountId: session.accountId,
        NOT: { company: "__INTERNAL_GENERAL_TEAM__" },
      },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where: { accountId: session.accountId, isRunning: false },
      _sum: { durationSeconds: true },
    }),
  ]);

  const userTimeMap = new Map<string, number>();
  for (const agg of timeAggregates) {
    userTimeMap.set(agg.userId, agg._sum.durationSeconds || 0);
  }

  const employees = users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    assignedClients: u.assignedClients.map((a: any) => a.client),
    totalTrackedSeconds: userTimeMap.get(u.id) || 0,
    activeTimer: u.timeEntries.length > 0 ? u.timeEntries[0] : null,
  }));

  return NextResponse.json({ employees, clients });
}

// POST /api/employees
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { name, email, password, role, assignedClientIds } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, email and password are required" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findFirst({
    where: { accountId: session.accountId, email: normalizedEmail },
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
      email: normalizedEmail,
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
      assignedClients: {
        create: Array.isArray(assignedClientIds)
          ? assignedClientIds.map((clientId: string) => ({
              accountId: session.accountId,
              clientId,
            }))
          : [],
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      accountId: session.accountId,
      userId: session.userId,
      action: "CREATE",
      entityType: "EMPLOYEE",
      entityId: newUser.id,
      details: JSON.stringify({ name, email: normalizedEmail, role }),
    },
  });

  return NextResponse.json({ employee: newUser });
}
