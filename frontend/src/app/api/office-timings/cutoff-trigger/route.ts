import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { enforceGlobalOfficeCutoffs } from '@/lib/server/timerEngine';

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const result = await enforceGlobalOfficeCutoffs();
    return NextResponse.json({
      success: true,
      message: `Office cutoff evaluation complete. Auto-stopped ${result.processed} active timers exceeding closing time.`,
      processed: result.processed,
    });
  } catch (error) {
    console.error('Error enforcing cutoff:', error);
    return NextResponse.json({ error: 'Failed to trigger office closing cutoff.' }, { status: 500 });
  }
}
