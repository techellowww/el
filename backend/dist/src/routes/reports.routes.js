"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../lib/auth");
const reportEngine_1 = require("../lib/reportEngine");
const date_fns_1 = require("date-fns");
const router = (0, express_1.Router)();
router.get('/daily', auth_1.authenticate, async (req, res) => {
    try {
        const rawDate = req.query.date;
        const dateParam = rawDate && rawDate.trim() ? rawDate.trim() : undefined;
        const projectFilter = req.query.projectId;
        let userFilter = req.query.userId;
        if (req.user.role !== 'ADMIN') {
            userFilter = req.user.id;
        }
        const report = await (0, reportEngine_1.getDailyReport)({
            date: dateParam,
            userId: userFilter === 'ALL' ? undefined : userFilter,
            projectId: projectFilter === 'ALL' ? undefined : projectFilter,
        });
        res.json({ report });
    }
    catch (error) {
        console.error('Error in daily report:', error);
        res.status(500).json({ error: 'Failed to generate daily report' });
    }
});
router.get('/weekly', auth_1.authenticate, async (req, res) => {
    try {
        const rawDate = req.query.date;
        const dateParam = rawDate && rawDate.trim() ? rawDate.trim() : undefined;
        const projectFilter = req.query.projectId;
        let userFilter = req.query.userId;
        if (req.user.role !== 'ADMIN') {
            userFilter = req.user.id;
        }
        const report = await (0, reportEngine_1.getWeeklyReport)({
            date: dateParam,
            userId: userFilter === 'ALL' ? undefined : userFilter,
            projectId: projectFilter === 'ALL' ? undefined : projectFilter,
        });
        res.json({ report });
    }
    catch (error) {
        console.error('Error in weekly report:', error);
        res.status(500).json({ error: 'Failed to generate weekly report' });
    }
});
router.get('/custom', auth_1.authenticate, async (req, res) => {
    try {
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const projectId = req.query.projectId;
        const classification = req.query.classification;
        let userId = req.query.userId;
        if (req.user.role !== 'ADMIN') {
            userId = req.user.id;
        }
        const report = await (0, reportEngine_1.getCustomReport)({
            startDate,
            endDate,
            projectId,
            userId,
            classification,
        });
        res.json({ report });
    }
    catch (error) {
        console.error('Error generating custom report:', error);
        res.status(500).json({ error: 'Failed to generate custom date range report' });
    }
});
router.get('/completed-projects', auth_1.authenticate, async (req, res) => {
    try {
        const reports = await (0, reportEngine_1.getCompletedProjectReports)();
        res.json({ completedProjects: reports });
    }
    catch (error) {
        console.error('Error fetching completed project reports:', error);
        res.status(500).json({ error: 'Failed to retrieve completed project reports' });
    }
});
router.get('/export', auth_1.authenticate, async (req, res) => {
    try {
        const exportFormat = req.query.format || 'csv';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const projectId = req.query.projectId;
        let userId = req.query.userId;
        if (req.user.role !== 'ADMIN') {
            userId = req.user.id;
        }
        const report = await (0, reportEngine_1.getCustomReport)({
            startDate,
            endDate,
            projectId,
            userId,
        });
        const flattenedData = report.entries.map((entry) => ({
            'Entry ID': entry.id,
            'Employee ID': entry.user.employeeId,
            'Employee Name': entry.user.name,
            'Department': entry.user.department || 'N/A',
            'Project Code': entry.project.code,
            'Project Name': entry.project.name,
            'Start Time (UTC)': (0, date_fns_1.format)(entry.startTime, 'yyyy-MM-dd HH:mm:ss'),
            'End Time (UTC)': entry.endTime ? (0, date_fns_1.format)(entry.endTime, 'yyyy-MM-dd HH:mm:ss') : 'RUNNING',
            'Duration': (0, reportEngine_1.formatDurationDetailed)(entry.duration),
            'Duration (Hours)': Number((entry.duration / 3600).toFixed(2)),
            'Classification': entry.classification,
            'Outside Hours': entry.isOutsideHours ? 'YES' : 'NO',
            'Source': entry.source,
            'Status': entry.status,
            'Notes': entry.notes || '',
        }));
        const filename = `el-app-report-${(0, date_fns_1.format)(new Date(), 'yyyy-MM-dd')}`;
        if (exportFormat === 'excel') {
            const excelBuffer = (0, reportEngine_1.exportToExcel)({
                'Time Records': flattenedData,
            });
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(excelBuffer);
        }
        else {
            const csvContent = (0, reportEngine_1.exportToCSV)(flattenedData);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.send(csvContent);
        }
    }
    catch (error) {
        console.error('Error exporting reports:', error);
        res.status(500).json({ error: 'Failed to export report data' });
    }
});
exports.default = router;
