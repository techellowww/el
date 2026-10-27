import cron from 'node-cron';
import { enforceGlobalOfficeCutoffs } from './timerEngine';
import { processScheduledEmailDispatch } from './emailService';
import { processAutomatedScreenshotsForRunningTimers, cleanupOldScreenshots } from './screenshotGenerator';

let isSchedulerInitialized = false;

export function initBackgroundScheduler() {
  if (isSchedulerInitialized) return;
  isSchedulerInitialized = true;

  console.log('⏰ Initializing EL App background worker & scheduler...');

  // 1. Check office closing auto-cutoffs every minute
  cron.schedule('* * * * *', async () => {
    try {
      const res = await enforceGlobalOfficeCutoffs();
      if (res.processed > 0) {
        console.log(`[Scheduler] Enforced office closing cutoff on ${res.processed} timers.`);
      }
    } catch (err) {
      console.error('[Scheduler] Office cutoff check failed:', err);
    }
  });

  // 2. Automated screenshot captures for running active timers every minute
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

  // 3. Automated screenshot retention cleanup every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const res = await cleanupOldScreenshots();
      if (res.deletedCount > 0) {
        console.log(`🧹 [Scheduler] Retention cleanup deleted ${res.deletedCount} old screenshots.`);
      }
    } catch (err) {
      console.error('[Scheduler] Screenshot retention cleanup failed:', err);
    }
  });

  // Run cleanup once on startup as well
  cleanupOldScreenshots().catch((err) => console.error('[Startup] Cleanup error:', err));

  // 4. Check scheduled email dispatches every 5 minutes (Daily, Weekly, Monthly with deduplication)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res = await processScheduledEmailDispatch();
      if (res.dispatched) {
        console.log(`📧 [Scheduler] Dispatched ${res.type} report email successfully.`);
      }
    } catch (err) {
      console.error('[Scheduler] Email schedule check failed:', err);
    }
  });

  console.log('✅ Background scheduler registered.');
}
