'use client';

import React from 'react';
import { Clock } from 'lucide-react';

interface TimePicker12hProps {
  value: string; // "HH:mm" in 24h format, e.g. "09:00" or "18:00"
  onChange: (val: string) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Converts a 24-hour "HH:mm" string to 12-hour components:
 * { hour12: number, minute: string, period: 'AM' | 'PM' }
 */
export function parse24hTo12h(time24: string): {
  hour12: number;
  minute: string;
  period: 'AM' | 'PM';
} {
  if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) {
    return { hour12: 9, minute: '00', period: 'AM' };
  }

  const [rawH, rawM] = time24.split(':');
  let h = parseInt(rawH, 10);
  if (isNaN(h)) h = 9;

  let m = parseInt(rawM, 10);
  if (isNaN(m)) m = 0;
  const minuteStr = String(m).padStart(2, '0');

  if (h === 0) {
    return { hour12: 12, minute: minuteStr, period: 'AM' };
  } else if (h === 12) {
    return { hour12: 12, minute: minuteStr, period: 'PM' };
  } else if (h > 12) {
    return { hour12: h - 12, minute: minuteStr, period: 'PM' };
  } else {
    return { hour12: h, minute: minuteStr, period: 'AM' };
  }
}

/**
 * Converts 12-hour components back into a 24-hour "HH:mm" string.
 */
export function format12hTo24h(hour12: number, minute: string, period: 'AM' | 'PM'): string {
  const m = String(minute).padStart(2, '0');
  let h = Number(hour12);

  if (period === 'AM') {
    if (h === 12) h = 0;
  } else {
    // PM
    if (h < 12) h += 12;
  }

  return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Formats a 24-hour "HH:mm" string for user display as "hh:mm AM/PM".
 * e.g. "18:00" -> "06:00 PM"
 * e.g. "09:30" -> "09:30 AM"
 */
export function format24hTo12h(time24: string): string {
  const { hour12, minute, period } = parse24hTo12h(time24);
  return `${String(hour12).padStart(2, '0')}:${minute} ${period}`;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function TimePicker12h({
  value,
  onChange,
  label,
  description,
  disabled = false,
  id,
}: TimePicker12hProps) {
  const { hour12, minute, period } = parse24hTo12h(value);

  const handleHourChange = (newHour: number) => {
    const updated = format12hTo24h(newHour, minute, period);
    onChange(updated);
  };

  const handleMinuteChange = (newMinute: string) => {
    const updated = format12hTo24h(hour12, newMinute, period);
    onChange(updated);
  };

  const handlePeriodChange = (newPeriod: 'AM' | 'PM') => {
    const updated = format12hTo24h(hour12, minute, newPeriod);
    onChange(updated);
  };

  return (
    <div className="space-y-1.5" id={id}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider">
            {label}
          </label>
          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-blue-950/60 border border-blue-800/40 text-blue-300 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            {format24hTo12h(value)}
          </span>
        </div>
      )}

      {/* Control Row: Hour, Minute, AM/PM Toggle */}
      <div className="flex items-center gap-2">
        {/* Hour Selector */}
        <div className="relative flex-1">
          <select
            value={hour12}
            disabled={disabled}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer text-center"
            aria-label={`${label || 'Time'} hour`}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
            HR
          </span>
        </div>

        <span className="font-bold text-slate-500 text-lg">:</span>

        {/* Minute Selector */}
        <div className="relative flex-1">
          <select
            value={MINUTES.includes(minute) ? minute : 'custom'}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                handleMinuteChange(e.target.value);
              }
            }}
            className="w-full py-2.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer text-center"
            aria-label={`${label || 'Time'} minute`}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {!MINUTES.includes(minute) && (
              <option value="custom">
                {minute}
              </option>
            )}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
            MIN
          </span>
        </div>

        {/* AM / PM Segmented Control */}
        <div className="flex rounded-xl bg-slate-950 border border-slate-800 p-1 shrink-0 gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handlePeriodChange('AM')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              period === 'AM'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-950/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handlePeriodChange('PM')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              period === 'PM'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm shadow-indigo-950/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {description && (
        <p className="text-[11px] text-slate-400 mt-1">
          {description} (System 24h: <span className="font-mono text-slate-300">{value}</span>)
        </p>
      )}
    </div>
  );
}
