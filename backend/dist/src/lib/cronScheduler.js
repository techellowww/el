"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBackgroundScheduler = initBackgroundScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const timerEngine_1 = require("./timerEngine");
const emailService_1 = require("./emailService");
const screenshotGenerator_1 = require("./screenshotGenerator");
let isSchedulerInitialized = false;
function initBackgroundScheduler() {
    if (isSchedulerInitialized)
        return;
    isSchedulerInitialized = true;
    console.log('⏰ Initializing EL App background worker & scheduler...');
    // 1. Check office closing auto-cutoffs every 5 minutes
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        try {
            const res = await (0, timerEngine_1.enforceGlobalOfficeCutoffs)();
            if (res.processed > 0) {
                console.log(`[Scheduler] Enforced office closing cutoff on ${res.processed} timers.`);
            }
        }
        catch (err) {
            console.error('[Scheduler] Office cutoff check failed:', err);
        }
    });
    // 2. Automated screenshot captures for running timers every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            const res = await (0, screenshotGenerator_1.processAutomatedScreenshotsForRunningTimers)();
            if (res.createdScreenshots > 0) {
                console.log(`📸 [Scheduler] Captured ${res.createdScreenshots} interval screenshots for active timers.`);
            }
        }
        catch (err) {
            console.error('[Scheduler] Automated screenshot check failed:', err);
        }
    });
    // 3. Check scheduled email dispatches every 15 minutes
    node_cron_1.default.schedule('*/15 * * * *', async () => {
        try {
            const settings = await (0, emailService_1.getEmailSettings)();
            if (!settings?.enabled)
                return;
            const now = new Date();
            const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            // Check daily email time match (within 15m window)
            if (settings.dailyEnabled && settings.dailyTime) {
                const [targetH, targetM] = settings.dailyTime.split(':').map(Number);
                if (now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) < 15) {
                    await (0, emailService_1.sendDailySummaryEmail)();
                }
            }
        }
        catch (err) {
            console.error('[Scheduler] Email schedule check failed:', err);
        }
    });
    console.log('✅ Background scheduler registered.');
}
