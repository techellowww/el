import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { cleanupOldScreenshots } from '@/lib/server/screenshotGenerator';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const result = await cleanupOldScreenshots();
    const backupMsg = result.backedUpCount > 0 ? ` (Auto-backed up ${result.backedUpCount} screenshot(s) to Drive: ${result.backupDrivePath})` : '';
    return NextResponse.json({
      success: true,
      message: `Retention cleanup completed. Purged ${result.deletedCount} screenshots older than ${result.retentionDays} days.${backupMsg}`,
      deletedCount: result.deletedCount,
      backedUpCount: result.backedUpCount,
      backupDrivePath: result.backupDrivePath,
      retentionDays: result.retentionDays,
      cutoffDate: result.cutoffDate,
    });
  } catch (error) {
    console.error('Error running screenshot cleanup:', error);
    return NextResponse.json({ error: 'Failed to run screenshot cleanup' }, { status: 500 });
  }
}
