import { prisma } from './prisma';
import { logAuditEvent } from './audit';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface DayTiming {
  start: string;
  end: string;
}

export interface DayTimingsMap {
  MON: DayTiming;
  TUE: DayTiming;
  WED: DayTiming;
  THU: DayTiming;
  FRI: DayTiming;
  SAT: DayTiming;
  SUN: DayTiming;
  [day: string]: DayTiming;
}

export interface OfficeScheduleConfig {
  openingTime: string; // "09:00"
  closingTime: string; // "18:00"
  workingDays: string; // "MON,TUE,WED,THU,FRI"
  timezone: string;    // "Asia/Kolkata"
  allowOutsideHours: boolean;
  autoCutoffEnabled: boolean;
  dayTimings?: string | DayTimingsMap | null;
}

export const DEFAULT_DAY_TIMINGS: DayTimingsMap = {
  MON: { start: '09:00', end: '18:00' },
  TUE: { start: '09:00', end: '18:00' },
  WED: { start: '09:00', end: '18:00' },
  THU: { start: '09:00', end: '18:00' },
  FRI: { start: '09:00', end: '18:00' },
  SAT: { start: '09:00', end: '18:00' },
  SUN: { start: '09:00', end: '18:00' },
};

const DEFAULT_SCHEDULE: OfficeScheduleConfig = {
  openingTime: '09:00',
  closingTime: '18:00',
  workingDays: 'MON,TUE,WED,THU,FRI,SAT,SUN',
  timezone: 'Asia/Kolkata',
  allowOutsideHours: true,
  autoCutoffEnabled: true,
  dayTimings: JSON.stringify(DEFAULT_DAY_TIMINGS),
};

export function parseDayTimings(raw?: string | DayTimingsMap | null): DayTimingsMap {
  if (!raw) return DEFAULT_DAY_TIMINGS;
  if (typeof raw === 'object') return { ...DEFAULT_DAY_TIMINGS, ...raw };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DAY_TIMINGS, ...parsed };
  } catch {
    return DEFAULT_DAY_TIMINGS;
  }
}

export function getOpeningTimeForDate(date: Date, schedule: OfficeScheduleConfig): string {
  const dayTimings = parseDayTimings(schedule.dayTimings);
  const dayOfWeek = formatInTimeZone(date, schedule.timezone, 'EEE').toUpperCase();
  if (dayTimings[dayOfWeek]?.start) {
    return dayTimings[dayOfWeek].start;
  }
  return schedule.openingTime || '09:00';
}

export function getClosingTimeForDate(date: Date, schedule: OfficeScheduleConfig): string {
  const dayTimings = parseDayTimings(schedule.dayTimings);
  const dayOfWeek = formatInTimeZone(date, schedule.timezone, 'EEE').toUpperCase();
  if (dayTimings[dayOfWeek]?.end) {
    return dayTimings[dayOfWeek].end;
  }
  return schedule.closingTime || '18:00';
}

export async function getOfficeSchedule(): Promise<OfficeScheduleConfig> {
  const schedule = await prisma.officeSchedule.findUnique({
    where: { id: 'default-schedule' },
  });

  if (!schedule) return DEFAULT_SCHEDULE;

  return {
    openingTime: schedule.openingTime,
    closingTime: schedule.closingTime,
    workingDays: schedule.workingDays,
    timezone: schedule.timezone,
    allowOutsideHours: schedule.allowOutsideHours,
    autoCutoffEnabled: schedule.autoCutoffEnabled,
    dayTimings: schedule.dayTimings || JSON.stringify(DEFAULT_DAY_TIMINGS),
  };
}

/**
 * Evaluates whether a given timestamp falls within regular office hours.
 */
