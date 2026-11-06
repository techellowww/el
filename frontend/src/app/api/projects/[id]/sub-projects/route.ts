import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requireAdmin, requireClientAccess, NotFoundError } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import {
  getSubProjectsByProject,
  createSubProject,
} from '@/lib/server/subProjectService';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: session.accountId },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireClientAccess(session, project.clientId);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subProjects = await getSubProjectsByProject(projectId);
  return NextResponse.json({ subProjects });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: session.accountId },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, stage, budgetHours } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Sub-project name is required' }, { status: 400 });
    }

    const created = await createSubProject({
      projectId,
      accountId: session.accountId,
      name: name.trim(),
      description: description?.trim() || null,
      stage: stage?.trim() || 'IN_PROGRESS',
      budgetHours: budgetHours !== undefined && budgetHours !== null ? Number(budgetHours) : null,
    });

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: 'CREATE',
        entityType: 'SUB_PROJECT',
        entityId: created.id,
        details: JSON.stringify({
          projectId,
          projectName: project.name,
          subProjectName: created.name,
          stage: created.stage,
        }),
      },
    });

    return NextResponse.json({ subProject: created }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating sub-project:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to create sub-project' },
      { status: 500 }
    );
  }
}
