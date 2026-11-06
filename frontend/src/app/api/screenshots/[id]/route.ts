import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.screenshotRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    let metaObj: Record<string, unknown> = {};
    try {
      if (existing.metadata) metaObj = JSON.parse(existing.metadata);
    } catch {}
    metaObj.isDeleted = true;
    metaObj.deletedAt = new Date().toISOString();
    metaObj.deletedBy = user.id;

    await prisma.screenshotRecord.update({
      where: { id },
      data: {
        imageUrl: '',
        fileSize: 0,
        metadata: JSON.stringify(metaObj),
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: 'SCREENSHOT_DELETED',
      targetEntity: 'ScreenshotRecord',
      targetId: id,
      mandatoryReason: 'Administrator deleted individual activity screenshot.',
      details: { screenshotId: id, userId: existing.userId },
    });

    return NextResponse.json({ success: true, message: 'Screenshot deleted successfully' });
  } catch (error) {
    console.error('Error deleting screenshot:', error);
    return NextResponse.json({ error: 'Failed to delete screenshot' }, { status: 500 });
  }
}
