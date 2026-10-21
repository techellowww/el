"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeSchedule = getOfficeSchedule;
exports.evaluateTimeClassification = evaluateTimeClassification;
exports.startProjectTimer = startProjectTimer;
exports.stopProjectTimer = stopProjectTimer;
exports.getActiveTimer = getActiveTimer;
exports.enforceOfficeCutoffForUser = enforceOfficeCutoffForUser;
exports.enforceGlobalOfficeCutoffs = enforceGlobalOfficeCutoffs;
const prisma_1 = require("./prisma");
const audit_1 = require("./audit");
const date_fns_tz_1 = require("date-fns-tz");
const DEFAULT_SCHEDULE = {
    openingTime: '09:00',
    closingTime: '18:00',
    workingDays: 'MON,TUE,WED,THU,FRI',
    timezone: 'Asia/Kolkata',
    allowOutsideHours: true,
    autoCutoffEnabled: true,
};
async function getOfficeSchedule() {
    const schedule = await prisma_1.prisma.officeSchedule.findUnique({
        where: { id: 'default-schedule' },
    });
    if (!schedule)
        return DEFAULT_SCHEDULE;
    return {
        openingTime: schedule.openingTime,
        closingTime: schedule.closingTime,
        workingDays: schedule.workingDays,
        timezone: schedule.timezone,
        allowOutsideHours: schedule.allowOutsideHours,
        autoCutoffEnabled: schedule.autoCutoffEnabled,
    };
}
/**
 * Evaluates whether a given timestamp falls within regular office hours.
 */
