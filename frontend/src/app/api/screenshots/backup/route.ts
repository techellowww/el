import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import {
  backupScreenshotsToDrive,
  getScreenshotBackupConfig,
  DEFAULT_BACKUP_DRIVE_PATH,
} from '@/lib/server/screenshotBackupService';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const config = await getScreenshotBackupConfig();
    return NextResponse.json({
      config: {
        autoBackupEnabled: config.autoBackupEnabled,
        backupDrivePath: config.backupDrivePath || DEFAULT_BACKUP_DRIVE_PATH,
        retentionDays: config.retentionDays,
      },
    });
  } catch (error) {
    console.error('Error fetching backup config:', error);
    return NextResponse.json({ error: 'Failed to retrieve backup config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { ids, projectId, startDate, endDate, destinationPath } = body;

    const result = await backupScreenshotsToDrive({
      ids: Array.isArray(ids) ? ids : undefined,
      projectId: projectId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      destinationPath: destinationPath || undefined,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      backedUpCount: result.backedUpCount,
      totalBytes: result.totalBytes,
      destinationPath: result.destinationPath,
      projectFolders: result.projectFolders,
      files: result.files,
      message: result.message,
      isServerless: result.isServerless,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (error: any) {
    console.error('Error executing screenshot backup:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to execute screenshot backup to Drive' },
      { status: 500 }
    );
  }
}

