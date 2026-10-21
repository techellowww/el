"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../lib/auth");
const timerEngine_1 = require("../lib/timerEngine");
const audit_1 = require("../lib/audit");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get('/active', auth_1.authenticate, async (req, res) => {
    try {
        const activeTimer = await (0, timerEngine_1.getActiveTimer)(req.user.id);
        const schedule = await (0, timerEngine_1.getOfficeSchedule)();
        const screenshotSetting = await prisma_1.prisma.screenshotSetting.findUnique({
            where: { id: 'default-screenshot-setting' },
        });
        const isOutsideHours = (0, timerEngine_1.evaluateTimeClassification)(new Date(), schedule).isOutsideHours;
        res.json({
            activeTimer,
            schedule,
            isOutsideHours,
            screenshotSetting,
            serverTime: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error fetching active timer:', error);
        res.status(500).json({ error: 'Failed to retrieve active timer state.' });
    }
});
router.post('/start', auth_1.authenticate, async (req, res) => {
    try {
        const { projectId, notes, targetDurationMinutes } = req.body;
        if (!projectId) {
            res.status(400).json({ error: 'Project ID is required' });
            return;
        }
        const { activeEntry, previousStopped } = await (0, timerEngine_1.startProjectTimer)({
            userId: req.user.id,
            projectId,
            notes,
            targetDurationMinutes: targetDurationMinutes ? Number(targetDurationMinutes) : undefined,
        });
        if (previousStopped) {
            await (0, audit_1.logAuditEvent)({
                userId: req.user.id,
                action: 'TIMER_AUTO_SWITCHED',
                targetEntity: 'TimeEntry',
                targetId: previousStopped.id,
                mandatoryReason: 'Automatically stopped previous project timer upon starting a new project.',
                details: { previousProjectId: previousStopped.projectId, newProjectId: projectId },
            });
        }
        const screenshotSetting = await prisma_1.prisma.screenshotSetting.findUnique({
            where: { id: 'default-screenshot-setting' },
        });
        res.json({
            success: true,
            activeTimer: activeEntry,
            previousStopped,
            screenshotSetting,
            serverTime: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error starting timer:', error);
        const message = error instanceof Error ? error.message : 'Failed to start timer.';
        res.status(400).json({ error: message });
    }
});
router.post('/stop', auth_1.authenticate, async (req, res) => {
    try {
        const { timeEntryId, notes } = req.body;
        const stoppedEntry = await (0, timerEngine_1.stopProjectTimer)({
            userId: req.user.id,
            timeEntryId,
            notes,
        });
        res.json({
            success: true,
            timeEntry: stoppedEntry,
            duration: stoppedEntry.duration,
            serverTime: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error stopping timer:', error);
        const message = error instanceof Error ? error.message : 'Failed to stop timer.';
        res.status(400).json({ error: message });
    }
});
exports.default = router;
