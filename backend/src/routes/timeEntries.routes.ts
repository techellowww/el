import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';
import { evaluateTimeClassification, getOfficeSchedule } from '../lib/timerEngine';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, projectId, userId: targetUserId, isOutsideHours, status } = req.query;
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const whereClause: Record<string, unknown> = {
      isDeleted: false,
    };

    // STRICT PERMISSION CHECK:
    // Non-admin can only access own logs!
    if (req.user!.role !== 'ADMIN') {
      whereClause.userId = req.user!.id;
    } else if (targetUserId && targetUserId !== 'ALL') {
      whereClause.userId = targetUserId;
    }

    if (projectId && projectId !== 'ALL') {
      whereClause.projectId = projectId;
    }

    if (isOutsideHours === 'true') {
      whereClause.isOutsideHours = true;
    } else if (isOutsideHours === 'false') {
      whereClause.isOutsideHours = false;
    }

    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) {
        (whereClause.startTime as Record<string, unknown>).gte = new Date(startDate as string);
      }
      if (endDate) {
        (whereClause.startTime as Record<string, unknown>).lte = new Date(endDate as string);
      }
    }

    const [entries, totalCount] = await Promise.all([
      prisma.timeEntry.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, employeeId: true, department: true } },
          project: { select: { id: true, code: true, name: true } },
          corrections: {
            select: { id: true, status: true, proposedStartTime: true, proposedEndTime: true, reason: true },
          },
        },
        orderBy: { startTime: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.timeEntry.count({ where: whereClause }),
    ]);

    res.json({
      entries,
      totalCount,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to retrieve time entries' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, projectId, startTime, endTime, notes, mandatoryReason } = req.body;

    if (!userId || !projectId || !startTime || !endTime) {
      res.status(400).json({ error: 'User, Project, Start Time, and End Time are required.' });
      return;
    }

    if (!mandatoryReason || mandatoryReason.trim().length < 5) {
      res.status(400).json({ error: 'A mandatory reason (at least 5 characters) is required for manual entry creation.' });
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      res.status(400).json({ error: 'End time must be strictly after start time.' });
      return;
    }

    const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const schedule = await getOfficeSchedule();
    const classification = evaluateTimeClassification(start, schedule);

    const entry = await prisma.timeEntry.create({
      data: {
        userId,
        projectId,
        startTime: start,
        endTime: end,
        duration: durationSeconds,
        status: 'STOPPED',
        classification: classification.classification,
        isOutsideHours: classification.isOutsideHours,
        needsReview: classification.needsReview,
        reviewReason: classification.reason || null,
        source: 'MANUAL',
        notes: notes || null,
      },
      include: {
        user: { select: { name: true, employeeId: true } },
        project: { select: { code: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TIME_ENTRY_MANUAL_CREATE',
      targetEntity: 'TimeEntry',
      targetId: entry.id,
      mandatoryReason,
      details: {
        targetEmployeeId: entry.user.employeeId,
        projectCode: entry.project.code,
        durationSeconds,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    res.status(201).json({ success: true, entry });
  } catch (error) {
    console.error('Error creating manual time entry:', error);
    res.status(500).json({ error: 'Failed to create manual entry' });
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { startTime, endTime, projectId, notes, mandatoryReason } = req.body;

    if (!mandatoryReason || mandatoryReason.trim().length < 5) {
      res.status(400).json({ error: 'A mandatory reason (at least 5 characters) is strictly required for administrative edits.' });
      return;
    }

    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, employeeId: true } },
        project: { select: { code: true, name: true } },
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }

    const newStart = startTime ? new Date(startTime) : existing.startTime;
    const newEnd = endTime ? new Date(endTime) : existing.endTime;

    let newDuration = existing.duration;
    if (newEnd) {
      if (newEnd <= newStart) {
        res.status(400).json({ error: 'End time must be after start time' });
        return;
      }
      newDuration = Math.round((newEnd.getTime() - newStart.getTime()) / 1000);
    }

    const schedule = await getOfficeSchedule();
    const classification = evaluateTimeClassification(newStart, schedule);

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        startTime: newStart,
        endTime: newEnd,
        duration: newDuration,
        projectId: projectId || existing.projectId,
        notes: notes !== undefined ? notes : existing.notes,
        classification: classification.classification,
        isOutsideHours: classification.isOutsideHours,
        needsReview: classification.needsReview,
        source: 'MANUAL',
      },
      include: {
        project: { select: { code: true, name: true } },
        user: { select: { name: true, employeeId: true } },
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TIME_ENTRY_ADMIN_EDIT',
      targetEntity: 'TimeEntry',
      targetId: id,
      mandatoryReason,
      details: {
        previous: {
          startTime: existing.startTime.toISOString(),
          endTime: existing.endTime?.toISOString(),
          duration: existing.duration,
          projectId: existing.projectId,
        },
        updated: {
          startTime: newStart.toISOString(),
          endTime: newEnd?.toISOString(),
          duration: newDuration,
          projectId: projectId || existing.projectId,
        },
      },
    });

    res.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Error editing time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const mandatoryReason = req.query.reason as string;

    if (!mandatoryReason || mandatoryReason.trim().length < 5) {
      res.status(400).json({ error: 'A mandatory reason is required for deleting a time entry.' });
      return;
    }

    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }

    await prisma.timeEntry.update({
      where: { id },
      data: { isDeleted: true },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TIME_ENTRY_DELETED',
      targetEntity: 'TimeEntry',
      targetId: id,
      mandatoryReason,
      details: {
        employeeId: (existing as any).user?.employeeId,
        duration: existing.duration,
        startTime: existing.startTime.toISOString(),
      },
    });

    res.json({ success: true, message: 'Time entry safely archived.' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
