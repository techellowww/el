import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';
import { enforceGlobalOfficeCutoffs } from '../lib/timerEngine';
import {
  sendDailySummaryEmail,
  sendWeeklySummaryEmail,
  sendMonthlySummaryEmail,
  sendCustomDateRangeReportEmail,
  sendEodReportEmail,
  parseRecipientEmails,
} from '../lib/emailService';
import { cleanupOldScreenshots } from '../lib/screenshotGenerator';
import { getCustomReport, formatDurationHours } from '../lib/reportEngine';
import { format } from 'date-fns';

const router = Router();

// Office Hours & Office Timings
const getOfficeScheduleHandler = async (req: Request, res: Response) => {
  try {
    const schedule = await prisma.officeSchedule.findUnique({
      where: { id: 'default-schedule' },
    });
    res.json({ schedule });
  } catch (error) {
    console.error('Error fetching office schedule:', error);
    res.status(500).json({ error: 'Failed to retrieve office schedule' });
  }
};

const putOfficeScheduleHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { openingTime, closingTime, workingDays, timezone, allowOutsideHours, autoCutoffEnabled, dayTimings } = req.body;

    const serializedDayTimings = dayTimings
      ? (typeof dayTimings === 'string' ? dayTimings : JSON.stringify(dayTimings))
      : undefined;

    const updated = await prisma.officeSchedule.upsert({
      where: { id: 'default-schedule' },
      update: {
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: req.user!.id,
      },
      create: {
        id: 'default-schedule',
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: req.user!.id,
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'OFFICE_SCHEDULE_UPDATED',
      targetEntity: 'OfficeSchedule',
      targetId: 'default-schedule',
      mandatoryReason: 'Admin updated office timings and auto-cutoff configuration',
      details: { openingTime, closingTime, workingDays, timezone, autoCutoffEnabled, dayTimings: serializedDayTimings },
    });

    res.json({ success: true, schedule: updated });
  } catch (error) {
    console.error('Error updating office schedule:', error);
    res.status(500).json({ error: 'Failed to update office schedule' });
  }
};

router.get('/office-hours', getOfficeScheduleHandler);
router.put('/office-hours', authenticate, putOfficeScheduleHandler);
router.get('/office-timings', getOfficeScheduleHandler);
router.put('/office-timings', authenticate, putOfficeScheduleHandler);

router.post('/office-hours/cutoff-trigger', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await enforceGlobalOfficeCutoffs();
    res.json({
      success: true,
      message: `Office cutoff evaluation complete. Auto-stopped ${result.processed} active timers exceeding closing time.`,
      processed: result.processed,
    });
  } catch (error) {
    console.error('Error enforcing cutoff:', error);
    res.status(500).json({ error: 'Failed to trigger office closing cutoff.' });
  }
});

// ==========================================
// MAIL MODULE ENDPOINTS
// ==========================================

const getEmailSettingsHandler = async (req: AuthRequest, res: Response) => {
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
};

const putEmailSettingsHandler = async (req: AuthRequest, res: Response) => {
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
};

router.get('/email', authenticate, requireAdmin, getEmailSettingsHandler);
router.put('/email', authenticate, requireAdmin, putEmailSettingsHandler);
router.get('/mail/settings', authenticate, requireAdmin, getEmailSettingsHandler);
router.put('/mail/settings', authenticate, requireAdmin, putEmailSettingsHandler);

// 4.2 Mail Audit List
router.get('/mail/audit', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
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

// 4.3 Manual Report Generation
router.post('/mail/generate-report', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
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

// 4.3 Send Manual Report via SMTP
router.post('/mail/send-report', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
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

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to dispatch report to recipients.' });
      return;
    }

    await logAuditEvent({
      userId: req.user!.id,
      action: 'MANUAL_REPORT_EMAILED',
      targetEntity: 'EmailDeliveryLog',
      targetId: `${startDate}_to_${endDate}`,
      mandatoryReason: 'Administrator manually generated and dispatched report email',
      details: { startDate, endDate, recipients: result.recipients, sentCount: result.sentCount, failedCount: result.failedCount },
    });

    res.json({
      success: true,
      message: `Report successfully dispatched to ${result.sentCount} recipient(s).`,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      results: result.results,
    });
  } catch (error) {
    console.error('Error dispatching manual report:', error);
    res.status(500).json({ error: 'Failed to send report email.' });
  }
});

