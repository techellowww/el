'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { cachedFetch, invalidateApiCache } from '@/lib/apiCache';
import {
  Building2,
  Clock,
  Globe,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Copy,
  Sparkles,
  Save,
  X,
  Loader2,
  Activity,
} from 'lucide-react';
import { TimePicker12h, format24hTo12h } from '@/components/TimePicker12h';

interface DaySchedule {
  start: string;
  end: string;
}

interface DaySchedulesState {
  MON: DaySchedule;
  TUE: DaySchedule;
  WED: DaySchedule;
  THU: DaySchedule;
  FRI: DaySchedule;
  SAT: DaySchedule;
  SUN: DaySchedule;
}

const DEFAULT_DAY_SCHEDULES: DaySchedulesState = {
  MON: { start: '09:00', end: '18:00' },
  TUE: { start: '09:00', end: '18:00' },
  WED: { start: '09:00', end: '18:00' },
  THU: { start: '09:00', end: '18:00' },
  FRI: { start: '09:00', end: '18:00' },
  SAT: { start: '09:00', end: '18:00' },
  SUN: { start: '09:00', end: '18:00' },
};

const DAYS_META: Array<{ key: keyof DaySchedulesState; label: string; short: string; isWeekend?: boolean }> = [
  { key: 'MON', label: 'Monday', short: 'Mon' },
  { key: 'TUE', label: 'Tuesday', short: 'Tue' },
  { key: 'WED', label: 'Wednesday', short: 'Wed' },
  { key: 'THU', label: 'Thursday', short: 'Thu' },
  { key: 'FRI', label: 'Friday', short: 'Fri' },
  { key: 'SAT', label: 'Saturday', short: 'Sat', isWeekend: true },
  { key: 'SUN', label: 'Sunday', short: 'Sun', isWeekend: true },
];

