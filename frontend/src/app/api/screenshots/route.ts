import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const andConditions: any[] = [
      { imageUrl: { not: '' } },
      {
        OR: [
          { metadata: null },
          { metadata: { not: { contains: '"isDeleted":true' } } },
        ],
      },
    ];

    if (targetUserId && targetUserId !== 'ALL') {
      andConditions.push({ userId: targetUserId });
    }

    if (projectId && projectId !== 'ALL') {
      andConditions.push({
        timeEntry: {
          projectId: projectId,
        },
      });
    }

    // Default to current date if neither startDate nor endDate is specified (unless all=true)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const effectiveStartDate = startDate || (!endDate && searchParams.get('all') !== 'true' ? todayStr : null);
    const effectiveEndDate = endDate || (!startDate && searchParams.get('all') !== 'true' ? todayStr : null);

    if (effectiveStartDate || effectiveEndDate) {
      const capturedAtFilter: Record<string, Date> = {};
      if (effectiveStartDate) {
        const [year, month, day] = effectiveStartDate.split('-').map(Number);
        const start = !isNaN(year) && !isNaN(month) && !isNaN(day)
          ? new Date(year, month - 1, day, 0, 0, 0, 0)
          : new Date(effectiveStartDate);
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          start.setHours(0, 0, 0, 0);
        }
        capturedAtFilter.gte = start;
      }
      if (effectiveEndDate) {
        const [year, month, day] = effectiveEndDate.split('-').map(Number);
        const end = !isNaN(year) && !isNaN(month) && !isNaN(day)
          ? new Date(year, month - 1, day, 23, 59, 59, 999)
          : new Date(effectiveEndDate);
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          end.setHours(23, 59, 59, 999);
        }
        capturedAtFilter.lte = end;
      }

      if (capturedAtFilter.gte && capturedAtFilter.lte && capturedAtFilter.gte > capturedAtFilter.lte) {
        return NextResponse.json({ screenshots: [], totalCount: 0 });
      }

      andConditions.push({ capturedAt: capturedAtFilter });
    }

    const whereClause: any = { AND: andConditions };

    const [screenshots, totalCount] = await Promise.all([
      prisma.screenshotRecord.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          timeEntry: {
            select: { id: true, durationSeconds: true, project: { select: { id: true, name: true } } },
          },
        },
        orderBy: { capturedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.screenshotRecord.count({ where: whereClause }),
    ]);

    await prisma.screenshotRecord.updateMany({
      where: {
        id: { in: screenshots.map((s: any) => s.id) },
        viewedAt: null,
      },
      data: {
        viewedAt: new Date(),
        viewedById: user.id,
      },
    });

    return NextResponse.json({ screenshots, totalCount });
  } catch (error) {
    console.error('Error fetching screenshots:', error);
    return NextResponse.json({ error: 'Failed to retrieve screenshots' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    if (!settings?.enabled) {
      return NextResponse.json({ error: 'Screenshot capture is currently disabled in system settings.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { imageUrl, fileSize = 102400, metadata, timeEntryId } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL or data is required' }, { status: 400 });
    }

    if (!timeEntryId) {
      return NextResponse.json({ error: 'Active timer entry ID is required' }, { status: 400 });
    }

    const runningEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    const isOwner = runningEntry && runningEntry.userId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!runningEntry || (!isOwner && !isAdmin) || (!runningEntry.isRunning && (runningEntry as any).status !== 'RUNNING')) {
      return NextResponse.json({ error: 'Screenshot must belong to an active running timer' }, { status: 400 });
    }

    const intervalIndex = metadata?.intervalIndex;
    let existingRecord = null;

    if (timeEntryId && typeof intervalIndex === 'number') {
      const records = await prisma.screenshotRecord.findMany({
        where: {
          timeEntryId,
          userId: runningEntry.userId,
        },
      });

      existingRecord = records.find((r: any) => {
        try {
          const m = JSON.parse(r.metadata || '{}');
          return m.intervalIndex === intervalIndex;
        } catch {
          return false;
        }
      });
    }

    let record;
    if (existingRecord) {
      record = await prisma.screenshotRecord.update({
        where: { id: existingRecord.id },
        data: {
          imageUrl,
          fileSize: Number(fileSize),
          metadata: metadata ? JSON.stringify(metadata) : existingRecord.metadata,
        },
      });
    } else {
      record = await prisma.screenshotRecord.create({
        data: {
          userId: runningEntry.userId,
          timeEntryId: timeEntryId || null,
          imageUrl,
          fileSize: Number(fileSize),
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    }

    return NextResponse.json({ success: true, record }, { status: 201 });
  } catch (error) {
    console.error('Error recording screenshot:', error);
    return NextResponse.json({ error: 'Failed to record screenshot' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const all = searchParams.get('all') || body.all;
    const startDate = searchParams.get('startDate') || body.startDate;
    const endDate = searchParams.get('endDate') || body.endDate;
    const userId = searchParams.get('userId') || body.userId;
    const projectId = searchParams.get('projectId') || body.projectId;
    const ids = searchParams.get('ids') || body.ids;

    const idsList = Array.isArray(ids)
      ? ids
      : typeof ids === 'string'
      ? ids.split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;

    if (idsList && idsList.length > 0) {
      const recordsToUpdate = await prisma.screenshotRecord.findMany({
        where: { id: { in: idsList } },
        select: { id: true, metadata: true },
      });

      for (const rec of recordsToUpdate) {
        let metaObj: Record<string, unknown> = {};
        try {
          if (rec.metadata) metaObj = JSON.parse(rec.metadata);
        } catch {}
        metaObj.isDeleted = true;
        metaObj.deletedAt = new Date().toISOString();
        metaObj.deletedBy = user.id;

        await prisma.screenshotRecord.update({
          where: { id: rec.id },
          data: {
            imageUrl: '',
            fileSize: 0,
            metadata: JSON.stringify(metaObj),
          },
        });
      }

      await logAuditEvent({
        userId: user.id,
        action: 'SCREENSHOTS_SELECTED_DELETED',
        targetEntity: 'ScreenshotRecord',
        targetId: 'SELECTED_BATCH',
        mandatoryReason: `Administrator deleted ${recordsToUpdate.length} selected screenshot(s).`,
        details: { count: recordsToUpdate.length, ids: idsList },
      });

      return NextResponse.json({
        success: true,
        count: recordsToUpdate.length,
        message: `Successfully deleted ${recordsToUpdate.length} selected screenshot(s).`,
      });
    }

    if (all === true || all === 'true') {
      const recordsToUpdate = await prisma.screenshotRecord.findMany({
        select: { id: true, metadata: true },
      });

      for (const rec of recordsToUpdate) {
        let metaObj: Record<string, unknown> = {};
        try {
          if (rec.metadata) metaObj = JSON.parse(rec.metadata);
        } catch {}
        metaObj.isDeleted = true;
        metaObj.deletedAt = new Date().toISOString();
        metaObj.deletedBy = user.id;

        await prisma.screenshotRecord.update({
          where: { id: rec.id },
          data: {
            imageUrl: '',
            fileSize: 0,
            metadata: JSON.stringify(metaObj),
          },
        });
      }

      await logAuditEvent({
        userId: user.id,
        action: 'SCREENSHOTS_DELETE_ALL',
        targetEntity: 'ScreenshotRecord',
        targetId: 'ALL',
        mandatoryReason: 'Administrator permanently deleted all activity screenshots.',
        details: { deletedCount: recordsToUpdate.length },
      });

      return NextResponse.json({
        success: true,
        count: recordsToUpdate.length,
        message: `Successfully deleted all ${recordsToUpdate.length} screenshots.`,
      });
    }

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ error: 'Invalid start or end date format.' }, { status: 400 });
      }

      if (end < start) {
        return NextResponse.json({ error: 'End date must be on or after start date.' }, { status: 400 });
      }

      const rangeWhere: Record<string, unknown> = {
        capturedAt: {
          gte: start,
          lte: end,
        },
      };

      if (userId && userId !== 'ALL') {
        rangeWhere.userId = userId as string;
      }

      if (projectId && projectId !== 'ALL') {
        rangeWhere.timeEntry = { projectId: projectId as string };
      }

      const recordsToUpdate = await prisma.screenshotRecord.findMany({
        where: rangeWhere,
        select: { id: true, metadata: true },
      });

      for (const rec of recordsToUpdate) {
        let metaObj: Record<string, unknown> = {};
        try {
          if (rec.metadata) metaObj = JSON.parse(rec.metadata);
        } catch {}
        metaObj.isDeleted = true;
        metaObj.deletedAt = new Date().toISOString();
        metaObj.deletedBy = user.id;

        await prisma.screenshotRecord.update({
          where: { id: rec.id },
          data: {
            imageUrl: '',
            fileSize: 0,
            metadata: JSON.stringify(metaObj),
          },
        });
      }

      await logAuditEvent({
        userId: user.id,
        action: 'SCREENSHOTS_DELETE_RANGE',
        targetEntity: 'ScreenshotRecord',
        targetId: `${startDate}_to_${endDate}`,
        mandatoryReason: `Administrator deleted screenshots from ${startDate} to ${endDate}.`,
        details: { startDate, endDate, userId: userId || 'ALL', deletedCount: recordsToUpdate.length },
      });

      return NextResponse.json({
        success: true,
        count: recordsToUpdate.length,
        message: `Successfully deleted ${recordsToUpdate.length} screenshots between ${startDate} and ${endDate}.`,
      });
    }

    return NextResponse.json(
      { error: 'Please specify either all=true to delete all, or both startDate and endDate to delete within a date range.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting screenshots:', error);
    return NextResponse.json({ error: 'Failed to delete screenshots.' }, { status: 500 });
  }
}
