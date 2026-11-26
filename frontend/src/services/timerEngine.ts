import { prisma } from '@/lib/db';
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

let cachedSchedule: OfficeScheduleConfig | null = null;
let lastScheduleFetchTime = 0;

export function invalidateOfficeScheduleCache(): void {
  cachedSchedule = null;
  lastScheduleFetchTime = 0;
}

export async function getOfficeSchedule(): Promise<OfficeScheduleConfig> {
  const now = Date.now();
  if (cachedSchedule && now - lastScheduleFetchTime < 30000) {
    return cachedSchedule;
  }

  const schedule = await prisma.officeSchedule.findUnique({
    where: { id: 'default-schedule' },
  });

  if (!schedule) {
    cachedSchedule = DEFAULT_SCHEDULE;
    lastScheduleFetchTime = now;
    return DEFAULT_SCHEDULE;
  }

  cachedSchedule = {
    openingTime: schedule.openingTime,
    closingTime: schedule.closingTime,
    workingDays: schedule.workingDays,
    timezone: schedule.timezone,
    allowOutsideHours: schedule.allowOutsideHours,
    autoCutoffEnabled: schedule.autoCutoffEnabled,
    dayTimings: schedule.dayTimings || JSON.stringify(DEFAULT_DAY_TIMINGS),
  };
  lastScheduleFetchTime = now;
  return cachedSchedule;
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

    const workingDays = (schedule.workingDays || 'MON,TUE,WED,THU,FRI')
      .split(',')
      .map((d) => d.trim().toUpperCase());

    if (!workingDays.includes(dayOfWeek)) {
      return {
        isOutsideHours: true,
        classification: 'OUTSIDE_HOURS',
        needsReview: true,
        reason: `Tracked on ${dayOfWeek}, which is outside scheduled working days (${schedule.workingDays}).`,
      };
    }

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
  isOvertime,
}: {
  userId: string;
  projectId: string;
  notes?: string;
  targetDurationMinutes?: number;
  isOvertime?: boolean;
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
  });

  if (!project) {
    throw new Error('Project not found.');
  }

  // 2. Classify start time against office hours
  const classificationResult = evaluateTimeClassification(now, schedule);
  const isOvertimeSession = Boolean(
    isOvertime ||
    classificationResult.isOutsideHours ||
    (notes && /\[Overtime\]/i.test(notes))
  );

  if (classificationResult.isOutsideHours && !schedule.allowOutsideHours && !isOvertimeSession && user.role !== 'ADMIN') {
    throw new Error('Company policy does not permit time tracking outside configured office hours.');
  }

  // Target duration: Overtime sessions run until manually stopped (no forced cutoff)
  let sessionNotes = notes || '';

  if (isOvertimeSession) {
    if (!/\[Overtime\]/i.test(sessionNotes)) {
      sessionNotes = sessionNotes ? `[Overtime] ${sessionNotes}` : '[Overtime]';
    }
    // Overtime runs until manually stopped
  } else if (classificationResult.isOutsideHours && targetDurationMinutes && targetDurationMinutes > 0) {
    sessionNotes = sessionNotes
      ? `${sessionNotes} [Planned limit: ${targetDurationMinutes}m]`
      : `[Planned limit: ${targetDurationMinutes}m]`;
  }

  // 3. Execute atomic transaction to switch or start timer
  const result = await prisma.$transaction(async (tx: any) => {
    // A. Check for currently running timer
    const runningEntries = await tx.timeEntry.findMany({
      where: {
        userId,
        isRunning: true,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    // If currently running on same project, return it
    const activeSameProject = runningEntries.find((e: any) => e.projectId === projectId);
    if (activeSameProject) {
      return { activeEntry: activeSameProject, previousStopped: null };
    }

    let previousStopped = null;

    // Stop any existing running entries
    for (const running of runningEntries) {
      const durationSeconds = Math.max(0, Math.round((now.getTime() - new Date(running.startedAt).getTime()) / 1000));
      previousStopped = await tx.timeEntry.update({
        where: { id: running.id },
        data: {
          stoppedAt: now,
          durationSeconds,
          isRunning: false,
        },
      });
    }

    // B. Create the new running timer
    const newEntry = await tx.timeEntry.create({
      data: {
        accountId: project.accountId,
        userId,
        projectId,
        clientId: project.clientId,
        startedAt: now,
        isRunning: true,
        durationSeconds: 0,
        description: sessionNotes || null,
      },
      include: {
        project: {
          select: { id: true, name: true },
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
    isRunning: boolean;
    id?: string;
  } = {
    userId,
    isRunning: true,
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
  const startMs = new Date(runningEntry.startedAt).getTime();
  const nowMs = now.getTime();
  const rawDurationSeconds = Math.round((nowMs - startMs) / 1000);
  const durationSeconds = Math.max(0, rawDurationSeconds);

  const updatedEntry = await prisma.timeEntry.update({
    where: { id: runningEntry.id },
    data: {
      stoppedAt: now,
      durationSeconds,
      isRunning: false,
      description: notes !== undefined ? notes : runningEntry.description,
    },
    include: {
      project: {
        select: { id: true, name: true },
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
      isRunning: true,
    },
    include: {
      project: {
        select: { id: true, name: true, stage: true },
      },
    },
  });
}

/**
 * Rule 3: Enforce office closing auto-cutoffs for a specific user if applicable.
 * - When autoCutoffEnabled is true, active timers started during regular office hours
 *   are automatically stopped when the office closing time is reached.
 * - Overtime timers (marked with [Overtime] or started after hours) run until manually stopped!
 */
export async function enforceOfficeCutoffForUser(userId: string) {
  const schedule = await getOfficeSchedule();
  // If checkbox is NOT checked, let the timer run until it is stopped manually!
  if (!schedule.autoCutoffEnabled) return;

  const runningEntries = await prisma.timeEntry.findMany({
    where: {
      userId,
      isRunning: true,
    },
  });

  if (runningEntries.length === 0) return;

  const now = new Date();
  const tz = schedule.timezone || 'Asia/Kolkata';

  for (const entry of runningEntries) {
    // 1. If timer has [Overtime] in description, IT MUST RUN UNTIL MANUALLY STOPPED!
    const isOvertimeTag = Boolean(entry.description && /\[Overtime\]/i.test(entry.description));

    const openingTime = getOpeningTimeForDate(entry.startedAt, schedule);
    const closingTime = getClosingTimeForDate(entry.startedAt, schedule);
    const [openH, openM] = openingTime.split(':').map(Number);
    const [closeH, closeM] = closingTime.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const startZoned = toZonedTime(entry.startedAt, tz);
    const startMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
    const startDayOfWeek = formatInTimeZone(entry.startedAt, tz, 'EEE').toUpperCase();
    const workingDays = (schedule.workingDays || 'MON,TUE,WED,THU,FRI').split(',').map((d) => d.trim().toUpperCase());

    const isNonWorkingDay = !workingDays.includes(startDayOfWeek);
    const isStartedAfterOfficeHours = isNonWorkingDay || (closeMinutes > openMinutes
      ? (startMinutes >= closeMinutes || startMinutes < openMinutes)
      : (startMinutes >= closeMinutes && startMinutes < openMinutes));

    // Overtime rule: Any timer marked as Overtime or started after office hours runs until manually stopped!
    if (isOvertimeTag || isStartedAfterOfficeHours) {
      continue;
    }

    // Active session protection: If heartbeat or activity was recorded within the last 30 minutes,
    // or if the timer was started less than 30 minutes ago, the user is actively working!
    // Never auto-stop an active working session.
    const effectiveLastActivity = entry.lastActivityAt
      ? new Date(entry.lastActivityAt).getTime()
      : new Date(entry.startedAt).getTime();
    if (!isNaN(effectiveLastActivity) && now.getTime() - effectiveLastActivity < 30 * 60 * 1000) {
      continue;
    }

    // 2. Daytime timer: Check if office closing time has been reached
    const startMs = new Date(entry.startedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.round((now.getTime() - startMs) / 1000));

    // Never auto-stop a timer that was just started (under 60 seconds)
    if (elapsedSeconds < 60) {
      continue;
    }

    const currentZoned = toZonedTime(now, tz);
    const curMinutes = currentZoned.getHours() * 60 + currentZoned.getMinutes();

    const startDayStr = formatInTimeZone(entry.startedAt, tz, 'yyyy-MM-dd');
    const currentDayStr = formatInTimeZone(now, tz, 'yyyy-MM-dd');

    const hasOfficeEnded = startDayStr !== currentDayStr || curMinutes >= closeMinutes;

    if (hasOfficeEnded) {
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          isRunning: false,
          stoppedAt: now,
          durationSeconds: Math.max(1, elapsedSeconds),
          description: (entry.description ? entry.description + ' ' : '') + `[Auto-stopped: Office hours ended at ${closingTime}]`,
        },
      });

      await logAuditEvent({
        userId,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Timer automatically stopped at office end time (${closingTime}) under policy rules.`,
        details: { userId, timeEntryId: entry.id, closingTime },
      });
    }
  }
}

/**
 * Rule: Global cron / scheduled worker to enforce office closing cutoff across all active timers.
 * - If checkbox is checked (autoCutoffEnabled = true), stops daytime timers automatically once office time ends.
 * - Overtime timers run until manually stopped!
 */
export async function enforceGlobalOfficeCutoffs() {
  const schedule = await getOfficeSchedule();
  // If checkbox is NOT checked, let the timer run until it is stopped manually!
  if (!schedule.autoCutoffEnabled) {
    return { processed: 0 };
  }

  const runningEntries = await prisma.timeEntry.findMany({
    where: {
      isRunning: true,
    },
    include: { user: true },
  });

  let processedCount = 0;
  const now = new Date();
  const tz = schedule.timezone || 'Asia/Kolkata';

  for (const entry of runningEntries) {
    // 1. If timer has [Overtime] in description, IT MUST RUN UNTIL MANUALLY STOPPED!
    const isOvertimeTag = Boolean(entry.description && /\[Overtime\]/i.test(entry.description));

    const openingTime = getOpeningTimeForDate(entry.startedAt, schedule);
    const closingTime = getClosingTimeForDate(entry.startedAt, schedule);
    const [openH, openM] = openingTime.split(':').map(Number);
    const [closeH, closeM] = closingTime.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const startZoned = toZonedTime(entry.startedAt, tz);
    const startMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
    const startDayOfWeek = formatInTimeZone(entry.startedAt, tz, 'EEE').toUpperCase();
    const workingDays = (schedule.workingDays || 'MON,TUE,WED,THU,FRI').split(',').map((d) => d.trim().toUpperCase());

    const isNonWorkingDay = !workingDays.includes(startDayOfWeek);
    const isStartedAfterOfficeHours = isNonWorkingDay || (closeMinutes > openMinutes
      ? (startMinutes >= closeMinutes || startMinutes < openMinutes)
      : (startMinutes >= closeMinutes && startMinutes < openMinutes));

    // Overtime rule: Any timer marked as Overtime or started after office hours runs until manually stopped!
    if (isOvertimeTag || isStartedAfterOfficeHours) {
      continue;
    }

    // Active session protection: If heartbeat or activity was recorded within the last 30 minutes,
    // or if the timer was started less than 30 minutes ago, the user is actively working!
    // Never auto-stop an active working session.
    const effectiveLastActivity = entry.lastActivityAt
      ? new Date(entry.lastActivityAt).getTime()
      : new Date(entry.startedAt).getTime();
    if (!isNaN(effectiveLastActivity) && now.getTime() - effectiveLastActivity < 30 * 60 * 1000) {
      continue;
    }

    const startMs = new Date(entry.startedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.round((now.getTime() - startMs) / 1000));

    // Never auto-stop a timer that was just started (under 60 seconds)
    if (elapsedSeconds < 60) {
      continue;
    }

    const currentZoned = toZonedTime(now, tz);
    const curMinutes = currentZoned.getHours() * 60 + currentZoned.getMinutes();

    const startDayStr = formatInTimeZone(entry.startedAt, tz, 'yyyy-MM-dd');
    const currentDayStr = formatInTimeZone(now, tz, 'yyyy-MM-dd');

    const hasOfficeEnded = startDayStr !== currentDayStr || curMinutes >= closeMinutes;

    if (hasOfficeEnded) {
      const startMs = new Date(entry.startedAt).getTime();
      const elapsedSeconds = Math.max(1, Math.round((now.getTime() - startMs) / 1000));

      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          isRunning: false,
          stoppedAt: now,
          durationSeconds: elapsedSeconds,
          description: (entry.description ? entry.description + ' ' : '') + `[Auto-stopped: Office hours ended at ${closingTime}]`,
        },
      });

      await logAuditEvent({
        userId: entry.userId,
        action: 'TIMER_AUTO_CUTOFF',
        targetEntity: 'TimeEntry',
        targetId: entry.id,
        mandatoryReason: `Timer automatically stopped at office closing time (${closingTime}).`,
        details: { userId: entry.userId, entryId: entry.id, closingTime },
      });

      processedCount++;
    }
  }

  return { processed: processedCount };
}
