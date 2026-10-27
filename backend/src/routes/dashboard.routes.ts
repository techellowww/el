import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { getOfficeSchedule } from '../lib/timerEngine';

const router = Router();

router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const [
      totalEmployees,
      activeProjectsCount,
      completedProjectsCount,
      runningTimers,
      pendingCorrectionsCount,
      outsideHoursReviewCount,
      todayEntries,
      weekEntries,
      monthEntries,
      topEmployeesData,
      projectDistributionData,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.timeEntry.findMany({
        where: { status: 'RUNNING', endTime: null, isDeleted: false },
        include: {
          user: { select: { id: true, name: true, employeeId: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.timeCorrectionRequest.count({ where: { status: 'PENDING' } }),
      prisma.timeEntry.count({ where: { needsReview: true, isDeleted: false } }),
      prisma.timeEntry.aggregate({
        where: { startTime: { gte: todayStart, lte: todayEnd }, isDeleted: false },
        _sum: { duration: true },
      }),
      prisma.timeEntry.aggregate({
        where: { startTime: { gte: weekStart, lte: weekEnd }, isDeleted: false },
        _sum: { duration: true },
      }),
      prisma.timeEntry.findMany({
        where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
        select: { startTime: true, endTime: true, duration: true, isOutsideHours: true },
      }),
      prisma.timeEntry.groupBy({
        by: ['userId'],
        where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
        _sum: { duration: true },
        orderBy: { _sum: { duration: 'desc' } },
        take: 5,
      }),
      prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
        _sum: { duration: true },
        orderBy: { _sum: { duration: 'desc' } },
        take: 8,
      }),
    ]);

    const topUserIds = topEmployeesData.map((d) => d.userId);
    const topUsers = await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, name: true, employeeId: true },
    });
    const userMap = new Map(topUsers.map((u) => [u.id, u]));

    const topEmployeesPieChart = topEmployeesData.map((d) => {
      const u = userMap.get(d.userId);
      const hours = Number(((d._sum.duration || 0) / 3600).toFixed(1));
      return {
        name: u ? u.name : 'Unknown',
        employeeId: u ? u.employeeId : '',
        hours,
        seconds: d._sum.duration || 0,
      };
    });

    const projectIds = projectDistributionData.map((d) => d.projectId);
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, code: true, name: true },
    });
    const projMap = new Map(projects.map((p) => [p.id, p]));

    const projectDistributionChart = projectDistributionData.map((d) => {
      const p = projMap.get(d.projectId);
      const hours = Number(((d._sum.duration || 0) / 3600).toFixed(1));
      return {
        name: p ? `${p.code} (${p.name})` : 'Unknown',
        hours,
        seconds: d._sum.duration || 0,
      };
    });

    // Top 5 Projects by tracked hours this month
    const topProjectsData = projectDistributionData.slice(0, 5);
    const topProjectsPieChart = topProjectsData.map((d) => {
      const p = projMap.get(d.projectId);
      const hours = Number(((d._sum.duration || 0) / 3600).toFixed(1));
      return {
        id: d.projectId,
        code: p ? p.code : 'PRJ',
        name: p ? p.name : 'Unknown Project',
        label: p ? `${p.code} — ${p.name}` : 'Unknown',
        hours,
        seconds: d._sum.duration || 0,
      };
    });

    // Calculate Current Month Inside Hours vs Outside Hours timing breakdown
    const schedule = await getOfficeSchedule();
    let monthInsideSeconds = 0;
    let monthOutsideSeconds = 0;

    for (const entry of monthEntries) {
      if (entry.isOutsideHours) {
        monthOutsideSeconds += entry.duration;
      } else if (schedule?.closingTime) {
        try {
          const start = new Date(entry.startTime);
          const end = entry.endTime ? new Date(entry.endTime) : new Date(start.getTime() + entry.duration * 1000);
          const [closeH, closeM] = schedule.closingTime.split(':').map(Number);
          const closingDate = new Date(start);
          closingDate.setHours(closeH, closeM, 0, 0);

          if (end.getTime() <= closingDate.getTime()) {
            monthInsideSeconds += entry.duration;
          } else if (start.getTime() >= closingDate.getTime()) {
            monthOutsideSeconds += entry.duration;
          } else {
            const insideMs = Math.max(0, closingDate.getTime() - start.getTime());
            const insideSec = Math.min(entry.duration, Math.round(insideMs / 1000));
            const outsideSec = Math.max(0, entry.duration - insideSec);
            monthInsideSeconds += insideSec;
            monthOutsideSeconds += outsideSec;
          }
        } catch {
          monthInsideSeconds += entry.duration;
        }
      } else {
        monthInsideSeconds += entry.duration;
      }
    }

    const monthInsideHours = Number((monthInsideSeconds / 3600).toFixed(2));
    const monthOutsideHours = Number((monthOutsideSeconds / 3600).toFixed(2));
    const monthTotalSeconds = monthInsideSeconds + monthOutsideSeconds;
    const monthTotalHours = Number((monthTotalSeconds / 3600).toFixed(2));

    const insidePct = monthTotalSeconds > 0 ? Math.round((monthInsideSeconds / monthTotalSeconds) * 100) : 0;
    const outsidePct = monthTotalSeconds > 0 ? 100 - insidePct : 0;

    const monthTimingPieChart = [
      {
        name: 'Inside Timing',
        label: 'Inside Office Hours',
        hours: monthInsideHours,
        seconds: monthInsideSeconds,
        percent: insidePct,
        color: '#10b981',
      },
      {
        name: 'Outside Timing',
        label: 'Outside Hours (Overtime)',
        hours: monthOutsideHours,
        seconds: monthOutsideSeconds,
        percent: outsidePct,
        color: '#f59e0b',
      },
    ];

    const past7DaysStart = startOfDay(subDays(now, 6));
    const recentEntries = await prisma.timeEntry.findMany({
      where: { startTime: { gte: past7DaysStart, lte: todayEnd }, isDeleted: false },
      select: { startTime: true, duration: true, isOutsideHours: true },
    });

    const dailyTrendMap = new Map<string, { date: string; regularHours: number; outsideHours: number; totalHours: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = subDays(now, i);
      const key = format(d, 'yyyy-MM-dd');
      dailyTrendMap.set(key, {
        date: format(d, 'MMM dd'),
        regularHours: 0,
        outsideHours: 0,
        totalHours: 0,
      });
    }

    for (const entry of recentEntries) {
      const key = format(entry.startTime, 'yyyy-MM-dd');
      const item = dailyTrendMap.get(key);
      if (item) {
        const h = entry.duration / 3600;
        if (entry.isOutsideHours) {
          item.outsideHours = Number((item.outsideHours + h).toFixed(2));
        } else {
          item.regularHours = Number((item.regularHours + h).toFixed(2));
        }
        item.totalHours = Number((item.totalHours + h).toFixed(2));
      }
    }

    const dailyTrendChart = Array.from(dailyTrendMap.values());

    res.json({
      summary: {
        totalEmployees,
        activeProjects: activeProjectsCount,
        completedProjects: completedProjectsCount,
        todayHours: Number(((todayEntries._sum.duration || 0) / 3600).toFixed(2)),
        weekHours: Number(((weekEntries._sum.duration || 0) / 3600).toFixed(2)),
        monthHours: monthTotalHours,
        monthInsideHours,
        monthOutsideHours,
        activeTimersCount: runningTimers.length,
        pendingCorrections: pendingCorrectionsCount,
        outsideHoursReview: outsideHoursReviewCount,
      },
      runningEmployees: runningTimers.map((t) => ({
        entryId: t.id,
        user: t.user,
        project: t.project,
        startTime: t.startTime,
      })),
      charts: {
        monthTimingPieChart,
        topProjectsPieChart,
        dailyTrendChart,
        projectDistributionChart,
        topEmployeesPieChart,
      },
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({ error: 'Failed to retrieve dashboard analytics' });
  }
});

export default router;
