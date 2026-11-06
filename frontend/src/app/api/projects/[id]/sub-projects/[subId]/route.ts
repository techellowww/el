import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/access';
import { prisma } from '@/lib/prisma';
import {
  updateSubProject,
  deleteSubProject,
} from '@/lib/server/subProjectService';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
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

  const { id: projectId, subId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: session.accountId },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, stage, budgetHours } = body;

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'Sub-project name cannot be empty' }, { status: 400 });
    }

    const updated = await updateSubProject(subId, session.accountId, {
      name,
      description,
      stage,
      budgetHours,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Sub-project not found' }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: 'UPDATE',
        entityType: 'SUB_PROJECT',
        entityId: subId,
        details: JSON.stringify({
          projectId,
          subProjectName: updated.name,
          stage: updated.stage,
        }),
      },
    });

    return NextResponse.json({ subProject: updated });
  } catch (err: any) {
    console.error('Error updating sub-project:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update sub-project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
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

  const { id: projectId, subId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: session.accountId },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const success = await deleteSubProject(subId, session.accountId);
    if (!success) {
      return NextResponse.json({ error: 'Sub-project not found' }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: 'DELETE',
        entityType: 'SUB_PROJECT',
        entityId: subId,
        details: JSON.stringify({ projectId }),
      },
    });

    return NextResponse.json({ success: true, message: 'Sub-project deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting sub-project:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete sub-project' },
      { status: 500 }
    );
  }
}
