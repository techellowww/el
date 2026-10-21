import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';

const router = Router();

// GET /api/screenshots - View screenshots with filtering by User and Date Range
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.query.userId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '100', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

    const whereClause: Record<string, unknown> = {};
    if (targetUserId && targetUserId !== 'ALL') {
      whereClause.userId = targetUserId;
    }

    if (startDate || endDate) {
      whereClause.capturedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        (whereClause.capturedAt as Record<string, unknown>).gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        (whereClause.capturedAt as Record<string, unknown>).lte = end;
      }
    }

    const [screenshots, totalCount] = await Promise.all([
      prisma.screenshotRecord.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, employeeId: true, department: true } },
          timeEntry: {
            select: { id: true, duration: true, project: { select: { code: true, name: true } } },
          },
        },
        orderBy: { capturedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.screenshotRecord.count({ where: whereClause }),
    ]);

    // Mark as viewed for audit
    await prisma.screenshotRecord.updateMany({
      where: {
        id: { in: screenshots.map((s) => s.id) },
        viewedAt: null,
      },
      data: {
        viewedAt: new Date(),
        viewedById: req.user!.id,
      },
    });

    res.json({ screenshots, totalCount });
  } catch (error) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({ error: 'Failed to retrieve screenshots' });
  }
});

// POST /api/screenshots - Employee or Agent records an activity capture
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    if (!settings?.enabled) {
      res.status(400).json({ error: 'Screenshot capture is currently disabled in system settings.' });
      return;
    }

    const { imageUrl, fileSize = 102400, metadata, timeEntryId } = req.body;

    if (!imageUrl) {
      res.status(400).json({ error: 'Image URL or data is required' });
      return;
    }

    // Validate that the timeEntry belongs to this user and is currently running
    if (!timeEntryId) {
      res.status(400).json({ error: 'Active timer entry ID is required' });
      return;
    }

    const runningEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    const isOwner = runningEntry && runningEntry.userId === req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';

    if (!runningEntry || (!isOwner && !isAdmin) || runningEntry.status !== 'RUNNING') {
      res.status(400).json({ error: 'Screenshot must belong to an active running timer' });
      return;
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

      existingRecord = records.find((r) => {
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

    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('Error recording screenshot:', error);
    res.status(500).json({ error: 'Failed to record screenshot' });
  }
});

// DELETE /api/screenshots - Bulk delete: all OR date-to-date range
router.delete('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { all, startDate, endDate, userId, ids } = {
      ...req.query,
      ...req.body,
    };

    const idsList = Array.isArray(ids)
      ? ids
      : typeof ids === 'string'
      ? ids.split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;

    if (idsList && idsList.length > 0) {
      const result = await prisma.screenshotRecord.deleteMany({
        where: { id: { in: idsList } },
      });

      await logAuditEvent({
        userId: req.user!.id,
        action: 'SCREENSHOTS_SELECTED_DELETED',
        targetEntity: 'ScreenshotRecord',
        targetId: 'SELECTED_BATCH',
        mandatoryReason: `Administrator deleted ${result.count} selected screenshot(s).`,
        details: { count: result.count, ids: idsList },
      });

      res.json({
        success: true,
        count: result.count,
        message: `Successfully deleted ${result.count} selected screenshot(s).`,
      });
      return;
    }

    if (all === true || all === 'true') {
      const result = await prisma.screenshotRecord.deleteMany({});

      await logAuditEvent({
        userId: req.user!.id,
        action: 'SCREENSHOTS_DELETE_ALL',
        targetEntity: 'ScreenshotRecord',
        targetId: 'ALL',
        mandatoryReason: 'Administrator permanently deleted all activity screenshots.',
        details: { deletedCount: result.count },
      });

      res.json({
        success: true,
        count: result.count,
        message: `Successfully deleted all ${result.count} screenshots.`,
      });
      return;
    }

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ error: 'Invalid start or end date format.' });
        return;
      }

      if (end < start) {
        res.status(400).json({ error: 'End date must be on or after start date.' });
        return;
      }

      const whereClause: Record<string, unknown> = {
        capturedAt: {
          gte: start,
          lte: end,
        },
      };

      if (userId && userId !== 'ALL') {
        whereClause.userId = userId as string;
      }

      const result = await prisma.screenshotRecord.deleteMany({
        where: whereClause,
      });

      await logAuditEvent({
        userId: req.user!.id,
        action: 'SCREENSHOTS_DELETE_RANGE',
        targetEntity: 'ScreenshotRecord',
        targetId: `${startDate}_to_${endDate}`,
        mandatoryReason: `Administrator deleted screenshots from ${startDate} to ${endDate}.`,
        details: { startDate, endDate, userId: userId || 'ALL', deletedCount: result.count },
      });

      res.json({
        success: true,
        count: result.count,
        message: `Successfully deleted ${result.count} screenshots between ${startDate} and ${endDate}.`,
      });
      return;
    }

    res.status(400).json({
      error: 'Please specify either all=true to delete all, or both startDate and endDate to delete within a date range.',
    });
  } catch (error) {
    console.error('Error deleting screenshots:', error);
    res.status(500).json({ error: 'Failed to delete screenshots.' });
  }
});

// DELETE /api/screenshots/:id - Delete single screenshot record
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.screenshotRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }

    await prisma.screenshotRecord.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SCREENSHOT_DELETED',
      targetEntity: 'ScreenshotRecord',
      targetId: id,
      mandatoryReason: 'Administrator deleted individual activity screenshot.',
      details: { screenshotId: id, userId: existing.userId },
    });

    res.json({ success: true, message: 'Screenshot deleted successfully.' });
  } catch (error) {
    console.error('Error deleting screenshot:', error);
    res.status(500).json({ error: 'Failed to delete screenshot.' });
  }
});

export default router;
