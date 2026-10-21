import cron from 'node-cron';
import { enforceGlobalOfficeCutoffs } from './timerEngine';
import { sendDailySummaryEmail, sendWeeklySummaryEmail, getEmailSettings } from './emailService';
import { processAutomatedScreenshotsForRunningTimers } from './screenshotGenerator';

let isSchedulerInitialized = false;

export function initBackgroundScheduler() {
  if (isSchedulerInitialized) return;
  isSchedulerInitialized = true;

  console.log('⏰ Initializing EL App background worker & scheduler...');

  // 1. Check office closing auto-cutoffs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res = await enforceGlobalOfficeCutoffs();
      if (res.processed > 0) {
        console.log(`[Scheduler] Enforced office closing cutoff on ${res.processed} timers.`);
      }
    } catch (err) {
      console.error('[Scheduler] Office cutoff check failed:', err);
    }
  });

  // 2. Automated screenshot captures for running timers every minute
  cron.schedule('* * * * *', async () => {
    try {
      const res = await processAutomatedScreenshotsForRunningTimers();
      if (res.createdScreenshots > 0) {
        console.log(`📸 [Scheduler] Captured ${res.createdScreenshots} interval screenshots for active timers.`);
      }
    } catch (err) {
      console.error('[Scheduler] Automated screenshot check failed:', err);
    }
  });

  // 3. Check scheduled email dispatches every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const settings = await getEmailSettings();
      if (!settings?.enabled) return;

      const now = new Date();
      const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Check daily email time match (within 15m window)
      if (settings.dailyEnabled && settings.dailyTime) {
        const [targetH, targetM] = settings.dailyTime.split(':').map(Number);
        if (now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) < 15) {
          await sendDailySummaryEmail();
        }
      }
    } catch (err) {
      console.error('[Scheduler] Email schedule check failed:', err);
    }
  });

  console.log('✅ Background scheduler registered.');
}
