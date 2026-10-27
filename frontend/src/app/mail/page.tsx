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
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  ExternalLink,
} from 'lucide-react';
import { TimePicker12h } from '@/components/TimePicker12h';

interface AuditLogItem {
  id: string;
  date: string;
  time: string;
  status: 'Success' | 'Failed';
  rawStatus: string;
  recipients: string;
  subject: string;
  type: string;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

interface GeneratedReport {
  startDate: string;
  endDate: string;
  totalTrackedSeconds: number;
  totalHoursFormatted: string;
  regularSeconds: number;
  regularHoursFormatted?: string;
  outsideHoursSeconds: number;
  outsideHoursFormatted?: string;
  totalEntriesCount: number;
  employeeBreakdown?: Array<{
    user: { id: string; name: string; employeeId: string; department?: string | null };
    totalDuration?: number;
    regularDuration?: number;
    outsideHoursDuration?: number;
    totalHoursFormatted: string;
    regularHoursFormatted: string;
    outsideHoursFormatted: string;
  }>;
  dailyBreakdown?: Array<{
    date: string;
    seconds: number;
    hoursFormatted: string;
  }>;
}

export default function MailModulePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // 4.1 Automatic Report Emails Settings
  const [enabled, setEnabled] = useState(true);
  const [scheduleType, setScheduleType] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [scheduleTime, setScheduleTime] = useState('18:00');
  const [weeklyDay, setWeeklyDay] = useState('FRI');
  const [monthlyDay, setMonthlyDay] = useState(1);

  // Recipient Email Addresses
  const [recipientList, setRecipientList] = useState<string[]>(['admin@company.com']);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState<string | null>(null);

  // SMTP Configuration (kept intact)
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('EL App Notifications <notifications@elapp.local>');
  const [showSmtpConfig, setShowSmtpConfig] = useState(true);
  const [hasEnvPass, setHasEnvPass] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{
    success: boolean;
    message: string;
    guidance?: string;
  } | null>(null);

  // 4.2 Mail Audit List
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [selectedErrorLog, setSelectedErrorLog] = useState<AuditLogItem | null>(null);

  // 4.3 Manual Report Generation
  const [manualFromDate, setManualFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [manualToDate, setManualToDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingManualReport, setIsSendingManualReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);

  // Status & notifications
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const parseEmails = (raw: string): string[] => {
    return raw
      .split(/[,;\s\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  };

  const loadAll = async () => {
    setIsLoading(true);
    await Promise.all([loadSettings(), loadAuditLogs()]);
    setIsLoading(false);
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/mail/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.envDefaults) {
          setHasEnvPass(Boolean(data.envDefaults.hasEnvPass));
        }
        if (data.settings) {
          setEnabled(data.settings.enabled ?? true);
          setScheduleType(
            (data.settings.scheduleType as 'DAILY' | 'WEEKLY' | 'MONTHLY') || 'DAILY'
          );
          setScheduleTime(data.settings.scheduleTime || data.settings.dailyTime || '18:00');
          setWeeklyDay(data.settings.weeklyDay || 'FRI');
          setMonthlyDay(data.settings.monthlyDay || 1);

          const rawRecipients: string = data.settings.recipients || 'admin@company.com';
          const parsed = parseEmails(rawRecipients);
          setRecipientList(parsed.length > 0 ? parsed : ['admin@company.com']);

          setSmtpHost(data.settings.smtpHost || data.envDefaults?.smtpHost || 'smtp.gmail.com');
          setSmtpPort(data.settings.smtpPort || data.envDefaults?.smtpPort || 587);
          setSmtpUser(data.settings.smtpUser || data.envDefaults?.smtpUser || '');
          setSmtpPass(data.settings.smtpPass || '');
          setSmtpFrom(data.settings.smtpFrom || data.envDefaults?.smtpFrom || 'EL App Notifications <notifications@elapp.local>');
        }
      }
    } catch (err) {
      console.error('Failed to load mail settings:', err);
    }
  };

  const loadAuditLogs = async () => {
    setIsAuditLoading(true);
    try {
      const res = await fetch('/api/mail/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load mail audit list:', err);
    } finally {
      setIsAuditLoading(false);
    }
  };

