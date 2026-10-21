"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
// GET /api/screenshots - View screenshots with filtering by User and Date Range
router.get('/', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const targetUserId = req.query.userId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
        const whereClause = {};
        if (targetUserId && targetUserId !== 'ALL') {
            whereClause.userId = targetUserId;
        }
        if (startDate || endDate) {
            whereClause.capturedAt = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                whereClause.capturedAt.gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                whereClause.capturedAt.lte = end;
            }
        }
        const [screenshots, totalCount] = await Promise.all([
            prisma_1.prisma.screenshotRecord.findMany({
                where: whereClause,
                include: {
                    user: { select: { id: true, name: true, employeeId: true, department: true } },
                    timeEntry: {
                        select: { id: true, duration: true, project: { select: { code: true, name: true } } },
                    },
                },
                orderBy: { capturedAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma_1.prisma.screenshotRecord.count({ where: whereClause }),
        ]);
        // Mark as viewed for audit
        await prisma_1.prisma.screenshotRecord.updateMany({
            where: {
                id: { in: screenshots.map((s) => s.id) },
                viewedAt: null,
            },
            data: {
                viewedAt: new Date(),
                viewedById: req.user.id,
            },
        });
        res.json({ screenshots, totalCount });
    }
    catch (error) {
        console.error('Error fetching screenshots:', error);
        res.status(500).json({ error: 'Failed to retrieve screenshots' });
    }
});
// POST /api/screenshots - Employee or Agent records an activity capture
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const settings = await prisma_1.prisma.screenshotSetting.findUnique({
            where: { id: 'default-screenshot-setting' },
        });
        if (!settings?.enabled) {
            res.status(400).json({ error: 'Screenshot capture is currently disabled in system settings.' });
            return;
        }
        const { imageUrl, fileSize = 102400, metadata, timeEntryId } = req.body;
        if (!imageUrl) {
            res.status(400).json({ error: 'Image URL or data is required' });
            return;
        }
        // Validate that the timeEntry belongs to this user and is currently running
        if (!timeEntryId) {
            res.status(400).json({ error: 'Active timer entry ID is required' });
            return;
        }
        const runningEntry = await prisma_1.prisma.timeEntry.findUnique({
            where: { id: timeEntryId },
        });
        if (!runningEntry || runningEntry.userId !== req.user.id || runningEntry.status !== 'RUNNING') {
            res.status(400).json({ error: 'Screenshot must belong to your own active running timer' });
            return;
        }
        const intervalIndex = metadata?.intervalIndex;
        let existingRecord = null;
        if (timeEntryId && typeof intervalIndex === 'number') {
            const records = await prisma_1.prisma.screenshotRecord.findMany({
                where: {
                    timeEntryId,
                    userId: req.user.id,
                },
            });
            existingRecord = records.find((r) => {
                try {
                    const m = JSON.parse(r.metadata || '{}');
                    return m.intervalIndex === intervalIndex;
                }
                catch {
                    return false;
                }
            });
        }
        let record;
        if (existingRecord) {
            record = await prisma_1.prisma.screenshotRecord.update({
                where: { id: existingRecord.id },
                data: {
                    imageUrl,
                    fileSize: Number(fileSize),
                    metadata: metadata ? JSON.stringify(metadata) : existingRecord.metadata,
                },
            });
        }
        else {
            record = await prisma_1.prisma.screenshotRecord.create({
                data: {
                    userId: req.user.id,
                    timeEntryId: timeEntryId || null,
                    imageUrl,
                    fileSize: Number(fileSize),
                    metadata: metadata ? JSON.stringify(metadata) : null,
                },
            });
        }
        res.status(201).json({ success: true, record });
    }
    catch (error) {
        console.error('Error recording screenshot:', error);
        res.status(500).json({ error: 'Failed to record screenshot' });
    }
});
// DELETE /api/screenshots - Bulk delete: all OR date-to-date range
router.delete('/', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { all, startDate, endDate, userId, ids } = {
            ...req.query,
            ...req.body,
        };
        const idsList = Array.isArray(ids)
            ? ids
            : typeof ids === 'string'
                ? ids.split(',').map((s) => s.trim()).filter(Boolean)
                : null;
        if (idsList && idsList.length > 0) {
            const result = await prisma_1.prisma.screenshotRecord.deleteMany({
                where: { id: { in: idsList } },
            });
            await (0, audit_1.logAuditEvent)({
                userId: req.user.id,
                action: 'SCREENSHOTS_SELECTED_DELETED',
                targetEntity: 'ScreenshotRecord',
                targetId: 'SELECTED_BATCH',
                mandatoryReason: `Administrator deleted ${result.count} selected screenshot(s).`,
                details: { count: result.count, ids: idsList },
            });
            res.json({
                success: true,
                count: result.count,
                message: `Successfully deleted ${result.count} selected screenshot(s).`,
            });
            return;
        }
        if (all === true || all === 'true') {
            const result = await prisma_1.prisma.screenshotRecord.deleteMany({});
            await (0, audit_1.logAuditEvent)({
                userId: req.user.id,
                action: 'SCREENSHOTS_DELETE_ALL',
                targetEntity: 'ScreenshotRecord',
                targetId: 'ALL',
                mandatoryReason: 'Administrator permanently deleted all activity screenshots.',
                details: { deletedCount: result.count },
            });
            res.json({
                success: true,
                count: result.count,
                message: `Successfully deleted all ${result.count} screenshots.`,
            });
            return;
        }
        if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                res.status(400).json({ error: 'Invalid start or end date format.' });
                return;
            }
            if (end < start) {
                res.status(400).json({ error: 'End date must be on or after start date.' });
                return;
            }
            const whereClause = {
                capturedAt: {
                    gte: start,
                    lte: end,
                },
            };
            if (userId && userId !== 'ALL') {
                whereClause.userId = userId;
            }
            const result = await prisma_1.prisma.screenshotRecord.deleteMany({
                where: whereClause,
            });
            await (0, audit_1.logAuditEvent)({
                userId: req.user.id,
                action: 'SCREENSHOTS_DELETE_RANGE',
                targetEntity: 'ScreenshotRecord',
                targetId: `${startDate}_to_${endDate}`,
                mandatoryReason: `Administrator deleted screenshots from ${startDate} to ${endDate}.`,
                details: { startDate, endDate, userId: userId || 'ALL', deletedCount: result.count },
            });
            res.json({
                success: true,
                count: result.count,
                message: `Successfully deleted ${result.count} screenshots between ${startDate} and ${endDate}.`,
            });
            return;
        }
        res.status(400).json({
            error: 'Please specify either all=true to delete all, or both startDate and endDate to delete within a date range.',
        });
    }
    catch (error) {
        console.error('Error deleting screenshots:', error);
        res.status(500).json({ error: 'Failed to delete screenshots.' });
    }
});
// DELETE /api/screenshots/:id - Delete single screenshot record
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const existing = await prisma_1.prisma.screenshotRecord.findUnique({
            where: { id },
        });
        if (!existing) {
            res.status(404).json({ error: 'Screenshot not found' });
            return;
        }
        await prisma_1.prisma.screenshotRecord.delete({
            where: { id },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'SCREENSHOT_DELETED',
            targetEntity: 'ScreenshotRecord',
            targetId: id,
            mandatoryReason: 'Administrator deleted individual activity screenshot.',
            details: { screenshotId: id, userId: existing.userId },
        });
        res.json({ success: true, message: 'Screenshot deleted successfully.' });
    }
    catch (error) {
        console.error('Error deleting screenshot:', error);
        res.status(500).json({ error: 'Failed to delete screenshot.' });
    }
});
exports.default = router;
