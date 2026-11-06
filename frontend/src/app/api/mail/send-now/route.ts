import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { sendCustomDateRangeReportEmail } from '@/lib/server/emailService';
import { logAuditEvent } from '@/lib/server/audit';

// POST /api/mail/send-now — Immediately dispatch today's report email
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const today = new Date().toISOString().split('T')[0];
    const body = await req.json().catch(() => ({}));
    const startDate = body?.startDate || today;
    const endDate = body?.endDate || today;
    const recipients = body?.recipients || undefined;

    const result = await sendCustomDateRangeReportEmail({ startDate, endDate, recipients });

    await logAuditEvent({
      userId: user!.id,
      action: 'MANUAL_REPORT_EMAILED',
      targetEntity: 'EmailDeliveryLog',
      targetId: `${startDate}_to_${endDate}`,
      mandatoryReason: 'Admin dispatched send-now report from Mail module',
      details: {
        startDate,
        endDate,
        recipients: result.recipients?.join(', '),
        status: result.success ? 'SENT' : 'FAILED',
      },
    });

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      recipients: result.recipients,
      message: result.success
        ? `Report for ${startDate} sent to ${result.recipients?.join(', ')}.`
        : `Report dispatch failed. ${result.error || ''}`,
    });
  } catch (error) {
    console.error('Error in send-now:', error);
    return NextResponse.json({ error: 'Failed to send report email.' }, { status: 500 });
  }
}
