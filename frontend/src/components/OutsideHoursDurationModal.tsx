'use client';

import React, { useState } from 'react';
import { Clock, Moon, AlertTriangle, ShieldCheck, Play, X, Camera } from 'lucide-react';
import { OfficeScheduleData } from '@/lib/store';

interface OutsideHoursDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (durationMinutes: number, notes?: string) => Promise<void>;
  projectName?: string;
  projectCode?: string;
  schedule?: OfficeScheduleData | null;
  initialNotes?: string;
  isStarting?: boolean;
}

const PRESET_DURATIONS = [
  { label: '30 min', minutes: 30, desc: 'Quick task / patch' },
  { label: '1 hour', minutes: 60, desc: 'Recommended', isDefault: true },
  { label: '1.5 hrs', minutes: 90, desc: 'Sprint task' },
  { label: '2 hours', minutes: 120, desc: 'Extended session' },
  { label: '3 hours', minutes: 180, desc: 'Deep work' },
  { label: '4 hours', minutes: 240, desc: 'Max overtime limit' },
];

export function OutsideHoursDurationModal({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  projectCode,
  schedule,
  initialNotes = '',
  isStarting = false,
}: OutsideHoursDurationModalProps) {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(60);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>('60');
  const [taskNotes, setTaskNotes] = useState<string>(initialNotes);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectiveMinutes = isCustom ? Math.max(15, Math.min(240, Number(customInput) || 60)) : selectedMinutes;

  // Calculate projected stop time
  const now = new Date();
  const projectedStopTime = new Date(now.getTime() + effectiveMinutes * 60 * 1000);
  const timeFormatted = projectedStopTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleStart = async () => {
    if (effectiveMinutes < 15 || effectiveMinutes > 240) {
      setErrorMsg('Please select a session duration between 15 minutes and 4 hours (240 mins).');
      return;
    }
    setErrorMsg(null);
    try {
      await onConfirm(effectiveMinutes, taskNotes);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to start overtime session.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/80 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="relative p-6 pb-4 bg-gradient-to-br from-amber-950/40 via-slate-900 to-indigo-950/30 border-b border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Moon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  After-Hours Protection
                </span>
                {schedule?.closingTime && (
                  <span className="text-[11px] text-slate-400">
                    Office Closed at {schedule.closingTime}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                Select Overtime Session Limit
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
            Standard office timing has ended. To make sure the timer doesn&apos;t keep running all night if you forget to stop it, please select an expected work duration.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Active Target Project */}
          {projectCode && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Project:</span>
              <span className="font-semibold text-white truncate max-w-[280px]">
                {projectCode} — {projectName}
              </span>
            </div>
          )}

          {/* Duration Preset Selection Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Planned Duration:
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {PRESET_DURATIONS.map((preset) => {
                const isSelected = !isCustom && selectedMinutes === preset.minutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => {
                      setIsCustom(false);
                      setSelectedMinutes(preset.minutes);
                    }}
                    className={`p-3 rounded-xl border text-left transition relative cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-900/30 ring-1 ring-blue-500'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{preset.label}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Minutes Option */}
            <div className="mt-3 flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setIsCustom(!isCustom)}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isCustom ? '← Use preset durations' : 'Set custom minutes (15 - 240 mins)'}</span>
              </button>

              {isCustom && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="15"
                    max="240"
                    step="5"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-20 py-1.5 px-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono text-center focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              )}
            </div>
          </div>

          {/* Projected End Summary Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-blue-950/40 border border-blue-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 block">Automatic Cut-Off Time</span>
                <span className="text-xs font-bold text-white">
                  Stops at <span className="text-blue-300 font-mono text-sm">{timeFormatted}</span> ({effectiveMinutes} min session)
                </span>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 italic text-right max-w-[130px] leading-tight">
              Stops earlier if you click Stop
            </span>
          </div>

          {/* Screenshot Monitoring Indicator */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300">
            <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Workstation screenshot monitoring remains active during overtime work.</span>
          </div>

          {/* Optional Task Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Task Notes (Optional):
            </label>
            <input
              type="text"
              placeholder="What are you working on late?"
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting}
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            {isStarting ? 'Starting Timer...' : `Start Timer (Auto-stops in ${effectiveMinutes}m)`}
          </button>
        </div>
      </div>
    </div>
  );
}