// 4.1 Trigger Scheduled Report Send Now
router.post('/mail/send-now', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
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

router.post('/email/test', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { type = 'eod', recipient, recipients } = req.body;
    const targetRecipients = recipients || recipient;

    let result;
    if (type === 'weekly') {
      result = await sendWeeklySummaryEmail(targetRecipients);
    } else if (type === 'monthly') {
      result = await sendMonthlySummaryEmail(targetRecipients);
    } else {
      result = await sendEodReportEmail(targetRecipients);
    }

    res.json({
      success: true,
      message: `Report (${type}) triggered successfully.`,
      result,
    });
  } catch (error) {
    console.error('Error triggering test email:', error);
    res.status(500).json({ error: 'Failed to send test email.' });
  }
});

router.post('/email/send-eod', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { recipients: customRecipients } = req.body;
    const result = await sendEodReportEmail(customRecipients);

    res.json({
      success: result.success,
      message: `EOD report dispatched to ${result.sentCount} recipient(s).`,
      result,
    });
  } catch (error) {
    console.error('Error dispatching EOD report:', error);
    res.status(500).json({ error: 'Failed to dispatch EOD report email.' });
  }
});

// ==========================================
// SCREENSHOT MODULE ENDPOINTS
// ==========================================

const getScreenshotSettingsHandler = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching screenshot settings:', error);
    res.status(500).json({ error: 'Failed to retrieve screenshot settings' });
  }
};

const putScreenshotSettingsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, intervalMinutes, retentionDays, requireConsent, consentNotice } = req.body;

    const parsedInterval = Math.max(1, parseInt(intervalMinutes, 10) || 60);
    const parsedRetention = Math.max(1, parseInt(retentionDays, 10) || 30);

    const updated = await prisma.screenshotSetting.upsert({
      where: { id: 'default-screenshot-setting' },
      update: {
        enabled: Boolean(enabled),
        intervalMinutes: parsedInterval,
        retentionDays: parsedRetention,
        requireConsent: requireConsent ?? true,
        consentNotice: consentNotice || 'Screenshots are periodically captured during active project timers for activity verification.',
      },
      create: {
        id: 'default-screenshot-setting',
        enabled: Boolean(enabled),
        intervalMinutes: parsedInterval,
        retentionDays: parsedRetention,
        requireConsent: requireConsent ?? true,
        consentNotice: consentNotice || 'Screenshots are periodically captured during active project timers for activity verification.',
      },
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SCREENSHOT_SETTINGS_UPDATED',
      targetEntity: 'ScreenshotSetting',
      targetId: 'default-screenshot-setting',
      mandatoryReason: 'Admin updated screenshot capture and retention settings',
      details: { enabled: updated.enabled, intervalMinutes: updated.intervalMinutes, retentionDays: updated.retentionDays },
    });

    res.json({ success: true, settings: updated });
  } catch (error) {
    console.error('Error updating screenshot settings:', error);
    res.status(500).json({ error: 'Failed to update screenshot settings' });
  }
};

router.get('/screenshots', getScreenshotSettingsHandler);
router.put('/screenshots', authenticate, requireAdmin, putScreenshotSettingsHandler);
router.get('/screenshots/settings', getScreenshotSettingsHandler);
router.put('/screenshots/settings', authenticate, requireAdmin, putScreenshotSettingsHandler);

// 5.4 Automatic Screenshot Deletion / Manual Cleanup Trigger
router.post('/screenshots/cleanup', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await cleanupOldScreenshots();
    res.json({
      success: true,
      message: `Retention cleanup completed. Deleted ${result.deletedCount} screenshots older than ${result.retentionDays} days.`,
      deletedCount: result.deletedCount,
      retentionDays: result.retentionDays,
      cutoffDate: result.cutoffDate,
    });
  } catch (error) {
    console.error('Error running screenshot cleanup:', error);
    res.status(500).json({ error: 'Failed to run screenshot cleanup' });
  }
});