  const handleAddEmail = (rawText: string) => {
    setEmailInputError(null);
    if (!rawText.trim()) return;

    const extracted = parseEmails(rawText);
    if (extracted.length === 0) {
      setEmailInputError('Please enter a valid email address (e.g. reports@company.com)');
      return;
    }

    setRecipientList((prev) => Array.from(new Set([...prev, ...extracted])));
    setNewEmailInput('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    if (recipientList.length <= 1) {
      setEmailInputError('At least one recipient email address must remain configured.');
      return;
    }
    setRecipientList((prev) => prev.filter((e) => e !== emailToRemove));
  };

  // 4.1 Save Automatic Schedule Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Administrator privileges are required to modify settings.' });
      return;
    }

    if (recipientList.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one recipient email address.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const cleanRecipients = recipientList.join(', ');

    try {
      const res = await fetch('/api/mail/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          scheduleType,
          scheduleTime,
          weeklyDay,
          monthlyDay,
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
        setMessage({ type: 'error', text: data.error || 'Failed to update email schedule settings' });
      } else {
        setMessage({
          type: 'success',
          text: `Mail settings saved successfully. ${scheduleType} reports configured for ${recipientList.length} recipient(s).`,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error while saving settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Test SMTP Connection
  const handleTestSmtpConnection = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);

    try {
      const res = await fetch('/api/mail/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpTestResult({
          success: true,
          message: data.message || 'SMTP connection tested and verified successfully!',
        });
      } else {
        setSmtpTestResult({
          success: false,
          message: data.error || 'SMTP authentication failed.',
          guidance: data.guidance,
        });
      }
    } catch {
      setSmtpTestResult({
        success: false,
        message: 'Network error communicating with the SMTP test endpoint.',
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Send Scheduled Report Now
  const handleSendNow = async () => {
    if (recipientList.length === 0) {
      setMessage({
        type: 'error',
        text: 'Please configure at least one recipient email address first.',
      });
      return;
    }

    setIsSendingNow(true);
    setMessage(null);

    try {
      const res = await fetch('/api/mail/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleType,
          recipients: recipientList,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Report (${scheduleType}) successfully sent to ${recipientList.length} recipient(s).`,
        });
        loadAuditLogs();
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to send report email.',
        });
        loadAuditLogs();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error sending report email.' });
    } finally {
      setIsSendingNow(false);
    }
  };

  // 4.3 Validate and Generate Manual Report
  const validateDateRange = (from: string, to: string): boolean => {
    setDateValidationError(null);
    if (!from || !to) {
      setDateValidationError('Both From Date and To Date are required.');
      return false;
    }
    const fromD = new Date(from);
    const toD = new Date(to);
    if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) {
      setDateValidationError('Invalid date selection.');
      return false;
    }
    if (toD < fromD) {
      setDateValidationError('To Date must be on or after From Date.');
      return false;
    }
    return true;
  };

  const handleGenerateManualReport = async () => {
    if (!validateDateRange(manualFromDate, manualToDate)) {
      return;
    }

    setIsGeneratingReport(true);
    setMessage(null);
    setGeneratedReport(null);

    try {
      const res = await fetch('/api/mail/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: manualFromDate,
          endDate: manualToDate,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedReport(data.report);
        setMessage({
          type: 'success',
          text: `Report generated for ${manualFromDate} to ${manualToDate}. Total tracked: ${data.report.totalHoursFormatted}.`,
        });
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to generate report for selected date range.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error generating report.' });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // 4.3 Send Generated Manual Report via SMTP
  const handleSendManualReport = async () => {
    if (!validateDateRange(manualFromDate, manualToDate)) {
      return;
    }

    if (recipientList.length === 0) {
      setMessage({
        type: 'error',
        text: 'Please configure at least one recipient email address before sending.',
      });
      return;
    }

    setIsSendingManualReport(true);
    setMessage(null);

    try {
      const res = await fetch('/api/mail/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: manualFromDate,
          endDate: manualToDate,
          recipients: recipientList,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Manual report successfully dispatched via SMTP to ${recipientList.length} recipient(s): ${recipientList.join(', ')}`,
        });
        loadAuditLogs();
      } else {
        setMessage({
          type: 'error',
          text: data.message || data.error || 'Failed to dispatch manual report via SMTP.',
        });
        loadAuditLogs();
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error dispatching manual report.' });
    } finally {
      setIsSendingManualReport(false);
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
            The Mail module is reserved for administrators only.
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Mail</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Reports & Automation
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Configure scheduled email reporting, manage recipients, generate manual reports, and review mail delivery audit logs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="refresh-mail-data-btn"
              data-testid="refresh-mail-data-btn"
              onClick={loadAll}
              disabled={isLoading || isAuditLoading}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isAuditLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {message && (
          <div
            id="mail-feedback-banner"
            data-testid="mail-feedback-banner"
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* LEFT COLUMN: Automatic Report Emails & Recipients */}
          <div className="lg:col-span-7 flex flex-col h-full">
            {/* Automatic Report Emails Configuration */}
            <div className="h-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Automatic Report Emails</h2>
                    <p className="text-xs text-slate-400">
                      Configure automated delivery schedule and manage recipient email addresses.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="auto-email-enabled-toggle"
                    data-testid="auto-email-enabled-toggle"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    disabled={!isAdmin}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <form onSubmit={handleSaveSettings} className="flex-1 flex flex-col justify-between pt-6 space-y-6">
                <div className="space-y-6 flex-1 flex flex-col">
                  {/* Schedule Selection: Daily, Weekly, Monthly */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Schedule Selection
                    </label>
                    <p className="text-xs text-slate-400 mb-3">
                      Choose how often reports should be automatically generated and dispatched.
                    </p>

                    <div className="grid grid-cols-3 gap-3">
                      {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((type) => {
                        const isSelected = scheduleType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            id={`schedule-type-${type.toLowerCase()}-btn`}
                            data-testid={`schedule-type-${type.toLowerCase()}-btn`}
                            onClick={() => setScheduleType(type)}
                            disabled={!isAdmin}
                            className={`p-3.5 rounded-xl border text-left transition duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600/15 border-blue-500/50 text-white shadow-md shadow-blue-500/10'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold capitalize">
                                {type.toLowerCase()}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">
                              {type === 'DAILY' && 'Every day at scheduled time'}
                              {type === 'WEEKLY' && 'Weekly summary on chosen day'}
                              {type === 'MONTHLY' && 'Monthly digest on chosen date'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Timing Details based on scheduleType */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span>Schedule Timing & Trigger Rules</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Time Picker */}
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Dispatch Time (12h format)
                        </label>
                        <TimePicker12h
                          value={scheduleTime}
                          onChange={setScheduleTime}
                          disabled={!isAdmin}
                          id="schedule-time"
                        />
                      </div>

                      {/* Weekly day picker */}
                      {scheduleType === 'WEEKLY' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Weekly Day
                          </label>
                          <select
                            id="weekly-day-select"
                            data-testid="weekly-day-select"
                            value={weeklyDay}
                            onChange={(e) => setWeeklyDay(e.target.value)}
                            disabled={!isAdmin}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="MON">Monday</option>
                            <option value="TUE">Tuesday</option>
                            <option value="WED">Wednesday</option>
                            <option value="THU">Thursday</option>
                            <option value="FRI">Friday</option>
                            <option value="SAT">Saturday</option>
                            <option value="SUN">Sunday</option>
                          </select>
                        </div>
                      )}

                      {/* Monthly day picker */}
                      {scheduleType === 'MONTHLY' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Day of the Month
                          </label>
                          <select
                            id="monthly-day-select"
                            data-testid="monthly-day-select"
                            value={monthlyDay}
                            onChange={(e) => setMonthlyDay(Number(e.target.value))}
                            disabled={!isAdmin}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={d}>
                                {d === 1
                                  ? '1st of month'
                                  : d === 2
                                  ? '2nd of month'
                                  : d === 3
                                  ? '3rd of month'
                                  : `${d}th of month`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>
                        Deduplication key prevents multiple duplicate deliveries within the same scheduling cycle.
                      </span>
                    </div>
                  </div>

                  {/* Recipient Management */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Recipient Email Addresses ({recipientList.length})
                      </label>
                      <span className="text-[11px] text-slate-400">
                        All added recipients receive scheduled reports
                      </span>
                    </div>

                    {/* Add email input bar */}
                    {isAdmin && (
                      <div className="space-y-1.5 mb-3">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="email"
                              id="new-recipient-email-input"
                              data-testid="new-recipient-email-input"
                              value={newEmailInput}
                              onChange={(e) => {
                                setNewEmailInput(e.target.value);
                                setEmailInputError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddEmail(newEmailInput);
                                }
                              }}
                              placeholder="Add recipient (e.g. director@company.com)"
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <button
                            type="button"
                            id="add-recipient-btn"
                            data-testid="add-recipient-btn"
                            onClick={() => handleAddEmail(newEmailInput)}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-blue-600/30"
                          >
                            <Plus className="w-4 h-4" /> Add
                          </button>
                        </div>

                        {emailInputError && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {emailInputError}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Recipient Chips */}
                    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 min-h-[50px] flex-1 items-start content-start">
                      {recipientList.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          No recipient emails added. Add at least one email address above.
                        </p>
                      ) : (
                        recipientList.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/60 text-blue-200 border border-blue-800/60 text-xs font-mono shadow-sm"
                          >
                            <Users className="w-3 h-3 text-blue-400" />
                            <span>{email}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveEmail(email)}
                                className="text-blue-400 hover:text-red-400 transition ml-0.5"
                                title={`Remove ${email}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Save and Send Now Actions */}
                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 mt-auto">
                    <button
                      type="button"
                      id="send-scheduled-now-btn"
                      data-testid="send-scheduled-now-btn"
                      onClick={handleSendNow}
                      disabled={isSendingNow || isSaving || recipientList.length === 0}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                    >
                      <Send className={`w-3.5 h-3.5 ${isSendingNow ? 'animate-pulse text-blue-400' : ''}`} />
                      <span>{isSendingNow ? 'Dispatching...' : `Send ${scheduleType} Report Now`}</span>
                    </button>

                    <button
                      type="submit"
                      id="save-mail-settings-btn"
                      data-testid="save-mail-settings-btn"
                      disabled={isSaving}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Settings...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Mail Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: Manual Report Generation, Delivery Health, & SMTP Configuration */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-6 h-full">
            {/* Manual Report Generation */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Manual Report Generation</h2>
                  <p className="text-xs text-slate-400">
                    Select a date range to compile and dispatch an on-demand report.
                  </p>
                </div>
              </div>

              {/* Date Range Inputs */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      From Date
                    </label>
                    <input
                      type="date"
                      id="manual-report-from-date"
                      data-testid="manual-report-from-date"
                      value={manualFromDate}
                      onChange={(e) => {
                        setManualFromDate(e.target.value);
                        setDateValidationError(null);
                      }}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      To Date
                    </label>
                    <input
                      type="date"
                      id="manual-report-to-date"
                      data-testid="manual-report-to-date"
                      value={manualToDate}
                      onChange={(e) => {
                        setManualToDate(e.target.value);
                        setDateValidationError(null);
                      }}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark] cursor-pointer"
                    />
                  </div>
                </div>

                {dateValidationError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {dateValidationError}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    type="button"
                    id="generate-manual-report-btn"
                    data-testid="generate-manual-report-btn"
                    onClick={handleGenerateManualReport}
                    disabled={isGeneratingReport || isSendingManualReport}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  >
                    {isGeneratingReport ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Compiling Data...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>Generate Report Preview</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    id="send-manual-report-btn"
                    data-testid="send-manual-report-btn"
                    onClick={handleSendManualReport}
                    disabled={isSendingManualReport || isGeneratingReport || recipientList.length === 0}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 transition cursor-pointer"
                  >
                    {isSendingManualReport ? (
                      <>
                        <Send className="w-3.5 h-3.5 animate-pulse" />
                        <span>Sending via SMTP...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send to Recipients</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Generated Report Preview Card */}
              {generatedReport && (
                <div
                  id="generated-report-preview"
                  data-testid="generated-report-preview"
                  className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Report Summary
                    </span>
                    <span className="text-[11px] font-mono text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/50">
                      {generatedReport.startDate} → {generatedReport.endDate}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Hours</p>
                      <p className="text-base font-mono font-bold text-white mt-0.5">
                        {generatedReport.totalHoursFormatted}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <p className="text-[10px] text-emerald-400 uppercase font-semibold">Inside Hours</p>
                      <p className="text-base font-mono font-bold text-emerald-300 mt-0.5">
                        {generatedReport.regularHoursFormatted || '0.00 hrs'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <p className="text-[10px] text-amber-400 uppercase font-semibold">Outside Hours</p>
                      <p className="text-base font-mono font-bold text-amber-300 mt-0.5">
                        {generatedReport.outsideHoursFormatted || '0.00 hrs'}
                      </p>
                    </div>
                  </div>

                  {/* Employee Hours Breakdown */}
                  {generatedReport.employeeBreakdown && generatedReport.employeeBreakdown.length > 0 ? (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Employee Hours Breakdown
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {generatedReport.employeeBreakdown.map((emp) => (
                          <div
                            key={emp.user.id}
                            className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg bg-slate-900/80 border border-slate-800/60"
                          >
                            <div>
                              <span className="font-semibold text-white block">{emp.user.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">[{emp.user.employeeId}]</span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-white font-bold block">{emp.totalHoursFormatted}</span>
                              <span className="text-[10px] text-slate-400">
                                <span className="text-emerald-400">Inside: {emp.regularHoursFormatted}</span> &nbsp;•&nbsp; 
                                <span className="text-amber-400">Outside: {emp.outsideHoursFormatted}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-800 text-center text-xs text-slate-500 py-2">
                      No employee activity recorded in this date range.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Service & Delivery Health Status Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/40 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Delivery & Service Health</h3>
                    <p className="text-[11px] text-slate-400">Automated engine status & dispatch statistics</p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    enabled
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {enabled ? 'Active Engine' : 'Engine Paused'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Total Sent</p>
                  <p className="text-lg font-bold font-mono text-white mt-0.5">{auditLogs.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Successful</p>
                  <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                    {auditLogs.filter((l) => l.status === 'Success').length}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Recipients</p>
                  <p className="text-lg font-bold font-mono text-blue-400 mt-0.5">{recipientList.length}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" /> Next Schedule:
                </span>
                <span className="font-semibold text-slate-200">
                  {enabled ? `${scheduleType} at ${scheduleTime}` : 'Automated Reports Paused'}
                </span>
              </div>
            </div>

            {/* SMTP Configuration Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/40 mt-auto">
              <button
                type="button"
                id="toggle-smtp-config-btn"
                data-testid="toggle-smtp-config-btn"
                onClick={() => setShowSmtpConfig(!showSmtpConfig)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>SMTP Configuration</span>
                      <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                        {smtpHost}:{smtpPort}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      View or update SMTP relay server details and sender envelope.
                    </p>
                  </div>
                </div>

                <div className="text-slate-400 p-1">
                  {showSmtpConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showSmtpConfig && (
                <div className="mt-5 pt-4 border-t border-slate-800 space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        disabled={!isAdmin}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">SMTP Port</label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        disabled={!isAdmin}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">SMTP Username</label>
                      <input
                        type="text"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        disabled={!isAdmin}
                        placeholder="user@example.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">SMTP Password</label>
                      <input
                        type="password"
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        disabled={!isAdmin}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">From Sender Address</label>
                    <input
                      type="text"
                      value={smtpFrom}
                      onChange={(e) => setSmtpFrom(e.target.value)}
                      disabled={!isAdmin}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Gmail Helper Banner */}
                  {smtpHost.toLowerCase().includes('gmail.com') && (
                    <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-600/30 text-amber-200 text-xs flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-amber-300">Google Gmail Authentication Requirements:</p>
                        <p className="text-slate-300 leading-relaxed">
                          Gmail SMTP strictly requires a <strong>16-character Google App Password</strong> (with 2-Step Verification enabled). Normal Google account passwords are rejected with <em>535-5.7.8 BadCredentials</em>.
                        </p>
                        <div>
                          <a
                            href="https://myaccount.google.com/apppasswords"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 underline font-medium mt-1"
                          >
                            <span>Generate 16-character App Password in Google Account</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Test Connection Button & Status */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      id="test-smtp-connection-btn"
                      data-testid="test-smtp-connection-btn"
                      onClick={handleTestSmtpConnection}
                      disabled={isTestingSmtp || !isAdmin}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 border border-slate-700 transition cursor-pointer self-start disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingSmtp ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
                      <span>{isTestingSmtp ? 'Verifying SMTP Server...' : 'Test SMTP Connection'}</span>
                    </button>

                    <span className="text-[11px] text-slate-500">
                      {hasEnvPass && !smtpPass ? 'Using environment password default' : 'Using form password'}
                    </span>
                  </div>

                  {/* Test Connection Output */}
                  {smtpTestResult && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs animate-in fade-in duration-200 ${
                        smtpTestResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                          : 'bg-red-950/40 border-red-500/30 text-red-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {smtpTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1 overflow-hidden">
                          <p className="font-semibold break-words">{smtpTestResult.message}</p>
                          {smtpTestResult.guidance && (
                            <p className="text-amber-300/90 text-[11px] leading-relaxed pt-1">
                              💡 <strong>Tip:</strong> {smtpTestResult.guidance}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4.2 Mail Audit List Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Mail Audit List</h2>
                <p className="text-xs text-slate-400">
                  Comprehensive audit history of all report emails sent by the application, including delivery status and errors.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="refresh-audit-list-btn"
              data-testid="refresh-audit-list-btn"
              onClick={loadAuditLogs}
              disabled={isAuditLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          {/* Audit Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table
              id="mail-audit-table"
              data-testid="mail-audit-table"
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Recipients</th>
                  <th className="py-3 px-4">Subject & Type</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
                {isAuditLoading && auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                      <span>Loading mail audit logs...</span>
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No report email dispatches recorded yet. Use &quot;Send Report Now&quot; or manual generation to test.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => {
                    const isSuccess = log.status === 'Success';
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Date */}
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                          {log.date}
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {log.time}
                        </td>

                        {/* Status (Success or Failed) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isSuccess ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Success</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Failed</span>
                            </span>
                          )}
                        </td>

                        {/* Recipients */}
                        <td className="py-3 px-4 text-slate-200 max-w-[260px] truncate" title={log.recipients}>
                          <span className="font-mono text-xs">{log.recipients}</span>
                        </td>

                        {/* Subject & Type */}
                        <td className="py-3 px-4 text-slate-400 max-w-[240px] truncate">
                          <span className="text-white font-medium block truncate">{log.subject}</span>
                          <span className="text-[10px] text-blue-400 uppercase font-bold">{log.type}</span>
                        </td>

                        {/* Details / Error */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {log.error ? (
                            <button
                              type="button"
                              onClick={() => setSelectedErrorLog(log)}
                              className="text-xs text-red-400 hover:text-red-300 underline font-semibold cursor-pointer"
                            >
                              View Error
                            </button>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Delivered</span>
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

        {/* Error Detail Modal */}
        {selectedErrorLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5 text-red-400 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Mail Delivery Error Details</span>
                </div>
                <button
                  onClick={() => setSelectedErrorLog(null)}
                  className="text-slate-400 hover:text-white transition p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Timestamp:</span>
                  <span className="font-mono text-slate-200">{selectedErrorLog.date} {selectedErrorLog.time}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Recipients:</span>
                  <span className="font-mono text-slate-200">{selectedErrorLog.recipients}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Subject:</span>
                  <span className="text-slate-200 font-medium">{selectedErrorLog.subject}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Stored Error Message:
                </label>
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-48">
                  {selectedErrorLog.error || 'Unknown delivery failure'}
                </div>
              </div>

              {(selectedErrorLog.error?.includes('535') || selectedErrorLog.error?.includes('BadCredentials')) && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span>How to fix Google 535-5.7.8 BadCredentials:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Google SMTP requires a <strong>16-character App Password</strong> (with 2-Step Verification active). Standard Gmail account passwords will always fail. If you changed your Google account password recently, old App Passwords are automatically revoked.
                  </p>
                  <div>
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline font-medium text-[11px]"
                    >
                      <span>Create new App Password at Google</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedErrorLog(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
