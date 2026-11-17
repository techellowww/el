import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess, requireAdmin, NotFoundError } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { getSubProjectsForProjects } from "@/lib/server/subProjectService";

// GET /api/projects
export async function GET(request?: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const projects = await prisma.project.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          notes: true,
          assignments: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
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
  });

  const subProjectsMap = await getSubProjectsForProjects(projects.map((p: any) => p.id));
  const projectsWithSubProjects = projects.map((p: any) => ({
    ...p,
    subProjects: subProjectsMap[p.id] || [],
  }));

  return NextResponse.json({ projects: projectsWithSubProjects });
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

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Create project error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
