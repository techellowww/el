import { prisma } from './prisma';

interface SvgParams {
  userName: string;
  employeeId: string;
  projectCode: string;
  projectName: string;
  elapsedSeconds: number;
  intervalMinutes: number;
  capturedAt: Date;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function formatSecondsToTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generateActivitySnapshotSvg(params: SvgParams): string {
  const initial = (params.userName || 'U').charAt(0).toUpperCase();
  const timerStr = formatSecondsToTimer(params.elapsedSeconds);
  const timeStr = params.capturedAt.toLocaleTimeString();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)" />

  <!-- Top title bar -->
  <rect width="960" height="40" fill="#0b0f19" />
  <circle cx="20" cy="20" r="5" fill="#ef4444" />
  <circle cx="36" cy="20" r="5" fill="#f59e0b" />
  <circle cx="52" cy="20" r="5" fill="#10b981" />
  <text x="480" y="25" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600">EL App Activity Monitor — ${escapeXml(params.projectCode)}: ${escapeXml(params.projectName)}</text>
  <text x="940" y="25" text-anchor="end" fill="#64748b" font-family="monospace" font-size="11">${timeStr}</text>

  <!-- Employee Session Header Card -->
  <rect x="24" y="56" width="912" height="76" rx="12" fill="rgba(15, 23, 42, 0.85)" stroke="#334155" stroke-width="1" />
  <rect x="40" y="70" width="48" height="48" rx="10" fill="#2563eb" />
  <text x="64" y="101" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">${initial}</text>
  
  <text x="102" y="88" fill="#ffffff" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">${escapeXml(params.userName)}</text>
  <text x="102" y="108" fill="#94a3b8" font-family="monospace" font-size="12">${escapeXml(params.employeeId)} • Workstation Session</text>

  <text x="360" y="88" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${escapeXml(params.projectCode)} — ${escapeXml(params.projectName)}</text>
  <text x="360" y="108" fill="#64748b" font-family="system-ui, sans-serif" font-size="12">Capture Interval: Every ${params.intervalMinutes} min</text>

  <rect x="736" y="66" width="184" height="56" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="1" />
  <text x="748" y="85" fill="#a5b4fc" font-family="system-ui, sans-serif" font-size="10" font-weight="bold">ACTIVE TIME ELAPSED</text>
  <text x="748" y="110" fill="#ffffff" font-family="monospace" font-size="20" font-weight="bold">${timerStr}</text>

  <!-- Main Notice Body -->
  <rect x="24" y="148" width="912" height="320" rx="12" fill="rgba(2, 6, 23, 0.8)" stroke="#334155" stroke-width="1" />
  
  <!-- Warning Badge and Icon -->
  <circle cx="480" cy="225" r="36" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" stroke-width="2" />
  <path d="M480 205 L480 227 M480 237 L480 241" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" />

  <text x="480" y="285" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold">Workstation Screen Stream Offline</text>
  <text x="480" y="315" text-anchor="middle" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">Desktop screen sharing was not active or was paused in browser during this capture interval.</text>

  <!-- Info Box -->
  <rect x="200" y="340" width="560" height="70" rx="8" fill="#0b0f19" stroke="#1e293b" stroke-width="1" />
  <text x="220" y="365" fill="#64748b" font-family="monospace" font-size="11">Capture Time: ${escapeXml(params.capturedAt.toLocaleString())}</text>
  <text x="220" y="388" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="11">Status: Employee must share screen (select &quot;Entire Screen&quot;) for live desktop image captures.</text>

  <!-- Footer -->
  <text x="480" y="500" text-anchor="middle" fill="#64748b" font-family="system-ui, sans-serif" font-size="11">🔒 Activity Monitoring Compliance • EL Enterprise Time Tracker</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Iterates through all currently running time entries.
 * For each running user, verifies whether each interval milestone (e.g. 15 min, 30 min, 45 min...)
 * has been recorded. If any milestone is missing, captures and stores the screenshot record.
 */
export async function processAutomatedScreenshotsForRunningTimers(): Promise<{ processedTimers: number; createdScreenshots: number }> {
  try {
    const settings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    if (!settings?.enabled) {
      return { processedTimers: 0, createdScreenshots: 0 };
    }

    const intervalMinutes = Math.max(1, settings.intervalMinutes || 15);
    const intervalSeconds = intervalMinutes * 60;
    const now = new Date();

    // Fetch all currently running timers across all users
    const runningEntries = await prisma.timeEntry.findMany({
      where: {
        status: 'RUNNING',
        isDeleted: false,
      },
      include: {
        user: { select: { id: true, name: true, employeeId: true } },
        project: { select: { id: true, code: true, name: true } },
        screenshots: true,
      },
    });

    let createdScreenshots = 0;

    for (const entry of runningEntries) {
      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - entry.startTime.getTime()) / 1000));
      const targetMilestones = Math.floor(elapsedSeconds / intervalSeconds);