export function evaluateTimeClassification(
  date: Date,
  schedule: OfficeScheduleConfig
): {
  isOutsideHours: boolean;
  classification: 'REGULAR' | 'OUTSIDE_HOURS' | 'AMBIGUOUS_REVIEW';
  needsReview: boolean;
  reason?: string;
} {
  try {
    const dayOfWeek = formatInTimeZone(date, schedule.timezone, 'EEE').toUpperCase(); // MON, TUE, etc.
    const timeOfDay = formatInTimeZone(date, schedule.timezone, 'HH:mm'); // 14:30

    // Resolve day-wise opening and closing times
    const openingTime = getOpeningTimeForDate(date, schedule);
    const closingTime = getClosingTimeForDate(date, schedule);

    const [openH, openM] = openingTime.split(':').map(Number);
    const [closeH, closeM] = closingTime.split(':').map(Number);
    const [curH, curM] = timeOfDay.split(':').map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    const currentMinutes = curH * 60 + curM;

    // Normal daytime schedule (e.g., 09:00 to 18:00)
    if (closeMinutes > openMinutes) {
      if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
        return {
          isOutsideHours: true,
          classification: 'OUTSIDE_HOURS',
          needsReview: true,
          reason: `Tracked at ${timeOfDay} on ${dayOfWeek}, outside standard hours ${openingTime}-${closingTime}.`,
        };
      }
    } else if (closeMinutes < openMinutes) {
      // Overnight schedule (e.g., 20:00 to 05:00)
      const isInOvernight = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
      if (!isInOvernight) {
        return {
          isOutsideHours: true,
          classification: 'OUTSIDE_HOURS',
          needsReview: true,
          reason: `Tracked at ${timeOfDay} on ${dayOfWeek}, outside overnight hours ${openingTime}-${closingTime}.`,
        };
      }
    }

    return {
      isOutsideHours: false,
      classification: 'REGULAR',
      needsReview: false,
    };
  } catch (err) {
    console.error('Error evaluating office hours classification:', err);
    return {
      isOutsideHours: false,
      classification: 'AMBIGUOUS_REVIEW',
      needsReview: true,
      reason: 'Failed to calculate timezone schedule. Flagged for review.',
    };
  }
}

/**
 * Rule 1 & Rule 4: Start a project timer with single-active-timer atomicity.
 * If another timer is running, atomically stop it and start the new one.
 */
