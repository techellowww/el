import { NextRequest, NextResponse } from 'next/server';
import { processScheduledEmailDispatch } from '@/lib/server/emailService';

// GET or POST /api/mail/dispatch-check — Check scheduled report email conditions and dispatch if due
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    const result = await processScheduledEmailDispatch({ force });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[API /api/mail/dispatch-check error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Dispatch check failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const result = await processScheduledEmailDispatch({ force });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[API /api/mail/dispatch-check error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Dispatch check failed' }, { status: 500 });
  }
}

