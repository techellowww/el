import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../lib/auth';
import { getActiveTimer, getOfficeSchedule, startProjectTimer, stopProjectTimer, evaluateTimeClassification } from '../lib/timerEngine';
import { logAuditEvent } from '../lib/audit';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const activeTimer = await getActiveTimer(req.user!.id);
    const schedule = await getOfficeSchedule();
    const screenshotSetting = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    const isOutsideHours = evaluateTimeClassification(new Date(), schedule).isOutsideHours;

    res.json({
      activeTimer,
      schedule,
      isOutsideHours,
      screenshotSetting,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching active timer:', error);
    res.status(500).json({ error: 'Failed to retrieve active timer state.' });
  }
});

router.post('/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let { projectId, notes, targetDurationMinutes } = req.body;

    if (!projectId) {
      const defaultProject = await prisma.project.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      if (!defaultProject) {
        res.status(400).json({ error: 'No active project available to track time.' });
        return;
      }
      projectId = defaultProject.id;
    }

    const { activeEntry, previousStopped } = await startProjectTimer({
      userId: req.user!.id,
      projectId,
      notes,
      targetDurationMinutes: targetDurationMinutes ? Number(targetDurationMinutes) : undefined,
    });

    if (previousStopped) {
      await logAuditEvent({
        userId: req.user!.id,
        action: 'TIMER_AUTO_SWITCHED',
        targetEntity: 'TimeEntry',
        targetId: previousStopped.id,
        mandatoryReason: 'Automatically stopped previous project timer upon starting a new project.',
        details: { previousProjectId: previousStopped.projectId, newProjectId: projectId },
      });
    }

    const screenshotSetting = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    res.json({
      success: true,
      activeTimer: activeEntry,
      previousStopped,
      screenshotSetting,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error starting timer:', error);
    const message = error instanceof Error ? error.message : 'Failed to start timer.';
    res.status(400).json({ error: message });
  }
});

router.post('/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { timeEntryId, notes } = req.body;

    const stoppedEntry = await stopProjectTimer({
      userId: req.user!.id,
      timeEntryId,
      notes,
    });

    res.json({
      success: true,
      timeEntry: stoppedEntry,
      duration: stoppedEntry.duration,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error stopping timer:', error);
    const message = error instanceof Error ? error.message : 'Failed to stop timer.';
    res.status(400).json({ error: message });
  }
});

export default router;
