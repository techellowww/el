import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { getDailyReport, getWeeklyReport, getCustomReport, formatDurationHours } from './reportEngine';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export function formatDurationDetailed(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTimeAmPm(date: Date | string | null): string {
  if (!date) return 'In Progress';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function parseRecipientEmails(rawRecipients?: string | string[] | null): string[] {
  if (!rawRecipients) return [];
  if (Array.isArray(rawRecipients)) {
    return Array.from(
      new Set(
        rawRecipients
          .flatMap((r) => parseRecipientEmails(r))
          .filter(Boolean)
      )
    );
  }
  return Array.from(
    new Set(
      rawRecipients
        .split(/[,;\s\n]+/)
        .map((r) => r.trim().toLowerCase())
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))
    )
  );
}

export async function getEmailSettings() {
  const settings = await prisma.emailScheduleSetting.findUnique({
    where: { id: 'default-email-setting' },
  });

  return settings;
}

export async function testSmtpConnection(customConfig?: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
}) {
  const settings = await getEmailSettings();

  const host = customConfig?.host || settings?.smtpHost || process.env.SMTP_HOST;
  const port = customConfig?.port || settings?.smtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587);
  const user = customConfig?.user || settings?.smtpUser || process.env.SMTP_USER;
  const pass = customConfig?.pass || settings?.smtpPass || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return {
      success: false,
      error: 'Incomplete SMTP settings: Host, Username, and Password are all required.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    await transporter.verify();
    return {
      success: true,
      message: `SMTP connection established and verified successfully with ${host}:${port} (${user}).`,
    };
  } catch (err: any) {
    const rawError = err instanceof Error ? err.message : String(err);
    let guidance = '';

    if (
      rawError.includes('535') ||
      rawError.includes('BadCredentials') ||
      rawError.toLowerCase().includes('username and password not accepted')
    ) {
      if (host.includes('gmail.com')) {
        guidance =
          'Google requires a 16-character App Password (with 2-Step Verification enabled). Normal Gmail account passwords are rejected. Generate an App Password at https://myaccount.google.com/apppasswords';
      } else {
        guidance = 'The SMTP server rejected the provided username or password. Please verify your credentials.';
      }
    }

    return {
      success: false,
      error: rawError,
      guidance,
    };
  }
}

export async function sendEmailNotification({
  to,
  subject,
  html,
  type,
}: {
  to: string;
  subject: string;
  html: string;
  type: string;
}) {
  const settings = await getEmailSettings();

  const host = settings?.smtpHost || process.env.SMTP_HOST;
  const port = settings?.smtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587);
  const user = settings?.smtpUser || process.env.SMTP_USER;
  const pass = settings?.smtpPass || process.env.SMTP_PASS;
  const from = settings?.smtpFrom || process.env.SMTP_FROM || 'EL App Notifications <notifications@elapp.local>';

  const isConfigured = Boolean(host && user && pass);

  let status: 'SENT' | 'FAILED' | 'SIMULATED' = 'SIMULATED';
  let errorMessage: string | null = null;

  if (isConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: host || undefined,
        port: port || 587,
        secure: port === 465,
        auth: {
          user: user || undefined,
          pass: pass || undefined,
        },
      });

      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      status = 'SENT';
    } catch (err) {
      console.warn('SMTP delivery failed, recording simulated/failed log:', err);
      status = 'FAILED';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  } else {
    // Simulated delivery mode
    status = 'SIMULATED';
  }

  // Record in EmailDeliveryLog
  const log = await prisma.emailDeliveryLog.create({
    data: {
      type,
      recipient: to,
      subject,
      status,
      content: html.substring(0, 1500),
      error: errorMessage,
      sentAt: status === 'SENT' || status === 'SIMULATED' ? new Date() : null,
    },
  });

  return log;
}

/**
 * Generates rich HTML for the End-of-Day (EOD) Employee Hours Report
 * Formatted cleanly with Employee Name, Inside Hours, Outside Hours, and Total Hours.
 */
