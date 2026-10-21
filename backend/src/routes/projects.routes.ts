import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    if (req.user!.role === 'ADMIN') {
      const whereClause: Record<string, unknown> = {};
      if (statusFilter && statusFilter !== 'ALL') {
        if (statusFilter === 'INACTIVE') {
          whereClause.status = { in: ['INACTIVE', 'COMPLETED'] };
        } else {
          whereClause.status = statusFilter;
        }
      }

      const projects = await prisma.project.findMany({
        where: whereClause,
        include: {
          creator: { select: { id: true, name: true, employeeId: true } },
          assignments: {
            include: {
              user: { select: { id: true, name: true, employeeId: true, department: true } },
            },
          },
          _count: {
            select: { timeEntries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const projectDurations = await prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: { isDeleted: false },
        _sum: { duration: true },
      });

      const durationMap = new Map(projectDurations.map((p) => [p.projectId, p._sum.duration || 0]));

      const enrichedProjects = projects.map((p) => ({
        ...p,
        totalTrackedSeconds: durationMap.get(p.id) || 0,
      }));

      res.json({ projects: enrichedProjects });
    } else {
      // Employee: All active projects are accessible for time tracking and selection
      const whereClause: Record<string, unknown> = {};
      if (statusFilter && statusFilter !== 'ALL') {
        if (statusFilter === 'INACTIVE') {
          whereClause.status = { in: ['INACTIVE', 'COMPLETED'] };
        } else {
          whereClause.status = statusFilter;
        }
      }

      const projects = await prisma.project.findMany({
        where: whereClause,
        include: {
          creator: { select: { id: true, name: true, employeeId: true } },
          assignments: {
            include: {
              user: { select: { id: true, name: true, employeeId: true, department: true } },
            },
          },
          _count: {
            select: { timeEntries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Employee's own tracked duration for each project
      const myDurations = await prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: { userId: req.user!.id, isDeleted: false },
        _sum: { duration: true },
      });
      const myDurationMap = new Map(myDurations.map((d) => [d.projectId, d._sum.duration || 0]));

      const enrichedProjects = projects.map((p) => ({
        ...p,
        totalTrackedSeconds: myDurationMap.get(p.id) || 0,
        isAssigned: p.assignments.some((a) => a.userId === req.user!.id),
      }));

      res.json({ projects: enrichedProjects });
    }
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, description, assignedUserIds, startDate } = req.body;

    if (!code || !name) {
      res.status(400).json({ error: 'Project Code and Name are required.' });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    const existing = await prisma.project.findUnique({
      where: { code: cleanCode },
    });

    if (existing) {
      res.status(400).json({ error: `Project Code "${cleanCode}" already exists.` });
      return;
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          code: cleanCode,
          name: name.trim(),
          description: description?.trim() || null,
          startDate: startDate ? new Date(startDate) : new Date(),
          status: 'ACTIVE',
          createdById: req.user!.id,
        },
      });

      if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
        await tx.projectAssignment.createMany({
          data: assignedUserIds.map((userId: string) => ({
            projectId: created.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'PROJECT_CREATED',
      targetEntity: 'Project',
      targetId: project.id,
      mandatoryReason: 'Admin created project',
      details: { code: project.code, name: project.name, assignedCount: assignedUserIds?.length || 0 },
    });

    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, status, assignedUserIds } = req.body;

    const existing = await prisma.project.findUnique({
      where: { id },
      include: { assignments: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const dataToUpdate: Record<string, unknown> = {};
    if (name) dataToUpdate.name = name.trim();
    if (description !== undefined) dataToUpdate.description = description ? description.trim() : null;

    let normalizedStatus: string | undefined = undefined;
    if (status && (status === 'ACTIVE' || status === 'INACTIVE' || status === 'COMPLETED')) {
      normalizedStatus = status === 'COMPLETED' ? 'INACTIVE' : status;
      dataToUpdate.status = normalizedStatus;
      if (normalizedStatus === 'INACTIVE' && existing.status !== 'INACTIVE') {
        dataToUpdate.closureDate = new Date();
      } else if (normalizedStatus === 'ACTIVE') {
        dataToUpdate.closureDate = null;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: dataToUpdate,
      });

      if (Array.isArray(assignedUserIds)) {
        await tx.projectAssignment.deleteMany({
          where: { projectId: id },
        });

        if (assignedUserIds.length > 0) {
          await tx.projectAssignment.createMany({
            data: assignedUserIds.map((uId: string) => ({
              projectId: id,
              userId: uId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (normalizedStatus === 'INACTIVE') {
        const now = new Date();
        const running = await tx.timeEntry.findMany({
          where: { projectId: id, status: 'RUNNING', endTime: null },
        });

        for (const r of running) {
          const dur = Math.max(0, Math.round((now.getTime() - r.startTime.getTime()) / 1000));
          await tx.timeEntry.update({
            where: { id: r.id },
            data: { endTime: now, duration: dur, status: 'STOPPED' },
          });
        }
      }

      return project;
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: status === 'COMPLETED' ? 'PROJECT_CLOSED' : 'PROJECT_UPDATED',
      targetEntity: 'Project',
      targetId: id,
      mandatoryReason: status === 'COMPLETED' ? 'Admin closed project' : 'Admin updated project details',
      details: { previousStatus: existing.status, newStatus: updated.status, changes: dataToUpdate },
    });

    res.json({ success: true, project: updated });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

async function executeProjectDeleteOrDeactivate(
  id: string,
  req: AuthRequest,
  res: Response,
  forcePermanent?: boolean
) {
  try {
    const isPermanent =
      forcePermanent ??
      (req.query.permanent === 'true' ||
        req.query.mode === 'permanent' ||
        req.body?.permanent === true ||
        req.body?.mode === 'permanent');

    const inputReason =
      (req.query.reason as string) ||
      (req.body?.reason as string) ||
      '';

    const cleanReason =
      inputReason.trim().length >= 3
        ? inputReason.trim()
        : isPermanent
        ? 'Admin permanently deleted project'
        : 'Admin deactivated project';

    const existing = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assignments: true, timeEntries: true },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (isPermanent) {
      await prisma.$transaction(async (tx) => {
        // 1. Find all time entries for this project
        const entries = await tx.timeEntry.findMany({
          where: { projectId: id },
          select: { id: true },
        });
        const entryIds = entries.map((e) => e.id);

        if (entryIds.length > 0) {
          // Delete correction requests for these time entries
          await tx.timeCorrectionRequest.deleteMany({
            where: { timeEntryId: { in: entryIds } },
          });

          // Delete screenshots for these time entries
          await tx.screenshotRecord.deleteMany({
            where: { timeEntryId: { in: entryIds } },
          });

          // Delete all time entries
          await tx.timeEntry.deleteMany({
            where: { projectId: id },
          });
        }

        // 2. Delete project assignments
        await tx.projectAssignment.deleteMany({
          where: { projectId: id },
        });

        // 3. Delete the project
        await tx.project.delete({
          where: { id },
        });
      });

      await logAuditEvent({
        userId: req.user!.id,
        action: 'PROJECT_PERMANENTLY_DELETED',
        targetEntity: 'Project',
        targetId: id,
        mandatoryReason: cleanReason,
        details: {
          code: existing.code,
          name: existing.name,
          assignmentsCount: existing._count.assignments,
          timeEntriesCount: existing._count.timeEntries,
          permanent: true,
        },
      });

      res.json({
        success: true,
        message: `Project ${existing.name} (${existing.code}) permanently deleted successfully.`,
      });
      return;
    }

    // Soft delete / deactivate project
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Stop running timers for this project
      const running = await tx.timeEntry.findMany({
        where: { projectId: id, status: 'RUNNING', endTime: null },
      });

      for (const r of running) {
        const dur = Math.max(0, Math.round((now.getTime() - r.startTime.getTime()) / 1000));
        await tx.timeEntry.update({
          where: { id: r.id },
          data: { endTime: now, duration: dur, status: 'STOPPED' },
        });
      }

      await tx.project.update({
        where: { id },
        data: { status: 'INACTIVE', closureDate: now },
      });
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'PROJECT_DEACTIVATED',
      targetEntity: 'Project',
      targetId: id,
      mandatoryReason: cleanReason,
      details: {
        code: existing.code,
        name: existing.name,
        previousStatus: existing.status,
      },
    });

    res.json({
      success: true,
      message: `Project ${existing.name} (${existing.code}) set to Inactive successfully.`,
    });
  } catch (error) {
    console.error('Error deleting/deactivating project:', error);
    res.status(500).json({ error: 'Failed to process project deletion or deactivation' });
  }
}

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  await executeProjectDeleteOrDeactivate(req.params.id as string, req, res);
});

router.post('/:id/delete', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  await executeProjectDeleteOrDeactivate(req.params.id as string, req, res);
});

export default router;
