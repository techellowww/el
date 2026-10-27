import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';
import { format } from 'date-fns';
import {
  sendEodReportEmail,
  sendWeeklySummaryEmail,
  sendMonthlySummaryEmail,
  sendCustomDateRangeReportEmail,
  parseRecipientEmails,
} from '../lib/emailService';
import { getCustomReport, formatDurationHours } from '../lib/reportEngine';

const router = Router();

// GET /api/mail/settings
router.get('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [settings, deliveryLogs] = await Promise.all([
      prisma.emailScheduleSetting.findUnique({
        where: { id: 'default-email-setting' },
      }),
      prisma.emailDeliveryLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    res.json({ settings, deliveryLogs });
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ error: 'Failed to retrieve email settings' });
  }
});

// PUT /api/mail/settings
router.put('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      enabled,
      scheduleType = 'DAILY',
      scheduleTime = '18:00',
      monthlyDay = 1,
      dailyEnabled,
      dailyTime,
      weeklyEnabled,
      weeklyDay = 'FRI',
      weeklyTime,
      recipients,
      timezone,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
    } = req.body;

    const parsedRecipients = parseRecipientEmails(recipients);
    const cleanRecipients = parsedRecipients.length > 0 ? parsedRecipients.join(', ') : 'admin@company.com';

    const updated = await prisma.emailScheduleSetting.upsert({
      where: { id: 'default-email-setting' },
      update: {
        enabled: enabled ?? true,
        scheduleType: scheduleType || 'DAILY',
        scheduleTime: scheduleTime || dailyTime || '18:00',
        monthlyDay: monthlyDay ? Number(monthlyDay) : 1,
        dailyEnabled: dailyEnabled ?? true,
        dailyTime: dailyTime || scheduleTime || '19:00',
        weeklyEnabled: weeklyEnabled ?? true,
        weeklyDay: weeklyDay || 'FRI',
        weeklyTime: weeklyTime || scheduleTime || '18:00',
        recipients: cleanRecipients,
        timezone: timezone || 'Asia/Kolkata',
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
        smtpUser: smtpUser || null,
        smtpPass: smtpPass || null,
        smtpFrom: smtpFrom || 'EL App Notifications <notifications@elapp.local>',
      },
      create: {
        id: 'default-email-setting',
        enabled: enabled ?? true,
        scheduleType: scheduleType || 'DAILY',
        scheduleTime: scheduleTime || dailyTime || '18:00',
        monthlyDay: monthlyDay ? Number(monthlyDay) : 1,
        dailyEnabled: dailyEnabled ?? true,
        dailyTime: dailyTime || scheduleTime || '19:00',
        weeklyEnabled: weeklyEnabled ?? true,
        weeklyDay: weeklyDay || 'FRI',
        weeklyTime: weeklyTime || scheduleTime || '18:00',
        recipients: cleanRecipients,
        timezone: timezone || 'Asia/Kolkata',
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
        smtpUser: smtpUser || null,
        smtpPass: smtpPass || null,
        smtpFrom: smtpFrom || 'EL App Notifications <notifications@elapp.local>',
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'EMAIL_SETTINGS_UPDATED',
      targetEntity: 'EmailScheduleSetting',
      targetId: 'default-email-setting',
      mandatoryReason: 'Admin updated automated email schedule and recipient configurations',
      details: { scheduleType: updated.scheduleType, recipients: updated.recipients, scheduleTime: updated.scheduleTime },
    });

    res.json({ success: true, settings: updated });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({ error: 'Failed to update email settings' });
  }
});

