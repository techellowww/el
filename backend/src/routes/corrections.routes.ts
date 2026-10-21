import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';
import { getOfficeSchedule, evaluateTimeClassification } from '../lib/timerEngine';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    const whereClause: Record<string, unknown> = {};

    if (req.user!.role !== 'ADMIN') {
      whereClause.userId = req.user!.id;
    }

    if (statusFilter && statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    const requests = await prisma.timeCorrectionRequest.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, employeeId: true, department: true } },
        reviewer: { select: { id: true, name: true } },
        timeEntry: {
          include: {
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error) {
    console.error('Error fetching correction requests:', error);
    res.status(500).json({ error: 'Failed to retrieve correction requests' });
  }
});

router.get('/pending-count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const whereClause: Record<string, unknown> = {
      status: 'PENDING',
    };

    if (req.user!.role !== 'ADMIN') {
      whereClause.userId = req.user!.id;
    }

    const count = await prisma.timeCorrectionRequest.count({
      where: whereClause,
    });

    res.json({ count });
  } catch (error) {
    console.error('Error fetching pending corrections count:', error);
    res.status(500).json({ error: 'Failed to retrieve pending corrections count' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { timeEntryId, proposedStartTime, proposedEndTime, reason } = req.body;

    if (!timeEntryId || !proposedStartTime || !proposedEndTime || !reason) {
      res.status(400).json({ error: 'Time Entry, Proposed Start, Proposed End, and Reason are all mandatory.' });
      return;
    }

    if (reason.trim().length < 5) {
      res.status(400).json({ error: 'Reason must be at least 5 characters long.' });
      return;
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!timeEntry) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }

    if (req.user!.role !== 'ADMIN' && timeEntry.userId !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden: You can only submit corrections for your own time records.' });
      return;
    }

    const proposedStart = new Date(proposedStartTime);
    const proposedEnd = new Date(proposedEndTime);

    if (proposedEnd <= proposedStart) {
      res.status(400).json({ error: 'Proposed end time must be after proposed start time.' });
      return;
    }

    const proposedDuration = Math.round((proposedEnd.getTime() - proposedStart.getTime()) / 1000);

    const correction = await prisma.timeCorrectionRequest.create({
      data: {
        timeEntryId,
        userId: timeEntry.userId,
        originalStartTime: timeEntry.startTime,
        originalEndTime: timeEntry.endTime,
        originalDuration: timeEntry.duration,
        proposedStartTime: proposedStart,
        proposedEndTime: proposedEnd,
        proposedDuration,
        reason: reason.trim(),
        status: 'PENDING',
      },
      include: {
        timeEntry: {
          include: { project: true },
        },
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CORRECTION_REQUESTED',
      targetEntity: 'TimeCorrectionRequest',
      targetId: correction.id,
      mandatoryReason: reason,
      details: {
        timeEntryId,
        proposedDuration,
        proposedStart: proposedStart.toISOString(),
        proposedEnd: proposedEnd.toISOString(),
      },
    });

    res.status(201).json({ success: true, correction });
  } catch (error) {
    console.error('Error submitting correction request:', error);
    res.status(500).json({ error: 'Failed to submit correction request' });
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status, reviewComment } = req.body;

    if (!status || (status !== 'APPROVED' && status !== 'REJECTED')) {
      res.status(400).json({ error: 'Status must be APPROVED or REJECTED' });
      return;
    }

    const request = await prisma.timeCorrectionRequest.findUnique({
      where: { id },
      include: {
        timeEntry: true,
        user: { select: { id: true, name: true, employeeId: true } },
      },
    }) as any;

    if (!request) {
      res.status(404).json({ error: 'Correction request not found' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
      return;
    }

    const now = new Date();

    if (status === 'APPROVED') {
      const schedule = await getOfficeSchedule();
      const classification = evaluateTimeClassification(request.proposedStartTime, schedule);

      await prisma.$transaction(async (tx) => {
        await tx.timeEntry.update({
          where: { id: request.timeEntryId },
          data: {
            startTime: request.proposedStartTime,
            endTime: request.proposedEndTime,
            duration: request.proposedDuration,
            status: 'CORRECTED',
            classification: classification.classification,
            isOutsideHours: classification.isOutsideHours,
            needsReview: classification.needsReview,
            source: 'CORRECTION',
            notes: (request.timeEntry?.notes ? request.timeEntry.notes + ' ' : '') + `[Correction approved: ${request.reason}]`,
          },
        });

        await tx.timeCorrectionRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            reviewedById: req.user!.id,
            reviewComment: reviewComment || null,
            reviewedAt: now,
          },
        });
      });

      await logAuditEvent({
        userId: req.user!.id,
        action: 'CORRECTION_APPROVED',
        targetEntity: 'TimeCorrectionRequest',
        targetId: id,
        mandatoryReason: reviewComment || `Correction approved by admin ${req.user!.name}`,
        details: {
          employeeId: request.user?.employeeId,
          timeEntryId: request.timeEntryId,
          originalDuration: request.originalDuration,
          correctedDuration: request.proposedDuration,
        },
      });

      res.json({ success: true, message: 'Correction request approved and time entry updated.' });
    } else {
      // REJECTED
      await prisma.timeCorrectionRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedById: req.user!.id,
          reviewComment: reviewComment || 'Rejected by administrator',
          reviewedAt: now,
        },
      });

      await logAuditEvent({
        userId: req.user!.id,
        action: 'CORRECTION_REJECTED',
        targetEntity: 'TimeCorrectionRequest',
        targetId: id,
        mandatoryReason: reviewComment || 'Correction rejected by administrator',
        details: { employeeId: request.user?.employeeId, timeEntryId: request.timeEntryId },
      });

      res.json({ success: true, message: 'Correction request rejected. Original record preserved.' });
    }
  } catch (error) {
    console.error('Error reviewing correction request:', error);
    res.status(500).json({ error: 'Failed to process correction review' });
  }
});

export default router;
