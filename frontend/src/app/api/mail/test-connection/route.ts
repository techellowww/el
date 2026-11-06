import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { testSmtpConnection } from '@/lib/server/emailService';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const body = await req.json().catch(() => ({}));
    const { host, port, user: smtpUser, pass } = body || {};

    const result = await testSmtpConnection({ host, port, user: smtpUser, pass });
    if (result.success) {
      return NextResponse.json({ success: true, message: result.message });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          guidance: result.guidance,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error testing SMTP connection:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error while testing SMTP connection.' },
      { status: 500 }
    );
  }
}