// 4.2 Mail Audit List: GET /api/mail/audit
router.get('/audit', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await prisma.emailDeliveryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const auditList = logs.map((log) => ({
      id: log.id,
      date: format(log.createdAt, 'yyyy-MM-dd'),
      time: format(log.createdAt, 'HH:mm:ss'),
      status: log.status === 'SENT' || log.status === 'SIMULATED' ? 'Success' : 'Failed',
      rawStatus: log.status,
      recipients: log.recipient,
      subject: log.subject,
      type: log.type,
      error: log.error || null,
      sentAt: log.sentAt,
      createdAt: log.createdAt,
    }));

    res.json({ success: true, logs: auditList });
  } catch (error) {
    console.error('Error fetching mail audit list:', error);
    res.status(500).json({ error: 'Failed to retrieve mail audit logs' });
  }
});

// 4.3 Manual Report Generation: POST /api/mail/generate-report
router.post('/generate-report', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Both From Date and To Date are required.' });
      return;
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Invalid date format for From Date or To Date.' });
      return;
    }

    if (end < start) {
      res.status(400).json({ error: 'To Date must be on or after From Date.' });
      return;
    }

    const report = await getCustomReport({ startDate: start, endDate: end });

    res.json({
      success: true,
      report: {
        startDate,
        endDate,
        totalTrackedSeconds: report.totalTrackedSeconds,
        totalHoursFormatted: formatDurationHours(report.totalTrackedSeconds),
        regularSeconds: report.regularSeconds,
        outsideHoursSeconds: report.outsideHoursSeconds,
        totalEntriesCount: report.totalEntriesCount,
        projectBreakdown: report.projectBreakdown,
        dailyBreakdown: report.dailyBreakdown,
      },
    });
  } catch (error) {
    console.error('Error generating manual report:', error);
    res.status(500).json({ error: 'Failed to generate report for selected date range.' });
  }
});

// 4.3 Send Manual Report via SMTP: POST /api/mail/send-report
router.post('/send-report', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, recipients } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Both From Date and To Date are required.' });
      return;
    }

    const result = await sendCustomDateRangeReportEmail({
      startDate,
      endDate,
      recipients,
    });

    if (result.results && result.results.length > 0) {
      await logAuditEvent({
        userId: req.user!.id,
        action: 'MANUAL_REPORT_EMAILED',
        targetEntity: 'EmailDeliveryLog',
        targetId: `${startDate}_to_${endDate}`,
        mandatoryReason: 'Admin dispatched custom date range report email via SMTP',
        details: { startDate, endDate, recipients: result.recipients?.join(', '), status: result.success ? 'SENT' : 'FAILED' },
      });

      res.json({
        success: result.success,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        message: result.success
          ? `Manual report for ${startDate} to ${endDate} successfully sent to ${result.recipients?.join(', ')}.`
          : `Dispatch attempted for ${result.recipients?.join(', ')}. Result recorded in audit log (${result.error || 'SMTP delivery failed'}).`,
        result,
      });
      return;
    }

    res.status(400).json({ error: result.error || 'Failed to dispatch report to recipients.' });
  } catch (error) {
    console.error('Error dispatching manual report:', error);
    res.status(500).json({ error: 'Failed to dispatch manual report email.' });
  }
});

// Send scheduled report immediately: POST /api/mail/send-now
router.post('/send-now', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { scheduleType = 'DAILY', recipients } = req.body;

    let result;
    if (scheduleType === 'WEEKLY') {
      result = await sendWeeklySummaryEmail(recipients);
    } else if (scheduleType === 'MONTHLY') {
      result = await sendMonthlySummaryEmail(recipients);
    } else {
      result = await sendEodReportEmail(recipients);
    }

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SCHEDULED_REPORT_TRIGGERED',
      targetEntity: 'EmailDeliveryLog',
      targetId: scheduleType,
      mandatoryReason: `Admin triggered ${scheduleType} report dispatch now`,
      details: { scheduleType, recipients },
    });

    res.json({
      success: true,
      message: `${scheduleType} report dispatch triggered successfully.`,
      result,
    });
  } catch (error) {
    console.error('Error triggering report dispatch:', error);
    res.status(500).json({ error: 'Failed to dispatch report email.' });
  }
});

export default router;
