'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { requestScreenStream, isScreenStreamActive, captureAndUploadActivityScreenshot } from '@/lib/screenshotCapture';
import {
  Camera,
  ShieldAlert,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Lock,
  Trash2,
  Calendar,
  Filter,
  X,
  Download,
  ZoomIn,
  RefreshCw,
  User as UserIcon,
  CheckSquare,
  Square,
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

export default function ScreenshotSettingsPage() {
  const { user } = useAuthStore();
  const { activeTimer, elapsedSeconds } = useTimerStore();

  // Settings State
  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [requireConsent, setRequireConsent] = useState(true);
  const [consentNotice, setConsentNotice] = useState('');

  // Screenshots List & Filters
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employeeId: string }>>([]);
  const [filterUserId, setFilterUserId] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Selection & Individual Delete State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false);
  const [confirmDeleteSingle, setConfirmDeleteSingle] = useState<ScreenshotRecord | null>(null);

  // Date Range Delete State
  const [deleteStartDate, setDeleteStartDate] = useState('');
  const [deleteEndDate, setDeleteEndDate] = useState('');
  const [deleteRangeUserId, setDeleteRangeUserId] = useState('ALL');
  const [isDeletingRange, setIsDeletingRange] = useState(false);

  // Modals
  const [previewScreenshot, setPreviewScreenshot] = useState<ScreenshotRecord | null>(null);
  const [confirmRangeDeleteOpen, setConfirmRangeDeleteOpen] = useState(false);

  // Statuses
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturingNow, setIsCapturingNow] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCaptureLiveNow = async () => {
    if (!activeTimer) {
      setMessage({ type: 'error', text: 'You must have an active running timer to capture an activity screenshot.' });
      return;
    }

    setIsCapturingNow(true);
    try {
      if (!isScreenStreamActive()) {
        const stream = await requestScreenStream();
        if (!stream) {
          setMessage({ type: 'error', text: 'Screen sharing was cancelled. Please select "Entire Screen" and click Share.' });
          setIsCapturingNow(false);
          return;
        }
      }

      const interval = intervalMinutes || 10;
      const ok = await captureAndUploadActivityScreenshot({
        userId: user?.id || '',
        userName: user?.name || 'User',
        employeeId: user?.employeeId || '000',
        timeEntryId: activeTimer.id,
        projectCode: activeTimer.project.code,
        projectName: activeTimer.project.name,
        elapsedSeconds,
        intervalMinutes: interval,
      });

      if (ok) {
        setMessage({ type: 'success', text: 'Live desktop screenshot successfully captured and saved!' });
        await loadScreenshots();
      } else {
        setMessage({ type: 'error', text: 'Failed to capture live desktop frame. Ensure your screen share is active.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Capture error' });
    } finally {
      setIsCapturingNow(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadEmployees();
  }, []);

  useEffect(() => {
    loadScreenshots();
  }, [filterUserId, filterStartDate, filterEndDate]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings/screenshots');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setEnabled(data.settings.enabled);
          setIntervalMinutes(data.settings.intervalMinutes);
          setRequireConsent(data.settings.requireConsent);
          setConsentNotice(data.settings.consentNotice);
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

  // Toggle selection for an individual screenshot
  const toggleSelect = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
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

  // Select / Deselect all visible screenshots
  const handleToggleSelectAll = () => {
    if (screenshots.length === 0) return;
    if (selectedIds.size === screenshots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(screenshots.map((s) => s.id)));
    }
  };

  // Delete selected screenshots in batch
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingSelected(true);
    try {
      const res = await fetch('/api/screenshots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || `Deleted ${selectedIds.size} selected screenshot(s).` });
        setSelectedIds(new Set());
        setConfirmDeleteSelectedOpen(false);
        loadScreenshots();
        if (previewScreenshot && selectedIds.has(previewScreenshot.id)) {
          setPreviewScreenshot(null);
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete selected screenshots' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting selected screenshots' });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/screenshots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          intervalMinutes: Math.max(1, Number(intervalMinutes)),
          requireConsent,
          consentNotice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      } else {
        setMessage({ type: 'success', text: 'Screenshot configuration updated successfully.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network request error' });
    } finally {
      setIsSaving(false);
    }
  };





  // Delete Screenshots from Date to Date
  const handleDeleteDateRange = async () => {
    if (!deleteStartDate || !deleteEndDate) {
      setMessage({ type: 'error', text: 'Please select both start date and end date for range deletion.' });
      return;
    }

    setIsDeletingRange(true);
    try {
      const params = new URLSearchParams({
        startDate: deleteStartDate,
        endDate: deleteEndDate,
      });
      if (deleteRangeUserId && deleteRangeUserId !== 'ALL') {
        params.append('userId', deleteRangeUserId);
      }

      const res = await fetch(`/api/screenshots?${params.toString()}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Date-range deletion completed.' });
        setConfirmRangeDeleteOpen(false);
        setSelectedIds(new Set());
        loadScreenshots();
        if (previewScreenshot) setPreviewScreenshot(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete screenshots in date range' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting range' });
    } finally {
      setIsDeletingRange(false);
    }
  };

  // Delete individual screenshot
  const handleDeleteSingle = async (id: string) => {
    try {
      const res = await fetch(`/api/screenshots/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Screenshot deleted successfully.' });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setConfirmDeleteSingle(null);
        if (previewScreenshot?.id === id) {
          setPreviewScreenshot(null);
        }
        loadScreenshots();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete screenshot' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error deleting screenshot' });
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Camera className="w-6 h-6 text-blue-500" />
              Screenshot Module & Workplace Privacy
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Configure activity verification timing, view captured employee screens, and manage retention.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadSettings();
                loadScreenshots();
              }}
              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Status Message Alert */}
        {message && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/40 border-red-800/60 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="p-1 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREENSHOT CONFIGURATION FORM                                            */}
        {/* ========================================================================= */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-white">Screenshot Module Timing & Status</h3>
                <p className="text-xs text-slate-400">
                  Screenshots are automatically taken once each time the configured interval threshold is reached during an active timer.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="screenshotMasterToggle"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 w-4 h-4"
                />
                <label htmlFor="screenshotMasterToggle" className="text-xs font-bold text-white cursor-pointer uppercase">
                  {enabled ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active / Enabled
                    </span>
                  ) : (
                    <span className="text-slate-500 font-bold">○ Disabled</span>
                  )}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Capture Timing Interval (Minutes)
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="1"
                    max="180"
                    required
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 1, 5, 15, 30, 60"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Once each time this duration is reached (e.g. every {intervalMinutes || 1} min of active tracking). Minimum: 1 min.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Mandatory Consent & Transparency
                </label>
                <div className="flex items-center gap-2.5 h-11">
                  <input
                    type="checkbox"
                    id="consentCheckbox"
                    checked={requireConsent}
                    onChange={(e) => setRequireConsent(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 w-4 h-4"
                  />
                  <label htmlFor="consentCheckbox" className="text-xs text-slate-300 cursor-pointer">
                    Display compliance notice on active project timer sessions
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Workplace Disclosure Notice Text
              </label>
              <textarea
                rows={2}
                value={consentNotice}
                onChange={(e) => setConsentNotice(e.target.value)}
                className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Timing & Settings'}
            </button>
          </div>
        </form>

        {/* ========================================================================= */}
        {/* SCREENSHOT MANAGEMENT & BULK DELETION CONTROLS                             */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                Activity Captures Gallery ({screenshots.length} of {totalCount})
                {selectedIds.size > 0 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
                    {selectedIds.size} Selected
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any capture to view full size. Select individual screenshots with the checkbox, delete individually, or delete in bulk.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {screenshots.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {selectedIds.size === screenshots.length ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-blue-400" /> Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-slate-400" /> Select All ({screenshots.length})
                    </>
                  )}
                </button>
              )}

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSelectedOpen(true)}
                  className="py-2 px-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-lg shadow-red-600/30 animate-in fade-in"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIds.size})
                </button>
              )}

              {activeTimer && (
                <button
                  type="button"
                  id="btn-capture-live-screen"
                  data-testid="btn-capture-live-screen"
                  disabled={isCapturingNow}
                  onClick={handleCaptureLiveNow}
                  className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer active:scale-95"
                  title="Capture your active workstation screen right now"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isCapturingNow ? 'Capturing...' : 'Capture Live Screen Now'}</span>
                </button>
              )}

              <button
                type="button"
                id="btn-refresh-screenshots"
                data-testid="btn-refresh-screenshots"
                onClick={loadScreenshots}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Refresh screenshots list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmRangeDeleteOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Calendar className="w-3.5 h-3.5" /> Delete from Date to Date
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span>Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Employee:</span>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="py-1 px-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                <option value="ALL">All Employees</option>
                {employeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Date Range:</span>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="py-1 px-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="py-1 px-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              />
            </div>

            {(filterUserId !== 'ALL' || filterStartDate || filterEndDate) && (
              <button
                onClick={() => {
                  setFilterUserId('ALL');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Screenshots Gallery Grid */}
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">Loading activity screenshots...</div>
          ) : screenshots.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No screenshots found. When an active timer reaches the configured interval timing ({intervalMinutes} min), screenshots will automatically appear here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {screenshots.map((s) => {
                const isSelected = selectedIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => setPreviewScreenshot(s)}
                    className={`group cursor-pointer p-3 rounded-xl border transition-all duration-200 shadow-md space-y-2 relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-950/20 ring-1 ring-blue-500/50'
                        : 'border-slate-800 hover:border-blue-500/40 bg-slate-950/60 hover:bg-slate-950'
                    }`}
                  >
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative border border-slate-800/80">
                      <img
                        src={s.imageUrl}
                        alt="Workstation capture"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Select Option Checkbox (Top-Left) */}
                      <div
                        onClick={(e) => toggleSelect(s.id, e)}
                        className={`absolute top-2 left-2 z-10 p-1.5 rounded-lg backdrop-blur-md border transition cursor-pointer flex items-center justify-center shadow-lg ${
                          isSelected
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-black/60 border-slate-700/80 hover:border-blue-400 text-slate-300'
                        }`}
                        title={isSelected ? 'Deselect screenshot' : 'Select screenshot'}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelect(s.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-0 cursor-pointer accent-blue-600"
                        />
                      </div>

                      {/* Delete Single Screenshot Button (Top-Right) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteSingle(s);
                        }}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-slate-700/80 hover:border-red-500/80 text-slate-400 hover:text-red-400 hover:bg-red-950/90 transition shadow-lg"
                        title="Delete this screenshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Hover Center: Zoom In View */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium flex items-center gap-1 shadow-lg">
                          <ZoomIn className="w-3.5 h-3.5" /> View Full
                        </span>
                      </div>
                    </div>

                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white truncate max-w-[150px]">{s.user.name}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {Math.round(s.fileSize / 1024)} KB
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(s.capturedAt).toLocaleString()}
                      </p>
                      {s.timeEntry && (
                        <p className="text-[10px] text-blue-400 font-mono truncate">
                          {s.timeEntry.project.code}: {s.timeEntry.project.name}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MODAL 1: FULL SCREENSHOT PREVIEW & DETAIL VIEWER                         */}
        {/* ========================================================================= */}
        {previewScreenshot && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Workstation Activity Screenshot: {previewScreenshot.user.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(previewScreenshot.capturedAt).toLocaleString()} • {previewScreenshot.user.employeeId}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewScreenshot(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Large Image View */}
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-black flex items-center justify-center mb-4">
                <img
                  src={previewScreenshot.imageUrl}
                  alt="Full resolution capture"
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>

              {/* Details and Actions Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-3 border-t border-slate-800 text-xs">
                <div className="space-y-1 text-slate-300">
                  <p>
                    <strong>Employee:</strong> {previewScreenshot.user.name} ({previewScreenshot.user.employeeId})
                  </p>
                  {previewScreenshot.timeEntry && (
                    <p>
                      <strong>Project:</strong> {previewScreenshot.timeEntry.project.code} — {previewScreenshot.timeEntry.project.name}
                    </p>
                  )}
                  <p>
                    <strong>Captured At:</strong> {new Date(previewScreenshot.capturedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelect(previewScreenshot.id)}
                    className={`py-2 px-3.5 rounded-xl font-medium flex items-center gap-1.5 transition border ${
                      selectedIds.has(previewScreenshot.id)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    {selectedIds.has(previewScreenshot.id) ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5" /> Selected
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5" /> Select
                      </>
                    )}
                  </button>

                  <a
                    href={previewScreenshot.imageUrl}
                    download={`screenshot-${previewScreenshot.user.employeeId}-${previewScreenshot.id}.${previewScreenshot.imageUrl.startsWith('data:image/svg') ? 'svg' : 'jpg'}`}
                    className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>

                  <button
                    onClick={() => setConfirmDeleteSingle(previewScreenshot)}
                    className="py-2 px-3.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 font-medium flex items-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Screenshot
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 2: CONFIRM DELETE SINGLE SCREENSHOT                                 */}
        {/* ========================================================================= */}
        {confirmDeleteSingle && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-3 text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete This Screenshot?</h3>
                  <p className="text-xs text-slate-400">This screenshot will be permanently removed.</p>
                </div>
              </div>

              {/* Thumbnail preview */}
              <div className="my-4 aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black">
                <img
                  src={confirmDeleteSingle.imageUrl}
                  alt="Screenshot preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="text-xs text-slate-300 space-y-1 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <p>
                  <strong>Employee:</strong> {confirmDeleteSingle.user.name} ({confirmDeleteSingle.user.employeeId})
                </p>
                <p>
                  <strong>Captured:</strong> {new Date(confirmDeleteSingle.capturedAt).toLocaleString()}
                </p>
                {confirmDeleteSingle.timeEntry && (
                  <p>
                    <strong>Project:</strong> {confirmDeleteSingle.timeEntry.project.name}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSingle(null)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSingle(confirmDeleteSingle.id)}
                  className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-600/30"
                >
                  Yes, Delete Screenshot
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 3: CONFIRM DELETE SELECTED SCREENSHOTS                              */}
        {/* ========================================================================= */}
        {confirmDeleteSelectedOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-3 text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Selected Screenshots?</h3>
                  <p className="text-xs text-slate-400">{selectedIds.size} screenshots will be permanently deleted.</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-6">
                Are you sure you want to delete the <strong>{selectedIds.size} selected screenshot(s)</strong>? This action is permanent and cannot be undone.
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSelectedOpen(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingSelected}
                  onClick={handleDeleteSelected}
                  className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-600/30 disabled:opacity-50"
                >
                  {isDeletingSelected ? 'Deleting...' : `Yes, Delete ${selectedIds.size} Selected`}
                </button>
              </div>
            </div>
          </div>
        )}



        {/* ========================================================================= */}
        {/* MODAL 3: DELETE SCREENSHOTS FROM DATE TO DATE                            */}
        {/* ========================================================================= */}
        {confirmRangeDeleteOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Delete Screenshots by Date Range</h3>
                </div>
                <button
                  onClick={() => setConfirmRangeDeleteOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300 mb-4">
                Select the starting and ending dates to remove screenshots captured within that period.
              </p>

              <div className="space-y-3.5 mb-6 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Target Employee (Optional):</label>
                  <select
                    value={deleteRangeUserId}
                    onChange={(e) => setDeleteRangeUserId(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="ALL">All Employees</option>
                    {employeesList.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">From Date (Start):</label>
                    <input
                      type="date"
                      required
                      value={deleteStartDate}
                      onChange={(e) => setDeleteStartDate(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">To Date (End):</label>
                    <input
                      type="date"
                      required
                      value={deleteEndDate}
                      onChange={(e) => setDeleteEndDate(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmRangeDeleteOpen(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingRange || !deleteStartDate || !deleteEndDate}
                  onClick={handleDeleteDateRange}
                  className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-lg shadow-amber-600/30 disabled:opacity-50"
                >
                  {isDeletingRange ? 'Deleting Range...' : 'Delete Range'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
