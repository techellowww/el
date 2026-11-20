import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess, requireAdmin, NotFoundError } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { getServerCache, setServerCache, invalidateServerCache } from "@/lib/server/apiServerCache";

export function invalidateProjectsCache(accountId: string) {
  invalidateServerCache(`projects:${accountId}`);
}

// GET /api/projects
export async function GET(request?: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `projects:${session.accountId}:${session.role}:${session.role === "EMPLOYEE" ? session.userId : "all"}`;
  const cached = getServerCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const whereClause: any = {
    accountId: session.accountId,
  };

  // Employees only see projects for clients they are assigned to
  if (session.role === "EMPLOYEE") {
    whereClause.client = {
      assignments: {
        some: {
          userId: session.userId,
        },
      },
    };
  }

  const [projects, allSubProjects] = await Promise.all([
    prisma.project.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            company: true,
            email: true,
          },
        },
        statusUpdates: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { timeEntries: true },
        },
      },
    }),
    prisma.subProject
      .findMany({
        where: { accountId: session.accountId },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => []),
  ]);

  const subProjectsMap: Record<string, any[]> = {};
  for (const sp of allSubProjects) {
    if (!subProjectsMap[sp.projectId]) subProjectsMap[sp.projectId] = [];
    subProjectsMap[sp.projectId].push({
      id: sp.id,
      projectId: sp.projectId,
      accountId: sp.accountId,
      name: sp.name,
      description: sp.description,
      stage: sp.stage,
      budgetHours: sp.budgetHours !== null ? Number(sp.budgetHours) : null,
      createdAt: sp.createdAt instanceof Date ? sp.createdAt.toISOString() : String(sp.createdAt),
      updatedAt: sp.updatedAt instanceof Date ? sp.updatedAt.toISOString() : String(sp.updatedAt),
    });
  }

  const projectsWithSubProjects = projects.map((p: any) => ({
    ...p,
    subProjects: subProjectsMap[p.id] || [],
  }));

  const responseData = { projects: projectsWithSubProjects };
  setServerCache(cacheKey, responseData, 15000); // 15s cache
  return NextResponse.json(responseData);
}

// POST /api/projects (Admin only)
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
    const { clientId, name, description, stage, stagingUrl, liveUrl } = body;

    if (!clientId || !name) {
      return NextResponse.json(
        { error: "Client ID and project name are required" },
        { status: 400 }
      );
    }

    // Verify client belongs to account
    await requireClientAccess(session, clientId);

    const projectStage = stage || "DISCOVERY";

    // Section 5 Module 3 Invariant: Staging URL required before Awaiting review
    if (projectStage === "AWAITING_REVIEW" && (!stagingUrl || !stagingUrl.trim())) {
      return NextResponse.json(
        { error: "A staging URL is required before a project can enter Awaiting review." },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        accountId: session.accountId,
        clientId,
        name: name.trim(),
        description: description?.trim() || null,
        stage: projectStage,
        stagingUrl: stagingUrl?.trim() || null,
        liveUrl: liveUrl?.trim() || null,
      },
      include: {
        client: {
          select: { id: true, name: true, company: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: "CREATE",
        entityType: "PROJECT",
        entityId: project.id,
        details: JSON.stringify({ name: project.name, stage: project.stage }),
      },
    });

    invalidateProjectsCache(session.accountId);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Create project error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
