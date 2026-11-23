"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { requestScreenStream, isScreenStreamActive, stopScreenStream } from '@/lib/screenshotCapture';
import { useAuthStore, useTimerStore, formatSecondsToTimer, checkIsAfterOfficeHours } from "@/lib/store";
import { getStageBadge } from "@/lib/utils";
import { cachedFetch, getCachedData } from "@/lib/apiCache";
import {
  FolderKanban,
  Users,
  Clock,
  Play,
  Square,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Building,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Loader2,
  X,
  Moon,
  RefreshCw,
} from "lucide-react";

function DashboardLiveTimerDigit({ fallbackBaseSeconds, hasActiveTimer }: { fallbackBaseSeconds: number; hasActiveTimer: boolean }) {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  const displayVal = hasActiveTimer ? elapsedSeconds : fallbackBaseSeconds;
  return <>{formatSecondsToTimer(displayVal)}</>;
}

function DashboardStopButtonTime() {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  return <span>Stop ({formatSecondsToTimer(elapsedSeconds)})</span>;
}

function DashboardTodayLoggedTime({ baseEntriesSeconds, hasActiveTimer }: { baseEntriesSeconds: number; hasActiveTimer: boolean }) {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  const total = baseEntriesSeconds + (hasActiveTimer ? elapsedSeconds : 0);
  return <>{formatSecondsToTimer(total)}</>;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { activeTimer, schedule, startTimer, stopTimer, error: timerStoreError } = useTimerStore();

  const cachedProjects = getCachedData<{ projects: any[] }>("/api/projects")?.projects;
  const [clients, setClients] = useState<any[]>(() => getCachedData<{ clients: any[] }>("/api/clients")?.clients || []);
  const [projects, setProjects] = useState<any[]>(() => cachedProjects || []);
  const [recentEntries, setRecentEntries] = useState<any[]>(() => getCachedData<{ entries: any[] }>("/api/time")?.entries || []);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [pendingProposals, setPendingProposals] = useState<any[]>(() => getCachedData<{ proposals: any[] }>("/api/proposals")?.proposals || []);
  const [failedAlerts, setFailedAlerts] = useState<any[]>([]);
  const [isRetryingAlerts, setIsRetryingAlerts] = useState<boolean>(false);
  const [isDismissingAlerts, setIsDismissingAlerts] = useState<boolean>(false);
  const [loading, setLoading] = useState(() => !cachedProjects);

  // Quick timer start states
  const [quickProjectId, setQuickProjectId] = useState<string>("");
  const [quickTaskDesc, setQuickTaskDesc] = useState<string>("");
  const [isStartingTimer, setIsStartingTimer] = useState<boolean>(false);
  const [timerActionError, setTimerActionError] = useState<string | null>(null);

  // Office timing & after-hours detection
  const afterHoursInfo = checkIsAfterOfficeHours(schedule);
  const isAfterHours = afterHoursInfo.isAfterHours;

  useEffect(() => {
    async function loadDashboard() {
      try {
        const isAdminUser = user?.role === "ADMIN";
        const [cData, pData, tData, iData, prData, aData] = await Promise.all([
          cachedFetch<{ clients: any[] }>("/api/clients").catch(() => ({ clients: [] })),
          cachedFetch<{ projects: any[] }>("/api/projects").catch(() => ({ projects: [] })),
          cachedFetch<{ entries: any[] }>("/api/time").catch(() => ({ entries: [] })),
          isAdminUser ? cachedFetch<{ invoices: any[] }>("/api/invoices?status=SENT").catch(() => ({ invoices: [] })) : Promise.resolve({ invoices: [] }),
          isAdminUser ? cachedFetch<{ proposals: any[] }>("/api/proposals?status=SENT").catch(() => ({ proposals: [] })) : Promise.resolve({ proposals: [] }),
          isAdminUser ? cachedFetch<{ alerts: any[] }>("/api/notifications/alerts").catch(() => ({ alerts: [] })) : Promise.resolve({ alerts: [] }),
        ]);

        setClients(cData.clients || []);
        const fetchedProjects = pData.projects || [];
        setProjects(fetchedProjects);
        if (fetchedProjects.length > 0) {
          setQuickProjectId((prev) => prev || fetchedProjects[0].id);
        }
        setRecentEntries(tData.entries || []);
        setUnpaidInvoices(iData.invoices || []);
        setPendingProposals(prData.proposals || []);
        setFailedAlerts(aData.alerts || []);
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [activeTimer?.id]);

  const handleRetryAlerts = async () => {
    setIsRetryingAlerts(true);
    try {
      const res = await fetch("/api/notifications/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      if (res.ok) {
        const data = await res.json();
        setFailedAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error("Failed to retry alerts:", err);
    } finally {
      setIsRetryingAlerts(false);
    }
  };

  const handleDismissAlerts = async () => {
    setIsDismissingAlerts(true);
    try {
      const res = await fetch("/api/notifications/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (res.ok) {
        setFailedAlerts([]);
      }
    } catch (err) {
      console.error("Failed to dismiss alerts:", err);
    } finally {
      setIsDismissingAlerts(false);
    }
  };

  const handleStartQuickTimer = async (e?: React.FormEvent, forceOvertime?: boolean) => {
    if (typeof window !== 'undefined' && !isScreenStreamActive()) {
      try { await requestScreenStream(); } catch {}
    }
    if (e) e.preventDefault();
    if (!quickProjectId) {
      setTimerActionError("Please select a project to start tracking time.");
      return;
    }
    setIsStartingTimer(true);
    setTimerActionError(null);
    try {
      let targetProjectId = quickProjectId;
      let finalDesc = quickTaskDesc.trim();

      if (quickProjectId.includes("::")) {
        const parts = quickProjectId.split("::");
        targetProjectId = parts[0];
        const subName = parts[2] || parts[1];
        finalDesc = finalDesc ? `[${subName}] ${finalDesc}` : `[${subName}]`;
      }

      const overtime = forceOvertime !== undefined ? forceOvertime : isAfterHours;
      const ok = await startTimer(targetProjectId, finalDesc || undefined, overtime);
      if (ok) {
        setQuickTaskDesc("");
      } else {
        setTimerActionError(timerStoreError || "Could not start timer. Please check office schedule or try again.");
      }
    } catch (err: any) {
      setTimerActionError(err?.message || "Failed to start timer.");
    } finally {
      setIsStartingTimer(false);
    }
  };

  const handleStartProjectTimer = async (projectId: string, projectName: string, forceOvertime?: boolean) => {
    if (typeof window !== 'undefined' && !isScreenStreamActive()) {
      try { await requestScreenStream(); } catch {}
    }
    setIsStartingTimer(true);
    setTimerActionError(null);
    try {
      const overtime = forceOvertime !== undefined ? forceOvertime : isAfterHours;
      const ok = await startTimer(projectId, `Working on ${projectName}`, overtime);
      if (!ok) {
        setTimerActionError(timerStoreError || `Could not start timer for ${projectName}.`);
      }
    } catch (err: any) {
      setTimerActionError(err?.message || "Failed to start timer.");
    } finally {
      setIsStartingTimer(false);
    }
  };

  const handleStopQuickTimer = async () => {
    setIsStartingTimer(true);
    setTimerActionError(null);
    try {
      await stopTimer();
    } catch (err: any) {
      setTimerActionError(err?.message || "Failed to stop timer.");
    } finally {
      setIsStartingTimer(false);
    }
  };

  const isAdmin = user?.role === "ADMIN";

  // Calculate today's tracked seconds from entries
  const baseTodayEntriesSeconds = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return recentEntries
      .filter((e) => new Date(e.startedAt) >= todayStart)
      .reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
  }, [recentEntries]);


  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Welcome & Overview Header */}
      <div className="p-4 sm:p-6 lg:p-8 rounded-card bg-white border border-border shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-text uppercase tracking-wider text-primary bg-primary-subtle border border-blue-200 px-2.5 py-1 rounded-full font-medium">
                {isAdmin ? "Agency Owner Dashboard" : "Staff Employee Workspace"}
              </span>
              <span className="helper-text text-text-secondary">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <h1 className="page-heading text-text-primary">
              Welcome back, {user?.name || "Team Member"}
            </h1>
            <p className="body-text text-text-secondary max-w-2xl">
              {isAdmin
                ? "Manage agency client deliverables, review project stages, track team working hours, and generate private client portals."
                : "View your assigned clients, record working time against authorized projects, and collaborate with your agency."}
            </p>
          </div>

          {/* Quick Active Timer Badge or Action */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-border shrink-0 w-full xl:w-[340px] space-y-3 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>{activeTimer ? "Active Stopwatch" : "Stopwatch Status"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
                {activeTimer ? (
                  activeTimer.isOvertime || (activeTimer.description && /\[Overtime\]/i.test(activeTimer.description)) ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      <Moon className="w-3 h-3 text-amber-600" />
                      <span>OVERTIME</span>
                    </span>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                      <span className="text-success font-semibold">RUNNING</span>
                    </>
                  )
                ) : isAfterHours ? (
                  <span className="text-amber-700 font-medium flex items-center gap-1">
                    <Moon className="w-3 h-3 text-amber-600" />
                    <span>AFTER HOURS</span>
                  </span>
                ) : (
                  <span className="text-text-secondary">STOPPED</span>
                )}
              </span>
            </div>

            <div className="font-mono text-2xl sm:text-[28px] font-bold text-text-primary tracking-tight">
              <DashboardLiveTimerDigit fallbackBaseSeconds={baseTodayEntriesSeconds} hasActiveTimer={Boolean(activeTimer)} />
            </div>

            {activeTimer ? (
              <div className="space-y-2.5 pt-2 border-t border-border/70">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        activeTimer.isOvertime || (activeTimer.description && /\[Overtime\]/i.test(activeTimer.description))
                          ? "bg-amber-500"
                          : "bg-success"
                      }`}
                    />
                    <p className="helper-text text-text-primary font-semibold truncate">
                      {activeTimer.project?.name || "Running..."}
                    </p>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-1 truncate">
                    {activeTimer.isOvertime || (activeTimer.description && /\[Overtime\]/i.test(activeTimer.description)) ? (
                      <span className="text-amber-700 font-medium flex items-center gap-1">
                        <Moon className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Overtime Mode • Runs until manually stopped</span>
                      </span>
                    ) : schedule?.autoCutoffEnabled ? (
                      <span>Auto-stops at office end time ({afterHoursInfo.closingTime})</span>
                    ) : (
                      <span>Manual stop only</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="dashboard-stop-timer-btn"
                    data-testid="dashboard-stop-timer-btn"
                    onClick={handleStopQuickTimer}
                    disabled={isStartingTimer}
                    className="flex-1 py-2 px-3 rounded-lg bg-error hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Stop Timer</span>
                  </button>
                  <Link
                    href="/time-sheet"
                    className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-text-secondary hover:text-text-primary border border-border text-xs font-medium transition whitespace-nowrap"
                  >
                    Time Sheet
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-2 border-t border-border/70">
                <select
                  id="dashboard-timer-project-select"
                  data-testid="dashboard-timer-project-select"
                  value={quickProjectId}
                  onChange={(e) => setQuickProjectId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary truncate"
                >
                  <option value="">Select project to track time...</option>
                  {projects.map((p) => {
                    const hasSubs = Array.isArray(p.subProjects) && p.subProjects.length > 0;
                    const clientLabel = p.client?.name ? ` · ${p.client.name}` : "";
                    if (!hasSubs) {
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name}{clientLabel}
                        </option>
                      );
                    }
                    return (
                      <optgroup key={p.id} label={`${p.name}${clientLabel}`}>
                        <option value={p.id}>
                          {p.name} (General / Main)
                        </option>
                        {p.subProjects.map((sub: any) => (
                          <option key={sub.id} value={`${p.id}::${sub.id}::${sub.name}`}>
                            ↳ {sub.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

                {/* After Hours Overtime Indicator */}
                {isAfterHours && (
                  <div className="flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                    <span className="flex items-center gap-1 font-medium">
                      <Moon className="w-3.5 h-3.5 text-amber-600" /> After Hours Overtime
                    </span>
                    <span className="text-amber-700 text-[10px]">Runs until manually stopped</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="dashboard-start-timer-btn"
                    data-testid="dashboard-start-timer-btn"
                    onClick={() => handleStartQuickTimer()}
                    disabled={!quickProjectId || isStartingTimer}
                    className={`flex-1 py-2 px-3 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                      isAfterHours
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-success hover:bg-green-700"
                    }`}
                  >
                    {isStartingTimer ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Starting...</span>
                      </>
                    ) : isAfterHours ? (
                      <>
                        <Moon className="w-3.5 h-3.5 fill-white" />
                        <span>Start Overtime Timer</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Start Timer</span>
                      </>
                    )}
                  </button>
                  <Link
                    href="/time-sheet"
                    className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-text-secondary hover:text-text-primary border border-border text-xs font-medium transition whitespace-nowrap"
                  >
                    Time Sheet
                  </Link>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-text-secondary pt-1 border-t border-border/60">
              <span>Today&apos;s logged time:</span>
              <span className="font-mono font-semibold text-text-primary">
                <DashboardTodayLoggedTime baseEntriesSeconds={baseTodayEntriesSeconds} hasActiveTimer={Boolean(activeTimer)} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Failed Email Alerts Banner (Section 8: "If one fails, retry up to 3 times, then mark it failed and show it on Home") */}
      {failedAlerts.length > 0 && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold flex items-center gap-2 flex-wrap">
                <span>Email Delivery Alert:</span>
                <span className="font-normal">
                  {failedAlerts.length} notification{failedAlerts.length === 1 ? "" : "s"} failed after 3 automatic retries.
                </span>
              </div>
              <span className="text-red-700 block mt-0.5 font-mono text-[11px] break-all">
                Latest error: {failedAlerts[0]?.errorLog || "SMTP connection/delivery failure"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            <button
              type="button"
              onClick={handleRetryAlerts}
              disabled={isRetryingAlerts || isDismissingAlerts}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-300 hover:bg-red-50 text-red-800 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Re-queue failed notifications and retry sending"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingAlerts ? "animate-spin text-red-600" : ""}`} />
              <span>{isRetryingAlerts ? "Retrying..." : "Retry All"}</span>
            </button>
            <Link
              href="/mail"
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs whitespace-nowrap transition shadow-2xs"
            >
              Check Mail Settings &rarr;
            </Link>
            <button
              type="button"
              onClick={handleDismissAlerts}
              disabled={isRetryingAlerts || isDismissingAlerts}
              className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition cursor-pointer disabled:opacity-50"
              title="Dismiss alert banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? "xl:grid-cols-5" : "xl:grid-cols-3"} gap-4`}>
        {/* Clients Metric */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold text-text-secondary">
              {isAdmin ? "Total Clients" : "Assigned Clients"}
            </span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {loading ? "…" : clients.length}
          </div>
          <p className="text-[11px] text-text-secondary flex items-center justify-between pt-1.5 border-t border-border">
            <span>{isAdmin ? "Agency roster" : "Assigned"}</span>
            <Link href="/clients" className="text-primary hover:underline font-semibold">
              View &rarr;
            </Link>
          </p>
        </div>

        {/* Projects Metric */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold text-text-secondary">
              Active Projects
            </span>
            <FolderKanban className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {loading ? "…" : projects.length}
          </div>
          <p className="text-[11px] text-text-secondary flex items-center justify-between pt-1.5 border-t border-border">
            <span>Pipelines</span>
            <Link href="/projects" className="text-primary hover:underline font-semibold">
              View &rarr;
            </Link>
          </p>
        </div>

        {/* Today's Logged Time */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="text-xs font-semibold text-text-secondary">
              Today's Hours
            </span>
            <Clock className="w-4 h-4 text-success" />
          </div>
          <div className="text-2xl font-bold text-text-primary font-mono">
            <DashboardTodayLoggedTime baseEntriesSeconds={baseTodayEntriesSeconds} hasActiveTimer={Boolean(activeTimer)} />
          </div>
          <p className="text-[11px] text-text-secondary flex items-center justify-between pt-1.5 border-t border-border">
            <span>Max 24h/day</span>
            <Link href="/time-sheet" className="text-primary hover:underline font-semibold">
              Time Sheet &rarr;
            </Link>
          </p>
        </div>

        {/* Unpaid Invoices Metric (Admin Only - Section 4) */}
        {isAdmin && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs space-y-2">
            <div className="flex items-center justify-between text-text-secondary">
              <span className="text-xs font-semibold text-amber-600">
                Unpaid Invoices
              </span>
              <Building className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {unpaidInvoices.length}
            </div>
            <p className="text-[11px] text-text-secondary flex items-center justify-between pt-1.5 border-t border-border">
              <span>Awaiting payment</span>
              <Link href="/invoices" className="text-primary hover:underline font-semibold">
                Invoices &rarr;
              </Link>
            </p>
          </div>
        )}

        {/* Pending Proposals Metric (Admin Only - Section 4) */}
        {isAdmin && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border shadow-xs space-y-2">
            <div className="flex items-center justify-between text-text-secondary">
              <span className="text-xs font-semibold text-blue-600">
                Awaiting Reply
              </span>
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {pendingProposals.length}
            </div>
            <p className="text-[11px] text-text-secondary flex items-center justify-between pt-1.5 border-t border-border">
              <span>Proposals sent</span>
              <Link href="/proposals" className="text-primary hover:underline font-semibold">
                Proposals &rarr;
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Error Alert Banner */}
      {timerActionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-error rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium text-red-800">{timerActionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTimerActionError(null)}
            className="p-1 hover:bg-red-100 rounded text-red-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Auto-Stop Office Hours Alert Banner */}
      {recentEntries.length > 0 &&
        recentEntries[0]?.description?.includes('[Auto-stopped:') &&
        !activeTimer && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-amber-950 block">Office Closing Time Reached</span>
                <span className="text-amber-800 text-[11px]">
                  Daytime timer was automatically stopped at {afterHoursInfo.closingTime} under agency policy. You can start an Overtime session below if continuing work.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleStartQuickTimer(undefined, true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs whitespace-nowrap transition cursor-pointer self-start sm:self-auto flex items-center gap-1.5 shadow-2xs"
            >
              <Moon className="w-3.5 h-3.5 fill-white" />
              <span>Start Overtime Timer</span>
            </button>
          </div>
      )}

      {/* Section 4 Required Dashboard Modules: Unpaid Invoices & Proposals Waiting for Reply (Admin Only) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Unpaid Invoices */}
          <div className="p-5 rounded-2xl bg-white border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Building className="w-4 h-4 text-amber-600" />
                <span>Unpaid Invoices ({unpaidInvoices.length})</span>
              </h2>
              <Link href="/invoices" className="text-xs text-primary font-semibold hover:underline">
                View all &rarr;
              </Link>
            </div>
            {unpaidInvoices.length === 0 ? (
              <p className="text-xs text-text-secondary">All invoices are paid in full!</p>
            ) : (
              <div className={`space-y-2 ${unpaidInvoices.length > 3 ? "max-h-[220px] overflow-y-auto pr-1 overscroll-contain" : ""}`}>
                {unpaidInvoices.map((inv) => (
                  <div key={inv.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-bold text-text-primary block truncate">{inv.invoiceNumberDisplay}</span>
                      <span className="text-slate-500 block text-[11px] truncate">{inv.client?.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-slate-900">${(inv.totalCents / 100).toFixed(2)}</span>
                      <span className="text-amber-600 font-semibold block text-[10px]">Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "Upon Receipt"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Proposals Waiting for Reply */}
          <div className="p-5 rounded-2xl bg-white border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Proposals Waiting for Reply ({pendingProposals.length})</span>
              </h2>
              <Link href="/proposals" className="text-xs text-primary font-semibold hover:underline">
                View all &rarr;
              </Link>
            </div>
            {pendingProposals.length === 0 ? (
              <p className="text-xs text-text-secondary">No proposals currently awaiting client signature.</p>
            ) : (
              <div className={`space-y-2 ${pendingProposals.length > 3 ? "max-h-[220px] overflow-y-auto pr-1 overscroll-contain" : ""}`}>
                {pendingProposals.map((prop) => (
                  <div key={prop.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-text-primary block truncate">{prop.title}</span>
                      <span className="text-slate-500 text-[11px] block truncate">{prop.client?.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-blue-600 font-semibold block text-[11px]">Sent {prop.sentAt ? new Date(prop.sentAt).toLocaleDateString() : ""}</span>
                      <span className="text-slate-400 text-[10px]">v{prop.currentVersionNumber}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Two Column Layout: Open Projects Pipeline & Accessible Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Active Projects Pipeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-heading text-text-primary flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-primary" />
              <span>Project Deliverables Pipeline</span>
            </h2>
            <Link
              href="/projects"
              className="btn-text text-primary hover:text-primary-hover font-medium"
            >
              All projects &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center text-center helper-text text-text-secondary bg-slate-50/50 border border-border rounded-card">
              Loading pipeline...
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 flex items-center justify-center text-center bg-slate-50/50 border border-border rounded-card body-text text-text-secondary">
              No active projects found.
            </div>
          ) : (
            <div
              className={`p-3 space-y-3 rounded-card bg-slate-50/50 border border-border transition-all ${
                projects.length > 2 ? "max-h-[250px] overflow-y-auto pr-1" : ""
              }`}
            >
              {projects.map((p) => {
                const stageBadge = getStageBadge(p.stage);
                const isThisProjectActive = activeTimer?.projectId === p.id;
                return (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl bg-white border border-border hover:border-slate-300 transition shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="card-title text-text-primary truncate">{p.name}</h3>
                        {p.client && (
                          <p className="helper-text text-primary font-medium flex items-center gap-1.5 mt-0.5 truncate">
                            <Building className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{p.client.name} {p.client.company ? `(${p.client.company})` : ""}</span>
                          </p>
                        )}
                      </div>
                      <span className={`label-text font-medium px-2.5 py-0.5 rounded-full border shrink-0 ${stageBadge.bg}`}>
                        {stageBadge.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/60">
                      {p.stagingUrl ? (
                        <a
                          href={p.stagingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 btn-text text-primary hover:text-primary-hover font-medium text-xs"
                        >
                          <span>Preview Staging</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-text-secondary">No staging environment</span>
                      )}

                      {isThisProjectActive ? (
                        <button
                          type="button"
                          onClick={handleStopQuickTimer}
                          disabled={isStartingTimer}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-error border border-red-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <DashboardStopButtonTime />
                        </button>
                      ) : isAfterHours ? (
                        <button
                          type="button"
                          onClick={() => handleStartProjectTimer(p.id, p.name, true)}
                          disabled={isStartingTimer}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                          title="Start Overtime timer that runs until manually stopped"
                        >
                          <Moon className="w-3 h-3 text-amber-600" />
                          <span>Start Overtime</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartProjectTimer(p.id, p.name, false)}
                          disabled={isStartingTimer}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-success border border-green-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Start Timer</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accessible Clients */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-heading text-text-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span>{isAdmin ? "Agency Clients" : "Your Assigned Clients"}</span>
            </h2>
            <Link
              href="/clients"
              className="btn-text text-primary hover:text-primary-hover font-medium"
            >
              Manage clients &rarr;
            </Link>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center text-center helper-text text-text-secondary bg-slate-50/50 border border-border rounded-card">
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <div className="p-8 flex items-center justify-center text-center bg-slate-50/50 border border-border rounded-card body-text text-text-secondary">
              No clients assigned to your account.
            </div>
          ) : (
            <div
              className={`p-3 space-y-3 rounded-card bg-slate-50/50 border border-border transition-all ${
                clients.length > 2 ? "max-h-[210px] overflow-y-auto pr-1" : ""
              }`}
            >
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl bg-white border border-border hover:border-slate-300 transition shadow-xs flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h3 className="card-title text-text-primary truncate">{c.name}</h3>
                    {c.company && (
                      <p className="helper-text text-text-secondary flex items-center gap-1 truncate">
                        <Building className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </p>
                    )}
                    <span className="helper-text text-text-secondary truncate block">{c.email}</span>
                  </div>

                  <span className="label-text font-medium text-text-secondary bg-slate-50 px-2.5 py-1 rounded-full border border-border shrink-0">
                    {c.projects?.length || 0} Projects
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}