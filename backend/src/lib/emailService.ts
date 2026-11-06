import nodemailer from 'nodemailer';
import { prisma } from './prisma';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

async function getSmtpSettings(): Promise<SmtpConfig> {
  const setting = await prisma.emailScheduleSetting.findFirst();
  return {
    host: setting?.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: setting?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587),
    user: setting?.smtpUser || process.env.SMTP_USER || undefined,
    pass: setting?.smtpPass || process.env.SMTP_PASS || undefined,
    from: setting?.smtpFrom || process.env.SMTP_FROM || 'ClientHub Notifications <notifications@clienthub.local>',
  };
}

function createTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
  } as any);
}

export async function testSmtpConnection(overrides?: SmtpConfig): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  guidance?: string;
}> {
  try {
    const defaults = await getSmtpSettings();
    const cfg: SmtpConfig = {
      host: overrides?.host || defaults.host,
      port: overrides?.port || defaults.port,
      user: overrides?.user || defaults.user,
      pass: overrides?.pass || defaults.pass,
      from: overrides?.from || defaults.from,
    };
    const transporter = createTransporter(cfg);
    await transporter.verify();
    return { success: true, message: `SMTP connection to ${cfg.host}:${cfg.port} verified successfully.` };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'SMTP connection failed',
      guidance: 'Check host, port, username and password. For Gmail, use App Passwords.',
    };
  }
}

