"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDurationDetailed = formatDurationDetailed;
exports.formatTimeAmPm = formatTimeAmPm;
exports.parseRecipientEmails = parseRecipientEmails;
exports.getEmailSettings = getEmailSettings;
exports.sendEmailNotification = sendEmailNotification;
exports.generateEodEmailHtml = generateEodEmailHtml;
exports.sendEodReportEmail = sendEodReportEmail;
exports.sendDailySummaryEmail = sendDailySummaryEmail;
exports.sendWeeklySummaryEmail = sendWeeklySummaryEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("./prisma");
const reportEngine_1 = require("./reportEngine");
function formatDurationDetailed(seconds) {
    if (!seconds || seconds <= 0)
        return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}
function formatTimeAmPm(date) {
    if (!date)
        return 'In Progress';
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return '—';
    return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}
function parseRecipientEmails(rawRecipients) {
    if (!rawRecipients)
        return [];
    if (Array.isArray(rawRecipients)) {
        return Array.from(new Set(rawRecipients
            .flatMap((r) => parseRecipientEmails(r))
            .filter(Boolean)));
    }
    return Array.from(new Set(rawRecipients
        .split(/[,;\s\n]+/)
        .map((r) => r.trim().toLowerCase())
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))));
}
async function getEmailSettings() {
    const settings = await prisma_1.prisma.emailScheduleSetting.findUnique({
        where: { id: 'default-email-setting' },
    });
    return settings;
}
async function sendEmailNotification({ to, subject, html, type, }) {
    const settings = await getEmailSettings();
    const host = settings?.smtpHost || process.env.SMTP_HOST;
    const port = settings?.smtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587);
    const user = settings?.smtpUser || process.env.SMTP_USER;
    const pass = settings?.smtpPass || process.env.SMTP_PASS;
    const from = settings?.smtpFrom || process.env.SMTP_FROM || 'EL App Notifications <notifications@elapp.local>';
    const isConfigured = Boolean(host && user && pass);
    let status = 'SIMULATED';
    let errorMessage = null;
    if (isConfigured) {
        try {
            const transporter = nodemailer_1.default.createTransport({
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
        }
        catch (err) {
            console.warn('SMTP delivery failed, recording simulated/failed log:', err);
            status = 'FAILED';
            errorMessage = err instanceof Error ? err.message : String(err);
        }
    }
    else {
        // Simulated delivery mode
        status = 'SIMULATED';
    }
    // Record in EmailDeliveryLog
    const log = await prisma_1.prisma.emailDeliveryLog.create({
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
 * Generates rich HTML for the End-of-Day (EOD) Employee Project & Timings Report
 */
async function generateEodEmailHtml(date = new Date()) {
    const report = await (0, reportEngine_1.getDailyReport)({ date });
    // 1. Fetch all active employees to know who was active and who had no recorded hours
    const allActiveEmployees = await prisma_1.prisma.user.findMany({
        where: { role: 'EMPLOYEE', isActive: true },
        select: { id: true, name: true, employeeId: true, department: true },
        orderBy: { name: 'asc' },
    });
    // Group raw entries by employee
    const employeeEntriesMap = new Map();
    for (const entry of report.rawEntries) {
        if (!employeeEntriesMap.has(entry.userId)) {
            employeeEntriesMap.set(entry.userId, []);
        }
        employeeEntriesMap.get(entry.userId).push(entry);
    }
    // Active employees who logged time
    const recordedEmployeesData = report.employeeBreakdown.map((emp) => {
        const entries = employeeEntriesMap.get(emp.user.id) || [];
        return {
            user: emp.user,
            totalDuration: emp.totalDuration,
            regularDuration: emp.regularDuration,
            outsideHoursDuration: emp.outsideHoursDuration,
            projects: emp.projects,
            entries,
        };
    });
    // Active employees who did NOT log time today
    const recordedUserIds = new Set(report.employeeBreakdown.map((e) => e.user.id));
    const unrecordedEmployees = allActiveEmployees.filter((e) => !recordedUserIds.has(e.id));
    // Project-wise total hours aggregation
    const projectAggregates = new Map();
    for (const entry of report.rawEntries) {
        if (!projectAggregates.has(entry.projectId)) {
            projectAggregates.set(entry.projectId, {
                code: entry.project.code,
                name: entry.project.name,
                totalSeconds: 0,
                contributors: new Set(),
            });
        }
        const agg = projectAggregates.get(entry.projectId);
        agg.totalSeconds += entry.duration;
        agg.contributors.add(entry.user.name);
    }
    const projectSummaryList = Array.from(projectAggregates.values());
    const formattedDate = new Date(report.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    // Build Employee Project and Timings Table HTML
    const employeeSectionsHtml = recordedEmployeesData.length === 0
        ? `
      <div style="padding: 24px; text-align: center; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; color: #64748b; font-size: 14px;">
        No employee activity or time entries recorded for this date.
      </div>
    `
        : recordedEmployeesData.map((emp) => {
            const timingsRows = emp.entries.map((entry) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 14px; font-weight: 600; color: #1e293b;">
              <span style="font-family: monospace; color: #2563eb; background: #eff6ff; padding: 2px 6px; rounded: 4px; font-size: 11px;">${entry.project.code}</span>
              <span style="display: block; font-size: 12px; color: #475569; margin-top: 2px;">${entry.project.name}</span>
            </td>
            <td style="padding: 10px 14px; font-family: monospace; font-size: 12px; color: #334155; white-space: nowrap;">
              <strong>${formatTimeAmPm(entry.startTime)}</strong> → <strong>${formatTimeAmPm(entry.endTime)}</strong>
            </td>
            <td style="padding: 10px 14px; font-weight: 600; color: #0f172a; font-size: 13px; white-space: nowrap;">
              ${formatDurationDetailed(entry.duration)}
            </td>
            <td style="padding: 10px 14px; white-space: nowrap;">
              ${entry.isOutsideHours
                ? `<span style="background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Outside Hours</span>`
                : `<span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">Regular</span>`}
            </td>
            <td style="padding: 10px 14px; font-size: 12px; color: #64748b;">
              ${entry.notes ? entry.notes : '<span style="color: #cbd5e1; font-style: italic;">No task notes</span>'}
            </td>
          </tr>
        `).join('');
            return `
          <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                <span style="font-weight: 700; font-size: 15px; color: #0f172a;">${emp.user.name}</span>
                <span style="font-family: monospace; font-size: 12px; color: #64748b; margin-left: 8px;">[${emp.user.employeeId}]</span>
                <span style="font-size: 12px; color: #2563eb; margin-left: 8px; background: #dbeafe; padding: 1px 6px; border-radius: 4px;">${emp.user.department || 'General'}</span>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 700; font-size: 14px; color: #0f172a; background: #f1f5f9; padding: 4px 10px; border-radius: 6px;">
                  Total: ${formatDurationDetailed(emp.totalDuration)}
                </span>
                ${emp.outsideHoursDuration > 0
                ? `<span style="font-size: 11px; color: #d97706; display: block; margin-top: 2px;">(${formatDurationDetailed(emp.outsideHoursDuration)} Outside Hours)</span>`
                : ''}
              </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #f8fafc; color: #64748b; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 8px 14px;">Project</th>
                  <th style="padding: 8px 14px;">Timings (Start → End)</th>
                  <th style="padding: 8px 14px;">Duration</th>
                  <th style="padding: 8px 14px;">Classification</th>
                  <th style="padding: 8px 14px;">Task Notes</th>
                </tr>
              </thead>
              <tbody>
                ${timingsRows}
              </tbody>
            </table>
          </div>
        `;
        }).join('');
    // Build Project Summary Rows
    const projectSummaryRowsHtml = projectSummaryList.length === 0
        ? `<tr><td colspan="4" style="padding: 12px 16px; text-align: center; color: #94a3b8;">No projects tracked today.</td></tr>`
        : projectSummaryList.map((p) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 16px; font-family: monospace; font-weight: 600; color: #2563eb;">${p.code}</td>
          <td style="padding: 8px 16px; font-weight: 500; color: #1e293b;">${p.name}</td>
          <td style="padding: 8px 16px; font-weight: 600; color: #0f172a;">${formatDurationDetailed(p.totalSeconds)}</td>
          <td style="padding: 8px 16px; font-size: 12px; color: #64748b;">${Array.from(p.contributors).join(', ')}</td>
        </tr>
      `).join('');
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
                  End-of-Day (EOD) Employee Project & Timings Report
                </h1>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
                  Operations & Time Ledger for <strong>${formattedDate}</strong>
                </p>
              </div>
            </div>
          </div>

          <!-- Body Content -->
          <div style="padding: 28px 32px;">

            <!-- Summary KPI Grid -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Hours</div>
                <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">
                  ${(0, reportEngine_1.formatDurationHours)(report.totalTrackedSeconds)}
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Active Employees</div>
                <div style="font-size: 20px; font-weight: 800; color: #2563eb; margin-top: 4px;">
                  ${recordedEmployeesData.length} <span style="font-size: 12px; font-weight: normal; color: #64748b;">/ ${allActiveEmployees.length}</span>
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Projects Active</div>
                <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">
                  ${projectSummaryList.length}
                </div>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Outside Hours</div>
                <div style="font-size: 20px; font-weight: 800; color: ${report.outsideHoursSeconds > 0 ? '#d97706' : '#0f172a'}; margin-top: 4px;">
                  ${formatDurationDetailed(report.outsideHoursSeconds)}
                </div>
              </div>
            </div>

            <!-- Detailed Section: Employee Projects & Timings -->
            <div style="margin-bottom: 32px;">
              <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px;">
                <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                  <span>📋 Employee Project & Timings Data</span>
                </h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
                  Individual session timings, project associations, and task notes logged throughout the day.
                </p>
              </div>

              ${employeeSectionsHtml}
            </div>

            <!-- Unrecorded Notice -->
            ${unrecordedHtml}

            <!-- Project Aggregates Summary -->
            <div style="margin-top: 32px;">
              <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                  📊 Project Time Distribution Summary
                </h3>
              </div>
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="background: #f8fafc; color: #64748b; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">
                      <th style="padding: 10px 16px;">Project Code</th>
                      <th style="padding: 10px 16px;">Project Name</th>
                      <th style="padding: 10px 16px;">Total Hours</th>
                      <th style="padding: 10px 16px;">Contributing Employees</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${projectSummaryRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Footer Notice -->
            <div style="margin-top: 36px; pt-20px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.6;">
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
            totalHours: (0, reportEngine_1.formatDurationHours)(report.totalTrackedSeconds),
            activeEmployeesCount: recordedEmployeesData.length,
            totalEmployeesCount: allActiveEmployees.length,
            projectsCount: projectSummaryList.length,
            outsideHours: formatDurationDetailed(report.outsideHoursSeconds),
        },
    };
}
/**
 * Sends the End-of-Day (EOD) report to all configured EOD recipients.
 * Accepts as many recipient email addresses as provided or configured.
 */
async function sendEodReportEmail(customRecipients) {
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
    const results = [];
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
async function sendDailySummaryEmail(targetRecipient) {
    const settings = await getEmailSettings();
    if (!settings?.enabled || !settings?.dailyEnabled) {
        return { skipped: true, reason: 'Daily EOD emails disabled in settings' };
    }
    return sendEodReportEmail(targetRecipient ? [targetRecipient] : undefined);
}
/**
 * Generates and delivers the Weekly Summary email.
 */
async function sendWeeklySummaryEmail(targetRecipient) {
    const settings = await getEmailSettings();
    if (!settings?.enabled || !settings?.weeklyEnabled) {
        return { skipped: true, reason: 'Weekly emails disabled in settings' };
    }
    const recipients = targetRecipient ? parseRecipientEmails(targetRecipient) : parseRecipientEmails(settings.recipients);
    const report = await (0, reportEngine_1.getWeeklyReport)({ date: new Date() });
    const projectRows = report.projectBreakdown
        .map((p) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;"><strong>${p.project.code}</strong> — ${p.project.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${(0, reportEngine_1.formatDurationHours)(p.duration)}</td>
    </tr>
  `)
        .join('');
    const html = `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; border-bottom: 2px solid #10b981; padding-bottom: 8px;">EL App — Weekly Project Summary</h2>
      <p>Period: <strong>${report.weekStart} to ${report.weekEnd}</strong></p>
      
      <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 16px 0;">
        <div style="font-size: 12px; color: #6b7280;">Total Tracked Project Hours</div>
        <div style="font-size: 20px; font-weight: bold; color: #111827;">${(0, reportEngine_1.formatDurationHours)(report.totalTrackedSeconds)}</div>
      </div>

      ${report.highestProjectTime
        ? `<p>⭐ <strong>Highest Project Time:</strong> ${report.highestProjectTime.user.name} on <em>${report.highestProjectTime.project.name}</em> (${(0, reportEngine_1.formatDurationHours)(report.highestProjectTime.duration)})</p>`
        : ''}

      <h3>Project Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f9fafb; text-align: left;">
            <th style="padding: 8px 12px;">Project</th>
            <th style="padding: 8px 12px;">Tracked Hours</th>
          </tr>
        </thead>
        <tbody>
          ${projectRows || '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #6b7280;">No projects tracked this week.</td></tr>'}
        </tbody>
      </table>
      
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
        Generated automatically by EL App — Employee Project Time Tracking System.
      </p>
    </div>
  `;
    for (const r of recipients) {
        if (r) {
            await sendEmailNotification({
                to: r,
                subject: `[EL App] Weekly Project Summary — ${report.weekStart} to ${report.weekEnd}`,
                html,
                type: 'WEEKLY_SUMMARY',
            });
        }
    }
    return { success: true, count: recipients.length };
}