function calculateWindowHours(start: string, end: string): string {
  try {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    let diffMinutes = eH * 60 + eM - (sH * 60 + sM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} hrs`;
  } catch {
    return '9 hrs';
  }
}

export default function OfficeTimingsPage() {
  const { user } = useAuthStore();
  const { syncActiveTimer } = useTimerStore();
  const isAdmin = user?.role === 'ADMIN';

  const [daySchedules, setDaySchedules] = useState<DaySchedulesState>(DEFAULT_DAY_SCHEDULES);
  const [autoCutoffEnabled, setAutoCutoffEnabled] = useState(true);
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      const data = await cachedFetch<{ schedule?: any }>('/api/office-timings', {
        forceRefresh,
        init: { credentials: 'include' },
      });
      if (data?.schedule) {
        setAutoCutoffEnabled(data.schedule.autoCutoffEnabled ?? true);
        setTimezone(data.schedule.timezone || 'Asia/Kolkata');

        if (data.schedule.dayTimings) {
          try {
            const parsed = typeof data.schedule.dayTimings === 'string'
              ? JSON.parse(data.schedule.dayTimings)
              : data.schedule.dayTimings;
            setDaySchedules({
              MON: parsed.MON || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              TUE: parsed.TUE || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              WED: parsed.WED || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              THU: parsed.THU || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              FRI: parsed.FRI || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              SAT: parsed.SAT || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
              SUN: parsed.SUN || { start: data.schedule.openingTime || '09:00', end: data.schedule.closingTime || '18:00' },
            });
          } catch {
            // fallback
          }
        } else {
          const defaultStart = data.schedule.openingTime || '09:00';
          const defaultEnd = data.schedule.closingTime || '18:00';
          setDaySchedules({
            MON: { start: defaultStart, end: defaultEnd },
            TUE: { start: defaultStart, end: defaultEnd },
            WED: { start: defaultStart, end: defaultEnd },
            THU: { start: defaultStart, end: defaultEnd },
            FRI: { start: defaultStart, end: defaultEnd },
            SAT: { start: defaultStart, end: defaultEnd },
            SUN: { start: defaultStart, end: defaultEnd },
          });
        }
      }
    } catch (err) {
      console.error('Failed to load office timings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDayTimeChange = (dayKey: keyof DaySchedulesState, field: 'start' | 'end', value: string) => {
    setDaySchedules((prev) => ({
      ...prev,
      [dayKey]: {
        ...(prev[dayKey] || { start: '09:00', end: '18:00' }),
        [field]: value,
      },
    }));
  };

  const handleCopyMonToWeekdays = () => {
    const mondayTiming = daySchedules.MON;
    setDaySchedules((prev) => ({
      ...prev,
      TUE: { ...mondayTiming },
      WED: { ...mondayTiming },
      THU: { ...mondayTiming },
      FRI: { ...mondayTiming },
    }));
    setMessage({ type: 'success', text: 'Copied Monday timings to all weekdays (Tue - Fri).' });
  };

  const handleCopyMonToAllDays = () => {
    const mondayTiming = daySchedules.MON;
    setDaySchedules({
      MON: { ...mondayTiming },
      TUE: { ...mondayTiming },
      WED: { ...mondayTiming },
      THU: { ...mondayTiming },
      FRI: { ...mondayTiming },
      SAT: { ...mondayTiming },
      SUN: { ...mondayTiming },
    });
    setMessage({ type: 'success', text: 'Copied Monday timings to all days (Mon - Sun).' });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/office-timings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          openingTime: daySchedules.MON?.start || '09:00',
          closingTime: daySchedules.MON?.end || '18:00',
          workingDays: 'MON,TUE,WED,THU,FRI,SAT,SUN',
          timezone,
          autoCutoffEnabled,
          dayTimings: daySchedules,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to save office timings' });
      } else {
        setMessage({
          type: 'success',
          text: 'Office timings and automatic timer stop settings saved successfully.',
        });
        invalidateApiCache('/api/office-timings');
        await loadSettings(true);
        syncActiveTimer();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network request error while saving office timings.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-heading text-text-primary flex items-center gap-2">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span>Office Timings</span>
          </h1>
          <p className="helper-text text-text-secondary mt-1">
            {isAdmin
              ? 'Configure day-wise office operating hours, organization timezone, and automatic timer cutoff enforcement.'
              : 'Standard agency operational schedules and active daily working windows.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-white border border-border shadow-xs text-xs font-mono text-text-secondary flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>{timezone}</span>
          </span>

          {isAdmin && (
            <button
              type="button"
              id="save-office-timings-btn"
              data-testid="save-office-timings-btn"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Timings</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {message && (
        <div
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* CARD 1: DAY-WISE OFFICE TIMINGS */}
        <div className="rounded-card bg-white border border-border p-4 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="card-title text-text-primary">Day-Wise Office Operating Hours</h2>
                  {!isAdmin && (
                    <span className="label-text font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-border">
                      View-Only
                    </span>
                  )}
                </div>
                <p className="helper-text text-text-secondary mt-0.5">
                  {isAdmin
                    ? 'Set separate opening and closing times for each individual day of the week.'
                    : 'Standard office operational schedules configured by administrators.'}
                </p>
              </div>
            </div>

            {/* Quick Preset Copy Actions (Admin Only) */}
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyMonToWeekdays}
                  className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-border text-xs text-text-primary font-medium transition cursor-pointer flex items-center gap-1.5"
                  title="Copy Monday's start and end times to Tue, Wed, Thu, Fri"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  <span>Copy Mon to Weekdays</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyMonToAllDays}
                  className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-border text-xs text-text-primary font-medium transition cursor-pointer flex items-center gap-1.5"
                  title="Copy Monday's start and end times to all 7 days"
                >
                  <Sparkles className="w-3.5 h-3.5 text-warning" />
                  <span>Copy Mon to All Days</span>
                </button>
              </div>
            )}
          </div>

          {/* 7 Days Table / List */}
          {isLoading ? (
            <div className="p-12 text-center helper-text text-text-secondary">Loading office timings...</div>
          ) : (
            <div className="space-y-3">
              {DAYS_META.map((day) => {
                const schedule = daySchedules[day.key];
                const windowStr = calculateWindowHours(schedule.start, schedule.end);

                return (
                  <div
                    key={day.key}
                    id={`day-timing-${day.key.toLowerCase()}`}
                    data-testid={`day-timing-${day.key.toLowerCase()}`}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 sm:gap-4 ${
                      day.isWeekend
                        ? 'bg-slate-50/70 border-border hover:border-slate-300'
                        : 'bg-white border-border hover:border-slate-300'
                    }`}
                  >
                    {/* Day Label & Window */}
                    <div className="w-36 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="card-title text-text-primary text-sm">{day.label}</span>
                        {day.isWeekend && (
                          <span className="text-[10px] font-semibold text-text-secondary bg-slate-100 px-1.5 py-0.5 rounded border border-border">
                            Weekend
                          </span>
                        )}
                      </div>
                      <span className="helper-text text-text-secondary font-mono mt-0.5 block">
                        Window: {windowStr}
                      </span>
                    </div>

                    {/* Start Time and End Time */}
                    {isAdmin ? (
                      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                        {/* Start Time */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                          <label
                            htmlFor={`start-time-${day.key}-hour`}
                            className="label-text text-text-secondary sm:w-20 shrink-0 font-medium"
                          >
                            Start Time:
                          </label>
                          <div className="flex-1">
                            <TimePicker12h
                              id={`start-time-${day.key}`}
                              dataTestId={`start-time-${day.key}`}
                              value={schedule.start}
                              onChange={(val) => handleDayTimeChange(day.key, 'start', val)}
                              size="sm"
                            />
                          </div>
                        </div>

                        {/* End Time */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                          <label
                            htmlFor={`end-time-${day.key}-hour`}
                            className="label-text text-text-secondary sm:w-20 shrink-0 font-medium"
                          >
                            End Time:
                          </label>
                          <div className="flex-1">
                            <TimePicker12h
                              id={`end-time-${day.key}`}
                              dataTestId={`end-time-${day.key}`}
                              value={schedule.end}
                              onChange={(val) => handleDayTimeChange(day.key, 'end', val)}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* View-Only Mode for Employees */
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-center gap-2">
                          <span className="label-text text-text-secondary w-20 shrink-0 font-medium">Start:</span>
                          <div className="py-2 px-3 bg-slate-50 border border-border rounded-xl text-xs sm:text-sm text-text-primary font-mono w-full flex items-center justify-between">
                            <span className="font-semibold">{format24hTo12h(schedule.start)}</span>
                            <span className="text-xs text-text-secondary font-mono">({schedule.start})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="label-text text-text-secondary w-20 shrink-0 font-medium">End:</span>
                          <div className="py-2 px-3 bg-slate-50 border border-border rounded-xl text-xs sm:text-sm text-text-primary font-mono w-full flex items-center justify-between">
                            <span className="font-semibold">{format24hTo12h(schedule.end)}</span>
                            <span className="text-xs text-text-secondary font-mono">({schedule.end})</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CARD 2: AUTOMATIC TIMER STOP SETTINGS (ADMIN ONLY) */}
        {isAdmin && (
          <div className="rounded-card bg-white border border-border p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-success border border-green-200 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="card-title text-text-primary">Automatic Timer Stop Settings</h2>
                <p className="helper-text text-text-secondary">
                  Enforce strict cutoff boundaries so employee timers never run unmonitored overnight.
                </p>
              </div>
            </div>

            {/* Checkbox Container */}
            <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-xl border border-border">
              <input
                type="checkbox"
                id="autoCutoffCheckbox"
                data-testid="autoCutoffCheckbox"
                checked={autoCutoffEnabled}
                onChange={(e) => setAutoCutoffEnabled(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
              />
              <div className="flex-1">
                <label htmlFor="autoCutoffCheckbox" className="card-title text-text-primary block cursor-pointer">
                  Automatically stop the timer when the configured office end time is reached
                </label>
                <p className="helper-text text-text-secondary mt-1 leading-relaxed">
                  When enabled, active timers started during regular office hours will automatically stop exactly at the configured office end time for that day. After office hours, employees can use the Overtime option to track additional work, which runs until manually stopped.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      autoCutoffEnabled
                        ? 'bg-green-50 text-success border-green-200'
                        : 'bg-slate-100 text-slate-600 border-border'
                    }`}
                  >
                    {autoCutoffEnabled ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                        Automatic Stop Active
                      </>
                    ) : (
                      'Automatic Stop Disabled'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Keyboard & Mouse Inactivity Auto-Cut Container */}
            <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-xl border border-border">
              <div className="mt-1 w-4 h-4 text-primary flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="card-title text-text-primary block">
                    Keyboard &amp; Mouse Inactivity Auto-Cut
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-green-50 text-success border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                    Active (10-15 Min)
                  </span>
                </div>
                <p className="helper-text text-text-secondary mt-1 leading-relaxed">
                  Automatically monitors user activity during running timers. If no keyboard or mouse movement is detected for 10 minutes, a warning alert is prompted. If inactivity continues up to 15 minutes, the timer is automatically cut off to prevent unmonitored abandoned sessions.
                </p>
              </div>
            </div>

            {/* Timezone Selection */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Organization Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full py-2.5 px-3 bg-white border border-border rounded-xl text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono cursor-pointer"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST — UTC+05:30) · Default</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">America/New_York (EST / EDT — UTC-05:00)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT — UTC-08:00)</option>
                <option value="Europe/London">Europe/London (GMT / BST — UTC+00:00)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET / CEST — UTC+01:00)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST — UTC+04:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT — UTC+08:00)</option>
              </select>
            </div>
          </div>
        )}

        {/* Action Buttons (Admin Only) */}
        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              id="save-office-timings-btn-bottom"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="w-full sm:w-auto py-2.5 px-7 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Timings...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Office Timings</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
