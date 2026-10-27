'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { requestScreenStream, isScreenStreamActive, captureAndUploadActivityScreenshot } from '@/lib/screenshotCapture';
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
    employeeId: string;
    department?: string | null;
  };
  timeEntry?: {
    id: string;
    duration: number;
    project: {
      code: string;
      name: string;
    };
  } | null;
}

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

  // 5.3 Screenshot History & Filters
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employeeId: string }>>([]);
  const [filterUserId, setFilterUserId] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modals & previews
  const [previewScreenshot, setPreviewScreenshot] = useState<ScreenshotRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading & Action states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isCapturingNow, setIsCapturingNow] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    loadEmployees();
  }, []);

  useEffect(() => {
    loadScreenshots();
  }, [filterUserId, filterStartDate, filterEndDate]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/screenshots/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setEnabled(Boolean(data.settings.enabled));
          setIntervalMinutes(data.settings.intervalMinutes || 60);
          setRetentionDays(data.settings.retentionDays || 30);
        }
      }
    } catch (err) {
      console.error('Failed to load screenshot settings:', err);
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/admin/employees');
      if (res.ok) {
        const data = await res.json();
        setEmployeesList(data.employees || []);
      }
    } catch {
      // ignore
    }
  };

  const loadScreenshots = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUserId && filterUserId !== 'ALL') params.append('userId', filterUserId);
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

  // 5.1 & 5.2 & 5.4 Save Configuration
  const handleSaveSettings = async (override?: { enabled?: boolean; interval?: number; retention?: number }) => {
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
          text: `Screenshot configuration saved. Status: ${payload.enabled ? 'Active' : 'Disabled'}, Interval: ${payload.intervalMinutes}m, Retention: ${payload.retentionDays} days.`,
        });
        setEnabled(payload.enabled);
        setIntervalMinutes(payload.intervalMinutes);
        setRetentionDays(payload.retentionDays);
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

  // 5.4 Automatic Screenshot Deletion Trigger (Immediate Cleanup)
  const handleRunCleanupNow = async () => {
    if (!isAdmin) return;
    setIsCleaningUp(true);
    setMessage(null);

    try {
      const res = await fetch('/api/screenshots/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Retention cleanup complete. Deleted ${data.deletedCount} screenshots older than ${data.retentionDays} days (${data.cutoffDate ? new Date(data.cutoffDate).toLocaleDateString() : 'cutoff'}).`,
        });
        loadScreenshots();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to execute screenshot cleanup.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error running cleanup.' });
    } finally {
      setIsCleaningUp(false);
    }
  };

  // 5.5 Live Test Capture (for active running timer)
  const handleCaptureLiveNow = async () => {
    if (!activeTimer) {
      setMessage({
        type: 'error',
        text: 'Screenshot capture is only permitted when a timer is actively running.',
      });
      return;
    }

    if (!enabled) {
      setMessage({
        type: 'error',
        text: 'Screenshot capture is currently disabled globally. Enable it above first.',
      });
      return;
    }

    setIsCapturingNow(true);
    setMessage(null);

    try {
      if (!isScreenStreamActive()) {
        const stream = await requestScreenStream();
        if (!stream) {
          setMessage({
            type: 'error',
            text: 'Screen sharing was cancelled. Please select "Entire Screen" to capture workstation desktop.',
          });
          setIsCapturingNow(false);
          return;
        }
      }

      const ok = await captureAndUploadActivityScreenshot({
        userId: user?.id || '',
        userName: user?.name || 'User',
        employeeId: user?.employeeId || '000',
        timeEntryId: activeTimer.id,
        projectCode: activeTimer.project.code,
        projectName: activeTimer.project.name,
        elapsedSeconds,
        intervalMinutes,
      });

      if (ok) {
        setMessage({ type: 'success', text: 'Desktop screenshot successfully captured and stored!' });
        loadScreenshots();
      } else {
        setMessage({ type: 'error', text: 'Failed to capture frame from desktop stream.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Capture error' });
    } finally {
      setIsCapturingNow(false);
    }
  };

  // Delete selected screenshots
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} selected screenshot(s)?`)) {
      return;
    }

    setIsDeletingSelected(true);
    try {
      const res = await fetch('/api/screenshots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Deleted ${data.count} selected screenshot(s).` });
        setSelectedIds(new Set());
        loadScreenshots();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete selected screenshots.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting screenshots.' });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            The Screenshot module is reserved for administrators only.
          </p>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
          >
            Return to Dashboard
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Module Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Screenshot</h1>
                <span
                  id="screenshot-status-badge"
                  data-testid="screenshot-status-badge"
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                    enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {enabled ? 'Active Capture' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Configure screenshot intervals, automatic retention cleanup, and review activity history for active project timers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {activeTimer && (
              <button
                type="button"
                id="capture-live-now-btn"
                data-testid="capture-live-now-btn"
                onClick={handleCaptureLiveNow}
                disabled={isCapturingNow}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/30 transition cursor-pointer"
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
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 transition cursor-pointer"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>

            <button
              id="refresh-screenshot-btn"
              data-testid="refresh-screenshot-btn"
              onClick={loadScreenshots}
              disabled={isLoading}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition"
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
            className={`p-4 rounded-xl flex items-start gap-3 border animate-in slide-in-from-top-2 duration-200 ${
              message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/40 border-red-500/30 text-red-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            )}
            <div className="flex-1 text-sm font-medium">{message.text}</div>
            <button
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-white transition p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TOP CONFIGURATION ROW: Capture Status, Capture Interval, Retention */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Screenshot Enable/Disable Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Capture Status
                </span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
              </div>

              <h2 className="text-base font-bold text-white mb-1">Screenshot Enable/Disable</h2>
              <p className="text-xs text-slate-400">
                When disabled, no screenshots are captured regardless of active timers.
              </p>
            </div>

            <div className="pt-6 border-t border-slate-800/80 mt-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                {enabled ? 'Active (Capturing Enabled)' : 'Inactive (Capturing Paused)'}
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
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Screenshot Capture Interval Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Capture Interval
                </span>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>

              <h2 className="text-base font-bold text-white mb-1">Capture Interval</h2>
              <p className="text-xs text-slate-400">
                Configure duration between captures in minutes (Default: <strong>1 hour</strong>).
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/80 mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 pr-12"
                    placeholder="Minutes"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">
                    min
                  </span>
                </div>
                <button
                  type="button"
                  id="interval-default-60-btn"
                  data-testid="interval-default-60-btn"
                  onClick={() => setIntervalMinutes(60)}
                  disabled={!isAdmin || isSaving}
                  title="Reset to 1 hour (60 minutes)"
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer shrink-0 ${
                    intervalMinutes === 60
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  1 Hour (Default)
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Current: <strong className="text-slate-200">{intervalMinutes} minutes</strong>
                {intervalMinutes === 60 ? ' (1.0 hour)' : ` (~${(intervalMinutes / 60).toFixed(1)} hrs)`}
              </p>
            </div>
          </div>

          {/* Automatic Screenshot Deletion / Retention Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Retention & Cleanup
                </span>
                <Trash2 className="w-4 h-4 text-amber-400" />
              </div>

              <h2 className="text-base font-bold text-white mb-1">Automatic Deletion</h2>
              <p className="text-xs text-slate-400">
                Old screenshots automatically purged (Default: <strong>1 month</strong>).
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/80 mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <select
                  id="retention-period-select"
                  data-testid="retention-period-select"
                  value={retentionDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setRetentionDays(days);
                  }}
                  disabled={!isAdmin || isSaving}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition font-medium"
                >
                  <option value={30}>1 Month (30 Days) — Default</option>
                  <option value={60}>2 Months (60 Days)</option>
                  <option value={90}>3 Months (90 Days)</option>
                  <option value={180}>6 Months (180 Days)</option>
                  <option value={15}>15 Days</option>
                  <option value={7}>7 Days (Aggressive)</option>
                </select>

                {isAdmin && (
                  <button
                    type="button"
                    id="trigger-retention-cleanup-btn"
                    data-testid="trigger-retention-cleanup-btn"
                    onClick={handleRunCleanupNow}
                    disabled={isCleaningUp}
                    title="Run retention cleanup now to delete screenshots older than retention period"
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer shrink-0"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${isCleaningUp ? 'animate-spin text-amber-400' : ''}`} />
                    <span>{isCleaningUp ? 'Cleaning...' : 'Run Cleanup'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Manual Save Action Bar */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg shadow-black/40">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-xs text-slate-300">
              Manual save mode active. Adjust status, interval, or retention above and click <strong>Save Configuration</strong> to apply changes.
            </p>
          </div>
          <button
            type="button"
            id="save-screenshot-config-btn"
            data-testid="save-screenshot-config-btn"
            onClick={() => handleSaveSettings()}
            disabled={!isAdmin || isSaving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer shrink-0"
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Saving Configuration...' : 'Save Configuration'}</span>
          </button>
        </div>

        {/* Screenshot Capture Conditions Informational Strip */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-500/20 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-blue-300 font-bold">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Screenshot Capture Conditions & Compliance Guardrails</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-400">
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <span>
                <strong>Active Timers Only:</strong> Screenshots are captured strictly when an employee has started their timer on a project.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <span>
                <strong>Immediate Cutoff:</strong> Stopping the timer immediately ceases all capture scheduling for that user.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <span>
                <strong>Multi-User Isolation:</strong> Multiple concurrent employees running timers are tracked and captured on their own intervals independently.
              </span>
            </div>
          </div>
        </div>

        {/* Screenshot History Table & Filters */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Screenshot History</h2>
                <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {totalCount} total captures
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Review captured desktop activity logs, timestamps, and inspect high-resolution frames.
              </p>
            </div>

            {selectedIds.size > 0 && isAdmin && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <span className="text-xs text-slate-400">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  id="delete-selected-screenshots-btn"
                  data-testid="delete-selected-screenshots-btn"
                  onClick={handleDeleteSelected}
                  disabled={isDeletingSelected}
                  className="px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            {/* Employee Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Filter by Employee
              </label>
              <select
                id="filter-employee-select"
                data-testid="filter-employee-select"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Employees</option>
                {employeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                From Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="filter-from-date"
                  data-testid="filter-from-date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onKeyDown={(e) => {
                    if (e.key !== 'Tab' && e.key !== 'Backspace' && e.key !== 'Delete') {
                      e.preventDefault();
                      (e.currentTarget as any).showPicker?.();
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 [color-scheme:dark] cursor-pointer"
                />
              </div>
            </div>

            {/* To Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                To Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="filter-to-date"
                  data-testid="filter-to-date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onKeyDown={(e) => {
                    if (e.key !== 'Tab' && e.key !== 'Backspace' && e.key !== 'Delete') {
                      e.preventDefault();
                      (e.currentTarget as any).showPicker?.();
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 [color-scheme:dark] cursor-pointer"
                />
              </div>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                type="button"
                id="reset-screenshot-filters-btn"
                data-testid="reset-screenshot-filters-btn"
                onClick={() => {
                  setFilterUserId('ALL');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {/* Screenshot List / Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table
              id="screenshot-history-table"
              data-testid="screenshot-history-table"
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {isAdmin && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={screenshots.length > 0 && selectedIds.size === screenshots.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Preview</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Project & Session</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
                {isLoading && screenshots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                      <span>Loading screenshot records...</span>
                    </td>
                  </tr>
                ) : screenshots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
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
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isSelected ? 'bg-blue-950/30' : ''
                        }`}
                      >
                        {isAdmin && (
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(item.id)}
                              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                            />
                          </td>
                        )}

                        {/* Thumbnail Preview */}
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => setPreviewScreenshot(item)}
                            className="relative group w-14 h-9 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center cursor-pointer shadow-sm"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt="Activity frame"
                              className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                              <ZoomIn className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                        </td>

                        {/* Username */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-[10px]">
                              {item.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-white leading-tight">{item.user.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{item.user.employeeId}</p>
                            </div>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                          {dateStr}
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {timeStr}
                        </td>

                        {/* Project & Session */}
                        <td className="py-3 px-4 text-slate-300 max-w-[200px] truncate">
                          {item.timeEntry?.project ? (
                            <span className="font-medium text-slate-200">
                              {item.timeEntry.project.code} • {item.timeEntry.project.name}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Workstation session</span>
                          )}
                        </td>

                        {/* Action: View full frame */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            id={`view-screenshot-btn-${item.id}`}
                            data-testid={`view-screenshot-btn-${item.id}`}
                            onClick={() => setPreviewScreenshot(item)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 hover:text-blue-300 font-semibold text-xs transition inline-flex items-center gap-1 cursor-pointer border border-blue-500/30"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Frame</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5.3 Screenshot High-Resolution Viewer Modal */}
        {previewScreenshot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{previewScreenshot.user.name}</span>
                      <span className="text-xs font-mono text-slate-400">
                        ({previewScreenshot.user.employeeId})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Captured at {new Date(previewScreenshot.capturedAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={previewScreenshot.imageUrl}
                    download={`screenshot_${previewScreenshot.user.employeeId}_${Date.now()}.png`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title="Download Frame"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setPreviewScreenshot(null)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* High-res Image Container */}
              <div className="flex-1 overflow-auto rounded-xl bg-black border border-slate-800 flex items-center justify-center p-2 min-h-[300px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewScreenshot.imageUrl}
                  alt="Captured screenshot preview"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                />
              </div>

              {/* Metadata Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-2 shrink-0">
                <div>
                  {previewScreenshot.timeEntry?.project && (
                    <span>
                      Project: <strong className="text-white">{previewScreenshot.timeEntry.project.code}</strong> — {previewScreenshot.timeEntry.project.name}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewScreenshot(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
