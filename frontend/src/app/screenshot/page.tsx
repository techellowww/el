'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { formatLocalDate } from '@/lib/utils';
import { requestScreenStream, isScreenStreamActive, captureAndUploadActivityScreenshot } from '@/lib/screenshotCapture';
import { ConfirmModal } from '@/components/MiniModal';
import JSZip from 'jszip';
import {
  Camera,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Calendar,
  Filter,
  X,
  Download,
  ZoomIn,
  RefreshCw,
  User as UserIcon,
  ShieldCheck,
  Check,
  Sparkles,
  Info,
  Timer,
  PlayCircle,
  Square,
  AlertTriangle,
  Save,
  Loader2,
  HardDrive,
  FolderDown,
  FolderCheck,
  Archive,
  FolderSync,
} from 'lucide-react';

interface ScreenshotRecord {
  id: string;
  userId: string;
  timeEntryId: string | null;
  capturedAt: string;
  imageUrl: string;
  fileSize: number;
  metadata: string | null;
  user: {
    id: string;
    name: string;
    email?: string;
    employeeId?: string;
    department?: string | null;
  };
  timeEntry?: {
    id: string;
    duration?: number;
    durationSeconds?: number;
    project?: {
      id?: string;
      code?: string;
      name: string;
    } | null;
  } | null;
}

const getTodayDateString = () => formatLocalDate(new Date());

