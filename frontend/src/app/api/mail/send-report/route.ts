import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';
import { sendCustomDateRangeReportEmail } from '@/lib/server/emailService';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const body = await req.json();
    const { startDate, endDate, recipients } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Both From Date and To Date are required.' }, { status: 400 });
    }

    const result = await sendCustomDateRangeReportEmail({
      startDate,
      endDate,
      recipients,
    });

    if (result.results && result.results.length > 0) {
      await logAuditEvent({
        userId: user!.id,
        action: 'MANUAL_REPORT_EMAILED',
        targetEntity: 'EmailDeliveryLog',
        targetId: `${startDate}_to_${endDate}`,
        mandatoryReason: 'Admin dispatched custom date range report email via SMTP',
        details: { startDate, endDate, recipients: result.recipients?.join(', '), status: result.success ? 'SENT' : 'FAILED' },
      });

      return NextResponse.json({
        success: result.success,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        message: result.success
          ? `Manual report for ${startDate} to ${endDate} successfully sent to ${result.recipients?.join(', ')}.`
          : `Dispatch attempted for ${result.recipients?.join(', ')}. Result recorded in audit log (${result.error || 'SMTP delivery failed'}).`,
        result,
      });
    }

    return NextResponse.json({ error: result.error || 'Failed to dispatch report to recipients.' }, { status: 400 });
  } catch (error) {
    console.error('Error dispatching manual report:', error);
    return NextResponse.json({ error: 'Failed to dispatch manual report email.' }, { status: 500 });
  }
}
