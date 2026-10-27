import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, verifyToken } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';
import { enforceGlobalOfficeCutoffs } from '../lib/timerEngine';

const router = Router();

// GET /api/office-timings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await prisma.officeSchedule.findUnique({
      where: { id: 'default-schedule' },
    });
    res.json({ schedule });
  } catch (error) {
    console.error('Error fetching office schedule:', error);
    res.status(500).json({ error: 'Failed to retrieve office schedule' });
  }
});

// Helper to resolve user from cookies/header or fallback to first admin
async function resolveUserOrFallback(req: AuthRequest) {
  try {
    let token: string | undefined;
    if (req.cookies && req.cookies.el_token) {
      token = req.cookies.el_token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded?.id) {
        const found = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { id: true, email: true, name: true, role: true, employeeId: true },
        });
        if (found) return found;
      }
    }
  } catch (err) {
    console.warn('Token resolution error in office timings:', err);
  }

  // Fallback to active admin or first user
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true, name: true, role: true, employeeId: true },
  });
  if (admin) return admin;

  return await prisma.user.findFirst({
    select: { id: true, email: true, name: true, role: true, employeeId: true },
  });
}

// PUT /api/office-timings
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await resolveUserOrFallback(req);

    const {
      openingTime = '09:00',
      closingTime = '18:00',
      workingDays = 'MON,TUE,WED,THU,FRI,SAT,SUN',
      timezone = 'Asia/Kolkata',
      allowOutsideHours = true,
      autoCutoffEnabled = true,
      dayTimings,
    } = req.body;

    const serializedDayTimings = dayTimings
      ? typeof dayTimings === 'string'
        ? dayTimings
        : JSON.stringify(dayTimings)
      : null;

    const updated = await prisma.officeSchedule.upsert({
      where: { id: 'default-schedule' },
      update: {
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: user?.id || null,
      },
      create: {
        id: 'default-schedule',
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: user?.id || null,
      },
    });

    if (user?.id) {
      try {
        await logAuditEvent({
          userId: user.id,
          action: 'OFFICE_SCHEDULE_UPDATED',
          targetEntity: 'OfficeSchedule',
          targetId: 'default-schedule',
          mandatoryReason: 'User updated office timings and auto-cutoff configuration',
          details: { openingTime, closingTime, workingDays, timezone, autoCutoffEnabled, dayTimings: serializedDayTimings },
        });
      } catch (auditErr) {
        console.warn('Audit log write skipped:', auditErr);
      }
    }

    res.json({ success: true, schedule: updated });
  } catch (error) {
    console.error('Error updating office schedule:', error);
    res.status(500).json({ error: 'Failed to update office schedule' });
  }
});

// POST /api/office-timings/cutoff-trigger
router.post('/cutoff-trigger', async (req: AuthRequest, res: Response) => {
  try {
    const result = await enforceGlobalOfficeCutoffs();
    res.json({
      success: true,
      message: `Office cutoff evaluation complete. Auto-stopped ${result.processed} active timers exceeding closing time.`,
      processed: result.processed,
    });
  } catch (error) {
    console.error('Error enforcing cutoff:', error);
    res.status(500).json({ error: 'Failed to trigger office closing cutoff.' });
  }
});

export default router;
