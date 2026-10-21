'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  Mail,
  Send,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Server,
  History,
  Plus,
  X,
  Users,
  Sparkles,
  RefreshCw,
  Check,
  FileText,
} from 'lucide-react';
import { TimePicker12h } from '@/components/TimePicker12h';

export default function EmailSettingsPage() {
  const { user } = useAuthStore();
  const [enabled, setEnabled] = useState(true);
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [dailyTime, setDailyTime] = useState('19:00');
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [weeklyDay, setWeeklyDay] = useState('FRI');
  const [weeklyTime, setWeeklyTime] = useState('18:00');

  // EOD Report Sharing Recipient Emails List (supports as many as needed)
  const [recipientList, setRecipientList] = useState<string[]>(['ellowwwstudio@gmail.com']);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState<string | null>(null);

  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('EL App Notifications <ellowwwstudio@gmail.com>');

  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEod, setIsSendingEod] = useState(false);
  const [isSendingWeekly, setIsSendingWeekly] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const parseEmails = (raw: string): string[] => {
    return raw
      .split(/[,;\s\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/email');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setEnabled(data.settings.enabled);
          setDailyEnabled(data.settings.dailyEnabled);
          setDailyTime(data.settings.dailyTime || '19:00');
          setWeeklyEnabled(data.settings.weeklyEnabled);
          setWeeklyDay(data.settings.weeklyDay || 'FRI');
          setWeeklyTime(data.settings.weeklyTime || '18:00');

          const rawRecipients: string = data.settings.recipients || 'ellowwwstudio@gmail.com';
          const parsed = parseEmails(rawRecipients);
          setRecipientList(parsed.length > 0 ? parsed : ['ellowwwstudio@gmail.com']);

          setSmtpHost(data.settings.smtpHost || 'smtp.gmail.com');
          setSmtpPort(data.settings.smtpPort || 587);
          setSmtpUser(data.settings.smtpUser || '');
          setSmtpPass(data.settings.smtpPass || '');
          setSmtpFrom(data.settings.smtpFrom || 'EL App Notifications <ellowwwstudio@gmail.com>');
        }
        setDeliveryLogs(data.deliveryLogs || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmail = (rawText: string) => {
    setEmailInputError(null);
    if (!rawText.trim()) return;

    const extracted = parseEmails(rawText);
    if (extracted.length === 0) {
      setEmailInputError('Please enter a valid email address (e.g. name@company.com)');
      return;
    }

    setRecipientList((prev) => Array.from(new Set([...prev, ...extracted])));
    setNewEmailInput('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setRecipientList((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const cleanRecipients = recipientList.join(', ');

    try {
      const res = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          dailyEnabled,
          dailyTime,
          weeklyEnabled,
          weeklyDay,
          weeklyTime,
          recipients: cleanRecipients,
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass,
          smtpFrom,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to update email settings' });
      } else {
        setMessage({
          type: 'success',
          text: `Settings saved successfully. Configured ${recipientList.length} EOD report recipient email(s).`,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network request error while saving settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendEodNow = async () => {
    if (recipientList.length === 0) {
      setMessage({
        type: 'error',
        text: 'Please add at least one recipient email address before dispatching EOD report.',
      });
      return;
    }

    setIsSendingEod(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/email/send-eod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: recipientList }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `End-of-Day (EOD) Report successfully dispatched to ${recipientList.length} recipient(s): ${recipientList.join(', ')}`,
        });
        loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to dispatch EOD report email.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error dispatching EOD report email.' });
    } finally {
      setIsSendingEod(false);
    }
  };

  const handleTestWeekly = async () => {
    setIsSendingWeekly(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'weekly', recipients: recipientList }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Weekly summary email dispatched to ${recipientList.length} recipient(s).` });
        loadSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Test send failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error sending weekly test email.' });
    } finally {
      setIsSendingWeekly(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6 font-sans">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Mail className="w-6 h-6 text-blue-500" />
              <span>Email Automation & EOD Report Sharing</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Configure End-of-Day (EOD) employee project & timings reports, manage multiple recipient emails, and review delivery logs.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSettings}
            disabled={isLoading}
            className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-2 self-start sm:self-auto cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status / Alert Banner */}
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
          {/* CARD 1: EOD REPORT SHARING MAIL IDS (AS MANY IDS AS NEEDED)             */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>EOD Report Sharing Mail IDs</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  End-of-Day project and timings summaries will be shared to all recipient email addresses added below.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  {recipientList.length} Recipient{recipientList.length === 1 ? '' : 's'} Configured
                </span>
              </div>
            </div>

            {/* Email Chips Container */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 min-h-[38px]">
                {recipientList.length === 0 ? (
                  <span className="text-xs text-amber-400/90 italic flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No recipient email IDs configured. Please add email addresses below.
                  </span>
                ) : (
                  recipientList.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 rounded-lg bg-blue-950/60 border border-blue-500/30 text-blue-200 font-mono text-xs shadow-sm hover:border-blue-400 transition"
                    >
                      <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="hover:text-red-400 hover:bg-red-500/10 p-1 rounded cursor-pointer transition text-slate-400"
                        title={`Remove ${email}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add New Email Input Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-900">
                <div className="relative flex-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Type an email address (e.g. admin@company.com, manager@company.com)..."
                    value={newEmailInput}
                    onChange={(e) => {
                      setNewEmailInput(e.target.value);
                      setEmailInputError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddEmail(newEmailInput);
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleAddEmail(newEmailInput)}
                  disabled={!newEmailInput.trim()}
                  className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Recipient</span>
                </button>
              </div>

              {emailInputError && (
                <p className="text-[11px] text-red-400 mt-1">{emailInputError}</p>
              )}

              {/* Helper Links & Shortcuts */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>
                  Tip: You can paste multiple emails separated by commas or newlines. Unlimited email IDs supported.
                </span>
                <div className="flex items-center gap-3">
                  {user?.email && !recipientList.includes(user.email.toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => handleAddEmail(user.email)}
                      className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer transition font-medium"
                    >
                      + Add My Email ({user.email})
                    </button>
                  )}
                  {recipientList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRecipientList([])}
                      className="text-red-400/80 hover:text-red-300 hover:underline cursor-pointer transition font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 2: SCHEDULED AUTOMATION & DIRECT DISPATCH                           */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>Automated Email Schedules</span>
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="masterEmailToggle"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="masterEmailToggle" className="text-xs font-semibold text-slate-300 cursor-pointer">
                  Enable Scheduled Deliveries
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Daily EOD Operations Summary */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        End-of-Day (EOD) Report
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={dailyEnabled}
                      onChange={(e) => setDailyEnabled(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Compiles each employee's worked projects, daily start/end timings, durations, and unrecorded employee alerts into an executive email report.
                  </p>
                </div>

                <TimePicker12h
                  label="Scheduled Daily Delivery Time (IST)"
                  value={dailyTime}
                  onChange={setDailyTime}
                />

                <button
                  type="button"
                  onClick={handleSendEodNow}
                  disabled={isSendingEod || recipientList.length === 0}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingEod ? 'animate-spin' : ''}`} />
                  <span>{isSendingEod ? 'Sending EOD Report...' : 'Send EOD Report Now to All Recipients'}</span>
                </button>
              </div>

              {/* Weekly Project Summary */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      Weekly Project Summary
                    </span>
                    <input
                      type="checkbox"
                      checked={weeklyEnabled}
                      onChange={(e) => setWeeklyEnabled(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Aggregated Monday-to-Sunday project hours, top contributors, and completion milestones.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Delivery Day</label>
                    <select
                      value={weeklyDay}
                      onChange={(e) => setWeeklyDay(e.target.value)}
                      className="w-full py-1.5 px-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Time</label>
                    <input
                      type="time"
                      value={weeklyTime}
                      onChange={(e) => setWeeklyTime(e.target.value)}
                      className="w-full py-1.5 px-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestWeekly}
                  disabled={isSendingWeekly || recipientList.length === 0}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border border-slate-700/50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingWeekly ? 'animate-spin' : ''}`} />
                  <span>{isSendingWeekly ? 'Sending...' : 'Test Send Weekly Summary'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CARD 3: SMTP CREDENTIALS                                                 */}
          {/* ========================================================================= */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>SMTP Provider Credentials</span>
            </h3>
            <p className="text-xs text-slate-400">
              Configure SMTP credentials (e.g. Gmail App Password, SendGrid, Amazon SES). If left blank or delivery is simulated, records are cleanly tracked in the delivery log.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Username / Email</label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Password / App Password</label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">From Sender Address</label>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="EL App Notifications <notifications@company.com>"
                className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving Settings...' : 'Save Email & EOD Settings'}</span>
            </button>
          </div>
        </form>

        {/* ========================================================================= */}
        {/* CARD 4: RECENT DELIVERY LOGS                                              */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                <span>Recent Email Delivery Logs</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Audit trail of outgoing automated EOD summaries and test dispatches.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Last {deliveryLogs.length} Records
            </span>
          </div>

          {deliveryLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No email deliveries recorded yet. Use the "Send EOD Report Now" button above to test.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="pb-2.5 font-medium">Timestamp</th>
                    <th className="pb-2.5 font-medium">Report Type</th>
                    <th className="pb-2.5 font-medium">Recipient</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 font-medium">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {deliveryLogs.map((log) => (
                    <tr key={log.id} className="text-slate-300 hover:bg-slate-800/30 transition">
                      <td className="py-2.5 text-slate-400 whitespace-nowrap">
                        {log.sentAt ? new Date(log.sentAt).toLocaleString() : new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {log.type}
                        </span>
                      </td>
                      <td className="py-2.5 text-white whitespace-nowrap">{log.recipient}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            log.status === 'SENT'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : log.status === 'SIMULATED'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400 truncate max-w-[200px]" title={log.subject}>
                        {log.subject}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
