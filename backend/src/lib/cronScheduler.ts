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

  // 4. Check scheduled email dispatches every minute (Daily, Weekly, Monthly with deduplication)
  cron.schedule('* * * * *', async () => {
    try {
      const res = await processScheduledEmailDispatch();
      if (res.dispatched) {
        console.log(`📧 [Scheduler] Dispatched ${res.type} report email successfully to:`, res.recipients);
      }
    } catch (err) {
      console.error('[Scheduler] Email schedule check failed:', err);
    }
  });

  // Check email schedule on startup as well
  processScheduledEmailDispatch().catch((err) => console.error('[Startup] Email dispatch check error:', err));

  // 5. ClientHub Background Jobs: Proposals, Reminders, Retries, Retainer Warnings (Section 10)
  cron.schedule('* * * * *', async () => {
    try {
      const clientUrl = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${clientUrl}/api/background/run`, { method: 'POST' }).catch(() => null);
    } catch (err: any) {
      console.warn('[Scheduler] ClientHub background job tick error:', err.message);
    }
  });

  console.log('✅ Background scheduler registered.');
}
