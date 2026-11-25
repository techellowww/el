import nodemailer from 'nodemailer';
import { prisma } from './prisma';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

export async function getSmtpSettings(): Promise<SmtpConfig> {
  let setting = null;
  try {
    setting = await prisma.emailScheduleSetting.findFirst();
  } catch (err: any) {
    console.warn('[getSmtpSettings DB lookup error]:', err?.message);
  }

  const defaultUser = 'ellowwwteam@gmail.com';
  const defaultPass = 'btfh oona qkht yukr';
  const defaultHost = 'smtp.gmail.com';
  const defaultPort = 587;
  const defaultFrom = `ClientHub Notifications <${defaultUser}>`;

  const host = setting?.smtpHost || process.env.SMTP_HOST || defaultHost;
  const port = setting?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : defaultPort);
  const user = (setting?.smtpUser && setting.smtpUser.trim()) || (process.env.SMTP_USER && process.env.SMTP_USER.trim()) || defaultUser;
  const pass = (setting?.smtpPass && setting.smtpPass.trim()) || (process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) || defaultPass;
  const from = (setting?.smtpFrom && setting.smtpFrom.trim()) || (process.env.SMTP_FROM && process.env.SMTP_FROM.trim()) || defaultFrom;

  return { host, port, user, pass, from };
}

export function createTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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

  // Fetch agency branding for report email
  const account = await prisma.account.findFirst({
    select: { name: true, logoUrl: true },
  });
  const agencyName = account?.name || 'Acme Digital Agency Global';
  const agencyLogoUrl = account?.logoUrl || null;
  const appUrl = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Build clean branded HTML email matching ClientHub template
  const subjectLine = `${agencyName}: Time Report — ${options.startDate} to ${options.endDate}`;
  const htmlBody = buildReportEmailHtml({
    startDate: options.startDate,
    endDate: options.endDate,
    entries,
    totalSeconds,
    totalHours,
    agencyName,
    agencyLogoUrl,
    appUrl,
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
  agencyName?: string;
  agencyLogoUrl?: string | null;
  appUrl?: string;
}): string {
  const { startDate, endDate, entries, totalHours } = opts;
  const agencyName = opts.agencyName || 'Acme Digital Agency Global';
  const agencyLogoUrl = opts.agencyLogoUrl || null;
  const appUrl = opts.appUrl || process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const logoHtml = agencyLogoUrl
    ? `<img src="${agencyLogoUrl}" alt="${agencyName}" style="max-height: 48px; max-width: 200px; object-fit: contain; margin-bottom: 8px;" />`
    : `<div style="font-size: 20px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px;">${agencyName}</div>`;

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
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Time Report: ${startDate} to ${endDate}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        
        <!-- Header with Agency Branding -->
        <div style="padding: 24px 32px; border-bottom: 1px solid #f1f5f9; text-align: center; background-color: #ffffff;">
          ${logoHtml}
          <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">
            ${agencyName} Secure Portal
          </div>
        </div>

        <!-- Main Body -->
        <div style="padding: 32px;">
          <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 18px 0; letter-spacing: -0.3px;">
            Time Report: ${startDate} to ${endDate}
          </h2>

          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 14px 0;">Hello Team,</p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
            Here is the automated summary of tracked time entries for <strong>${agencyName}</strong>.
          </p>

          <!-- Key Details Summary Box -->
          <div style="margin: 20px 0; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 6px 0;">
              <strong>Date Range:</strong> ${startDate} to ${endDate}
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0;">
              <strong>Total Tracked:</strong> <span style="font-weight: 700; color: #0f172a;">${totalHours} hours</span> across ${entries.length} recorded entries
            </p>
          </div>

          <!-- Time Entries Table -->
          <div style="margin: 24px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #f8fafc;">
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Date</th>
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Employee</th>
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Project</th>
                  <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Client</th>
                  <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>

          <!-- Primary CTA Button -->
          <div style="margin: 32px 0 20px 0; text-align: center;">
            <a href="${appUrl}/time-sheet" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
              View Timesheet & Reports &rarr;
            </a>
            <div style="margin-top: 10px; font-size: 12px; color: #64748b;">
              Or copy and paste this link in your browser: <br/>
              <a href="${appUrl}/time-sheet" style="color: #2563eb; word-break: break-all;">${appUrl}/time-sheet</a>
            </div>
          </div>

          <!-- Footer Note -->
          <div style="padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
            This is an automated report generated by ${agencyName} Secure Portal • ${new Date().toLocaleString()}
          </div>
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
    hourCycle: 'h23',
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
    const timeStr = setting.scheduleTime || setting.dailyTime || '18:00';
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
    const timeStr = setting.scheduleTime || setting.weeklyTime || '18:00';
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
    const timeStr = setting.scheduleTime || setting.monthlyTime || '18:00';
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