// Audit Logs
router.get('/audit-logs', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const actionFilter = req.query.action as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const adminOnly = req.query.adminOnly !== 'false';
    const search = req.query.search as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

    const whereClause: Record<string, unknown> = {};

    // 1. Explicit list of admin record mutations (edits, deletes, updates, creates)
    const adminMutationActions = [
      'TIME_ENTRY_ADMIN_EDIT',
      'TIME_ENTRY_MANUAL_CREATE',
      'TIME_ENTRY_DELETED',
      'PROJECT_CREATED',
      'PROJECT_UPDATED',
      'PROJECT_DEACTIVATED',
      'PROJECT_CLOSED',
      'PROJECT_PERMANENTLY_DELETED',
      'EMPLOYEE_CREATED',
      'EMPLOYEE_UPDATED',
      'EMPLOYEE_DEACTIVATED',
      'EMPLOYEE_PERMANENTLY_DELETED',
      'CORRECTION_APPROVED',
      'CORRECTION_REJECTED',
      'OFFICE_SCHEDULE_UPDATED',
      'EMAIL_SETTINGS_UPDATED',
      'SCREENSHOT_SETTINGS_UPDATED',
      'SCREENSHOT_DELETED',
    ];

    // 2. Action Category Filter
    if (actionFilter === 'EDITS') {
      whereClause.action = {
        in: [
          'TIME_ENTRY_ADMIN_EDIT',
          'PROJECT_UPDATED',
          'EMPLOYEE_UPDATED',
          'OFFICE_SCHEDULE_UPDATED',
          'EMAIL_SETTINGS_UPDATED',
          'SCREENSHOT_SETTINGS_UPDATED',
        ],
      };
    } else if (actionFilter === 'DELETES') {
      whereClause.action = {
        in: [
          'TIME_ENTRY_DELETED',
          'PROJECT_PERMANENTLY_DELETED',
          'PROJECT_DEACTIVATED',
          'PROJECT_CLOSED',
          'EMPLOYEE_PERMANENTLY_DELETED',
          'EMPLOYEE_DEACTIVATED',
          'SCREENSHOT_DELETED',
        ],
      };
    } else if (actionFilter === 'CREATES') {
      whereClause.action = {
        in: ['TIME_ENTRY_MANUAL_CREATE', 'PROJECT_CREATED', 'EMPLOYEE_CREATED'],
      };
    } else if (actionFilter === 'CORRECTIONS') {
      whereClause.action = {
        in: ['CORRECTION_APPROVED', 'CORRECTION_REJECTED'],
      };
    } else if (actionFilter && actionFilter !== 'ALL' && actionFilter !== 'ALL_MUTATIONS') {
      whereClause.action = actionFilter;
    } else if (actionFilter === 'ALL') {
      whereClause.action = { notIn: ['SCREENSHOTS_VIEWED', 'SCREENSHOT_VIEWED'] };
    } else {
      // Default: ALL_MUTATIONS (only admin record modifications: edits, deletes, updates)
      whereClause.action = { in: adminMutationActions };
    }

    // 3. Admin Only Filtering
    if (adminOnly) {
      whereClause.user = {
        role: 'ADMIN',
      };
    }

    // 4. Date Range Filtering (From & To dates)
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate && startDate.trim()) {
        const s = startDate.includes('T')
          ? new Date(startDate)
          : new Date(`${startDate.trim()}T00:00:00.000`);
        if (!isNaN(s.getTime())) dateFilter.gte = s;
      }
      if (endDate && endDate.trim()) {
        const e = endDate.includes('T')
          ? new Date(endDate)
          : new Date(`${endDate.trim()}T23:59:59.999`);
        if (!isNaN(e.getTime())) dateFilter.lte = e;
      }
      if (Object.keys(dateFilter).length > 0) {
        whereClause.createdAt = dateFilter;
      }
    }

    // 5. Text Search Filter
    if (search && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { targetId: { contains: q, mode: 'insensitive' } },
        { mandatoryReason: { contains: q, mode: 'insensitive' } },
        { targetEntity: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { employeeId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, employeeId: true, role: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where: whereClause }),
    ]);

    res.json({
      logs,
      totalCount,
      limit,
      offset,
      hasMore: offset + logs.length < totalCount,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

export default router;
