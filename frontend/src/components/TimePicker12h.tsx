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
  dataTestId?: string;
  size?: 'default' | 'sm';
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
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker12h({
  value,
  onChange,
  label,
  description,
  disabled = false,
  id,
  dataTestId,
  size = 'default',
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

  const selectPadding = size === 'sm' ? 'py-1.5 px-1.5 text-xs sm:text-sm' : 'py-2 px-2.5 text-sm';
  const buttonPadding = size === 'sm' ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-xs';
  const containerPadding = size === 'sm' ? 'p-0.5 gap-0.5' : 'p-1 gap-1';
  const fieldWidth = size === 'sm' ? 'w-[52px] sm:w-[56px] shrink-0' : 'w-16 shrink-0';

  return (
    <div className="space-y-1.5" id={id} data-testid={dataTestId || id}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
            {label}
          </label>
          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-primary-subtle border border-blue-200 text-primary flex items-center gap-1">
            <Clock className="w-3 h-3 text-primary" />
            {format24hTo12h(value)}
          </span>
        </div>
      )}

      {/* Control Row: Hour, Minute, AM/PM Toggle */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Hour Selector */}
        <div className={`relative ${fieldWidth}`}>
          <select
            id={id ? `${id}-hour` : undefined}
            data-testid={id ? `${id}-hour` : undefined}
            value={hour12}
            disabled={disabled}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            className={`w-full ${selectPadding} bg-white border border-border rounded-xl font-bold text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none cursor-pointer text-center`}
            aria-label={`${label || 'Time'} hour`}
            title="Hour"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <span className="font-bold text-slate-400 text-base sm:text-lg shrink-0 select-none">:</span>

        {/* Minute Selector */}
        <div className={`relative ${fieldWidth}`}>
          <select
            id={id ? `${id}-minute` : undefined}
            data-testid={id ? `${id}-minute` : undefined}
            value={minute}
            disabled={disabled}
            onChange={(e) => handleMinuteChange(e.target.value)}
            className={`w-full ${selectPadding} bg-white border border-border rounded-xl font-bold text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none cursor-pointer text-center`}
            aria-label={`${label || 'Time'} minute`}
            title="Minute"
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* AM / PM Segmented Control */}
        <div className={`inline-flex rounded-xl bg-slate-100 border border-border ${containerPadding} shrink-0`}>
          <button
            type="button"
            id={id ? `${id}-am` : undefined}
            data-testid={id ? `${id}-am` : undefined}
            disabled={disabled}
            onClick={() => handlePeriodChange('AM')}
            className={`${buttonPadding} rounded-lg font-bold transition-all cursor-pointer ${
              period === 'AM'
                ? 'bg-white text-primary border border-slate-200/90 shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            id={id ? `${id}-pm` : undefined}
            data-testid={id ? `${id}-pm` : undefined}
            disabled={disabled}
            onClick={() => handlePeriodChange('PM')}
            className={`${buttonPadding} rounded-lg font-bold transition-all cursor-pointer ${
              period === 'PM'
                ? 'bg-white text-primary border border-slate-200/90 shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {description && (
        <p className="text-[11px] text-text-secondary mt-1">
          {description} (System 24h: <span className="font-mono text-text-primary font-medium">{value}</span>)
        </p>
      )}
    </div>
  );
}