      // Check which milestone indices have already been recorded for this time entry
      const recordedMilestones = new Set<number>();
      for (const s of entry.screenshots) {
        if (s.metadata) {
          try {
            const meta = JSON.parse(s.metadata);
            if (typeof meta.intervalIndex === 'number') {
              recordedMilestones.add(meta.intervalIndex);
            }
          } catch {
            // ignore
          }
        }
      }

      // Check milestone 0 (initial session start capture) if no screenshot has been logged yet
      if (!recordedMilestones.has(0) && entry.screenshots.length === 0) {
        const imageUrl = generateActivitySnapshotSvg({
          userName: entry.user.name,
          employeeId: entry.user.employeeId,
          projectCode: entry.project.code,
          projectName: entry.project.name,
          elapsedSeconds: 0,
          intervalMinutes,
          capturedAt: entry.startTime,
        });

        await prisma.screenshotRecord.create({
          data: {
            userId: entry.userId,
            timeEntryId: entry.id,
            capturedAt: entry.startTime,
            imageUrl,
            fileSize: 102400,
            metadata: JSON.stringify({
              intervalIndex: 0,
              intervalMinute: intervalMinutes,
              elapsedSeconds: 0,
              projectCode: entry.project.code,
              source: 'AUTO_INTERVAL_SCHEDULER',
            }),
          },
        });

        recordedMilestones.add(0);
        createdScreenshots++;
        console.log(
          `📸 [Screenshot Scheduler] Captured initial session snapshot for ${entry.user.name} (${entry.user.employeeId}) on project ${entry.project.code}`
        );
      }

      if (targetMilestones < 1) {
        continue;
      }

      // Also if legacy or unindexed screenshots exist, track count
      const existingCount = entry.screenshots.length;

      for (let m = 1; m <= targetMilestones; m++) {
        // If milestone index already exists or screenshot count covers it, skip
        if (recordedMilestones.has(m) || (recordedMilestones.size === 0 && m <= existingCount)) {
          continue;
        }

        const milestoneElapsedSeconds = m * intervalSeconds;
        const milestoneTime = new Date(entry.startTime.getTime() + milestoneElapsedSeconds * 1000);
        const captureTime = milestoneTime <= now ? milestoneTime : now;

        const imageUrl = generateActivitySnapshotSvg({
          userName: entry.user.name,
          employeeId: entry.user.employeeId,
          projectCode: entry.project.code,
          projectName: entry.project.name,
          elapsedSeconds: milestoneElapsedSeconds,
          intervalMinutes,
          capturedAt: captureTime,
        });

        await prisma.screenshotRecord.create({
          data: {
            userId: entry.userId,
            timeEntryId: entry.id,
            capturedAt: captureTime,
            imageUrl,
            fileSize: 102400,
            metadata: JSON.stringify({
              intervalIndex: m,
              intervalMinute: intervalMinutes,
              elapsedSeconds: milestoneElapsedSeconds,
              projectCode: entry.project.code,
              source: 'AUTO_INTERVAL_SCHEDULER',
            }),
          },
        });

        recordedMilestones.add(m);
        createdScreenshots++;
        console.log(
          `📸 [Screenshot Scheduler] Captured ${intervalMinutes}m interval #${m} for ${entry.user.name} (${entry.user.employeeId}) on project ${entry.project.code}`
        );
      }
    }

    return { processedTimers: runningEntries.length, createdScreenshots };
  } catch (error) {
    console.error('Error in automated screenshot scheduler:', error);
    return { processedTimers: 0, createdScreenshots: 0 };
  }
}

/**
 * Automatically cleans up screenshots older than the configured retention period (default 30 days / 1 month).
 */
export async function cleanupOldScreenshots(): Promise<{ deletedCount: number; cutoffDate: Date; retentionDays: number }> {
  try {
    const settings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    const retentionDays = settings?.retentionDays ?? 30; // default 1 month (30 days)
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.screenshotRecord.deleteMany({
      where: {
        capturedAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      console.log(`🧹 [Screenshot Retention] Automatically deleted ${result.count} screenshots older than ${retentionDays} days (${cutoffDate.toISOString()}).`);
    }

    return { deletedCount: result.count, cutoffDate, retentionDays };
  } catch (error) {
    console.error('Error during automatic screenshot cleanup:', error);
    return { deletedCount: 0, cutoffDate: new Date(), retentionDays: 30 };
  }
}

