import { prisma } from '../prisma';

export function formatDurationHours(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export async function getCustomReport(opts: { startDate: Date; endDate: Date }) {
  const { startDate, endDate } = opts;

  const entries = await prisma.timeEntry.findMany({
    where: {
      startedAt: { gte: startDate, lte: endDate },
      isRunning: false,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  const totalTrackedSeconds = entries.reduce((acc: number, e: any) => acc + (e.durationSeconds || 0), 0);
  const regularEntries = entries.filter(
    (e: any) => !e.description || !/\[overtime\]/i.test(e.description)
  );
  const overtimeEntries = entries.filter(
    (e: any) => e.description && /\[overtime\]/i.test(e.description)
  );
  const regularSeconds = regularEntries.reduce((acc: number, e: any) => acc + (e.durationSeconds || 0), 0);
  const outsideHoursSeconds = overtimeEntries.reduce((acc: number, e: any) => acc + (e.durationSeconds || 0), 0);

  // Group by employee
  const employeeMap = new Map<string, { name: string; email: string; totalSeconds: number; entries: number }>();
  for (const e of entries) {
    const key = e.userId;
    const name = e.user?.name || 'Unknown';
    const email = e.user?.email || '';
    if (!employeeMap.has(key)) {
      employeeMap.set(key, { name, email, totalSeconds: 0, entries: 0 });
    }
    const emp = employeeMap.get(key)!;
    emp.totalSeconds += e.durationSeconds || 0;
    emp.entries += 1;
  }

  const employeeBreakdown = Array.from(employeeMap.entries()).map(([userId, data]) => ({
    userId,
    name: data.name,
    email: data.email,
    totalSeconds: data.totalSeconds,
    totalHoursFormatted: formatDurationHours(data.totalSeconds),
    entries: data.entries,
  }));

  // Group by day
  const dailyMap = new Map<string, number>();
  for (const e of entries) {
    const dayKey = new Date(e.startedAt).toISOString().split('T')[0];
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (e.durationSeconds || 0));
  }
  const dailyBreakdown = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, secs]) => ({
      date,
      totalSeconds: secs,
      hoursFormatted: formatDurationHours(secs),
    }));

  return {
    totalTrackedSeconds,
    regularSeconds,
    outsideHoursSeconds,
    totalEntriesCount: entries.length,
    employeeBreakdown,
    dailyBreakdown,
  };
}