export default function ScreenshotModulePage() {
  const { user } = useAuthStore();
  const { activeTimer, elapsedSeconds } = useTimerStore();
  const isAdmin = user?.role === 'ADMIN';

  // 5.1 Enable/Disable (Default false)
  const [enabled, setEnabled] = useState(false);

  // 5.2 Capture Interval (Default 1 hour / 60 minutes)
  const [intervalMinutes, setIntervalMinutes] = useState(60);

  // 5.4 Retention Period (Default 1 month / 30 days)
  const [retentionDays, setRetentionDays] = useState(30);

  // Automated Drive Backup Settings
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [backupDrivePath, setBackupDrivePath] = useState('D:/el/backups/screenshots');

  // Backup Modal & Processing states
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [targetDrivePath, setTargetDrivePath] = useState('D:/el/backups/screenshots');
  const [backupScope, setBackupScope] = useState<'selected' | 'project'>('selected');

  // 5.3 Screenshot History & Filters (Defaults to current date)
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employeeId: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string }>>([]);
  const [filterUserId, setFilterUserId] = useState('ALL');
  const [filterProjectId, setFilterProjectId] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState(() => getTodayDateString());
  const [filterEndDate, setFilterEndDate] = useState(() => getTodayDateString());

  // Modals & previews
  const [previewScreenshot, setPreviewScreenshot] = useState<ScreenshotRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading & Action states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isCapturingNow, setIsCapturingNow] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadSettings();
      loadEmployees();
      loadProjects();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadScreenshots();
    }
  }, [filterUserId, filterProjectId, filterStartDate, filterEndDate, isAdmin]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/screenshots/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setEnabled(Boolean(data.settings.enabled));
          setIntervalMinutes(data.settings.intervalMinutes || 60);
          setRetentionDays(data.settings.retentionDays || 30);
          if (typeof data.settings.autoBackupEnabled === 'boolean') {
            setAutoBackupEnabled(data.settings.autoBackupEnabled);
          }
          if (data.settings.backupDrivePath) {
            setBackupDrivePath(data.settings.backupDrivePath);
            setTargetDrivePath(data.settings.backupDrivePath);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load screenshot settings:', err);
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        setEmployeesList(data.employees || []);
      }
    } catch {
      // ignore
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjectsList(data.projects || []);
      }
    } catch {
      // ignore
    }
  };

  const handleStartDateChange = (val: string) => {
    // From Date should not cross To Date
    if (filterEndDate && val && val > filterEndDate) {
      setFilterStartDate(filterEndDate);
    } else {
      setFilterStartDate(val);
    }
  };

  const handleEndDateChange = (val: string) => {
    // To Date should not be before From Date
    if (filterStartDate && val && val < filterStartDate) {
      setFilterEndDate(filterStartDate);
    } else {
      setFilterEndDate(val);
    }
  };

  const loadScreenshots = async () => {
    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUserId && filterUserId !== 'ALL') params.append('userId', filterUserId);
      if (filterProjectId && filterProjectId !== 'ALL') params.append('projectId', filterProjectId);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);

      const res = await fetch(`/api/screenshots?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setScreenshots(data.screenshots || []);
        setTotalCount(data.totalCount || (data.screenshots || []).length);
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error('Error fetching screenshots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 5.1 & 5.2 & 5.4 Save Configuration (including Drive Backup settings)
  const handleSaveSettings = async (override?: {
    enabled?: boolean;
    interval?: number;
    retention?: number;
    autoBackup?: boolean;
    drivePath?: string;
  }) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Administrator privileges are required to modify settings.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const payload = {
      enabled: override?.enabled !== undefined ? override.enabled : enabled,
      intervalMinutes: override?.interval !== undefined ? override.interval : intervalMinutes,
      retentionDays: override?.retention !== undefined ? override.retention : retentionDays,
      autoBackupEnabled: override?.autoBackup !== undefined ? override.autoBackup : autoBackupEnabled,
      backupDrivePath: override?.drivePath !== undefined ? override.drivePath : backupDrivePath,
    };

    try {
      const res = await fetch('/api/screenshots/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Screenshot configuration saved. Status: ${payload.enabled ? 'Active' : 'Disabled'}, Interval: ${payload.intervalMinutes}m, Retention: ${payload.retentionDays} days, Auto-Backup: ${payload.autoBackupEnabled ? 'Enabled' : 'Disabled'}.`,
        });
        setEnabled(payload.enabled);
        setIntervalMinutes(payload.intervalMinutes);
        setRetentionDays(payload.retentionDays);
        setAutoBackupEnabled(payload.autoBackupEnabled);
        setBackupDrivePath(payload.backupDrivePath);
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to update screenshot configuration.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error saving screenshot configuration.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenBackupModal = (scope: 'selected' | 'project') => {
    setBackupScope(scope);
    setTargetDrivePath(backupDrivePath || 'D:/el/backups/screenshots');
    setBackupModalOpen(true);
  };

  // Direct Server / Local Drive Folder Backup (stores directly to drive directory)
  const handleExecuteServerDriveBackup = async () => {
    setIsBackingUp(true);
    setMessage(null);

    try {
      const payload: any = {
        destinationPath: targetDrivePath || backupDrivePath,
      };

      if (backupScope === 'selected') {
        payload.ids = Array.from(selectedIds);
      } else {
        payload.projectId = filterProjectId;
        if (filterStartDate) payload.startDate = filterStartDate;
        if (filterEndDate) payload.endDate = filterEndDate;
      }

      const res = await fetch('/api/screenshots/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: data.message || `Successfully backed up ${data.backedUpCount || 0} screenshot(s) to Drive: ${data.destinationPath}`,
        });
        setBackupModalOpen(false);
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to back up screenshots to Drive.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error executing Drive backup.' });
    } finally {
      setIsBackingUp(false);
    }
  };

  // Direct Browser ZIP Archive Download to Local Drive / Downloads
  const handleExecuteZipDownload = async () => {
    setIsBackingUp(true);
    setMessage(null);

    try {
      let itemsToExport: ScreenshotRecord[] = [];
      if (backupScope === 'selected') {
        itemsToExport = screenshots.filter((s) => selectedIds.has(s.id));
      } else {
        itemsToExport = screenshots.filter(
          (s) => filterProjectId === 'ALL' || s.timeEntry?.project?.id === filterProjectId
        );
      }

      if (itemsToExport.length === 0) {
        setMessage({ type: 'error', text: 'No screenshots found to export.' });
        setIsBackingUp(false);
        return;
      }

      const zip = new JSZip();
      const manifestFiles: any[] = [];

      for (const item of itemsToExport) {
        if (!item.imageUrl) continue;
        const projName = item.timeEntry?.project?.name || 'General Workstation';
        const projCode = item.timeEntry?.project?.code || '';
        const safeProjectFolder = (projCode ? `${projCode} - ${projName}` : projName)
          .replace(/[<>:"/\\|?*]+/g, '_')
          .trim();

        const captureDate = new Date(item.capturedAt);
        const dateStr = `${captureDate.getFullYear()}-${String(captureDate.getMonth() + 1).padStart(2, '0')}-${String(captureDate.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(captureDate.getHours()).padStart(2, '0')}-${String(captureDate.getMinutes()).padStart(2, '0')}-${String(captureDate.getSeconds()).padStart(2, '0')}`;
        const safeEmp = (item.user.name || item.user.employeeId || 'Staff').replace(/[<>:"/\\|?*]+/g, '_').trim();
        const fileName = `${safeEmp}_${timeStr}_${item.id.slice(0, 8)}.jpg`;

        const base64Data = item.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        zip.file(`${safeProjectFolder}/${dateStr}/${fileName}`, base64Data, { base64: true });

        manifestFiles.push({
          id: item.id,
          fileName,
          path: `${safeProjectFolder}/${dateStr}/${fileName}`,
          projectName: projName,
          employeeName: item.user.name,
          employeeId: item.user.employeeId,
          capturedAt: item.capturedAt,
        });
      }

      zip.file(
        'manifest.json',
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            totalScreenshots: itemsToExport.length,
            files: manifestFiles,
          },
          null,
          2
        )
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const projLabel =
        filterProjectId !== 'ALL'
          ? (projectsList.find((p) => p.id === filterProjectId)?.name || 'Project').replace(/[<>:"/\\|?*]+/g, '_')
          : 'Screenshots';
      a.download = `Backup_${projLabel}_${getTodayDateString()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: 'success',
        text: `Exported ${itemsToExport.length} screenshot(s) into Drive backup archive: Backup_${projLabel}_${getTodayDateString()}.zip`,
      });
      setBackupModalOpen(false);
    } catch (err: any) {
      console.error('Error generating backup zip:', err);
      setMessage({ type: 'error', text: 'Failed to create backup ZIP archive.' });
    } finally {
      setIsBackingUp(false);
    }
  };

  // 5.4 Automatic Screenshot Deletion Trigger (Immediate Cleanup)
  const handleRunCleanupNow = async () => {
    if (!isAdmin) return;
    setIsCleaningUp(true);
    setMessage(null);

    try {
      const res = await fetch('/api/screenshots/cleanup', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: data.message || `Cleanup complete: ${data.deletedCount || 0} old screenshots purged.`,
        });
        loadScreenshots();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to execute retention cleanup.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error running retention cleanup.' });
    } finally {
      setIsCleaningUp(false);
    }
  };

  // Immediate Screenshot Trigger (Active Timer Session)
  const handleCaptureLiveNow = async () => {
    if (!activeTimer) {
      setMessage({ type: 'error', text: 'No active timer running. Screenshots are tied to active project sessions.' });
      return;
    }

    setIsCapturingNow(true);
    setMessage(null);

    try {
      const streamActive = isScreenStreamActive();
      if (!streamActive) {
        const stream = await requestScreenStream();
        if (!stream) {
          setMessage({
            type: 'error',
            text: 'Screen capture permission was declined. Please share screen to capture desktop activity.',
          });
          setIsCapturingNow(false);
          return;
        }
      }

      const success = await captureAndUploadActivityScreenshot({
        userId: user?.id || '',
        userName: user?.name || 'Staff User',
        employeeId: user?.employeeId || '',
        timeEntryId: activeTimer.id,
        projectCode: (activeTimer.project as any)?.code || '',
        projectName: activeTimer.project.name,
        elapsedSeconds,
        intervalMinutes,
      });

      if (success) {
        setMessage({
          type: 'success',
          text: 'Activity screenshot frame captured and recorded successfully.',
        });
        loadScreenshots();
      } else {
        setMessage({
          type: 'error',
          text: 'Failed to capture screen frame from stream. Make sure your desktop screen is being shared.',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Error occurred while triggering screen capture.',
      });
    } finally {
      setIsCapturingNow(false);
    }
  };

  // 5.3 Batch Delete Screenshots (Admin Only)
  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedIds.size === 0) return;
    setConfirmDeleteOpen(false);
    setIsDeletingSelected(true);
    setMessage(null);

    try {
      const res = await fetch('/api/screenshots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Successfully deleted ${data.deletedCount || selectedIds.size} screenshot(s).`,
        });
        setSelectedIds(new Set());
        loadScreenshots();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to delete selected screenshots.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting screenshots.' });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  // 5.3 Single Delete Screenshot (Admin Only)
  const handleDeleteSingle = async (id: string) => {
    if (!isAdmin) return;
    setMessage(null);

    try {
      const res = await fetch(`/api/screenshots/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Screenshot successfully deleted.',
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        loadScreenshots();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to delete screenshot.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting screenshot.' });
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === screenshots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(screenshots.map((s) => s.id)));
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-warning flex items-center justify-center mb-4 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="page-heading text-text-primary mb-2">Access Restricted</h2>
        <p className="helper-text text-text-secondary max-w-md mb-6">
          The Screenshot module and activity capture history are reserved for administrators only.
        </p>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="page-heading text-text-primary flex items-center gap-2">
              <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              <span>Screenshots & Activity Monitoring</span>
            </h1>
            <span
              id="screenshot-status-badge"
              data-testid="screenshot-status-badge"
              className={`label-text font-semibold px-2.5 py-0.5 rounded-full border ${
                enabled
                  ? 'bg-green-50 text-success border-green-200'
                  : 'bg-slate-100 text-slate-600 border-border'
              }`}
            >
              {enabled ? 'Active Capture' : 'Disabled'}
            </span>
          </div>
          <p className="helper-text text-text-secondary mt-1">
            Configure capture intervals, automatic retention cleanup, and review activity history for active project timers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {activeTimer && (
            <button
              type="button"
              id="capture-live-now-btn"
              data-testid="capture-live-now-btn"
              onClick={handleCaptureLiveNow}
              disabled={isCapturingNow}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white btn-text shadow-sm transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Camera className={`w-3.5 h-3.5 ${isCapturingNow ? 'animate-spin' : ''}`} />
              <span>{isCapturingNow ? 'Capturing...' : 'Capture Active Timer Now'}</span>
            </button>
          )}

          <button
            type="button"
            id="top-save-screenshot-btn"
            data-testid="top-save-screenshot-btn"
            onClick={() => handleSaveSettings()}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>

          <button
            id="refresh-screenshot-btn"
            data-testid="refresh-screenshot-btn"
            onClick={loadScreenshots}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-text-secondary hover:text-text-primary border border-border btn-text transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {message && (
        <div
          id="screenshot-feedback-banner"
          data-testid="screenshot-feedback-banner"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 helper-text font-medium animate-in fade-in ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-success'
              : 'bg-red-50 border-red-200 text-error'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-error shrink-0" />
            )}
            <span className="truncate">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 transition p-1 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP CONFIGURATION ROW: Capture Status, Capture Interval, Retention, Drive Backup (2x2 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Screenshot Enable/Disable Card */}
        <div className="rounded-card bg-white border border-border p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="helper-text text-text-secondary font-medium">Capture Engine Status</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  enabled ? 'bg-success animate-pulse' : 'bg-slate-300'
                }`}
              />
            </div>
            <h2 className="card-title text-text-primary">Screenshot Enable / Disable</h2>
            <p className="helper-text text-text-secondary mt-0.5">
              When disabled, activity captures are completely paused regardless of active project timers.
            </p>
          </div>

          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="helper-text font-semibold text-text-primary">
                Capture Engine State
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary font-medium">
                  {enabled ? 'Enabled' : 'Paused'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="screenshot-enabled-toggle"
                    data-testid="screenshot-enabled-toggle"
                    checked={enabled}
                    onChange={(e) => {
                      setEnabled(e.target.checked);
                    }}
                    disabled={!isAdmin || isSaving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-border text-xs">
              <span className="font-medium text-text-secondary">Current Status:</span>
              <span className={`font-semibold ${enabled ? 'text-success' : 'text-slate-600'}`}>
                {enabled ? 'Active (Capturing Enabled)' : 'Inactive (Capturing Paused)'}
              </span>
            </div>

            <p className="helper-text text-text-secondary">
              Captures strictly trigger when an employee has a project timer actively running.
            </p>
          </div>
        </div>

        {/* Screenshot Capture Interval Card */}
        <div className="rounded-card bg-white border border-border p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="helper-text text-text-secondary font-medium">Capture Cadence</span>
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <h2 className="card-title text-text-primary">Capture Interval</h2>
            <p className="helper-text text-text-secondary mt-0.5">
              Duration between periodic activity frame captures (Default: <strong>1 hour / 60m</strong>).
            </p>
          </div>

          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="helper-text font-semibold text-text-primary">
                Interval Duration
              </span>
              <button
                type="button"
                id="interval-default-60-btn"
                data-testid="interval-default-60-btn"
                onClick={() => setIntervalMinutes(60)}
                disabled={!isAdmin || isSaving}
                title="Reset to 1 hour (60 minutes)"
                className={`py-1 px-2.5 rounded-lg text-xs font-semibold transition border cursor-pointer shrink-0 ${
                  intervalMinutes === 60
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 border-border text-text-primary'
                }`}
              >
                1 Hr Default
              </button>
            </div>

            <div className="relative">
              <input
                type="number"
                id="capture-interval-minutes-input"
                data-testid="capture-interval-minutes-input"
                min={1}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setIntervalMinutes(isNaN(val) ? 1 : Math.max(1, Math.min(1440, val)));
                }}
                disabled={!isAdmin || isSaving}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary pr-12"
                placeholder="Minutes"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 helper-text text-text-secondary font-medium pointer-events-none">
                min
              </span>
            </div>

            <p className="helper-text text-text-secondary">
              Current: <strong className="text-text-primary">{intervalMinutes} minutes</strong>
              {intervalMinutes === 60 ? ' (1.0 hour)' : ` (~${(intervalMinutes / 60).toFixed(1)} hrs)`}
            </p>
          </div>
        </div>

        {/* Automatic Screenshot Deletion / Retention Card */}
        <div className="rounded-card bg-white border border-border p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="helper-text text-text-secondary font-medium">Storage & Lifecycle</span>
              <Trash2 className="w-4 h-4 text-warning" />
            </div>
            <h2 className="card-title text-text-primary">Automatic Retention Cleanup</h2>
            <p className="helper-text text-text-secondary mt-0.5">
              Historical screenshots older than the retention threshold are automatically deleted.
            </p>
          </div>

          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="helper-text font-semibold text-text-primary">
                Retention Threshold
              </span>
              {isAdmin && (
                <button
                  type="button"
                  id="trigger-retention-cleanup-btn"
                  data-testid="trigger-retention-cleanup-btn"
                  onClick={handleRunCleanupNow}
                  disabled={isCleaningUp}
                  title="Run retention cleanup now"
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-text-primary text-xs font-semibold flex items-center gap-1.5 border border-border transition cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className={`w-3.5 h-3.5 text-warning ${isCleaningUp ? 'animate-spin' : ''}`} />
                  <span>{isCleaningUp ? 'Cleaning...' : 'Run Cleanup Now'}</span>
                </button>
              )}
            </div>

            <div>
              <select
                id="retention-period-select"
                data-testid="retention-period-select"
                value={retentionDays}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  setRetentionDays(days);
                }}
                disabled={!isAdmin || isSaving}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition font-medium cursor-pointer"
              >
                <option value={30}>1 Month (30 Days) — Recommended Default</option>
                <option value={60}>2 Months (60 Days)</option>
                <option value={90}>3 Months (90 Days) — Quarterly Archive</option>
                <option value={180}>6 Months (180 Days) — Half-Year Compliance</option>
                <option value={15}>15 Days — Fast Storage Recovery</option>
                <option value={7}>7 Days (Aggressive Cleanup)</option>
              </select>
            </div>

            <p className="helper-text text-text-secondary">
              Keeps captures from the past <strong className="text-text-primary">{retentionDays} days</strong>.
            </p>
          </div>
        </div>

        {/* Automated Drive Backup Card */}
        <div className="rounded-card bg-white border border-border p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="helper-text text-text-secondary font-medium">Cloud & Drive Backup</span>
              <HardDrive className="w-4 h-4 text-primary" />
            </div>
            <h2 className="card-title text-text-primary">Drive Backup Option</h2>
            <p className="helper-text text-text-secondary mt-0.5">
              Archive project screenshots to Drive before retention purge or backup on demand.
            </p>
          </div>

          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="helper-text font-semibold text-text-primary">
                Auto-Backup before Retention Cleanup
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary font-medium">
                  {autoBackupEnabled ? 'Enabled' : 'Paused'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="auto-backup-enabled-toggle"
                    data-testid="auto-backup-enabled-toggle"
                    checked={autoBackupEnabled}
                    onChange={(e) => {
                      setAutoBackupEnabled(e.target.checked);
                    }}
                    disabled={!isAdmin || isSaving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  id="backup-drive-path-input"
                  data-testid="backup-drive-path-input"
                  value={backupDrivePath}
                  onChange={(e) => setBackupDrivePath(e.target.value)}
                  disabled={!isAdmin || isSaving}
                  placeholder="D:/el/backups/screenshots"
                  className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary truncate"
                  title={backupDrivePath}
                />
              </div>
              <button
                type="button"
                id="save-backup-settings-btn"
                data-testid="save-backup-settings-btn"
                onClick={() => handleSaveSettings()}
                disabled={isSaving}
                title="Save Backup Settings"
                className="px-3 py-2 rounded-xl bg-primary-subtle text-primary hover:bg-blue-100 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>

            <p className="helper-text text-text-secondary">
              Target directory for project-based archives and retention backups.
            </p>
          </div>
        </div>
      </div>

      {/* Screenshot Capture Conditions Informational Strip */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-text-secondary space-y-2">
        <div className="flex items-center gap-2 text-primary font-bold">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Screenshot Capture Conditions & Compliance Guardrails</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-text-secondary">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span>
              <strong className="text-text-primary">Active Timers Only:</strong> Screenshots are captured strictly when an employee has started their timer on a project.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span>
              <strong className="text-text-primary">Immediate Cutoff:</strong> Stopping the timer immediately ceases all capture scheduling for that user.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span>
              <strong className="text-text-primary">Multi-User Isolation:</strong> Multiple concurrent employees running timers are tracked and captured on their own intervals independently.
            </span>
          </div>
        </div>
      </div>

      {/* Screenshot History Table & Filters Card */}
      <div className="rounded-card bg-white border border-border p-4 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="card-title text-text-primary">Screenshot History</h2>
              <span className="label-text text-text-secondary bg-slate-100 px-2.5 py-0.5 rounded-full border border-border font-mono font-semibold text-xs">
                {totalCount} total captures
              </span>
            </div>
            <p className="helper-text text-text-secondary mt-0.5">
              Review captured desktop activity logs, timestamps, and inspect high-resolution frames.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterProjectId !== 'ALL' && selectedIds.size === 0 && isAdmin && (
              <button
                type="button"
                id="backup-project-btn"
                data-testid="backup-project-btn"
                onClick={() => handleOpenBackupModal('project')}
                className="px-3.5 py-1.5 rounded-xl bg-primary-subtle hover:bg-blue-100 text-primary border border-blue-200 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Backup all screenshots for this project"
              >
                <FolderDown className="w-3.5 h-3.5" />
                <span>Backup Project to Drive</span>
              </button>
            )}

            {selectedIds.size > 0 && isAdmin && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <span className="helper-text text-text-secondary">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  id="backup-selected-screenshots-btn"
                  data-testid="backup-selected-screenshots-btn"
                  onClick={() => handleOpenBackupModal('selected')}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border border-blue-600 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Store selected screenshots to drive"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Backup to Drive ({selectedIds.size})</span>
                </button>
                <button
                  type="button"
                  id="delete-selected-screenshots-btn"
                  data-testid="delete-selected-screenshots-btn"
                  onClick={handleDeleteSelected}
                  disabled={isDeletingSelected}
                  className="px-3.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-error border border-red-200 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-border items-end">
          {/* Employee Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
              Filter by Employee
            </label>
            <select
              id="filter-employee-select"
              data-testid="filter-employee-select"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="w-full h-9 bg-white border border-border rounded-lg px-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer font-medium"
            >
              <option value="ALL">All Employees ({employeesList.length})</option>
              {employeesList.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employeeId ? `(${emp.employeeId})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Filter by Project
              </label>
              {filterProjectId !== 'ALL' && (
                <button
                  type="button"
                  id="filter-backup-project-btn"
                  data-testid="filter-backup-project-btn"
                  onClick={() => handleOpenBackupModal('project')}
                  className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1"
                  title="Backup this project's captures"
                >
                  <FolderDown className="w-3 h-3" />
                  <span>Backup</span>
                </button>
              )}
            </div>
            <select
              id="filter-project-select"
              data-testid="filter-project-select"
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="w-full h-9 bg-white border border-border rounded-lg px-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer font-medium truncate"
            >
              <option value="ALL">All Projects ({projectsList.length})</option>
              {projectsList.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              id="filter-from-date"
              data-testid="filter-from-date"
              value={filterStartDate}
              max={filterEndDate || undefined}
              onChange={(e) => handleStartDateChange(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full h-9 bg-white border border-border rounded-lg px-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              id="filter-to-date"
              data-testid="filter-to-date"
              value={filterEndDate}
              min={filterStartDate || undefined}
              onChange={(e) => handleEndDateChange(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full h-9 bg-white border border-border rounded-lg px-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            />
          </div>

          {/* Reset Filters */}
          <div>
            <button
              type="button"
              id="reset-screenshot-filters-btn"
              data-testid="reset-screenshot-filters-btn"
              onClick={() => {
                const today = getTodayDateString();
                setFilterUserId('ALL');
                setFilterProjectId('ALL');
                setFilterStartDate(today);
                setFilterEndDate(today);
              }}
              className="w-full h-9 px-3 rounded-lg bg-white hover:bg-slate-100 text-text-primary border border-border text-xs font-semibold transition cursor-pointer shadow-xs flex items-center justify-center"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Screenshot List / Table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table
            id="screenshot-history-table"
            data-testid="screenshot-history-table"
            className="w-full text-left border-collapse"
          >
            <thead>
              <tr className="bg-slate-50 border-b border-border table-header-text uppercase font-semibold text-text-secondary">
                {isAdmin && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={screenshots.length > 0 && selectedIds.size === screenshots.length}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-primary focus:ring-primary accent-primary"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Preview</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Project & Session</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border table-cell-text">
              {isLoading && screenshots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center helper-text text-text-secondary">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    <span>Loading screenshot records...</span>
                  </td>
                </tr>
              ) : screenshots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center helper-text text-text-secondary">
                    No screenshots found. When an active timer is running and screenshots are enabled, captures appear here automatically.
                  </td>
                </tr>
              ) : (
                screenshots.map((item) => {
                  const captureDate = new Date(item.capturedAt);
                  const dateStr = captureDate.toLocaleDateString();
                  const timeStr = captureDate.toLocaleTimeString();
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-primary-subtle/50' : ''
                      }`}
                    >
                      {isAdmin && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded border-border text-primary focus:ring-primary accent-primary"
                          />
                        </td>
                      )}

                      {/* Thumbnail Preview */}
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setPreviewScreenshot(item)}
                          className="relative group w-14 h-9 rounded-lg overflow-hidden border border-border bg-slate-100 flex items-center justify-center cursor-pointer shadow-xs"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.imageUrl}
                            alt="Activity frame"
                            className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <ZoomIn className="w-3.5 h-3.5 text-white" />
                          </div>
                        </button>
                      </td>

                      {/* Username */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary-subtle text-primary border border-blue-200 font-bold flex items-center justify-center text-xs">
                            {item.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary leading-tight">{item.user.name}</p>
                            <p className="text-[10px] text-text-secondary font-mono">{item.user.employeeId}</p>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-text-primary whitespace-nowrap">
                        {dateStr}
                      </td>

                      {/* Time */}
                      <td className="py-3 px-4 font-mono text-text-secondary whitespace-nowrap">
                        {timeStr}
                      </td>

                      {/* Project & Session */}
                      <td className="py-3 px-4 text-text-primary max-w-[200px] truncate">
                        {item.timeEntry?.project ? (
                          <span className="font-medium text-text-primary">
                            {item.timeEntry.project.code ? `${item.timeEntry.project.code} • ` : ''}{item.timeEntry.project.name}
                          </span>
                        ) : (
                          <span className="helper-text text-text-secondary italic">Workstation session</span>
                        )}
                      </td>

                      {/* Action: View full frame & Delete */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          id={`view-screenshot-btn-${item.id}`}
                          data-testid={`view-screenshot-btn-${item.id}`}
                          onClick={() => setPreviewScreenshot(item)}
                          className="px-3 py-1.5 rounded-lg bg-primary-subtle hover:bg-blue-100 text-primary border border-blue-200 font-semibold text-xs transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Frame</span>
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            id={`delete-screenshot-btn-${item.id}`}
                            data-testid={`delete-screenshot-btn-${item.id}`}
                            onClick={() => handleDeleteSingle(item.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-error border border-red-200 font-semibold text-xs transition inline-flex items-center gap-1 cursor-pointer ml-1.5"
                            title="Delete screenshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup to Drive Modal */}
      {backupModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isBackingUp) setBackupModalOpen(false);
          }}
        >
          <div
            className="bg-white border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="card-title text-text-primary">
                    Backup Screenshots to Drive
                  </h3>
                  <p className="helper-text text-text-secondary">
                    {backupScope === 'selected'
                      ? `Archiving ${selectedIds.size} selected screenshot(s)`
                      : `Archiving all screenshots for project: ${
                          projectsList.find((p) => p.id === filterProjectId)?.name || 'All Projects'
                        }`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                disabled={isBackingUp}
                className="text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope Summary Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-border space-y-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Backup Target Scope:</span>
                <span className="font-semibold text-text-primary capitalize">
                  {backupScope === 'selected' ? `${selectedIds.size} Picked Captures` : 'Selected Project Scope'}
                </span>
              </div>
              {backupScope === 'project' && filterProjectId !== 'ALL' && (
                <div className="flex justify-between text-text-secondary">
                  <span>Target Project:</span>
                  <span className="font-semibold text-text-primary truncate max-w-[240px]">
                    {projectsList.find((p) => p.id === filterProjectId)?.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>Date Range:</span>
                <span className="font-mono text-text-primary">
                  {filterStartDate || 'Beginning'} to {filterEndDate || 'Current'}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Folder Structure:</span>
                <span className="font-mono text-[11px] text-primary truncate max-w-[240px]">
                  &#123;Project&#125;/&#123;YYYY-MM-DD&#125;/&#123;Emp&#125;_&#123;Time&#125;.jpg
                </span>
              </div>
            </div>

            {/* Target Drive Folder Path */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Drive Storage Directory / Mount Path
              </label>
              <input
                type="text"
                id="target-drive-path-input"
                data-testid="target-drive-path-input"
                value={targetDrivePath}
                onChange={(e) => setTargetDrivePath(e.target.value)}
                disabled={isBackingUp}
                placeholder="D:/el/backups/screenshots or G:/My Drive/Screenshots"
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-text-secondary">
                Screenshots, date subdirectories, and a full <code className="text-primary font-mono">manifest.json</code> audit log will be written to this path.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                disabled={isBackingUp}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary border border-border btn-text transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                id="execute-zip-download-btn"
                data-testid="execute-zip-download-btn"
                onClick={handleExecuteZipDownload}
                disabled={isBackingUp}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-text-primary border border-border btn-text transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                title="Download ZIP package organized by project to your drive"
              >
                <FolderDown className="w-3.5 h-3.5 text-primary" />
                <span>Download ZIP to Drive</span>
              </button>

              <button
                type="button"
                id="execute-server-drive-backup-btn"
                data-testid="execute-server-drive-backup-btn"
                onClick={handleExecuteServerDriveBackup}
                disabled={isBackingUp || !targetDrivePath.trim()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isBackingUp ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5" />
                )}
                <span>{isBackingUp ? 'Backing Up...' : 'Save to Drive Directory'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.3 Screenshot High-Resolution Viewer Modal */}
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewScreenshot(null);
          }}
        >
          <div
            className="bg-white border border-border rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="card-title text-text-primary flex items-center gap-2">
                    <span>{previewScreenshot.user.name}</span>
                    <span className="helper-text font-mono text-text-secondary">
                      ({previewScreenshot.user.employeeId})
                    </span>
                  </h3>
                  <p className="helper-text text-text-secondary font-mono">
                    Captured at {new Date(previewScreenshot.capturedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewScreenshot.imageUrl}
                  download={`screenshot_${previewScreenshot.user.employeeId}_${Date.now()}.png`}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-text-primary transition"
                  title="Download Frame"
                >
                  <Download className="w-4 h-4" />
                </a>
                {isAdmin && (
                  <button
                    id="preview-delete-screenshot-btn"
                    data-testid="preview-delete-screenshot-btn"
                    onClick={() => {
                      const id = previewScreenshot.id;
                      setPreviewScreenshot(null);
                      handleDeleteSingle(id);
                    }}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-error border border-red-200 transition cursor-pointer"
                    title="Delete Frame"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setPreviewScreenshot(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* High-res Image Container */}
            <div className="flex-1 overflow-auto rounded-xl bg-slate-950 border border-border flex items-center justify-center p-2 min-h-[300px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewScreenshot.imageUrl}
                alt="Captured screenshot preview"
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            </div>

            {/* Metadata Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary pt-2 shrink-0">
              <div>
                {previewScreenshot.timeEntry?.project && (
                  <span>
                    Project: <strong className="text-text-primary">{previewScreenshot.timeEntry.project.name}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary border border-border btn-text transition cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
