import { prisma } from './prisma';
import * as XLSX from 'xlsx';
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay, differenceInDays } from 'date-fns';

export interface ReportFilterOptions {
  startDate?: string | Date;
  endDate?: string | Date;
  projectId?: string;
  userId?: string;
  classification?: string; // "ALL" | "REGULAR" | "OUTSIDE_HOURS"
  status?: string;
}

export function formatDurationHours(seconds: number): string {
  const hours = (seconds / 3600).toFixed(2);
  return `${hours} hrs`;
}

export function formatDurationDetailed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function parseSafeDate(d?: Date | string): Date {
  if (!d) return new Date();
  if (d instanceof Date) return isNaN(d.getTime()) ? new Date() : d;
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (!trimmed) return new Date();
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

/**
 * Generates Daily Report Data
 */
export async function getDailyReport({
  date = new Date(),
  userId,
  projectId,
}: {
  date?: Date | string;
  userId?: string;
  projectId?: string;
}) {
  const targetDate = parseSafeDate(date);
  const start = startOfDay(targetDate);
  const end = endOfDay(targetDate);

  const whereClause: Record<string, unknown> = {
    startTime: { gte: start, lte: end },
    isDeleted: false,
  };

  if (userId) whereClause.userId = userId;
  if (projectId) whereClause.projectId = projectId;

  const entries = await prisma.timeEntry.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, employeeId: true, department: true } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  let totalDuration = 0;
  let regularDuration = 0;
  let outsideHoursDuration = 0;

  const employeeMap = new Map<string, {
    user: { id: string; name: string; employeeId: string; department: string | null };
    totalDuration: number;
    regularDuration: number;
    outsideHoursDuration: number;
    projects: Map<string, { project: { id: string; code: string; name: string }; duration: number }>;
  }>();

  for (const entry of entries) {
    const dur = entry.duration;
    totalDuration += dur;

    if (entry.isOutsideHours) {
      outsideHoursDuration += dur;
    } else {
      regularDuration += dur;
    }

    if (!employeeMap.has(entry.userId)) {
      employeeMap.set(entry.userId, {
        user: entry.user,
        totalDuration: 0,
        regularDuration: 0,
        outsideHoursDuration: 0,
        projects: new Map(),
      });
    }

    const emp = employeeMap.get(entry.userId)!;
    emp.totalDuration += dur;
    if (entry.isOutsideHours) emp.outsideHoursDuration += dur;
    else emp.regularDuration += dur;

    if (!emp.projects.has(entry.projectId)) {
      emp.projects.set(entry.projectId, { project: entry.project, duration: 0 });
    }
    emp.projects.get(entry.projectId)!.duration += dur;
  }

  const employeeBreakdown = Array.from(employeeMap.values()).map((emp) => ({
    user: emp.user,
    totalDuration: emp.totalDuration,
    regularDuration: emp.regularDuration,
    outsideHoursDuration: emp.outsideHoursDuration,
    projects: Array.from(emp.projects.values()),
  }));

  return {
    date: format(targetDate, 'yyyy-MM-dd'),
    totalTrackedSeconds: totalDuration,
    regularSeconds: regularDuration,
    outsideHoursSeconds: outsideHoursDuration,
    totalEntriesCount: entries.length,
    employeeBreakdown,
    rawEntries: entries,
  };
}

/**
 * Generates Weekly Report Data with Highest and Lowest Project Hours
 */
export async function getWeeklyReport({
  date = new Date(),
  userId,
  projectId,
}: {
  date?: Date | string;
  userId?: string;
  projectId?: string;
}) {
  const targetDate = parseSafeDate(date);
  // Monday start default
  const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });

  const whereClause: Record<string, unknown> = {
    startTime: { gte: weekStart, lte: weekEnd },
    isDeleted: false,
  };

  if (userId) whereClause.userId = userId;
  if (projectId) whereClause.projectId = projectId;

  const entries = await prisma.timeEntry.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, employeeId: true, department: true } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  let totalDuration = 0;
  const projectMap = new Map<string, { project: { id: string; code: string; name: string }; duration: number; employeeHours: Map<string, number> }>();
  const employeeProjectList: Array<{ user: { id: string; name: string; employeeId: string }; project: { id: string; code: string; name: string }; duration: number }> = [];

  const empProjMap = new Map<string, { user: { id: string; name: string; employeeId: string }; project: { id: string; code: string; name: string }; duration: number }>();

  for (const entry of entries) {
    const dur = entry.duration;
    totalDuration += dur;

    // By Project
    if (!projectMap.has(entry.projectId)) {
      projectMap.set(entry.projectId, {
        project: entry.project,
        duration: 0,
        employeeHours: new Map(),
      });
    }
    const pRecord = projectMap.get(entry.projectId)!;
    pRecord.duration += dur;
    const currentEmpHours = pRecord.employeeHours.get(entry.user.name) || 0;
    pRecord.employeeHours.set(entry.user.name, currentEmpHours + dur);

    // Combination key for high/low
    const key = `${entry.userId}__${entry.projectId}`;
    if (!empProjMap.has(key)) {
      empProjMap.set(key, { user: entry.user, project: entry.project, duration: 0 });
    }
    empProjMap.get(key)!.duration += dur;
  }

  const combinations = Array.from(empProjMap.values());
  combinations.sort((a, b) => b.duration - a.duration);

  const highestProjectTime = combinations.length > 0 ? combinations[0] : null;
  const lowestProjectTime = combinations.length > 0 ? combinations[combinations.length - 1] : null;

  const projectBreakdown = Array.from(projectMap.values()).map((p) => ({
    project: p.project,
    duration: p.duration,
    employeeHours: Array.from(p.employeeHours.entries()).map(([employeeName, duration]) => ({
      employeeName,
      duration,
    })),
  }));

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    totalTrackedSeconds: totalDuration,
    totalEntriesCount: entries.length,
    projectBreakdown,
    highestProjectTime,
    lowestProjectTime,
    rawEntries: entries,
  };
}

