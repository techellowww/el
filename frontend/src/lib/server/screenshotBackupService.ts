import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from './audit';

export interface BackupOptions {
  ids?: string[];
  projectId?: string;
  startDate?: string;
  endDate?: string;
  destinationPath?: string;
  userId?: string;
}

export interface BackupResult {
  success: boolean;
  backedUpCount: number;
  totalBytes: number;
  destinationPath: string;
  projectFolders: string[];
  files: Array<{
    id: string;
    fileName: string;
    filePath: string;
    projectName: string;
    employeeName: string;
    capturedAt: string;
    fileSize: number;
  }>;
  message?: string;
}

export const DEFAULT_BACKUP_DRIVE_PATH = 'D:/el/backups/screenshots';

/**
 * Sanitizes folder and file names to be safe across Windows, Linux, and macOS filesystems.
 */
export function sanitizeFileSystemName(name: string): string {
  if (!name) return 'General';
  return name
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/**
 * Decodes a base64 Data URL or base64 string to a Buffer and file extension.
 */
export function decodeImageToBuffer(imageUrl: string): { buffer: Buffer; extension: string } {
  if (!imageUrl) {
    return { buffer: Buffer.alloc(0), extension: 'jpg' };
  }

  const match = imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (match) {
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    return { buffer: Buffer.from(match[2], 'base64'), extension: ext };
  }

  // If it's pure base64 without data URI prefix
  try {
    return { buffer: Buffer.from(imageUrl, 'base64'), extension: 'jpg' };
  } catch {
    return { buffer: Buffer.alloc(0), extension: 'jpg' };
  }
}

/**
 * Retrieves the current screenshot backup settings from database.
 */
export async function getScreenshotBackupConfig(): Promise<{
  autoBackupEnabled: boolean;
  backupDrivePath: string;
  retentionDays: number;
}> {
  try {
    const setting = await prisma.screenshotSetting.findUnique({
      where: { id: 'default-screenshot-setting' },
    });

    let autoBackupEnabled = true;
    let backupDrivePath = DEFAULT_BACKUP_DRIVE_PATH;
    const retentionDays = setting?.retentionDays ?? 30;

    if (setting?.consentNotice && setting.consentNotice.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(setting.consentNotice);
        if (typeof parsed.autoBackupEnabled === 'boolean') {
          autoBackupEnabled = parsed.autoBackupEnabled;
        }
        if (parsed.backupDrivePath && typeof parsed.backupDrivePath === 'string') {
          backupDrivePath = parsed.backupDrivePath;
        }
      } catch {}
    }

    return { autoBackupEnabled, backupDrivePath, retentionDays };
  } catch (err) {
    console.error('Error fetching screenshot backup config:', err);
    return {
      autoBackupEnabled: true,
      backupDrivePath: DEFAULT_BACKUP_DRIVE_PATH,
      retentionDays: 30,
    };
  }
}

/**
 * Core engine: Backs up screenshots to the designated drive location, organized cleanly by Project and Date.
 */
