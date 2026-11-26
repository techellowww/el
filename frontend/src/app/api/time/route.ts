import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireClientAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { enforceOfficeCutoffForUser, getOfficeSchedule, evaluateTimeClassification } from "@/lib/server/timerEngine";

// Helper: Calculate total duration in seconds logged by user on a given UTC date
async function getUserTotalSecondsForDay(
  accountId: string,
  userId: string,
  date: Date,
  excludeEntryId?: string
): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: {
      accountId,
      userId,
      startedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      id: excludeEntryId ? { not: excludeEntryId } : undefined,
    },
    select: { durationSeconds: true },
  });

  return entries.reduce((acc: number, curr: any) => acc + (curr.durationSeconds || 0), 0);
}

// GET /api/time
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");
  const projectId = searchParams.get("projectId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const allDates = searchParams.get("allDates") === "true";

  // Enforce office cutoff for the current session user
  try {
    await enforceOfficeCutoffForUser(session.userId);
  } catch (cutoffErr) {
    console.error("Error evaluating office cutoff in GET /api/time:", cutoffErr);
  }

  // Build query where clause for time entries
  const whereClause: any = {
    accountId: session.accountId,
    isRunning: false,
  };

  // Role-based visibility:
  // Employees can ONLY see their own data
  // Admins see everyone's data by default, or can filter by specific employee
  if (session.role === "EMPLOYEE") {
    whereClause.userId = session.userId;
  } else if (session.role === "ADMIN") {
    if (requestedUserId && requestedUserId !== "all" && requestedUserId.trim() !== "") {
      whereClause.userId = requestedUserId.trim();
    }
  } else {
    whereClause.userId = session.userId;
  }

  // Project filter
  if (projectId && projectId !== "all" && projectId.trim() !== "") {
    whereClause.projectId = projectId.trim();
  }

  // Date range filter: default to today if not specified and not allDates
  if (startDate || endDate) {
    whereClause.startedAt = {};
    if (startDate) {
      const [sY, sM, sD] = startDate.split("-").map(Number);
      whereClause.startedAt.gte = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
    }
    if (endDate) {
      const [eY, eM, eD] = endDate.split("-").map(Number);
      whereClause.startedAt.lte = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
    }
  } else if (!allDates) {
    // Default: show today's data
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    whereClause.startedAt = {
      gte: startOfToday,
      lte: endOfToday,
    };
  }

  const [activeTimer, entries, schedule, screenshotSetting] = await Promise.all([
    // Active timer is strictly for the logged-in session user's personal stopwatch
    prisma.timeEntry.findFirst({
      where: {
        accountId: session.accountId,
        userId: session.userId,
        isRunning: true,
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: whereClause,
      orderBy: { startedAt: "desc" },
      take: 200,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    getOfficeSchedule().catch(() => null),
    prisma.screenshotSetting.findUnique({ where: { id: 'default-screenshot-setting' } }).catch(() => null),
  ]);

  return NextResponse.json({
    activeTimer,
    entries,
    isAdmin: session.role === "ADMIN",
    currentUserId: session.userId,
    schedule: schedule ? {
      autoCutoffEnabled: schedule.autoCutoffEnabled,
      closingTime: schedule.closingTime,
      openingTime: schedule.openingTime,
      workingDays: schedule.workingDays,
      timezone: schedule.timezone,
      allowOutsideHours: schedule.allowOutsideHours,
      dayTimings: schedule.dayTimings,
    } : null,
    screenshotSetting: screenshotSetting ? {
      enabled: screenshotSetting.enabled,
      intervalMinutes: screenshotSetting.intervalMinutes,
      requireConsent: screenshotSetting.requireConsent,
      consentNotice: screenshotSetting.consentNotice,
    } : null,
  });
}

// POST /api/time
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, projectId, description, durationSeconds, startedAt, stoppedAt, deviceId } = body;

  // ACTION: HEARTBEAT (Keep-alive for active user tracking)
  if (action === "HEARTBEAT") {
    const running = await prisma.timeEntry.findFirst({
      where: {
        accountId: session.accountId,
        userId: session.userId,
        isRunning: true,
      },
    });

    if (running) {
      await prisma.timeEntry.update({
        where: { id: running.id },
        data: { lastActivityAt: new Date() },
      });
      return NextResponse.json({ ok: true, activeTimerId: running.id });
    }
    return NextResponse.json({ ok: true, activeTimerId: null });
  }

  // ACTION: STOP TIMER (Does not require projectId - stops current active user timer)
  if (action === "STOP") {
    const running = await prisma.timeEntry.findFirst({
      where: {
        accountId: session.accountId,
        userId: session.userId,
        isRunning: true,
      },
    });

    if (!running) {
      // Gracefully clear active state if timer was already stopped
      return NextResponse.json({ entry: null, message: "No active running timer" });
    }

    // Inactivity Auto-Cut Protection across Multi-Device / Multi-Tab:
    // If this STOP request is an automatic inactivity cutoff, ONLY the device that started the timer
    // (or where the active tracking session is hosted) is permitted to auto-cut it.
    // If another device (idle on another system) tries to auto-cut, gracefully ignore it.
    const isAutoInactivityCut = Boolean(description && description.includes('[Auto-stopped: 15 minutes of inactivity'));
    if (isAutoInactivityCut && running.deviceId && deviceId && deviceId !== running.deviceId) {
      return NextResponse.json({
        entry: running,
        ignored: true,
        message: "Inactivity auto-cutoff ignored: timer was started on another device.",
      });
    }

    const now = new Date();
    let effectiveStopTime = now;
    if (stoppedAt) {
      const parsedStop = new Date(stoppedAt);
      if (!isNaN(parsedStop.getTime()) && parsedStop <= now && parsedStop >= new Date(running.startedAt)) {
        effectiveStopTime = parsedStop;
      }
    }

    let elapsedSeconds = Math.max(
      1,
      Math.round((effectiveStopTime.getTime() - new Date(running.startedAt).getTime()) / 1000)
    );

    // Rule: No more than 24 hours (86,400s) in one day - cap duration if it exceeded
    const existingSeconds = await getUserTotalSecondsForDay(
      session.accountId,
      session.userId,
      running.startedAt,
      running.id
    );

    if (existingSeconds + elapsedSeconds > 86400) {
      elapsedSeconds = Math.max(1, 86400 - existingSeconds);
    }

    // Determine final description: preserve original if present, append idle/auto-cut notes
    let finalDesc = running.description;
    if (description && description.trim()) {
      const trimmed = description.trim();
      if (!finalDesc) {
        finalDesc = trimmed;
      } else if (!finalDesc.includes(trimmed)) {
        finalDesc = `${finalDesc} - ${trimmed}`;
      }
    }

    const stopped = await prisma.timeEntry.update({
      where: { id: running.id },
      data: {
        isRunning: false,
        stoppedAt: effectiveStopTime,
        durationSeconds: elapsedSeconds,
        description: finalDesc,
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ entry: stopped });
  }

  // START and MANUAL actions require a valid projectId
  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: session.accountId },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify client access
  try {
    await requireClientAccess(session, project.clientId);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ACTION 1: START TIMER
  if (action === "START") {
    // Rule: One running timer per person!
    const existingRunning = await prisma.timeEntry.findFirst({
      where: {
        accountId: session.accountId,
        userId: session.userId,
        isRunning: true,
      },
    });

    if (existingRunning) {
      return NextResponse.json(
        { error: "You already have a running timer. Stop it before starting a new one." },
        { status: 400 }
      );
    }

    const [schedule, screenshotSetting] = await Promise.all([
      getOfficeSchedule().catch(() => null),
      prisma.screenshotSetting.findUnique({ where: { id: 'default-screenshot-setting' } }).catch(() => null),
    ]);
    const classification = schedule ? evaluateTimeClassification(new Date(), schedule) : null;
    const isOvertime = Boolean(body.isOvertime || classification?.isOutsideHours);

    let finalDesc = (description || "").trim();
    if (isOvertime && !/\[Overtime\]/i.test(finalDesc)) {
      finalDesc = finalDesc ? `[Overtime] ${finalDesc}` : "[Overtime]";
    }

    const timer = await prisma.timeEntry.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        projectId: project.id,
        clientId: project.clientId,
        description: finalDesc || null,
        deviceId: deviceId || null,
        lastActivityAt: new Date(),
        startedAt: new Date(),
        isRunning: true,
        durationSeconds: 0,
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({
      timer,
      schedule: schedule ? {
        autoCutoffEnabled: schedule.autoCutoffEnabled,
        closingTime: schedule.closingTime,
        openingTime: schedule.openingTime,
        workingDays: schedule.workingDays,
        timezone: schedule.timezone,
        allowOutsideHours: schedule.allowOutsideHours,
        dayTimings: schedule.dayTimings,
      } : null,
      screenshotSetting: screenshotSetting ? {
        enabled: screenshotSetting.enabled,
        intervalMinutes: screenshotSetting.intervalMinutes,
        requireConsent: screenshotSetting.requireConsent,
        consentNotice: screenshotSetting.consentNotice,
      } : null,
    });
  }

  // ACTION 3: MANUAL LOG
  if (action === "MANUAL") {
    const seconds = parseInt(durationSeconds, 10);
    if (isNaN(seconds) || seconds <= 0) {
      return NextResponse.json(
        { error: "Valid duration in seconds is required" },
        { status: 400 }
      );
    }

    const entryDate = startedAt ? new Date(startedAt) : new Date();

    // Rule: No more than 24 hours (86,400s) in one day
    const existingSeconds = await getUserTotalSecondsForDay(
      session.accountId,
      session.userId,
      entryDate
    );

    if (existingSeconds + seconds > 86400) {
      return NextResponse.json(
        { error: "Cannot log more than 24 hours of time in a single day" },
        { status: 400 }
      );
    }

    const manualEntry = await prisma.timeEntry.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        projectId: project.id,
        clientId: project.clientId,
        description: description || null,
        startedAt: entryDate,
        stoppedAt: new Date(entryDate.getTime() + seconds * 1000),
        durationSeconds: seconds,
        isRunning: false,
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    });

    return NextResponse.json({ entry: manualEntry });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