export async function sendCustomDateRangeReportEmail(options: {
  startDate: string;
  endDate: string;
  recipients?: string[];
}): Promise<{
  success: boolean;
  sentCount: number;
  failedCount: number;
  recipients?: string[];
  error?: string;
  results?: any[];
}> {
  const cfg = await getSmtpSettings();
  const setting = await prisma.emailScheduleSetting.findFirst();

  let recipientList: string[] = [];
  if (options.recipients && options.recipients.length > 0) {
    recipientList = options.recipients;
  } else if (setting?.recipients) {
    recipientList = setting.recipients.split(',').map((r: string) => r.trim()).filter(Boolean);
  }

  if (recipientList.length === 0) {
    return { success: false, sentCount: 0, failedCount: 0, error: 'No recipients configured.' };
  }

  // Fetch time data for the date range
  const start = new Date(options.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(options.endDate);
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: {
      startedAt: { gte: start, lte: end },
      isRunning: false,
    },
    include: {
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, company: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  const totalSeconds = entries.reduce((acc: number, e: any) => acc + (e.durationSeconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(2);

  // Build simple HTML email
  const subjectLine = `[EL App] Time Report — ${options.startDate} to ${options.endDate}`;
  const htmlBody = buildReportEmailHtml({
    startDate: options.startDate,
    endDate: options.endDate,
    entries,
    totalSeconds,
    totalHours,
  });

  const transporter = createTransporter(cfg);
  const results: any[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipientList) {
    try {
      await transporter.sendMail({
        from: cfg.from,
        to: recipient,
        subject: subjectLine,
        html: htmlBody,
      });

      await prisma.emailDeliveryLog.create({
        data: {
          type: 'CUSTOM_REPORT',
          recipient,
          subject: subjectLine,
          status: 'SENT',
          content: htmlBody.substring(0, 500),
          sentAt: new Date(),
        },
      });

      results.push({ recipient, status: 'SENT' });
      sentCount++;
    } catch (err: any) {
      await prisma.emailDeliveryLog.create({
        data: {
          type: 'CUSTOM_REPORT',
          recipient,
          subject: subjectLine,
          status: 'FAILED',
          error: err.message || 'SMTP error',
          sentAt: new Date(),
        },
      });

      results.push({ recipient, status: 'FAILED', error: err.message });
      failedCount++;
    }
  }

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    recipients: recipientList,
    results,
  };
}

function buildReportEmailHtml(opts: {
  startDate: string;
  endDate: string;
  entries: any[];
  totalSeconds: number;
  totalHours: string;
}): string {
  const { startDate, endDate, entries, totalHours } = opts;

  let rowsHtml = '';

  if (!entries || entries.length === 0) {
    rowsHtml = `<tr>
      <td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;border-bottom:1px solid #e2e8f0">No time entries recorded for this date range.</td>
    </tr>`;
  } else {
    const sortedEntries = [...entries].sort((a: any, b: any) => {
      const timeA = new Date(a.startedAt).getTime();
      const timeB = new Date(b.startedAt).getTime();

      const dateA = new Date(a.startedAt).toLocaleDateString();
      const dateB = new Date(b.startedAt).toLocaleDateString();
      if (dateA !== dateB) return timeA - timeB;

      const nameA = a.user?.name || 'Unknown';
      const nameB = b.user?.name || 'Unknown';
      if (nameA !== nameB) return nameA.localeCompare(nameB);

      return timeA - timeB;
    });

    interface EmployeeGroup {
      employeeName: string;
      entries: any[];
    }

    interface DateGroup {
      dateStr: string;
      totalRows: number;
      employees: EmployeeGroup[];
    }

    const dateGroups: DateGroup[] = [];
    for (const entry of sortedEntries) {
      const dateStr = new Date(entry.startedAt).toLocaleDateString();
      const empName = entry.user?.name || 'Unknown';

      let dGroup = dateGroups.find((g) => g.dateStr === dateStr);
      if (!dGroup) {
        dGroup = { dateStr, totalRows: 0, employees: [] };
        dateGroups.push(dGroup);
      }
      dGroup.totalRows++;

      let eGroup = dGroup.employees.find((e) => e.employeeName === empName);
      if (!eGroup) {
        eGroup = { employeeName: empName, entries: [] };
        dGroup.employees.push(eGroup);
      }
      eGroup.entries.push(entry);
    }

    rowsHtml = dateGroups
      .map((dGroup) => {
        let isFirstDateRow = true;

        return dGroup.employees
          .map((eGroup) => {
            let isFirstEmpRow = true;
            const empRowCount = eGroup.entries.length;

            return eGroup.entries
              .map((entry: any) => {
                const dateCell = isFirstDateRow
                  ? `<td rowspan="${dGroup.totalRows}" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;vertical-align:top;font-weight:600;color:#0f172a;background:#ffffff">${dGroup.dateStr}</td>`
                  : '';
                if (isFirstDateRow) isFirstDateRow = false;

                const empCell = isFirstEmpRow
                  ? `<td rowspan="${empRowCount}" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;vertical-align:top;font-weight:600;color:#0f172a;background:#ffffff">${eGroup.employeeName}</td>`
                  : '';
                if (isFirstEmpRow) isFirstEmpRow = false;

                return `<tr>
                  ${dateCell}
                  ${empCell}
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155">${entry.project?.name || '—'}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">${entry.client?.name || '—'}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:600;color:#0f172a">${formatSecondsToHHMM(entry.durationSeconds || 0)}</td>
                </tr>`;
              })
              .join('');
          })
          .join('');
      })
      .join('');
  }

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#1e293b">
      <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:28px 32px;color:#fff">
          <span style="display:inline-block;background:#2563eb;color:#fff;font-size:11px;font-weight:800;padding:3px 8px;border-radius:4px;text-transform:uppercase;margin-bottom:8px">EL App</span>
          <h1 style="margin:0;font-size:22px;font-weight:700">Time Report</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:14px">${startDate} to ${endDate}</p>
        </div>
        <div style="padding:24px 32px">
          <p style="margin:0 0 16px;font-size:14px;color:#475569">Total tracked: <strong>${totalHours} hours</strong> across ${entries.length} entries.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600">Date</th>
                <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600">Employee</th>
                <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600">Project</th>
                <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600">Client</th>
                <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600">Duration</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
          Sent automatically by EL App • ${new Date().toLocaleString()}
        </div>
      </div>
    </body>
    </html>
  `;
}

function formatSecondsToHHMM(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }
  return {
    dateStr: `${partMap.year}-${partMap.month}-${partMap.day}`,
    hour: parseInt(partMap.hour || '0', 10),
    minute: parseInt(partMap.minute || '0', 10),
    dayOfWeek: (partMap.weekday || '').toUpperCase(),
    dayOfMonth: parseInt(partMap.day || '1', 10),
    year: partMap.year || String(date.getFullYear()),
    month: partMap.month || '01',
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Evaluates the automated email schedule and dispatches the corresponding report
 * if the scheduled time has arrived and hasn't already been delivered for this period.
 */
export async function processScheduledEmailDispatch(options?: {
  force?: boolean;
}): Promise<{
  dispatched: boolean;
  type?: string;
  reason?: string;
  recipients?: string[];
  sentCount?: number;
  failedCount?: number;
  error?: string;
}> {
  const setting = await prisma.emailScheduleSetting.findFirst({
    where: { id: 'default-email-setting' },
  });

  if (!setting || (!setting.enabled && !options?.force)) {
    return { dispatched: false, reason: 'Automatic email reporting is disabled in settings.' };
  }

  const tz = setting.timezone || 'Asia/Kolkata';
  const now = new Date();
  const zoned = getZonedParts(now, tz);
  const curTotalMin = zoned.hour * 60 + zoned.minute;

  const scheduleType = (setting.scheduleType || 'DAILY').toUpperCase();
  let isDue = Boolean(options?.force);
  let key = '';
  let startDate = zoned.dateStr;
  let endDate = zoned.dateStr;

  if (scheduleType === 'DAILY') {
    const timeStr = setting.dailyTime || setting.scheduleTime || '18:00';
    const [targetH, targetM] = timeStr.split(':').map(Number);
    const targetTotalMin = (targetH || 0) * 60 + (targetM || 0);

    key = `DAILY_${zoned.dateStr}`;
    if (!options?.force) {
      if (setting.lastSentKey === key) {
        return { dispatched: false, reason: `Daily report already dispatched for today (${zoned.dateStr}).` };
      }
      if (curTotalMin < targetTotalMin) {
        return {
          dispatched: false,
          reason: `Current time (${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}) is before scheduled daily time (${timeStr}).`,
        };
      }
    }
    isDue = true;
    startDate = zoned.dateStr;
    endDate = zoned.dateStr;
  } else if (scheduleType === 'WEEKLY') {
    const targetDay = (setting.weeklyDay || 'FRI').toUpperCase();
    const timeStr = setting.weeklyTime || setting.scheduleTime || '18:00';
    const [targetH, targetM] = timeStr.split(':').map(Number);
    const targetTotalMin = (targetH || 0) * 60 + (targetM || 0);

    const weekNumber = getWeekNumber(now);
    key = `WEEKLY_${zoned.year}-W${weekNumber}`;

    if (!options?.force) {
      if (setting.lastSentKey === key) {
        return { dispatched: false, reason: `Weekly report already dispatched for week ${key}.` };
      }
      if (zoned.dayOfWeek !== targetDay) {
        return { dispatched: false, reason: `Today is ${zoned.dayOfWeek}, weekly report scheduled for ${targetDay}.` };
      }
      if (curTotalMin < targetTotalMin) {
        return {
          dispatched: false,
          reason: `Current time (${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}) is before scheduled time (${timeStr}).`,
        };
      }
    }
    isDue = true;
    const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const pastZoned = getZonedParts(past7, tz);
    startDate = pastZoned.dateStr;
    endDate = zoned.dateStr;
  } else if (scheduleType === 'MONTHLY') {
    const targetDay = setting.monthlyDay || 1;
    const timeStr = setting.monthlyTime || setting.scheduleTime || '18:00';
    const [targetH, targetM] = timeStr.split(':').map(Number);
    const targetTotalMin = (targetH || 0) * 60 + (targetM || 0);

    key = `MONTHLY_${zoned.year}-${zoned.month}`;
    if (!options?.force) {
      if (setting.lastSentKey === key) {
        return { dispatched: false, reason: `Monthly report already dispatched for month ${key}.` };
      }
      if (zoned.dayOfMonth !== targetDay) {
        return { dispatched: false, reason: `Today is day ${zoned.dayOfMonth}, monthly report scheduled for day ${targetDay}.` };
      }
      if (curTotalMin < targetTotalMin) {
        return {
          dispatched: false,
          reason: `Current time (${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}) is before scheduled time (${timeStr}).`,
        };
      }
    }
    isDue = true;
    startDate = `${zoned.year}-${zoned.month}-01`;
    endDate = zoned.dateStr;
  }

  if (!isDue) {
    return { dispatched: false, reason: 'Conditions for scheduled dispatch not met.' };
  }

  // Execute dispatch
  const result = await sendCustomDateRangeReportEmail({
    startDate,
    endDate,
  });

  if (result.success && result.sentCount > 0) {
    // Only lock lastSentKey after successful delivery!
    await prisma.emailScheduleSetting.update({
      where: { id: setting.id },
      data: { lastSentKey: key },
    });

    return {
      dispatched: true,
      type: scheduleType,
      recipients: result.recipients,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
    };
  }

  return {
    dispatched: false,
    type: scheduleType,
    reason: result.error || 'Failed to deliver scheduled email report.',
    error: result.error,
    recipients: result.recipients,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
  };
}