function evaluateTimeClassification(date, schedule) {
    try {
        const zonedDate = (0, date_fns_tz_1.toZonedTime)(date, schedule.timezone);
        const dayOfWeek = (0, date_fns_tz_1.formatInTimeZone)(date, schedule.timezone, 'EEE').toUpperCase(); // MON, TUE, etc.
        const timeOfDay = (0, date_fns_tz_1.formatInTimeZone)(date, schedule.timezone, 'HH:mm'); // 14:30
        const validDays = schedule.workingDays.split(',').map((d) => d.trim().toUpperCase());
        const isWorkingDay = validDays.includes(dayOfWeek);
        if (!isWorkingDay) {
            return {
                isOutsideHours: true,
                classification: 'OUTSIDE_HOURS',
                needsReview: true,
                reason: `Tracked on ${dayOfWeek}, which is outside configured working days (${schedule.workingDays}).`,
            };
        }
        const [openH, openM] = schedule.openingTime.split(':').map(Number);
        const [closeH, closeM] = schedule.closingTime.split(':').map(Number);
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
                    reason: `Tracked at ${timeOfDay}, outside standard hours ${schedule.openingTime}-${schedule.closingTime}.`,
                };
            }
        }
        else {
            // Overnight schedule (e.g., 20:00 to 05:00)
            const isInOvernight = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
            if (!isInOvernight) {
                return {
                    isOutsideHours: true,
                    classification: 'OUTSIDE_HOURS',
                    needsReview: true,
                    reason: `Tracked at ${timeOfDay}, outside overnight hours ${schedule.openingTime}-${schedule.closingTime}.`,
                };
            }
        }
        return {
            isOutsideHours: false,
            classification: 'REGULAR',
            needsReview: false,
        };
    }
    catch (err) {
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
async function startProjectTimer({ userId, projectId, notes, targetDurationMinutes, }) {
    const schedule = await getOfficeSchedule();
    const now = new Date();
    // 1. Verify permitted project assignment or Admin access
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
        throw new Error('User account is inactive or not found.');
    }
    const project = await prisma_1.prisma.project.findUnique({
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
    let targetDurationSeconds = null;
    let sessionNotes = notes || '';
    if (classificationResult.isOutsideHours) {
        // If user provided a planned duration (e.g. 30m, 60m, 120m)
        if (targetDurationMinutes && targetDurationMinutes > 0) {
            targetDurationSeconds = Math.round(targetDurationMinutes * 60);
            sessionNotes = sessionNotes
                ? `${sessionNotes} [Planned outside-hours limit: ${targetDurationMinutes}m]`
                : `[Planned outside-hours limit: ${targetDurationMinutes}m]`;
        }
        else {
            // Default safety limit of 2 hours (120 minutes) if no duration was explicitly supplied
            targetDurationSeconds = 120 * 60;
            sessionNotes = sessionNotes
                ? `${sessionNotes} [Planned outside-hours limit: 120m]`
                : `[Planned outside-hours limit: 120m]`;
        }
    }
    // 3. Execute atomic transaction to switch or start timer
    const result = await prisma_1.prisma.$transaction(async (tx) => {
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
            },
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
async function stopProjectTimer({ userId, timeEntryId, notes, }) {
    const now = new Date();
    // Find running entry
    const whereClause = {
        userId,
        status: 'RUNNING',
        endTime: null,
        isDeleted: false,
    };
    if (timeEntryId) {
        whereClause.id = timeEntryId;
    }
    const runningEntry = await prisma_1.prisma.timeEntry.findFirst({
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
    const updatedEntry = await prisma_1.prisma.timeEntry.update({
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
async function getActiveTimer(userId) {
    // First run any required cutoff check
    await enforceOfficeCutoffForUser(userId);
    return prisma_1.prisma.timeEntry.findFirst({
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
async function enforceOfficeCutoffForUser(userId) {
    const schedule = await getOfficeSchedule();
    if (!schedule.autoCutoffEnabled)
        return;
    const runningEntries = await prisma_1.prisma.timeEntry.findMany({
        where: {
            userId,
            status: 'RUNNING',
            endTime: null,
            isDeleted: false,
        },
    });
    if (runningEntries.length === 0)
        return;
    const now = new Date();
    for (const entry of runningEntries) {
        const startClass = evaluateTimeClassification(entry.startTime, schedule);
        const nowClass = evaluateTimeClassification(now, schedule);
        // Case 1: Planned target duration reached (user-selected duration limit)
        const targetSec = entry.targetDuration;
        const elapsedSeconds = Math.max(0, Math.round((now.getTime() - entry.startTime.getTime()) / 1000));
        if (targetSec && targetSec > 0 && elapsedSeconds >= targetSec) {
            const cutoffDate = new Date(entry.startTime.getTime() + targetSec * 1000);
            await prisma_1.prisma.timeEntry.update({
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
            await (0, audit_1.logAuditEvent)({
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
            const startZoned = (0, date_fns_tz_1.toZonedTime)(entry.startTime, schedule.timezone);
            const [closeH, closeM] = schedule.closingTime.split(':').map(Number);
            const cutoffDate = new Date(startZoned);
            cutoffDate.setHours(closeH, closeM, 0, 0);
            // Duration capped at closing time
            const cutoffMs = cutoffDate.getTime();
            const startMs = entry.startTime.getTime();
            const durationSeconds = Math.max(0, Math.round((cutoffMs - startMs) / 1000));
            await prisma_1.prisma.timeEntry.update({
                where: { id: entry.id },
                data: {
                    endTime: cutoffDate,
                    duration: durationSeconds,
                    status: 'AUTO_CUTOFF',
                    source: 'AUTO_CUTOFF',
                    notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped at office closing time ${schedule.closingTime}]`,
                    updatedAt: now,
                },
            });
            await (0, audit_1.logAuditEvent)({
                userId: null,
                action: 'TIMER_AUTO_CUTOFF',
                targetEntity: 'TimeEntry',
                targetId: entry.id,
                mandatoryReason: `Timer automatically stopped at office closing time (${schedule.closingTime}) under policy rules.`,
                details: { userId, timeEntryId: entry.id, closingTime: schedule.closingTime },
            });
            continue;
        }
        // Case 3: Safety cap for runaway outside-hours timers (4 hours max)
        if (startClass.isOutsideHours && elapsedSeconds >= 14400) {
            const maxCutoffDate = new Date(entry.startTime.getTime() + 14400 * 1000);
            await prisma_1.prisma.timeEntry.update({
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
            await (0, audit_1.logAuditEvent)({
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
async function enforceGlobalOfficeCutoffs() {
    const schedule = await getOfficeSchedule();
    if (!schedule.autoCutoffEnabled)
        return { processed: 0 };
    const runningEntries = await prisma_1.prisma.timeEntry.findMany({
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
        const targetSec = entry.targetDuration;
        const elapsedSeconds = Math.max(0, Math.round((now.getTime() - entry.startTime.getTime()) / 1000));
        if (targetSec && targetSec > 0 && elapsedSeconds >= targetSec) {
            const cutoffDate = new Date(entry.startTime.getTime() + targetSec * 1000);
            await prisma_1.prisma.timeEntry.update({
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
            await (0, audit_1.logAuditEvent)({
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
            const startZoned = (0, date_fns_tz_1.toZonedTime)(entry.startTime, schedule.timezone);
            const [closeH, closeM] = schedule.closingTime.split(':').map(Number);
            const cutoffDate = new Date(startZoned);
            cutoffDate.setHours(closeH, closeM, 0, 0);
            const cutoffMs = cutoffDate.getTime();
            const startMs = entry.startTime.getTime();
            const durationSeconds = Math.max(0, Math.round((cutoffMs - startMs) / 1000));
            await prisma_1.prisma.timeEntry.update({
                where: { id: entry.id },
                data: {
                    endTime: cutoffDate,
                    duration: durationSeconds,
                    status: 'AUTO_CUTOFF',
                    source: 'AUTO_CUTOFF',
                    notes: (entry.notes ? entry.notes + ' ' : '') + `[Auto-stopped at office closing time ${schedule.closingTime}]`,
                    updatedAt: now,
                },
            });
            await (0, audit_1.logAuditEvent)({
                userId: null,
                action: 'TIMER_AUTO_CUTOFF',
                targetEntity: 'TimeEntry',
                targetId: entry.id,
                mandatoryReason: `Scheduled cutoff enforced at office closing time (${schedule.closingTime}).`,
                details: { employeeId: entry.user.employeeId, entryId: entry.id },
            });
            processedCount++;
            continue;
        }
        // Case 3: Safety cap for runaway outside-hours timers (4 hours max)
        if (startClass.isOutsideHours && elapsedSeconds >= 14400) {
            const maxCutoffDate = new Date(entry.startTime.getTime() + 14400 * 1000);
            await prisma_1.prisma.timeEntry.update({
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
            await (0, audit_1.logAuditEvent)({
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