export async function generateEodEmailHtml(date: Date = new Date()) {
  const report = await getDailyReport({ date });

  // 1. Fetch all active employees to know who was active and who had no recorded hours
  const allActiveEmployees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', isActive: true },
    select: { id: true, name: true, employeeId: true, department: true },
    orderBy: { name: 'asc' },
  });

  // Group raw entries by employee
  const employeeEntriesMap = new Map<string, typeof report.rawEntries>();
  for (const entry of report.rawEntries) {
    if (!employeeEntriesMap.has(entry.userId)) {
      employeeEntriesMap.set(entry.userId, []);
    }
    employeeEntriesMap.get(entry.userId)!.push(entry);
  }

  // Active employees who logged time
  const recordedEmployeesData = report.employeeBreakdown.map((emp) => {
    const entries = employeeEntriesMap.get(emp.user.id) || [];
    return {
      user: emp.user,
      totalDuration: emp.totalDuration,
      regularDuration: emp.regularDuration, // Inside Hours
      outsideHoursDuration: emp.outsideHoursDuration, // Outside Hours
      entries,
    };
  });

  // Active employees who did NOT log time today
  const recordedUserIds = new Set(report.employeeBreakdown.map((e) => e.user.id));
  const unrecordedEmployees = allActiveEmployees.filter((e) => !recordedUserIds.has(e.id));

  const formattedDate = new Date(report.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Inside hours calculation across report
  const insideSeconds = report.regularSeconds || Math.max(0, report.totalTrackedSeconds - report.outsideHoursSeconds);

  // 1. Employee Hours Summary Rows (Employee Name, Inside Hours, Outside Hours, Total Hours)
  const employeeSummaryRowsHtml = recordedEmployeesData.length === 0
    ? `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #64748b; font-size: 13px;">No employee hours recorded for this date.</td></tr>`
    : recordedEmployeesData.map((emp) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a;">${emp.user.name}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
              <span style="font-family: monospace;">[${emp.user.employeeId}]</span>
              <span style="color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">${emp.user.department || 'General'}</span>
            </div>
          </td>
          <td style="padding: 14px 16px; text-align: center;">
            <span style="display: inline-block; background: #ecfdf5; color: #047857; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 6px;">
              ${formatDurationDetailed(emp.regularDuration)}
            </span>
          </td>
          <td style="padding: 14px 16px; text-align: center;">
            <span style="display: inline-block; background: ${emp.outsideHoursDuration > 0 ? '#fef3c7' : '#f8fafc'}; color: ${emp.outsideHoursDuration > 0 ? '#b45309' : '#94a3b8'}; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 6px;">
              ${formatDurationDetailed(emp.outsideHoursDuration)}
            </span>
          </td>
          <td style="padding: 14px 16px; text-align: right;">
            <span style="font-weight: 800; font-size: 15px; color: #0f172a;">
              ${formatDurationDetailed(emp.totalDuration)}
            </span>
          </td>
        </tr>
      `).join('');

  // 2. Individual Employee Session Logs (Timings, Duration, Inside/Outside classification, Notes - NO PROJECT!)
  const employeeSessionDetailsHtml = recordedEmployeesData.length === 0
    ? ''
    : `
      <div style="margin-top: 32px;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">
            ⏱️ Individual Session Timings
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
            Exact clock-in / clock-out periods and activity classifications logged today.
          </p>
        </div>

        ${recordedEmployeesData.map((emp) => {
          const rows = emp.entries.map((entry) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 14px; font-family: monospace; font-size: 12px; color: #334155; white-space: nowrap;">
                <strong>${formatTimeAmPm(entry.startTime)}</strong> → <strong>${formatTimeAmPm(entry.endTime)}</strong>
              </td>
              <td style="padding: 10px 14px; font-weight: 600; color: #0f172a; font-size: 13px; white-space: nowrap;">
                ${formatDurationDetailed(entry.duration)}
              </td>
              <td style="padding: 10px 14px; white-space: nowrap;">
                ${entry.isOutsideHours
                  ? `<span style="background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Outside Hours</span>`
                  : `<span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Inside Hours</span>`
                }
              </td>
              <td style="padding: 10px 14px; font-size: 12px; color: #64748b;">
                ${entry.notes ? entry.notes : '<span style="color: #cbd5e1; font-style: italic;">No task notes</span>'}
              </td>
            </tr>
          `).join('');

          return `
            <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
              <div style="background: #f8fafc; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${emp.user.name}</span>
                <span style="font-size: 12px; color: #475569;">
                  Inside: <strong style="color: #047857;">${formatDurationDetailed(emp.regularDuration)}</strong> &nbsp;|&nbsp; 
                  Outside: <strong style="color: #b45309;">${formatDurationDetailed(emp.outsideHoursDuration)}</strong> &nbsp;|&nbsp; 
                  Total: <strong style="color: #0f172a;">${formatDurationDetailed(emp.totalDuration)}</strong>
                </span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: #ffffff; color: #64748b; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">
                    <th style="padding: 8px 14px;">Timings (Start → End)</th>
                    <th style="padding: 8px 14px;">Duration</th>
                    <th style="padding: 8px 14px;">Classification</th>
                    <th style="padding: 8px 14px;">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}
      </div>
    `;

  // Unrecorded employees notice
  const unrecordedHtml = unrecordedEmployees.length > 0
    ? `
      <div style="margin-top: 24px; padding: 14px 18px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-size: 13px;">
        <strong style="color: #92400e; display: block; margin-bottom: 4px;">
          ⚠️ Unrecorded Employees (${unrecordedEmployees.length}):
        </strong>
        <span style="color: #78350f;">
          The following active employees had no tracked hours recorded today:
          <strong>${unrecordedEmployees.map((e) => `${e.name} (${e.employeeId})`).join(', ')}</strong>.
        </span>
      </div>
    `
    : '';

  const subject = `[EL App] End of Day (EOD) Operations Report — ${formattedDate}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 780px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; color: #ffffff;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
                  EL App Enterprise
                </span>
                <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em;">
                  End-of-Day (EOD) Operations Report
                </h1>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
                  Operations & Work Hours Ledger for <strong>${formattedDate}</strong>
                </p>
              </div>
            </div>
          </div>

          <!-- Body Content -->
          <div style="padding: 28px 32px;">

            <!-- Summary KPI Grid (Total Hours, Active Employees, Inside Hours, Outside Hours) -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Hours</div>
                <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">
                  ${formatDurationHours(report.totalTrackedSeconds)}
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Active Employees</div>
                <div style="font-size: 20px; font-weight: 800; color: #2563eb; margin-top: 4px;">
                  ${recordedEmployeesData.length} <span style="font-size: 12px; font-weight: normal; color: #64748b;">/ ${allActiveEmployees.length}</span>
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #047857; text-transform: uppercase;">Inside Hours</div>
                <div style="font-size: 20px; font-weight: 800; color: #047857; margin-top: 4px;">
                  ${formatDurationDetailed(insideSeconds)}
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #b45309; text-transform: uppercase;">Outside Hours</div>
                <div style="font-size: 20px; font-weight: 800; color: ${report.outsideHoursSeconds > 0 ? '#d97706' : '#64748b'}; margin-top: 4px;">
                  ${formatDurationDetailed(report.outsideHoursSeconds)}
                </div>
              </div>
            </div>

            <!-- Employee Hours Summary Table -->
            <div style="margin-bottom: 24px;">
              <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px;">
                <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                  👥 Employee Hours Summary
                </h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
                  Inside hours, outside hours, and total recorded working time per employee.
                </p>
              </div>

              <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="background: #f8fafc; color: #475569; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;">
                      <th style="padding: 12px 16px;">Employee Name</th>
                      <th style="padding: 12px 16px; text-align: center;">Inside Hours</th>
                      <th style="padding: 12px 16px; text-align: center;">Outside Hours</th>
                      <th style="padding: 12px 16px; text-align: right;">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${employeeSummaryRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Session Details (Start -> End Timings) -->
            ${employeeSessionDetailsHtml}

            <!-- Unrecorded Notice -->
            ${unrecordedHtml}

            <!-- Footer Notice -->
            <div style="margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.6;">
              <p style="margin: 0;">
                This End-of-Day (EOD) Operations Summary was automatically compiled and dispatched by <strong>EL App</strong>.
              </p>
              <p style="margin: 4px 0 0 0;">
                Generated at ${new Date().toLocaleTimeString()} • Timezone: ${process.env.APP_TIMEZONE || 'Asia/Kolkata'}
              </p>
            </div>

          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject,
    html,
    summary: {
      date: report.date,
      formattedDate,
      totalHours: formatDurationHours(report.totalTrackedSeconds),
      activeEmployeesCount: recordedEmployeesData.length,
      totalEmployeesCount: allActiveEmployees.length,
      insideHours: formatDurationDetailed(insideSeconds),
      outsideHours: formatDurationDetailed(report.outsideHoursSeconds),
    },
  };
}

/**
 * Sends the End-of-Day (EOD) report to all configured EOD recipients.
 * Accepts as many recipient email addresses as provided or configured.
 */
export async function sendEodReportEmail(customRecipients?: string[] | string) {
  const settings = await getEmailSettings();

  const recipientList = customRecipients
    ? parseRecipientEmails(customRecipients)
    : parseRecipientEmails(settings?.recipients || 'ellowwwstudio@gmail.com');

  if (recipientList.length === 0) {
    return {
      success: false,
      error: 'No valid recipient email addresses configured for EOD report sharing.',
      recipients: [],
    };
  }

  const { html, subject, summary } = await generateEodEmailHtml(new Date());

  const results: Array<{ recipient: string; status: string; logId: string; error: string | null }> = [];

  for (const recipient of recipientList) {
    const log = await sendEmailNotification({
      to: recipient,
      subject,
      html,
      type: 'EOD_REPORT',
    });
    results.push({
      recipient,
      status: log.status,
      logId: log.id,
      error: log.error,
    });
  }

  const sentCount = results.filter((r) => r.status === 'SENT' || r.status === 'SIMULATED').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    recipients: recipientList,
    results,
    summary,
  };
}

/**
 * Generates and delivers the Daily Summary email to administrators (EOD).
 */
export async function sendDailySummaryEmail(targetRecipient?: string) {
  const settings = await getEmailSettings();
  if (!settings?.enabled || !settings?.dailyEnabled) {
    return { skipped: true, reason: 'Daily EOD emails disabled in settings' };
  }

  return sendEodReportEmail(targetRecipient ? [targetRecipient] : undefined);
}

/**
 * Generates and delivers the Weekly Summary email.
 */
export async function sendWeeklySummaryEmail(targetRecipient?: string) {
  const settings = await getEmailSettings();
  if (!settings?.enabled || !settings?.weeklyEnabled) {
    return { skipped: true, reason: 'Weekly emails disabled in settings' };
  }

  const recipients = targetRecipient ? parseRecipientEmails(targetRecipient) : parseRecipientEmails(settings.recipients);
  const report = await getWeeklyReport({ date: new Date() });

  // Aggregate hours by employee
  const employeeMap = new Map<string, { name: string; employeeId: string; insideSeconds: number; outsideSeconds: number; totalSeconds: number }>();
  for (const entry of report.rawEntries || []) {
    if (!employeeMap.has(entry.userId)) {
      employeeMap.set(entry.userId, {
        name: entry.user.name,
        employeeId: entry.user.employeeId,
        insideSeconds: 0,
        outsideSeconds: 0,
        totalSeconds: 0,
      });
    }
    const emp = employeeMap.get(entry.userId)!;
    emp.totalSeconds += entry.duration;
    if (entry.isOutsideHours) emp.outsideSeconds += entry.duration;
    else emp.insideSeconds += entry.duration;
  }

  const employeeRows = Array.from(employeeMap.values()).map(
    (e) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #111827;">${e.name} <span style="color: #6b7280; font-size: 11px; font-family: monospace;">[${e.employeeId}]</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.insideSeconds)}</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: ${e.outsideSeconds > 0 ? '#fef3c7' : '#f3f4f6'}; color: ${e.outsideSeconds > 0 ? '#b45309' : '#9ca3af'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.outsideSeconds)}</span></td>
      <td style="padding: 10px 14px; text-align: right; font-weight: bold; color: #0f172a;">${formatDurationDetailed(e.totalSeconds)}</td>
    </tr>
  `
  ).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; border-bottom: 2px solid #10b981; padding-bottom: 8px;">EL App — Weekly Operations Summary</h2>
      <p>Period: <strong>${report.weekStart} to ${report.weekEnd}</strong></p>
      
      <div style="background: #f3f4f6; padding: 14px; border-radius: 8px; margin: 16px 0; display: flex; gap: 16px; justify-content: space-around; text-align: center;">
        <div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Total Tracked</div>
          <div style="font-size: 20px; font-weight: bold; color: #111827; margin-top: 2px;">${formatDurationHours(report.totalTrackedSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #047857; text-transform: uppercase;">Inside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #047857; margin-top: 2px;">${formatDurationHours(report.weekInsideSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #b45309; text-transform: uppercase;">Outside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #b45309; margin-top: 2px;">${formatDurationHours(report.weekOutsideSeconds)}</div>
        </div>
      </div>

      <h3 style="font-size: 15px; margin-top: 20px; color: #0f172a;">👥 Employee Hours Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb; text-align: left; border-bottom: 1px solid #e5e7eb;">
            <th style="padding: 10px 14px;">Employee</th>
            <th style="padding: 10px 14px; text-align: center;">Inside Hours</th>
            <th style="padding: 10px 14px; text-align: center;">Outside Hours</th>
            <th style="padding: 10px 14px; text-align: right;">Total Hours</th>
          </tr>
        </thead>
        <tbody>
          ${employeeRows || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">No hours tracked this week.</td></tr>'}
        </tbody>
      </table>
      
      <p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">
        Generated automatically by EL App — Employee Time Tracking System.
      </p>
    </div>
  `;

  for (const r of recipients) {
    if (r) {
      await sendEmailNotification({
        to: r,
        subject: `[EL App] Weekly Operations Summary — ${report.weekStart} to ${report.weekEnd}`,
        html,
        type: 'WEEKLY_SUMMARY',
      });
    }
  }

  return { success: true, count: recipients.length };
}

/**
 * Generates and delivers the Monthly Summary email.
 */
export async function sendMonthlySummaryEmail(targetRecipient?: string | string[]) {
  const settings = await getEmailSettings();
  const recipientList = targetRecipient
    ? parseRecipientEmails(targetRecipient)
    : parseRecipientEmails(settings?.recipients);

  if (recipientList.length === 0) {
    return { success: false, error: 'No recipient email addresses configured.' };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const report = await getCustomReport({
    startDate: monthStart,
    endDate: monthEnd,
  });

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const employeeRows = (report.employeeBreakdown || [])
    .map(
      (e) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #111827;">${e.user.name} <span style="color: #6b7280; font-size: 11px; font-family: monospace;">[${e.user.employeeId}]</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.regularDuration)}</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: ${e.outsideHoursDuration > 0 ? '#fef3c7' : '#f3f4f6'}; color: ${e.outsideHoursDuration > 0 ? '#b45309' : '#9ca3af'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.outsideHoursDuration)}</span></td>
      <td style="padding: 10px 14px; text-align: right; font-weight: bold; color: #0f172a;">${formatDurationDetailed(e.totalDuration)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">EL App — Monthly Operations Summary (${monthName})</h2>
      <p>Period: <strong>${monthStart.toLocaleDateString()} to ${monthEnd.toLocaleDateString()}</strong></p>
      
      <div style="background: #f3f4f6; padding: 14px; border-radius: 8px; margin: 16px 0; display: flex; gap: 16px; justify-content: space-around; text-align: center;">
        <div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Total Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #111827; margin-top: 2px;">${formatDurationHours(report.totalTrackedSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #047857; text-transform: uppercase;">Inside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #047857; margin-top: 2px;">${formatDurationHours(report.regularSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #b45309; text-transform: uppercase;">Outside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #b45309; margin-top: 2px;">${formatDurationHours(report.outsideHoursSeconds)}</div>
        </div>
      </div>

      <h3 style="font-size: 15px; margin-top: 20px; color: #0f172a;">👥 Employee Hours Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb; text-align: left; border-bottom: 1px solid #e5e7eb;">
            <th style="padding: 10px 14px;">Employee</th>
            <th style="padding: 10px 14px; text-align: center;">Inside Hours</th>
            <th style="padding: 10px 14px; text-align: center;">Outside Hours</th>
            <th style="padding: 10px 14px; text-align: right;">Total Hours</th>
          </tr>
        </thead>
        <tbody>
          ${employeeRows || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">No employee activity recorded this month.</td></tr>'}
        </tbody>
      </table>
      
      <p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">
        Generated automatically by EL App — Employee Time Tracking System.
      </p>
    </div>
  `;

  const results: Array<{ recipient: string; status: string; logId: string; error: string | null }> = [];
  for (const r of recipientList) {
    const log = await sendEmailNotification({
      to: r,
      subject: `[EL App] Monthly Operations Report — ${monthName}`,
      html,
      type: 'MONTHLY_SUMMARY',
    });
    results.push({
      recipient: r,
      status: log.status,
      logId: log.id,
      error: log.error,
    });
  }

  const sentCount = results.filter((r) => r.status === 'SENT' || r.status === 'SIMULATED').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    recipients: recipientList,
    results,
  };
}

/**
 * Generates and delivers a Custom Date-Range Report email manually requested by an Administrator.
 */
export async function sendCustomDateRangeReportEmail({
  startDate,
  endDate,
  recipients: customRecipients,
}: {
  startDate: string;
  endDate: string;
  recipients?: string | string[];
}) {
  const settings = await getEmailSettings();
  const recipientList = customRecipients
    ? parseRecipientEmails(customRecipients)
    : parseRecipientEmails(settings?.recipients);

  if (recipientList.length === 0) {
    return { success: false, error: 'No recipient email addresses provided or configured.' };
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: 'Invalid start date or end date format.' };
  }

  if (end < start) {
    return { success: false, error: 'End date must be on or after start date.' };
  }

  const report = await getCustomReport({ startDate: start, endDate: end });

  const employeeRows = (report.employeeBreakdown || [])
    .map(
      (e) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 14px; font-weight: 600; color: #111827;">${e.user.name} <span style="color: #6b7280; font-size: 11px; font-family: monospace;">[${e.user.employeeId}]</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.regularDuration)}</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span style="background: ${e.outsideHoursDuration > 0 ? '#fef3c7' : '#f3f4f6'}; color: ${e.outsideHoursDuration > 0 ? '#b45309' : '#9ca3af'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${formatDurationDetailed(e.outsideHoursDuration)}</span></td>
      <td style="padding: 10px 14px; text-align: right; font-weight: bold; color: #0f172a;">${formatDurationDetailed(e.totalDuration)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">EL App — Operations Activity Report</h2>
      <p>Report Range: <strong>${startDate} to ${endDate}</strong></p>
      
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 14px; border-radius: 8px; margin: 16px 0; display: flex; gap: 16px; justify-content: space-around; text-align: center;">
        <div>
          <div style="font-size: 11px; color: #0284c7; text-transform: uppercase;">Total Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #0369a1; margin-top: 2px;">${formatDurationHours(report.totalTrackedSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #047857; text-transform: uppercase;">Inside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #047857; margin-top: 2px;">${formatDurationHours(report.regularSeconds)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #b45309; text-transform: uppercase;">Outside Hours</div>
          <div style="font-size: 20px; font-weight: bold; color: #b45309; margin-top: 2px;">${formatDurationHours(report.outsideHoursSeconds)}</div>
        </div>
      </div>

      <h3 style="font-size: 15px; margin-top: 20px; color: #0f172a;">👥 Employee Hours Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f8fafc; text-align: left; border-bottom: 1px solid #e5e7eb;">
            <th style="padding: 10px 14px;">Employee</th>
            <th style="padding: 10px 14px; text-align: center;">Inside Hours</th>
            <th style="padding: 10px 14px; text-align: center;">Outside Hours</th>
            <th style="padding: 10px 14px; text-align: right;">Total Hours</th>
          </tr>
        </thead>
        <tbody>
          ${employeeRows || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">No time entries in this range.</td></tr>'}
        </tbody>
      </table>
      
      <p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">
        Report generated and sent from EL App — Employee Time Tracking System.
      </p>
    </div>
  `;

  const results: Array<{ recipient: string; status: string; logId: string; error: string | null }> = [];
  for (const r of recipientList) {
    const log = await sendEmailNotification({
      to: r,
      subject: `[EL App] Activity Report (${startDate} to ${endDate})`,
      html,
      type: 'MANUAL_REPORT',
    });
    results.push({
      recipient: r,
      status: log.status,
      logId: log.id,
      error: log.error,
    });
  }

  const sentCount = results.filter((r) => r.status === 'SENT' || r.status === 'SIMULATED').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  const firstError = results.find((r) => r.error)?.error || null;

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    recipients: recipientList,
    results,
    report,
    error: sentCount === 0 && firstError ? firstError : undefined,
  };
}

/**
 * Background worker to check and dispatch scheduled reports (Daily, Weekly, Monthly)
 * without duplicate scheduled emails.
 */
export async function processScheduledEmailDispatch(): Promise<{ dispatched: boolean; type?: string; reason?: string }> {
  const settings = await prisma.emailScheduleSetting.findUnique({
    where: { id: 'default-email-setting' },
  });

  if (!settings || !settings.enabled) {
    return { dispatched: false, reason: 'Email settings disabled' };
  }

  const tz = settings.timezone || 'Asia/Kolkata';
  const now = new Date();
  const scheduleType = (settings.scheduleType || 'DAILY').toUpperCase();
  const scheduleTime = settings.scheduleTime || settings.dailyTime || '18:00';

  const [targetH, targetM] = scheduleTime.split(':').map(Number);
  const currentZonedTime = toZonedTime(now, tz);
  const curH = currentZonedTime.getHours();
  const curM = currentZonedTime.getMinutes();

  // Check if current time is within 15 min window of scheduleTime
  const curTotalMin = curH * 60 + curM;
  const targetTotalMin = targetH * 60 + targetM;
  if (Math.abs(curTotalMin - targetTotalMin) > 15) {
    return { dispatched: false, reason: 'Not schedule time' };
  }

  const dateStr = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const dayOfWeek = formatInTimeZone(now, tz, 'EEE').toUpperCase();
  const dayOfMonth = currentZonedTime.getDate();

  if (scheduleType === 'DAILY') {
    const key = `DAILY_${dateStr}`;
    if (settings.lastSentKey === key) {
      return { dispatched: false, reason: 'Already sent today' };
    }
    await prisma.emailScheduleSetting.update({
      where: { id: settings.id },
      data: { lastSentKey: key },
    });
    await sendEodReportEmail();
    return { dispatched: true, type: 'DAILY' };
  } else if (scheduleType === 'WEEKLY') {
    const targetWeeklyDay = (settings.weeklyDay || 'FRI').toUpperCase();
    if (dayOfWeek !== targetWeeklyDay) {
      return { dispatched: false, reason: `Today is ${dayOfWeek}, weekly schedule is ${targetWeeklyDay}` };
    }
    const weekKey = `WEEKLY_${formatInTimeZone(now, tz, 'yyyy-ww')}`;
    if (settings.lastSentKey === weekKey) {
      return { dispatched: false, reason: 'Already sent this week' };
    }
    await prisma.emailScheduleSetting.update({
      where: { id: settings.id },
      data: { lastSentKey: weekKey },
    });
    await sendWeeklySummaryEmail();
    return { dispatched: true, type: 'WEEKLY' };
  } else if (scheduleType === 'MONTHLY') {
    const targetMonthlyDay = settings.monthlyDay || 1;
    if (dayOfMonth !== targetMonthlyDay) {
      return { dispatched: false, reason: `Today is day ${dayOfMonth}, monthly schedule is day ${targetMonthlyDay}` };
    }
    const monthKey = `MONTHLY_${formatInTimeZone(now, tz, 'yyyy-MM')}`;
    if (settings.lastSentKey === monthKey) {
      return { dispatched: false, reason: 'Already sent this month' };
    }
    await prisma.emailScheduleSetting.update({
      where: { id: settings.id },
      data: { lastSentKey: monthKey },
    });
    await sendMonthlySummaryEmail();
    return { dispatched: true, type: 'MONTHLY' };
  }

  return { dispatched: false };
}

