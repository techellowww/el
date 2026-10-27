'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore, useTimerStore } from '@/lib/store';
import {
  Building2,
  Clock,
  Calendar,
  Globe,
  ShieldCheck,
  PlayCircle,
  AlertCircle,
  CheckCircle2,
  Copy,
  Sparkles,
  Save,
  Check,
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
  const [isTriggering, setIsTriggering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/office-timings', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) {
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
            // Populate defaults using global opening and closing time if dayTimings wasn't initialized yet
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
        await loadSettings();
        syncActiveTimer();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network request error while saving office timings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerCutoffNow = async () => {
    setIsTriggering(true);
    setMessage(null);

    try {
      const res = await fetch('/api/office-timings/cutoff-trigger', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        syncActiveTimer();
      } else {
        setMessage({ type: 'error', text: data.error || 'Cutoff evaluation failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error evaluating cutoffs.' });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-blue-500" />
              <span>Office Timings</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Configure day-wise office start and end times for Monday through Sunday, and enable automatic timer stopping.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 font-mono flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" /> {timezone}
            </span>
          </div>
        </div>

        {/* Alert / Status Banner */}
        {message && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 text-xs sm:text-sm leading-relaxed transition animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/40 border-red-800/60 text-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* ========================================================================= */}
          {/* DAY-WISE OFFICE TIMINGS (MONDAY THROUGH SUNDAY)                          */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span>Day-Wise Office Operating Hours</span>
                  </h3>
                  {!isAdmin && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                      View-Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAdmin
                    ? 'Set separate start time and end time for each individual day of the week.'
                    : 'Standard office operational schedules configured by administrators.'}
                </p>
              </div>

              {/* Quick Preset Copy Actions (Admin Only) */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyMonToWeekdays}
                    className="py-1.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-medium transition cursor-pointer flex items-center gap-1.5"
                    title="Copy Monday's start and end times to Tue, Wed, Thu, Fri"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Copy Mon to Weekdays</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMonToAllDays}
                    className="py-1.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-medium transition cursor-pointer flex items-center gap-1.5"
                    title="Copy Monday's start and end times to all 7 days"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Copy Mon to All Days</span>
                  </button>
                </div>
              )}
            </div>

            {/* 7 Days Table / Grid */}
            <div className="space-y-3">
              {DAYS_META.map((day) => {
                const schedule = daySchedules[day.key];
                const windowStr = calculateWindowHours(schedule.start, schedule.end);

                return (
                  <div
                    key={day.key}
                    id={`day-timing-${day.key.toLowerCase()}`}
                    data-testid={`day-timing-${day.key.toLowerCase()}`}
                    className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                      day.isWeekend
                        ? 'bg-slate-950/40 border-slate-800/60'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    {/* Day Label */}
                    <div className="w-36 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{day.label}</span>
                        {day.isWeekend && (
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            Weekend
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                        Window: {windowStr}
                      </span>
                    </div>

                    {/* Start Time and End Time */}
                    {isAdmin ? (
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Start Time */}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`start-time-${day.key}`}
                            className="text-xs text-slate-400 w-20 shrink-0 font-medium"
                          >
                            Start Time:
                          </label>
                          <input
                            id={`start-time-${day.key}`}
                            data-testid={`start-time-${day.key}`}
                            type="time"
                            value={schedule.start}
                            onChange={(e) => handleDayTimeChange(day.key, 'start', e.target.value)}
                            className="py-2 px-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-blue-500 w-full"
                          />
                          <span className="text-xs text-slate-500 font-mono shrink-0 w-16 text-right">
                            {format24hTo12h(schedule.start)}
                          </span>
                        </div>

                        {/* End Time */}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`end-time-${day.key}`}
                            className="text-xs text-slate-400 w-20 shrink-0 font-medium"
                          >
                            End Time:
                          </label>
                          <input
                            id={`end-time-${day.key}`}
                            data-testid={`end-time-${day.key}`}
                            type="time"
                            value={schedule.end}
                            onChange={(e) => handleDayTimeChange(day.key, 'end', e.target.value)}
                            className="py-2 px-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-blue-500 w-full"
                          />
                          <span className="text-xs text-slate-500 font-mono shrink-0 w-16 text-right">
                            {format24hTo12h(schedule.end)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* View-Only Mode for Employees */
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-20 shrink-0 font-medium">Start Time:</span>
                          <div className="py-2 px-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs sm:text-sm text-slate-200 font-mono w-full flex items-center justify-between">
                            <span>{schedule.start}</span>
                            <span className="text-xs text-slate-400 font-mono">({format24hTo12h(schedule.start)})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-20 shrink-0 font-medium">End Time:</span>
                          <div className="py-2 px-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs sm:text-sm text-slate-200 font-mono w-full flex items-center justify-between">
                            <span>{schedule.end}</span>
                            <span className="text-xs text-slate-400 font-mono">({format24hTo12h(schedule.end)})</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Card 1 footer (if non-admin, no extra button; if admin, buttons are in action row below) */}
          </div>

          {/* ========================================================================= */}
          {/* CARD 2: AUTOMATIC TIMER STOP CHECKBOX & ENFORCEMENT (ADMIN ONLY)          */}
          {/* ========================================================================= */}
          {isAdmin && (
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Automatic Timer Stop Settings</span>
              </h3>

              {/* Checkbox */}
              <div className="flex items-start gap-3.5 p-4 bg-slate-950/80 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="autoCutoffCheckbox"
                  data-testid="autoCutoffCheckbox"
                  checked={autoCutoffEnabled}
                  onChange={(e) => setAutoCutoffEnabled(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer accent-blue-600 shrink-0"
                />
                <div className="flex-1">
                  <label htmlFor="autoCutoffCheckbox" className="text-sm font-semibold text-white block cursor-pointer">
                    Automatically stop the timer when the configured office end time is reached
                  </label>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    When enabled, any active timer will be automatically stopped exactly at the configured office end time for that day. This prevents timers from running overnight if an employee forgets to stop their timer.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        autoCutoffEnabled
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {autoCutoffEnabled ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Automatic Stop Active
                        </>
                      ) : (
                        'Automatic Stop Disabled'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timezone Selection */}
              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Organization Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET / CEST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                </select>
              </div>
            </div>
          )}

          {/* Action Buttons (Admin Only) */}
          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTriggerCutoffNow}
                disabled={isTriggering}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-amber-300 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <PlayCircle className="w-4 h-4" />
                <span>{isTriggering ? 'Evaluating Office End Time...' : 'Test Auto-Stop Evaluation Now'}</span>
              </button>

              <button
                type="button"
                id="save-office-timings-btn"
                data-testid="save-office-timings-btn"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="w-full sm:w-auto py-2.5 px-7 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-600/30 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Timings...' : 'Save Office Timings'}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </AppShell>
  );
}
