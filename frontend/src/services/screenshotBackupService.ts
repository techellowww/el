import fs from 'fs';
import path from 'path';
import os from 'os';
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
  isServerless?: boolean;
  fallbackUsed?: boolean;
}

export const DEFAULT_BACKUP_DRIVE_PATH = 'D:/el/backups/screenshots';

/**
 * Detects whether the current runtime is a serverless or read-only container environment (e.g. Vercel, AWS Lambda).
 */
export function isServerlessEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    (typeof process.cwd === 'function' && process.cwd().startsWith('/var/task'))
  );
}

/**
 * Safely resolves destination backup paths across Windows, Linux, macOS, and serverless environments.
 * Prevents Linux/Vercel from concatenating Windows drive letters into invalid read-only paths (e.g. /var/task/frontend/D:/...).
 */
export function resolveSafeBackupPath(rawInputPath?: string): { resolvedPath: string; isServerless: boolean } {
  const isServerless = isServerlessEnvironment();
  const input = (rawInputPath || '').trim() || DEFAULT_BACKUP_DRIVE_PATH;

  // Check if input has a Windows drive pattern like "D:/" or "C:\"
  const windowsDriveMatch = input.match(/^[a-zA-Z]:[/\\]?(.*)$/);

  if (isServerless) {
    // In serverless / AWS Lambda / Vercel, the application root (/var/task) is strictly read-only.
    // The only guaranteed writable directory is os.tmpdir() (e.g. /tmp).
    const relativePart = windowsDriveMatch ? windowsDriveMatch[1] : input.replace(/^[/\\]+/, '');
    const cleanRelative = relativePart ? path.normalize(relativePart).replace(/^(\.\.[/\\])+/, '') : 'backups/screenshots';
    const target = path.join(os.tmpdir(), cleanRelative);
    return { resolvedPath: target, isServerless: true };
  }

  if (process.platform === 'win32') {
    // On Windows, path.resolve handles drive letters (e.g. "D:/el/backups/screenshots/summafolder")
    return { resolvedPath: path.resolve(input), isServerless: false };
  }

  // On POSIX (Linux/macOS) non-serverless:
  if (windowsDriveMatch) {
    // Strip drive letter so it does not result in /path/D:...
    const relativePart = windowsDriveMatch[1].replace(/^[/\\]+/, '');
    const cleanRelative = relativePart ? path.normalize(relativePart).replace(/^(\.\.[/\\])+/, '') : 'backups/screenshots';
    return { resolvedPath: path.resolve(process.cwd(), cleanRelative), isServerless: false };
  }

  return { resolvedPath: path.resolve(input), isServerless: false };
}

/**
 * Ensures a directory exists; creates the folder recursively if it does not exist.
 * If the target path cannot be created (e.g. read-only filesystem, invalid drive, permissions),
 * safely falls back to a guaranteed writable directory in os.tmpdir().
 */
export function ensureDirectory(dirPath: string): { actualPath: string; fallbackUsed: boolean } {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return { actualPath: dirPath, fallbackUsed: false };
  } catch (err: any) {
    console.warn(`[ScreenshotBackup] Failed to create folder at "${dirPath}": ${err?.message || err}. Falling back to writable temp directory.`);
    try {
      const fallbackDir = path.join(os.tmpdir(), 'backups', 'screenshots', sanitizeFileSystemName(path.basename(dirPath) || 'general'));
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      return { actualPath: fallbackDir, fallbackUsed: true };
    } catch (fallbackErr: any) {
      console.error(`[ScreenshotBackup] Critical: Failed to create fallback directory in temp:`, fallbackErr);
      throw new Error(`Unable to create backup directory "${dirPath}" or temporary storage: ${fallbackErr?.message || err?.message}`);
    }
  }
}

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

  const match = imageUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s);
  if (match) {
    const sub = match[1].toLowerCase();
    const ext = sub.includes('svg') ? 'svg' : (sub === 'jpeg' || sub === 'jpg' ? 'jpg' : (sub === 'png' ? 'png' : (sub === 'webp' ? 'webp' : 'jpg')));
    return { buffer: Buffer.from(match[2], 'base64'), extension: ext };
  }

  if (imageUrl.startsWith('data:image/svg+xml')) {
    const commaIndex = imageUrl.indexOf(',');
    const rawSvg = commaIndex !== -1 ? decodeURIComponent(imageUrl.slice(commaIndex + 1)) : imageUrl;
    return { buffer: Buffer.from(rawSvg, 'utf8'), extension: 'svg' };
  }

  if (imageUrl.trim().startsWith('<svg')) {
    return { buffer: Buffer.from(imageUrl, 'utf8'), extension: 'svg' };
  }

  // If it's pure base64 without data URI prefix or general base64
  try {
    const cleanBase64 = imageUrl.replace(/^data:[^;]+;base64,/, '').trim();
    return { buffer: Buffer.from(cleanBase64, 'base64'), extension: 'jpg' };
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
  const { resolvedPath, isServerless } = resolveSafeBackupPath(rawDestPath);

  // Ensure root destination folder exists (automatically creates one if it does not exist)
  const { actualPath: destinationPath, fallbackUsed } = ensureDirectory(resolvedPath);

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
      message: 'No matching screenshots found for backup criteria. Target directory created and ready.',
      isServerless,
      fallbackUsed,
    };
  }

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

    // Ensure subdirectories exist for each project & date
    if (!fs.existsSync(targetDateFolderPath)) {
      try {
        fs.mkdirSync(targetDateFolderPath, { recursive: true });
      } catch (mkdirErr: any) {
        console.warn(`[ScreenshotBackup] Failed to create folder ${targetDateFolderPath}:`, mkdirErr);
      }
    }
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
      const manifestDir = path.join(destinationPath, projectFolder);
      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }
      const manifestPath = path.join(manifestDir, 'manifest.json');
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
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath, { recursive: true });
    }
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

  const envNotice = isServerless
    ? ' (Serverless cloud storage: to download directly to your local PC, use "Download ZIP")'
    : fallbackUsed
    ? ` (Folder redirected to writable location: ${destinationPath})`
    : '';

  return {
    success: true,
    backedUpCount: backedUpFiles.length,
    totalBytes,
    destinationPath,
    projectFolders: Array.from(projectFoldersSet),
    files: backedUpFiles,
    message: `Successfully backed up ${backedUpFiles.length} screenshot(s) across ${projectFoldersSet.size} project(s) into Drive: ${destinationPath}${envNotice}`,
    isServerless,
    fallbackUsed,
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