export async function startProjectTimer({
  userId,
  projectId,
  notes,
  targetDurationMinutes,
}: {
  userId: string;
  projectId: string;
  notes?: string;
  targetDurationMinutes?: number;
}) {
  const schedule = await getOfficeSchedule();
  const now = new Date();

  // 1. Verify permitted project assignment or Admin access
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new Error('User account is inactive or not found.');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignments: true },
  });

  if (!project) {
    throw new Error('Project not found.');
  }

  if (project.status === 'COMPLETED' || project.status === 'INACTIVE') {
    throw new Error('Cannot track time on an inactive project.');
  }

  // Employees can track time on any active project
  if (user.role !== 'ADMIN' && project.status !== 'ACTIVE') {
    throw new Error('Unauthorized: Project is not active for time tracking.');
  }

  // 2. Classify start time against office hours
  const classificationResult = evaluateTimeClassification(now, schedule);

  if (classificationResult.isOutsideHours && !schedule.allowOutsideHours && user.role !== 'ADMIN') {
    throw new Error('Company policy does not permit time tracking outside configured office hours.');
  }

  // Calculate target duration for outside-hours sessions
  let targetDurationSeconds: number | null = null;
  let sessionNotes = notes || '';

  if (classificationResult.isOutsideHours) {
    // If user provided a planned duration (e.g. 30m, 60m, 120m)
    if (targetDurationMinutes && targetDurationMinutes > 0) {
      targetDurationSeconds = Math.round(targetDurationMinutes * 60);
      sessionNotes = sessionNotes
        ? `${sessionNotes} [Planned outside-hours limit: ${targetDurationMinutes}m]`
        : `[Planned outside-hours limit: ${targetDurationMinutes}m]`;
    } else {
      // Default safety limit of 2 hours (120 minutes) if no duration was explicitly supplied
      targetDurationSeconds = 120 * 60;
      sessionNotes = sessionNotes
        ? `${sessionNotes} [Planned outside-hours limit: 120m]`
        : `[Planned outside-hours limit: 120m]`;
    }
  }

  // 3. Execute atomic transaction to switch or start timer
  const result = await prisma.$transaction(async (tx) => {
    // A. Check for currently running timer
    const runningEntries = await tx.timeEntry.findMany({
      where: {
        userId,
        status: 'RUNNING',
        endTime: null,
        isDeleted: false,
      },
      include: {
        project: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    // If currently running on same project, return it
    const activeSameProject = runningEntries.find((e) => e.projectId === projectId);
    if (activeSameProject) {
      return { activeEntry: activeSameProject, previousStopped: null };
    }

    let previousStopped = null;

    // Stop any existing running entries
    for (const running of runningEntries) {
      const durationSeconds = Math.max(0, Math.round((now.getTime() - running.startTime.getTime()) / 1000));
      previousStopped = await tx.timeEntry.update({
        where: { id: running.id },
        data: {
          endTime: now,
          duration: durationSeconds,
          status: 'STOPPED',
          updatedAt: now,
        },
      });
    }

    // B. Create the new running timer
    const newEntry = await tx.timeEntry.create({
      data: {
        userId,
        projectId,
        startTime: now,
        endTime: null,
        duration: 0,
        targetDuration: targetDurationSeconds,
        status: 'RUNNING',
        classification: classificationResult.classification,
        isOutsideHours: classificationResult.isOutsideHours,
        needsReview: classificationResult.needsReview,
        reviewReason: classificationResult.reason || null,
        source: 'TIMER',
        notes: sessionNotes || null,
      } as any,
      include: {
        project: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    return { activeEntry: newEntry, previousStopped };
  });

  return result;
}

/**
 * Rule 2: Stop an active timer with duration calculation and validation.
 */
export async function stopProjectTimer({
  userId,
  timeEntryId,
  notes,
}: {
  userId: string;
  timeEntryId?: string;
  notes?: string;
}) {
  const now = new Date();

  // Find running entry
  const whereClause: {
    userId: string;
    status: string;
    endTime: null;
    isDeleted: boolean;
    id?: string;
  } = {
    userId,
    status: 'RUNNING',
    endTime: null,
    isDeleted: false,
  };

  if (timeEntryId) {
    whereClause.id = timeEntryId;
  }

  const runningEntry = await prisma.timeEntry.findFirst({
    where: whereClause,
    include: { project: true },
  });

  if (!runningEntry) {
    throw new Error('No active timer currently running.');
  }

  // Calculate accurate duration in seconds
  const startMs = runningEntry.startTime.getTime();
  const nowMs = now.getTime();
  const rawDurationSeconds = Math.round((nowMs - startMs) / 1000);
  const durationSeconds = Math.max(0, rawDurationSeconds);

  const updatedEntry = await prisma.timeEntry.update({
    where: { id: runningEntry.id },
    data: {
      endTime: now,
      duration: durationSeconds,
      status: 'STOPPED',
      notes: notes !== undefined ? notes : runningEntry.notes,
      updatedAt: now,
    },
    include: {
      project: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  return updatedEntry;
}

/**
 * Retrieve the current active timer for an employee.
 */
export async function getActiveTimer(userId: string) {
  // First run any required cutoff check
  await enforceOfficeCutoffForUser(userId);

  return prisma.timeEntry.findFirst({
    where: {
      userId,
      status: 'RUNNING',
      endTime: null,
      isDeleted: false,
    },
    include: {
      project: {
        select: { id: true, code: true, name: true, status: true },
      },
    },
  });
}

/**
 * Rule 3: Enforce office closing auto-cutoffs for a specific user if applicable.
 */
export async function enforceOfficeCutoffForUser(userId: string) {
  const schedule = await getOfficeSchedule();
  if (!schedule.autoCutoffEnabled) return;

  const runningEntries = await prisma.timeEntry.findMany({
    where: {
      userId,
      status: 'RUNNING',
      endTime: null,
      isDeleted: false,
    },
  });

  if (runningEntries.length === 0) return;

  const now = new Date();

  for (const entry of runningEntries) {
    const startClass = evaluateTimeClassification(entry.startTime, schedule);
    const nowClass = evaluateTimeClassification(now, schedule);

    // Case 1: Planned target duration reached (user-selected duration limit)
    const targetSec = (entry as any).targetDuration as number | null;
    const elapsedSeconds = Math.max(0, Math.round((now.getTime() - entry.startTime.getTime()) / 1000));

    if (targetSec && targetSec > 0 && elapsedSeconds >= targetSec) {
      const cutoffDate = new Date(entry.startTime.getTime() + targetSec * 1000);
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: cutoffDate,
          duration: targetSec,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped: Reached planned ${Math.round(targetSec / 60)}m outside-hours limit]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Timer automatically stopped upon reaching selected outside-hours duration limit (${Math.round(targetSec / 60)} mins).`,
        details: { userId, timeEntryId: entry.id, targetDuration: targetSec },
      });
      continue;
    }

    // Case 2: Started during regular hours and current time is past office closing time
    if (!startClass.isOutsideHours && nowClass.isOutsideHours) {
      // Calculate closing time cutoff timestamp on entry's day in org timezone
      const startZoned = toZonedTime(entry.startTime, schedule.timezone);
      const closingTime = getClosingTimeForDate(entry.startTime, schedule);
      const [closeH, closeM] = closingTime.split(':').map(Number);
      
      const cutoffDate = new Date(startZoned);
      cutoffDate.setHours(closeH, closeM, 0, 0);

      // Duration capped at closing time
      const cutoffMs = cutoffDate.getTime();
      const startMs = entry.startTime.getTime();
      const durationSeconds = Math.max(0, Math.round((cutoffMs - startMs) / 1000));

      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: cutoffDate,
          duration: durationSeconds,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped at office closing time ${closingTime}]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Timer automatically stopped at office closing time (${closingTime}) under policy rules.`,
        details: { userId, timeEntryId: entry.id, closingTime },
      });
      continue;
    }

    // Case 3: Safety cap for runaway outside-hours timers (4 hours max)
    if (startClass.isOutsideHours && elapsedSeconds >= 14400) {
      const maxCutoffDate = new Date(entry.startTime.getTime() + 14400 * 1000);
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: maxCutoffDate,
          duration: 14400,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped: Exceeded 4-hour safety cap for outside-hours sessions]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: 'Timer automatically stopped after exceeding 4-hour outside-hours safety cap.',
        details: { userId, timeEntryId: entry.id },
      });
    }
  }
}

/**
 * Rule 3: Global cron / scheduled worker to enforce office closing cutoff across all active timers.
 */
export async function enforceGlobalOfficeCutoffs() {
  const schedule = await getOfficeSchedule();
  if (!schedule.autoCutoffEnabled) return { processed: 0 };

  const runningEntries = await prisma.timeEntry.findMany({
    where: {
      status: 'RUNNING',
      endTime: null,
      isDeleted: false,
    },
    include: { user: true },
  });

  let processedCount = 0;
  const now = new Date();

  for (const entry of runningEntries) {
    const startClass = evaluateTimeClassification(entry.startTime, schedule);
    const nowClass = evaluateTimeClassification(now, schedule);

    // Case 1: Planned target duration reached for outside-hours sessions
    const targetSec = (entry as any).targetDuration as number | null;
    const elapsedSeconds = Math.max(0, Math.round((now.getTime() - entry.startTime.getTime()) / 1000));

    if (targetSec && targetSec > 0 && elapsedSeconds >= targetSec) {
      const cutoffDate = new Date(entry.startTime.getTime() + targetSec * 1000);
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: cutoffDate,
          duration: targetSec,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped: Reached planned ${Math.round(targetSec / 60)}m outside-hours limit]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Scheduled cutoff enforced upon reaching planned outside-hours limit (${Math.round(targetSec / 60)} mins).`,
        details: { employeeId: entry.user.employeeId, entryId: entry.id, targetDuration: targetSec },
      });

      processedCount++;
      continue;
    }

    // Case 2: Started inside office hours and current time is outside hours (closing cutoff)
    if (!startClass.isOutsideHours && nowClass.isOutsideHours) {
      const startZoned = toZonedTime(entry.startTime, schedule.timezone);
      const closingTime = getClosingTimeForDate(entry.startTime, schedule);
      const [closeH, closeM] = closingTime.split(':').map(Number);
      
      const cutoffDate = new Date(startZoned);
      cutoffDate.setHours(closeH, closeM, 0, 0);

      const cutoffMs = cutoffDate.getTime();
      const startMs = entry.startTime.getTime();
      const durationSeconds = Math.max(0, Math.round((cutoffMs - startMs) / 1000));

      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: cutoffDate,
          duration: durationSeconds,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped at office closing time ${closingTime}]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Scheduled cutoff enforced at office closing time (${closingTime}).`,
        details: { employeeId: entry.user.employeeId, entryId: entry.id, closingTime },
      });

      processedCount++;
      continue;
    }

    // Case 3: Safety cap for runaway outside-hours timers (4 hours max)
    if (startClass.isOutsideHours && elapsedSeconds >= 14400) {
      const maxCutoffDate = new Date(entry.startTime.getTime() + 14400 * 1000);
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          endTime: maxCutoffDate,
          duration: 14400,
          status: 'AUTO_CUTOFF',
          source: 'AUTO_CUTOFF',
          notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped: Exceeded 4-hour safety cap for outside-hours sessions]`,
          updatedAt: now,
        },
      });

      await logAuditEvent({
        userId: null,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: 'Scheduled cutoff enforced after exceeding 4-hour outside-hours safety cap.',
        details: { employeeId: entry.user.employeeId, entryId: entry.id },
      });

      processedCount++;
    }
  }

  return { processed: processedCount };
}
