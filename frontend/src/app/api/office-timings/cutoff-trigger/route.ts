import { NextResponse } from 'next/server';
import { enforceGlobalOfficeCutoffs } from '@/lib/server/timerEngine';

export async function POST() {
  try {
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