/**
 * Custom Date-Range and Employee/Project Filtered Report
 */
export async function getCustomReport(filters: ReportFilterOptions) {
  const start = filters.startDate ? startOfDay(new Date(filters.startDate)) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const end = filters.endDate ? endOfDay(new Date(filters.endDate)) : endOfDay(new Date());

  const whereClause: Record<string, unknown> = {
    startTime: { gte: start, lte: end },
    isDeleted: false,
  };

  if (filters.userId && filters.userId !== 'ALL') whereClause.userId = filters.userId;
  if (filters.projectId && filters.projectId !== 'ALL') whereClause.projectId = filters.projectId;
  if (filters.classification === 'OUTSIDE_HOURS') whereClause.isOutsideHours = true;
  if (filters.classification === 'REGULAR') whereClause.isOutsideHours = false;

  const entries = await prisma.timeEntry.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, employeeId: true, department: true } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { startTime: 'desc' },
  });

  let totalDuration = 0;
  let regularDuration = 0;
  let outsideHoursDuration = 0;

  const dailyBreakdown = new Map<string, { date: string; duration: number; regular: number; outside: number }>();

  for (const entry of entries) {
    const dur = entry.duration;
    totalDuration += dur;
    if (entry.isOutsideHours) outsideHoursDuration += dur;
    else regularDuration += dur;

    const dayKey = format(entry.startTime, 'yyyy-MM-dd');
    if (!dailyBreakdown.has(dayKey)) {
      dailyBreakdown.set(dayKey, { date: dayKey, duration: 0, regular: 0, outside: 0 });
    }
    const dRecord = dailyBreakdown.get(dayKey)!;
    dRecord.duration += dur;
    if (entry.isOutsideHours) dRecord.outside += dur;
    else dRecord.regular += dur;
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    totalSeconds: totalDuration,
    regularSeconds: regularDuration,
    outsideHoursSeconds: outsideHoursDuration,
    entriesCount: entries.length,
    dailyTimeline: Array.from(dailyBreakdown.values()).sort((a, b) => a.date.localeCompare(b.date)),
    entries,
  };
}

/**
 * Completed Project Analytics (Distinguishes calendar elapsed time from actual tracked working time)
 */
export async function getCompletedProjectReports() {
  const completedProjects = await prisma.project.findMany({
    where: { status: 'COMPLETED' },
    include: {
      creator: { select: { name: true, employeeId: true } },
      timeEntries: {
        where: { isDeleted: false },
        include: {
          user: { select: { id: true, name: true, employeeId: true } },
        },
      },
    },
    orderBy: { closureDate: 'desc' },
  });

  return completedProjects.map((project) => {
    const createdDate = project.startDate || project.createdAt;
    const closedDate = project.closureDate || project.updatedAt;

    // Calendar duration
    const calendarDays = Math.max(1, differenceInDays(closedDate, createdDate));

    // Tracked working time
    let totalTrackedSeconds = 0;
    const employeeHoursMap = new Map<string, { user: { id: string; name: string; employeeId: string }; seconds: number }>();

    for (const entry of project.timeEntries) {
      totalTrackedSeconds += entry.duration;

      if (!employeeHoursMap.has(entry.userId)) {
        employeeHoursMap.set(entry.userId, { user: entry.user, seconds: 0 });
      }
      employeeHoursMap.get(entry.userId)!.seconds += entry.duration;
    }

    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      creationDate: format(createdDate, 'yyyy-MM-dd'),
      closureDate: format(closedDate, 'yyyy-MM-dd'),
      calendarElapsedDays: calendarDays,
      calendarElapsedFormatted: `${calendarDays} days`,
      totalTrackedSeconds,
      totalTrackedFormatted: formatDurationHours(totalTrackedSeconds),
      employeeBreakdown: Array.from(employeeHoursMap.values()).map((e) => ({
        user: e.user,
        durationSeconds: e.seconds,
        durationFormatted: formatDurationHours(e.seconds),
      })),
    };
  });
}

/**
 * Export helpers: CSV and Excel buffer generation
 */
export function exportToCSV(data: Array<Record<string, unknown>>): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function exportToExcel(sheets: Record<string, Array<Record<string, unknown>>>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, data] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
