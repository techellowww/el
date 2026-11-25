import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';
import { prisma } from '@/lib/prisma';
import { DEFAULT_BACKUP_DRIVE_PATH } from '@/lib/server/screenshotBackupService';

function parseBackupNotice(rawNotice?: string | null) {
  const defaultNotice = 'Screenshots are periodically captured for activity verification during active project timers.';
  let autoBackupEnabled = true;
  let backupDrivePath = DEFAULT_BACKUP_DRIVE_PATH;
  let notice = defaultNotice;

  if (rawNotice && rawNotice.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawNotice);
      if (typeof parsed.autoBackupEnabled === 'boolean') {
        autoBackupEnabled = parsed.autoBackupEnabled;
      }
      if (parsed.backupDrivePath && typeof parsed.backupDrivePath === 'string') {
        backupDrivePath = parsed.backupDrivePath;
      }
      if (parsed.notice && typeof parsed.notice === 'string') {
        notice = parsed.notice;
      }
    } catch {}
  } else if (rawNotice) {
    notice = rawNotice;
  }

  return { notice, autoBackupEnabled, backupDrivePath };
}

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  try {
    const user = request ? await getAuthUser(request) : null;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const rawSettings = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    const parsed = parseBackupNotice(rawSettings?.consentNotice);

    const settings = {
      enabled: rawSettings?.enabled ?? false,
      intervalMinutes: rawSettings?.intervalMinutes ?? 60,
      retentionDays: rawSettings?.retentionDays ?? 30,
      requireConsent: rawSettings?.requireConsent ?? true,
      consentNotice: parsed.notice,
      autoBackupEnabled: parsed.autoBackupEnabled,
      backupDrivePath: parsed.backupDrivePath,
    };

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error fetching screenshot settings:', error);
    return NextResponse.json({ error: 'Failed to retrieve screenshot settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      enabled,
      intervalMinutes,
      retentionDays,
      requireConsent,
      consentNotice,
      autoBackupEnabled,
      backupDrivePath,
    } = body;

    const parsedInterval = Math.max(1, parseInt(intervalMinutes, 10) || 60);
    const parsedRetention = Math.max(1, parseInt(retentionDays, 10) || 30);
    const resolvedDrivePath = (backupDrivePath || DEFAULT_BACKUP_DRIVE_PATH).trim();

    const encodedConsent = JSON.stringify({
      notice: consentNotice || 'Screenshots are periodically captured for activity verification during active project timers.',
      autoBackupEnabled: autoBackupEnabled !== false,
      backupDrivePath: resolvedDrivePath,
    });

    const updated = await prisma.screenshotSetting.upsert({
      where: { id: 'default-screenshot-setting' },
      update: {
        enabled: Boolean(enabled),
        intervalMinutes: parsedInterval,
        retentionDays: parsedRetention,
        requireConsent: requireConsent ?? true,
        consentNotice: encodedConsent,
      },
      create: {
        id: 'default-screenshot-setting',
        enabled: Boolean(enabled),
        intervalMinutes: parsedInterval,
        retentionDays: parsedRetention,
        requireConsent: requireConsent ?? true,
        consentNotice: encodedConsent,
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: 'SCREENSHOT_SETTINGS_UPDATED',
      targetEntity: 'ScreenshotSetting',
      targetId: 'default-screenshot-setting',
      mandatoryReason: 'Admin updated screenshot capture, retention, and Drive backup configuration',
      details: {
        enabled: updated.enabled,
        intervalMinutes: updated.intervalMinutes,
        retentionDays: updated.retentionDays,
        autoBackupEnabled: autoBackupEnabled !== false,
        backupDrivePath: resolvedDrivePath,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        enabled: updated.enabled,
        intervalMinutes: updated.intervalMinutes,
        retentionDays: updated.retentionDays,
        requireConsent: updated.requireConsent,
        consentNotice: consentNotice || 'Screenshots are periodically captured for activity verification during active project timers.',
        autoBackupEnabled: autoBackupEnabled !== false,
        backupDrivePath: resolvedDrivePath,
      },
    });
  } catch (error) {
    console.error('Error updating screenshot settings:', error);
    return NextResponse.json({ error: 'Failed to update screenshot settings' }, { status: 500 });
  }
}
