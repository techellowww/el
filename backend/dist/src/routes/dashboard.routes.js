"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../lib/auth");
const date_fns_1 = require("date-fns");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = (0, date_fns_1.startOfDay)(now);
        const todayEnd = (0, date_fns_1.endOfDay)(now);
        const weekStart = (0, date_fns_1.startOfWeek)(now, { weekStartsOn: 1 });
        const weekEnd = (0, date_fns_1.endOfWeek)(now, { weekStartsOn: 1 });
        const monthStart = (0, date_fns_1.startOfMonth)(now);
        const monthEnd = (0, date_fns_1.endOfMonth)(now);
        const [totalEmployees, activeProjectsCount, completedProjectsCount, runningTimers, pendingCorrectionsCount, outsideHoursReviewCount, todayEntries, weekEntries, monthEntries, topEmployeesData, projectDistributionData,] = await Promise.all([
            prisma_1.prisma.user.count({ where: { role: 'EMPLOYEE', isActive: true } }),
            prisma_1.prisma.project.count({ where: { status: 'ACTIVE' } }),
            prisma_1.prisma.project.count({ where: { status: 'COMPLETED' } }),
            prisma_1.prisma.timeEntry.findMany({
                where: { status: 'RUNNING', endTime: null, isDeleted: false },
                include: {
                    user: { select: { id: true, name: true, employeeId: true } },
                    project: { select: { id: true, code: true, name: true } },
                },
            }),
            prisma_1.prisma.timeCorrectionRequest.count({ where: { status: 'PENDING' } }),
            prisma_1.prisma.timeEntry.count({ where: { needsReview: true, isDeleted: false } }),
            prisma_1.prisma.timeEntry.aggregate({
                where: { startTime: { gte: todayStart, lte: todayEnd }, isDeleted: false },
                _sum: { duration: true },
            }),
            prisma_1.prisma.timeEntry.aggregate({
                where: { startTime: { gte: weekStart, lte: weekEnd }, isDeleted: false },
                _sum: { duration: true },
            }),
            prisma_1.prisma.timeEntry.aggregate({
                where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
                _sum: { duration: true },
            }),
            prisma_1.prisma.timeEntry.groupBy({
                by: ['userId'],
                where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
                _sum: { duration: true },
                orderBy: { _sum: { duration: 'desc' } },
                take: 5,
            }),
            prisma_1.prisma.timeEntry.groupBy({
                by: ['projectId'],
                where: { startTime: { gte: monthStart, lte: monthEnd }, isDeleted: false },
                _sum: { duration: true },
                orderBy: { _sum: { duration: 'desc' } },
                take: 8,
            }),
        ]);
        const topUserIds = topEmployeesData.map((d) => d.userId);
        const topUsers = await prisma_1.prisma.user.findMany({
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
        const projects = await prisma_1.prisma.project.findMany({
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
        const past7DaysStart = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(now, 6));
        const recentEntries = await prisma_1.prisma.timeEntry.findMany({
            where: { startTime: { gte: past7DaysStart, lte: todayEnd }, isDeleted: false },
            select: { startTime: true, duration: true, isOutsideHours: true },
        });
        const dailyTrendMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = (0, date_fns_1.subDays)(now, i);
            const key = (0, date_fns_1.format)(d, 'yyyy-MM-dd');
            dailyTrendMap.set(key, {
                date: (0, date_fns_1.format)(d, 'MMM dd'),
                regularHours: 0,
                outsideHours: 0,
                totalHours: 0,
            });
        }
        for (const entry of recentEntries) {
            const key = (0, date_fns_1.format)(entry.startTime, 'yyyy-MM-dd');
            const item = dailyTrendMap.get(key);
            if (item) {
                const h = entry.duration / 3600;
                if (entry.isOutsideHours) {
                    item.outsideHours = Number((item.outsideHours + h).toFixed(2));
                }
                else {
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
                monthHours: Number(((monthEntries._sum.duration || 0) / 3600).toFixed(2)),
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
                topProjectsPieChart,
                dailyTrendChart,
                projectDistributionChart,
                topEmployeesPieChart,
            },
        });
    }
    catch (error) {
        console.error('Error fetching admin dashboard stats:', error);
        res.status(500).json({ error: 'Failed to retrieve dashboard analytics' });
    }
});
exports.default = router;
