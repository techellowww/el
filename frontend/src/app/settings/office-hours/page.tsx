'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  Building2,
  Clock,
  Calendar,
  Globe,
  ShieldCheck,
  PlayCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { TimePicker12h, format24hTo12h } from '@/components/TimePicker12h';

export default function OfficeHoursSettingsPage() {
  const { user } = useAuthStore();
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('18:00');
  const [workingDays, setWorkingDays] = useState('MON,TUE,WED,THU,FRI');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [allowOutsideHours, setAllowOutsideHours] = useState(true);
  const [autoCutoffEnabled, setAutoCutoffEnabled] = useState(true);

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
      const res = await fetch('/api/settings/office-hours');
      if (res.ok) {
        const data = await res.json();
        if (data.schedule) {
          setOpeningTime(data.schedule.openingTime);
          setClosingTime(data.schedule.closingTime);
          setWorkingDays(data.schedule.workingDays);
          setTimezone(data.schedule.timezone);
          setAllowOutsideHours(data.schedule.allowOutsideHours);
          setAutoCutoffEnabled(data.schedule.autoCutoffEnabled);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/office-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingTime,
          closingTime,
          workingDays,
          timezone,
          allowOutsideHours,
          autoCutoffEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to save office settings' });
      } else {
        setMessage({ type: 'success', text: 'Office schedule & auto-cutoff policies updated successfully.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network request error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualCutoffTrigger = async () => {
    setIsTriggering(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/office-hours/cutoff-trigger', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.error || 'Cutoff trigger failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error executing cutoff' });
    } finally {
      setIsTriggering(false);
    }
  };

  const toggleDay = (day: string) => {
    const daysArr = workingDays.split(',').map((d) => d.trim());
    if (daysArr.includes(day)) {
      setWorkingDays(daysArr.filter((d) => d !== day).join(','));
    } else {
      setWorkingDays([...daysArr, day].join(','));
    }
  };

  const allDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const activeDays = workingDays.split(',').map((d) => d.trim());

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-slate-800">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-blue-500" />
            Office Hours & Automated Cut-Off Rules
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure standard office operating windows, organization timezone, working days, and automatic timer stopping rules.
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
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
          {/* Schedule Configuration Card */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" /> Standard Daily Office Hours
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <TimePicker12h
                id="opening-time-picker"
                label="Office Opening Time"
                value={openingTime}
                onChange={setOpeningTime}
                description="Start of official working hours"
              />

              <TimePicker12h
                id="closing-time-picker"
                label="Office Closing Time (Cut-off Boundary)"
                value={closingTime}
                onChange={setClosingTime}
                description="End of official working hours & auto-cutoff point"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                Applicable Working Days
              </label>
              <div className="flex flex-wrap gap-2">
                {allDays.map((day) => {
                  const isSelected = activeDays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`py-2 px-3.5 rounded-xl text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Organization Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (EST / EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                <option value="Europe/London">Europe/London (GMT / BST)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET / CEST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
              </select>
            </div>
          </div>

          {/* Automatic Enforcement Rules */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Automatic Cut-Off & Outside-Hours Policies
            </h3>

            <div className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                id="autoCutoffCheckbox"
                checked={autoCutoffEnabled}
                onChange={(e) => setAutoCutoffEnabled(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <div>
                <label htmlFor="autoCutoffCheckbox" className="text-sm font-semibold text-white block cursor-pointer">
                  Enable Automatic Closing-Time Timer Cut-off (Rule 3)
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  When enabled, active project timers will be automatically stopped at the configured closing time ({format24hTo12h(closingTime)}), even if the employee&apos;s browser is closed or their computer is turned off.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                id="allowOutsideCheckbox"
                checked={allowOutsideHours}
                onChange={(e) => setAllowOutsideHours(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <div>
                <label htmlFor="allowOutsideCheckbox" className="text-sm font-semibold text-white block cursor-pointer">
                  Permit Outside-Office-Hours Tracking (Rule 4)
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allows employees to manually start timers after hours when required. Such sessions will be clearly flagged as "Outside Hours" and isolated in administrative reviews.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleManualCutoffTrigger}
              disabled={isTriggering}
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-amber-300 flex items-center gap-2 transition"
            >
              <PlayCircle className="w-4 h-4" />
              {isTriggering ? 'Evaluating Cutoffs...' : 'Trigger Cut-Off Evaluation Now'}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Office Settings'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