export async function backupScreenshotsToDrive(options: BackupOptions): Promise<BackupResult> {
  const config = await getScreenshotBackupConfig();
  const rawDestPath = (options.destinationPath || config.backupDrivePath || DEFAULT_BACKUP_DRIVE_PATH).trim();
  const destinationPath = path.resolve(rawDestPath);

  // Build where clause
  const andConditions: any[] = [
    { imageUrl: { not: '' } },
    {
      OR: [
        { metadata: null },
        { metadata: { not: { contains: '"isDeleted":true' } } },
      ],
    },
  ];

  if (options.ids && options.ids.length > 0) {
    andConditions.push({ id: { in: options.ids } });
  }

  if (options.projectId && options.projectId !== 'ALL') {
    andConditions.push({
      timeEntry: {
        projectId: options.projectId,
      },
    });
  }

  if (options.startDate || options.endDate) {
    const capturedAtFilter: Record<string, Date> = {};
    if (options.startDate) {
      const [year, month, day] = options.startDate.split('-').map(Number);
      const start = !isNaN(year) && !isNaN(month) && !isNaN(day)
        ? new Date(year, month - 1, day, 0, 0, 0, 0)
        : new Date(options.startDate);
      capturedAtFilter.gte = start;
    }
    if (options.endDate) {
      const [year, month, day] = options.endDate.split('-').map(Number);
      const end = !isNaN(year) && !isNaN(month) && !isNaN(day)
        ? new Date(year, month - 1, day, 23, 59, 59, 999)
        : new Date(options.endDate);
      capturedAtFilter.lte = end;
    }
    andConditions.push({ capturedAt: capturedAtFilter });
  }

  const screenshots = await prisma.screenshotRecord.findMany({
    where: { AND: andConditions },
    include: {
      user: { select: { id: true, name: true, email: true } },
      timeEntry: {
        select: {
          id: true,
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true, company: true } },
        },
      },
    },
    orderBy: { capturedAt: 'asc' },
  });

  if (screenshots.length === 0) {
    return {
      success: true,
      backedUpCount: 0,
      totalBytes: 0,
      destinationPath,
      projectFolders: [],
      files: [],
      message: 'No matching screenshots found for backup criteria.',
    };
  }

  // Ensure root destination folder exists
  fs.mkdirSync(destinationPath, { recursive: true });

  const projectFoldersSet = new Set<string>();
  const backedUpFiles: BackupResult['files'] = [];
  const projectManifestsMap = new Map<string, any[]>();
  let totalBytes = 0;

  for (const s of screenshots) {
    const { buffer, extension } = decodeImageToBuffer(s.imageUrl);
    if (!buffer || buffer.length === 0) continue;

    const projectName = s.timeEntry?.project?.name || 'General Workstation';
    const safeProjectFolderName = sanitizeFileSystemName(projectName);

    const captureDate = new Date(s.capturedAt);
    const dateFolderName = `${captureDate.getFullYear()}-${String(captureDate.getMonth() + 1).padStart(2, '0')}-${String(captureDate.getDate()).padStart(2, '0')}`;

    const projectFolderPath = path.join(/*turbopackIgnore: true*/ destinationPath, safeProjectFolderName);
    const targetDateFolderPath = path.join(/*turbopackIgnore: true*/ projectFolderPath, dateFolderName);

    fs.mkdirSync(targetDateFolderPath, { recursive: true });
    projectFoldersSet.add(safeProjectFolderName);

    // Format file name: EmployeeName_HH-MM-SS_interval_id.jpg
    const safeEmpName = sanitizeFileSystemName(s.user.name || 'Staff');
    const timeStr = `${String(captureDate.getHours()).padStart(2, '0')}-${String(captureDate.getMinutes()).padStart(2, '0')}-${String(captureDate.getSeconds()).padStart(2, '0')}`;
    const shortId = s.id.slice(0, 8);
    const fileName = `${safeEmpName}_${timeStr}_${shortId}.${extension}`;
    const filePath = path.join(/*turbopackIgnore: true*/ targetDateFolderPath, fileName);

    fs.writeFileSync(filePath, buffer);
    totalBytes += buffer.length;

    const fileMeta = {
      id: s.id,
      fileName,
      filePath,
      projectName,
      employeeName: s.user.name,
      employeeId: s.user.email || s.user.id,
      capturedAt: s.capturedAt.toISOString(),
      fileSize: buffer.length,
    };

    backedUpFiles.push(fileMeta);

    // Group for project manifest
    if (!projectManifestsMap.has(safeProjectFolderName)) {
      projectManifestsMap.set(safeProjectFolderName, []);
    }
    projectManifestsMap.get(safeProjectFolderName)!.push(fileMeta);
  }

  // Write a manifest.json inside each project folder
  for (const [projectFolder, filesList] of projectManifestsMap.entries()) {
    try {
      const manifestPath = path.join(destinationPath, projectFolder, 'manifest.json');
      let existingManifest: any = { files: [] };
      if (fs.existsSync(manifestPath)) {
        try {
          existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch {}
      }

      const mergedFilesMap = new Map<string, any>();
      (existingManifest.files || []).forEach((f: any) => mergedFilesMap.set(f.id, f));
      filesList.forEach((f) => mergedFilesMap.set(f.id, f));

      const updatedManifest = {
        projectName: filesList[0]?.projectName || projectFolder,
        lastBackupAt: new Date().toISOString(),
        backupRoot: destinationPath,
        totalCaptures: mergedFilesMap.size,
        files: Array.from(mergedFilesMap.values()),
      };

      fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[ScreenshotBackup] Could not write manifest for ${projectFolder}:`, err);
    }
  }

  // Write top-level backup_index.json
  try {
    const indexPath = path.join(destinationPath, 'backup_index.json');
    const indexData = {
      lastBackupAt: new Date().toISOString(),
      driveLocation: destinationPath,
      totalScreenshots: backedUpFiles.length,
      totalBytes,
      projects: Array.from(projectFoldersSet),
    };
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
  } catch {}

  // Log audit event if user is provided
  if (options.userId) {
    try {
      await logAuditEvent({
        userId: options.userId,
        action: 'SCREENSHOT_BACKUP_EXECUTED',
        targetEntity: 'ScreenshotRecord',
        targetId: options.projectId || 'BULK_SELECTION',
        mandatoryReason: 'Administrator executed screenshot backup to Drive',
        details: {
          backedUpCount: backedUpFiles.length,
          totalBytes,
          destinationPath,
          projects: Array.from(projectFoldersSet),
        },
      });
    } catch {}
  }

  return {
    success: true,
    backedUpCount: backedUpFiles.length,
    totalBytes,
    destinationPath,
    projectFolders: Array.from(projectFoldersSet),
    files: backedUpFiles,
    message: `Successfully backed up ${backedUpFiles.length} screenshot(s) across ${projectFoldersSet.size} project(s) into Drive: ${destinationPath}`,
  };
}

/**
 * Retrieves the current Drive backup configuration for an account.
 */
export async function getBackupConfiguration(accountId?: string): Promise<{
  autoBackupEnabled: boolean;
  backupDrivePath: string;
}> {
  try {
    const setting = await prisma.screenshotSetting.findFirst({
      where: accountId ? { accountId } : undefined,
    });

    if (!setting) {
      return {
        autoBackupEnabled: true,
        backupDrivePath: DEFAULT_BACKUP_DRIVE_PATH,
      };
    }

    let autoBackupEnabled = true;
    let backupDrivePath = DEFAULT_BACKUP_DRIVE_PATH;

    if (setting.consentNotice) {
      try {
        const parsed = JSON.parse(setting.consentNotice);
        if (typeof parsed.autoBackupEnabled === 'boolean') {
          autoBackupEnabled = parsed.autoBackupEnabled;
        }
        if (typeof parsed.backupDrivePath === 'string' && parsed.backupDrivePath.trim()) {
          backupDrivePath = parsed.backupDrivePath.trim();
        }
      } catch {}
    }

    return { autoBackupEnabled, backupDrivePath };
  } catch (err) {
    console.error('Error fetching backup configuration:', err);
    return {
      autoBackupEnabled: true,
      backupDrivePath: DEFAULT_BACKUP_DRIVE_PATH,
    };
  }
}
