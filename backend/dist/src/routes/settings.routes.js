"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const timerEngine_1 = require("../lib/timerEngine");
const emailService_1 = require("../lib/emailService");
const router = (0, express_1.Router)();
// Office Hours
router.get('/office-hours', async (req, res) => {
    try {
        const schedule = await prisma_1.prisma.officeSchedule.findUnique({
            where: { id: 'default-schedule' },
        });
        res.json({ schedule });
    }
    catch (error) {
        console.error('Error fetching office schedule:', error);
        res.status(500).json({ error: 'Failed to retrieve office schedule' });
    }
});
router.put('/office-hours', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { openingTime, closingTime, workingDays, timezone, allowOutsideHours, autoCutoffEnabled } = req.body;
        if (!openingTime || !closingTime || !workingDays) {
            res.status(400).json({ error: 'Opening Time, Closing Time, and Working Days are required.' });
            return;
        }
        const updated = await prisma_1.prisma.officeSchedule.upsert({
            where: { id: 'default-schedule' },
            update: {
                openingTime,
                closingTime,
                workingDays,
                timezone: timezone || 'Asia/Kolkata',
                allowOutsideHours: allowOutsideHours ?? true,
                autoCutoffEnabled: autoCutoffEnabled ?? true,
                updatedById: req.user.id,
            },
            create: {
                id: 'default-schedule',
                openingTime,
                closingTime,
                workingDays,
                timezone: timezone || 'Asia/Kolkata',
                allowOutsideHours: allowOutsideHours ?? true,
                autoCutoffEnabled: autoCutoffEnabled ?? true,
                updatedById: req.user.id,
            },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'OFFICE_SCHEDULE_UPDATED',
            targetEntity: 'OfficeSchedule',
            targetId: 'default-schedule',
            mandatoryReason: 'Admin updated office schedule and auto-cutoff configuration',
            details: { openingTime, closingTime, workingDays, timezone, autoCutoffEnabled },
        });
        res.json({ success: true, schedule: updated });
    }
    catch (error) {
        console.error('Error updating office schedule:', error);
        res.status(500).json({ error: 'Failed to update office schedule' });
    }
});
router.post('/office-hours/cutoff-trigger', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const result = await (0, timerEngine_1.enforceGlobalOfficeCutoffs)();
        res.json({
            success: true,
            message: `Office cutoff evaluation complete. Auto-stopped ${result.processed} active timers exceeding closing time.`,
            processed: result.processed,
        });
    }
    catch (error) {
        console.error('Error enforcing cutoff:', error);
        res.status(500).json({ error: 'Failed to trigger office closing cutoff.' });
    }
});
// Email Settings
router.get('/email', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const [settings, deliveryLogs] = await Promise.all([
            prisma_1.prisma.emailScheduleSetting.findUnique({
                where: { id: 'default-email-setting' },
            }),
            prisma_1.prisma.emailDeliveryLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
        ]);
        res.json({ settings, deliveryLogs });
    }
    catch (error) {
        console.error('Error fetching email settings:', error);
        res.status(500).json({ error: 'Failed to retrieve email settings' });
    }
});
router.put('/email', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { enabled, dailyEnabled, dailyTime, weeklyEnabled, weeklyDay, weeklyTime, recipients, timezone, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, } = req.body;
        const parsedRecipients = (0, emailService_1.parseRecipientEmails)(recipients);
        const cleanRecipients = parsedRecipients.length > 0 ? parsedRecipients.join(', ') : 'ellowwwstudio@gmail.com';
        const updated = await prisma_1.prisma.emailScheduleSetting.upsert({
            where: { id: 'default-email-setting' },
            update: {
                enabled: enabled ?? true,
                dailyEnabled: dailyEnabled ?? true,
                dailyTime: dailyTime || '19:00',
                weeklyEnabled: weeklyEnabled ?? true,
                weeklyDay: weeklyDay || 'FRI',
                weeklyTime: weeklyTime || '18:00',
                recipients: cleanRecipients,
                timezone: timezone || 'Asia/Kolkata',
                smtpHost: smtpHost || null,
                smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
                smtpUser: smtpUser || null,
                smtpPass: smtpPass || null,
                smtpFrom: smtpFrom || 'EL App Notifications <notifications@elapp.local>',
            },
            create: {
                id: 'default-email-setting',
                enabled: enabled ?? true,
                dailyEnabled: dailyEnabled ?? true,
                dailyTime: dailyTime || '19:00',
                weeklyEnabled: weeklyEnabled ?? true,
                weeklyDay: weeklyDay || 'FRI',
                weeklyTime: weeklyTime || '18:00',
                recipients: cleanRecipients,
                timezone: timezone || 'Asia/Kolkata',
                smtpHost: smtpHost || null,
                smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
                smtpUser: smtpUser || null,
                smtpPass: smtpPass || null,
                smtpFrom: smtpFrom || 'EL App Notifications <notifications@elapp.local>',
            },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMAIL_SETTINGS_UPDATED',
            targetEntity: 'EmailScheduleSetting',
            targetId: 'default-email-setting',
            mandatoryReason: 'Admin updated automated email schedules and delivery settings',
            details: { recipients: updated.recipients, dailyTime: updated.dailyTime, weeklyTime: updated.weeklyTime },
        });
        res.json({ success: true, settings: updated });
    }
    catch (error) {
        console.error('Error updating email settings:', error);
        res.status(500).json({ error: 'Failed to update email settings' });
    }
});
router.post('/email/test', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { type = 'eod', recipient, recipients } = req.body;
        const targetRecipients = recipients || recipient;
        let result;
        if (type === 'weekly') {
            result = await (0, emailService_1.sendWeeklySummaryEmail)(targetRecipients);
        }
        else {
            result = await (0, emailService_1.sendEodReportEmail)(targetRecipients);
        }
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMAIL_TEST_DISPATCHED',
            targetEntity: 'EmailDeliveryLog',
            targetId: type,
            mandatoryReason: 'Admin triggered manual email report dispatch',
            details: { type, recipients: targetRecipients },
        });
        res.json({
            success: true,
            message: `EOD / ${type} summary email triggered successfully.`,
            result,
        });
    }
    catch (error) {
        console.error('Error triggering test email:', error);
        res.status(500).json({ error: 'Failed to send test email.' });
    }
});
router.post('/email/send-eod', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { recipients: customRecipients } = req.body;
        const result = await (0, emailService_1.sendEodReportEmail)(customRecipients);
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMAIL_TEST_DISPATCHED',
            targetEntity: 'EmailDeliveryLog',
            targetId: 'EOD_REPORT',
            mandatoryReason: 'Admin dispatched End-of-Day (EOD) employee project & timings report',
            details: { recipients: result.recipients, sentCount: result.sentCount, failedCount: result.failedCount },
        });
        res.json({
            success: result.success,
            message: `EOD report dispatched to ${result.sentCount} recipient(s).`,
            result,
        });
    }
    catch (error) {
        console.error('Error dispatching EOD report:', error);
        res.status(500).json({ error: 'Failed to dispatch EOD report email.' });
    }
});
// Screenshot Settings
router.get('/screenshots', async (req, res) => {
    try {
        const settings = await prisma_1.prisma.screenshotSetting.findUnique({
            where: { id: 'default-screenshot-setting' },
        });
        res.json({ settings });
    }
    catch (error) {
        console.error('Error fetching screenshot settings:', error);
        res.status(500).json({ error: 'Failed to retrieve screenshot settings' });
    }
});
router.put('/screenshots', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { enabled, intervalMinutes, requireConsent, consentNotice } = req.body;
        const updated = await prisma_1.prisma.screenshotSetting.upsert({
            where: { id: 'default-screenshot-setting' },
            update: {
                enabled: Boolean(enabled),
                intervalMinutes: Math.max(1, parseInt(intervalMinutes, 10) || 60),
                requireConsent: requireConsent ?? true,
                consentNotice: consentNotice || 'Screenshots are periodically captured during active project timers for activity verification.',
            },
            create: {
                id: 'default-screenshot-setting',
                enabled: Boolean(enabled),
                intervalMinutes: Math.max(1, parseInt(intervalMinutes, 10) || 60),
                requireConsent: requireConsent ?? true,
                consentNotice: consentNotice || 'Screenshots are periodically captured during active project timers for activity verification.',
            },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'SCREENSHOT_SETTINGS_UPDATED',
            targetEntity: 'ScreenshotSetting',
            targetId: 'default-screenshot-setting',
            mandatoryReason: 'Admin updated screenshot capture configuration',
            details: { enabled: updated.enabled, intervalMinutes: updated.intervalMinutes },
        });
        res.json({ success: true, settings: updated });
    }
    catch (error) {
        console.error('Error updating screenshot settings:', error);
        res.status(500).json({ error: 'Failed to update screenshot settings' });
    }
});
// Audit Logs
router.get('/audit-logs', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const actionFilter = req.query.action;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const adminOnly = req.query.adminOnly !== 'false';
        const search = req.query.search;
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
        const whereClause = {};
        // 1. Explicit list of admin record mutations (edits, deletes, updates, creates)
        const adminMutationActions = [
            'TIME_ENTRY_ADMIN_EDIT',
            'TIME_ENTRY_MANUAL_CREATE',
            'TIME_ENTRY_DELETED',
            'PROJECT_CREATED',
            'PROJECT_UPDATED',
            'PROJECT_DEACTIVATED',
            'PROJECT_CLOSED',
            'PROJECT_PERMANENTLY_DELETED',
            'EMPLOYEE_CREATED',
            'EMPLOYEE_UPDATED',
            'EMPLOYEE_DEACTIVATED',
            'EMPLOYEE_PERMANENTLY_DELETED',
            'CORRECTION_APPROVED',
            'CORRECTION_REJECTED',
            'OFFICE_SCHEDULE_UPDATED',
            'EMAIL_SETTINGS_UPDATED',
            'SCREENSHOT_SETTINGS_UPDATED',
            'SCREENSHOT_DELETED',
        ];
        // 2. Action Category Filter
        if (actionFilter === 'EDITS') {
            whereClause.action = {
                in: [
                    'TIME_ENTRY_ADMIN_EDIT',
                    'PROJECT_UPDATED',
                    'EMPLOYEE_UPDATED',
                    'OFFICE_SCHEDULE_UPDATED',
                    'EMAIL_SETTINGS_UPDATED',
                    'SCREENSHOT_SETTINGS_UPDATED',
                ],
            };
        }
        else if (actionFilter === 'DELETES') {
            whereClause.action = {
                in: [
                    'TIME_ENTRY_DELETED',
                    'PROJECT_PERMANENTLY_DELETED',
                    'PROJECT_DEACTIVATED',
                    'PROJECT_CLOSED',
                    'EMPLOYEE_PERMANENTLY_DELETED',
                    'EMPLOYEE_DEACTIVATED',
                    'SCREENSHOT_DELETED',
                ],
            };
        }
        else if (actionFilter === 'CREATES') {
            whereClause.action = {
                in: ['TIME_ENTRY_MANUAL_CREATE', 'PROJECT_CREATED', 'EMPLOYEE_CREATED'],
            };
        }
        else if (actionFilter === 'CORRECTIONS') {
            whereClause.action = {
                in: ['CORRECTION_APPROVED', 'CORRECTION_REJECTED'],
            };
        }
        else if (actionFilter && actionFilter !== 'ALL' && actionFilter !== 'ALL_MUTATIONS') {
            whereClause.action = actionFilter;
        }
        else if (actionFilter === 'ALL') {
            whereClause.action = { notIn: ['SCREENSHOTS_VIEWED', 'SCREENSHOT_VIEWED'] };
        }
        else {
            // Default: ALL_MUTATIONS (only admin record modifications: edits, deletes, updates)
            whereClause.action = { in: adminMutationActions };
        }
        // 3. Admin Only Filtering
        if (adminOnly) {
            whereClause.user = {
                role: 'ADMIN',
            };
        }
        // 4. Date Range Filtering (From & To dates)
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate && startDate.trim()) {
                const s = startDate.includes('T')
                    ? new Date(startDate)
                    : new Date(`${startDate.trim()}T00:00:00.000`);
                if (!isNaN(s.getTime()))
                    dateFilter.gte = s;
            }
            if (endDate && endDate.trim()) {
                const e = endDate.includes('T')
                    ? new Date(endDate)
                    : new Date(`${endDate.trim()}T23:59:59.999`);
                if (!isNaN(e.getTime()))
                    dateFilter.lte = e;
            }
            if (Object.keys(dateFilter).length > 0) {
                whereClause.createdAt = dateFilter;
            }
        }
        // 5. Text Search Filter
        if (search && search.trim()) {
            const q = search.trim();
            whereClause.OR = [
                { targetId: { contains: q, mode: 'insensitive' } },
                { mandatoryReason: { contains: q, mode: 'insensitive' } },
                { targetEntity: { contains: q, mode: 'insensitive' } },
                { details: { contains: q, mode: 'insensitive' } },
                { user: { name: { contains: q, mode: 'insensitive' } } },
                { user: { employeeId: { contains: q, mode: 'insensitive' } } },
            ];
        }
        const [logs, totalCount] = await Promise.all([
            prisma_1.prisma.auditLog.findMany({
                where: whereClause,
                include: {
                    user: { select: { id: true, name: true, employeeId: true, role: true, email: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma_1.prisma.auditLog.count({ where: whereClause }),
        ]);
        res.json({
            logs,
            totalCount,
            limit,
            offset,
            hasMore: offset + logs.length < totalCount,
        });
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});
exports.default = router;
