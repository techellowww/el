'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, formatSecondsToTimer } from '@/components/AppShell';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { requestScreenStream, isScreenStreamActive, captureAndUploadActivityScreenshot } from '@/lib/screenshotCapture';
import {
  Play,
  Square,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  Users,
  TrendingUp,
  FileText,
  ShieldAlert,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  Moon,
  PieChart as PieIcon,
} from 'lucide-react';
import { OutsideHoursDurationModal } from '@/components/OutsideHoursDurationModal';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

interface AdminDashboardData {
  summary: {
    totalEmployees: number;
    activeProjects: number;
    completedProjects: number;
    todayHours: number;
    weekHours: number;
    monthHours: number;
    activeTimersCount: number;
    pendingCorrections: number;
    outsideHoursReview: number;
  };
  runningEmployees: Array<{
    entryId: string;
    startTime: string;
    user: { id: string; name: string; employeeId: string };
    project: { id: string; code: string; name: string };
  }>;
  charts: {
    topProjectsPieChart: Array<{ id: string; code: string; name: string; label: string; hours: number; seconds: number }>;
    dailyTrendChart: Array<{ date: string; regularHours: number; outsideHours: number; totalHours: number }>;
    projectDistributionChart: Array<{ name: string; hours: number }>;
    topEmployeesPieChart?: Array<{ name: string; hours: number; employeeId: string }>;
  };
}

interface EmployeeDashboardData {
  todayTotalSeconds: number;
  weekTotalSeconds: number;
  todayProjects: Array<{ project: { code: string; name: string }; duration: number }>;
  recentLogs: Array<{
    id: string;
    startTime: string;
    endTime: string | null;
    duration: number;
    status: string;
    isOutsideHours: boolean;
    project: { code: string; name: string };
  }>;
  pendingCorrectionsCount: number;
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const {
    activeTimer,
    elapsedSeconds,
    schedule,
    isOutsideHours,
    screenshotSetting,
    startTimer,
    stopTimer,
    isLoading: isTimerLoading,
  } = useTimerStore();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [timerNotes, setTimerNotes] = useState<string>('');
  const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);

  // Admin Data State
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);

  // Employee Data State
  const [empData, setEmpData] = useState<EmployeeDashboardData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [greetingText, setGreetingText] = useState('Welcome');
  const [currentDateStr, setCurrentDateStr] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreetingText('Good morning');
    else if (hour < 17) setGreetingText('Good afternoon');
    else setGreetingText('Good evening');

    setCurrentDateStr(
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    );
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    setIsLoadingData(true);

    try {
      if (user.role === 'ADMIN') {
        // Parallelize projects and admin dashboard data
        const [prjRes, adminRes] = await Promise.all([
          fetch('/api/projects?status=ACTIVE'),
          fetch('/api/admin/dashboard'),
        ]);

        if (prjRes.ok) {
          const pData = await prjRes.json();
          const pList: ProjectOption[] = pData.projects || [];
          setProjects(pList);
          if (pList.length > 0) {
            setSelectedProjectId((prev) => (prev && pList.some((p) => p.id === prev) ? prev : pList[0].id));
          }
        }

        if (adminRes.ok) {
          const aData = await adminRes.json();
          setAdminData(aData);
        }
      } else {
        // Parallelize all employee queries concurrently
        const [prjRes, dailyRes, weeklyRes, logsRes, corrRes] = await Promise.all([
          fetch('/api/projects?status=ACTIVE'),
          fetch('/api/reports/daily'),
          fetch('/api/reports/weekly'),
          fetch('/api/time-entries?limit=5'),
          fetch('/api/corrections?status=PENDING'),
        ]);

        if (prjRes.ok) {
          const pData = await prjRes.json();
          const pList: ProjectOption[] = pData.projects || [];
          setProjects(pList);
          if (pList.length > 0) {
            setSelectedProjectId((prev) => (prev && pList.some((p) => p.id === prev) ? prev : pList[0].id));
          }
        }

        const dailyData = dailyRes.ok ? await dailyRes.json() : null;
        const weeklyData = weeklyRes.ok ? await weeklyRes.json() : null;
        const logsData = logsRes.ok ? await logsRes.json() : null;
        const corrData = corrRes.ok ? await corrRes.json() : null;

        // Group today's projects
        const todayProjectsMap = new Map<string, { project: { code: string; name: string }; duration: number }>();
        if (dailyData?.report?.rawEntries) {
          for (const e of dailyData.report.rawEntries) {
            if (!todayProjectsMap.has(e.projectId)) {
              todayProjectsMap.set(e.projectId, { project: e.project, duration: 0 });
            }
            todayProjectsMap.get(e.projectId)!.duration += e.duration;
          }
        }

        setEmpData({
          todayTotalSeconds: dailyData?.report?.totalTrackedSeconds || 0,
          weekTotalSeconds: weeklyData?.report?.totalTrackedSeconds || 0,
          todayProjects: Array.from(todayProjectsMap.values()),
          recentLogs: logsData?.entries || [],
          pendingCorrectionsCount: corrData?.requests?.length || 0,
        });
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleStartTimer = async () => {
    if (!selectedProjectId) return;

    // Require duration limit selection if starting outside office hours
    if (isOutsideHours) {
      setIsDurationModalOpen(true);
      return;
    }

    if (screenshotSetting?.enabled && !isScreenStreamActive()) {
      const stream = await requestScreenStream();
      if (!stream) {
        return;
      }
    }

    const ok = await startTimer(selectedProjectId, timerNotes);
    if (ok) {
      setTimerNotes('');
      loadDashboardData();

      // Immediately take live milestone 0 screenshot of workstation
      const currentActive = useTimerStore.getState().activeTimer;
      if (currentActive && user && isScreenStreamActive()) {
        const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 10);
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId,
          timeEntryId: currentActive.id,
          projectCode: currentActive.project.code,
          projectName: currentActive.project.name,
          elapsedSeconds: 0,
          intervalMinutes,
          intervalIndex: 0,
        }).catch(console.error);
      }
    }
  };

  const handleConfirmOutsideStart = async (durationMinutes: number, notes?: string) => {
    if (!selectedProjectId) return;

    if (screenshotSetting?.enabled && !isScreenStreamActive()) {
      const stream = await requestScreenStream();
      if (!stream) {
        throw new Error('Screen sharing is required to track overtime. Please select "Entire Screen" to proceed.');
      }
    }

    const ok = await startTimer(selectedProjectId, notes || timerNotes, durationMinutes);
    if (ok) {
      setIsDurationModalOpen(false);
      setTimerNotes('');
      loadDashboardData();

      // Immediately take live milestone 0 screenshot of workstation
      const currentActive = useTimerStore.getState().activeTimer;
      if (currentActive && user && isScreenStreamActive()) {
        const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 10);
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId,
          timeEntryId: currentActive.id,
          projectCode: currentActive.project.code,
          projectName: currentActive.project.name,
          elapsedSeconds: 0,
          intervalMinutes,
          intervalIndex: 0,
        }).catch(console.error);
      }
    }
  };

  const handleStopTimer = async () => {
    const ok = await stopTimer();
    if (ok) {
      loadDashboardData();
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Top Greeting Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
              <Sparkles className="w-4 h-4" />
              <span>Workspace Overview</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-1">
              {greetingText}, {user?.name}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {currentDateStr || 'Today'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
            >
              <BarChart3 className="w-4 h-4 text-slate-400" /> View Analytics
            </Link>
            {isAdmin && (
              <Link
                href="/corrections"
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition"
              >
                Approvals ({adminData?.summary.pendingCorrections || 0})
              </Link>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TIMER ENGINE CONTROL WIDGET (Available to both Employees and Admins)     */}
        {/* ========================================================================= */}
        <section className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${activeTimer ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {activeTimer ? 'Live Project Timer (Active)' : 'Project Timer (Idle)'}
                  </span>
                </span>
                {activeTimer?.isOutsideHours && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Outside Office Hours
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span>Current Time:</span>
                  <span className="text-white font-bold">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </span>
              </div>

              {activeTimer ? (
                <div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-white tracking-tight">
                    {formatSecondsToTimer(elapsedSeconds)}
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <p className="text-sm text-slate-300 font-medium">
                       Tracking on <span className="text-blue-400 font-semibold">{activeTimer.project.code}</span> — {activeTimer.project.name}
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span>Started at:</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {new Date(activeTimer.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </p>
                    {activeTimer.targetDuration && (
                      <div className="mt-2 p-2 px-3 rounded-lg bg-amber-950/40 border border-amber-500/30 flex items-center justify-between text-xs max-w-sm">
                        <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-amber-400" />
                          Limit: {Math.round(activeTimer.targetDuration / 60)}m Session
                        </span>
                        <span className="font-mono text-amber-200">
                          {activeTimer.targetDuration - elapsedSeconds > 0
                            ? `Auto-stops in ${formatSecondsToTimer(activeTimer.targetDuration - elapsedSeconds)}`
                            : 'Limit reached (Auto-stopping...)'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-slate-600 tracking-tight">
                    00:00:00
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {isOutsideHours ? (
                      <p className="text-xs text-amber-300/90 font-medium flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-amber-400" />
                        Office closed ({schedule?.closingTime ? `Ended at ${schedule.closingTime}` : 'Outside hours'}). Planned duration limit required.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Select a project to start logging time.
                      </p>
                    )}
                    <p className="text-xs text-slate-500 font-mono">
                      Current Time: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!activeTimer ? (
                <>
                  <div className="min-w-[220px]">
                    <select
                      id="timer-project-select"
                      data-testid="timer-project-select"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      {projects.length === 0 ? (
                        <option value="">No active projects available</option>
                      ) : (
                        projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <input
                    id="timer-notes-input"
                    data-testid="timer-notes-input"
                    type="text"
                    placeholder="Task notes (optional)"
                    value={timerNotes}
                    onChange={(e) => setTimerNotes(e.target.value)}
                    className="py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 sm:w-56"
                  />

                  <button
                    id="timer-start-btn"
                    data-testid="timer-start-btn"
                    onClick={handleStartTimer}
                    disabled={isTimerLoading || projects.length === 0}
                    className={`py-2.5 px-6 rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer ${
                      isOutsideHours
                        ? 'bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white shadow-amber-950/40'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                    }`}
                  >
                    {isOutsideHours ? (
                      <>
                        <Moon className="w-4 h-4 text-amber-200 fill-amber-200" /> Start Overtime Session
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" /> Start Timer
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-[200px]">
                    <select
                      id="timer-switch-select"
                      data-testid="timer-switch-select"
                      value={selectedProjectId}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value);
                        startTimer(e.target.value);
                      }}
                      className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          Switch to: {p.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    id="timer-stop-btn"
                    data-testid="timer-stop-btn"
                    onClick={handleStopTimer}
                    disabled={isTimerLoading}
                    className="py-2.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-white" /> Stop Timer
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ADMIN DASHBOARD CONTENT                                                  */}
        {/* ========================================================================= */}
        {isAdmin && adminData && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Tracked Today</span>
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {adminData.summary.todayHours} <span className="text-xs font-normal text-slate-400">hrs</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Across all employees</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Tracked This Week</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {adminData.summary.weekHours} <span className="text-xs font-normal text-slate-400">hrs</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Total weekly output</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Active Timers</span>
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white flex items-center gap-2">
                  <span>{adminData.summary.activeTimersCount}</span>
                  {adminData.summary.activeTimersCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Currently working live</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Pending Corrections</span>
                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {adminData.summary.pendingCorrections}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Awaiting approval</p>
              </div>
            </div>

            {/* Live Active Timers List */}
            {adminData.runningEmployees.length > 0 && (
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Employees Currently Tracking Time
                  </h3>
                  <span className="text-xs text-slate-400">
                    {adminData.runningEmployees.length} active
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {adminData.runningEmployees.map((t) => (
                    <div
                      key={t.entryId}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{t.user.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{t.user.employeeId}</p>
                        <p className="text-xs text-blue-400 font-medium mt-1 truncate max-w-[180px]">
                          {t.project.code}: {t.project.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Started: {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 font-mono text-xs rounded-md border border-emerald-500/30">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Tracked Trend Chart */}
              <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Daily Tracked Hours Trend</h3>
                    <p className="text-xs text-slate-400">Regular Hours vs Outside Hours (Last 7 Days)</p>
                  </div>
                  <BarChart3 className="w-5 h-5 text-slate-500" />
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adminData.charts.dailyTrendChart}>
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} unit="h" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="regularHours" name="Regular Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                      <Bar dataKey="outsideHours" name="Outside Hours" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top 5 Projects Pie Chart */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-blue-400" />
                      Top 5 Projects
                    </h3>
                    <p className="text-xs text-slate-400">Total tracked hours this month</p>
                  </div>
                  <PieIcon className="w-5 h-5 text-slate-500" />
                </div>

                <div className="h-64 w-full flex items-center justify-center">
                  {!adminData.charts.topProjectsPieChart || adminData.charts.topProjectsPieChart.length === 0 ? (
                    <p className="text-xs text-slate-500">No tracked project hours this month yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={adminData.charts.topProjectsPieChart}
                          dataKey="hours"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ code, percent }: { code?: string; percent?: number }) =>
                            `${code || ''} ${((percent || 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {adminData.charts.topProjectsPieChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                          formatter={(value: any, name: any, item: any) => [
                            `${value} hrs`,
                            item?.payload?.name ? `${item.payload.code} (${item.payload.name})` : name,
                          ]}
                          itemStyle={{ fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Top 5 Projects Legend List */}
                {adminData.charts.topProjectsPieChart && adminData.charts.topProjectsPieChart.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                    {adminData.charts.topProjectsPieChart.map((proj, idx) => (
                      <div key={proj.code || idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span className="font-semibold text-slate-200">{proj.code}</span>
                          <span className="text-slate-400 truncate">{proj.name}</span>
                        </div>
                        <span className="font-mono font-medium text-slate-300 ml-2 shrink-0">{proj.hours} hrs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* EMPLOYEE DASHBOARD CONTENT                                               */}
        {/* ========================================================================= */}
        {!isAdmin && empData && (
          <div className="space-y-8">
            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium">Today's Tracked Time</div>
                <div className="mt-2 text-2xl font-bold text-white font-mono">
                  {formatSecondsToTimer(empData.todayTotalSeconds)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Logged across all projects today</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium">Weekly Tracked Hours</div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {(empData.weekTotalSeconds / 3600).toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-400">hours</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Monday to Sunday period</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium">Pending Corrections</div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {empData.pendingCorrectionsCount}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Requests waiting admin review</p>
              </div>
            </div>

            {/* Today's Project-Wise Time Breakdown */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h3 className="text-base font-semibold text-white mb-4">
                Today's Project-Wise Distribution
              </h3>

              {empData.todayProjects.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  No time tracked yet today. Start your timer above to begin recording hours!
                </div>
              ) : (
                <div className="space-y-3">
                  {empData.todayProjects.map((p, idx) => {
                    const percent = empData.todayTotalSeconds > 0
                      ? Math.round((p.duration / empData.todayTotalSeconds) * 100)
                      : 0;
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium text-slate-200">
                            <strong className="text-blue-400">{p.project.code}</strong> — {p.project.name}
                          </span>
                          <span className="font-mono text-slate-300 font-semibold">
                            {formatSecondsToTimer(p.duration)} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Time Logs Table */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Recent Time History</h3>
                <Link
                  href="/time-logs"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  View All Logs <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {empData.recentLogs.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">
                  No previous time logs found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="pb-3 font-medium">Project</th>
                        <th className="pb-3 font-medium">Date & Time</th>
                        <th className="pb-3 font-medium">Duration</th>
                        <th className="pb-3 font-medium">Type</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {empData.recentLogs.map((log) => (
                        <tr key={log.id} className="text-slate-300 hover:bg-slate-800/30 transition">
                          <td className="py-3 font-medium text-white">
                            {log.project.code} — {log.project.name}
                          </td>
                          <td className="py-3 text-xs text-slate-400">
                            {new Date(log.startTime).toLocaleString()}
                          </td>
                          <td className="py-3 font-mono font-medium">
                            {formatSecondsToTimer(log.duration)}
                          </td>
                          <td className="py-3">
                            {log.isOutsideHours ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Outside Hours
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Regular
                              </span>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="text-xs text-slate-400 uppercase font-mono">
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Outside Hours Duration Limit Modal */}
      <OutsideHoursDurationModal
        isOpen={isDurationModalOpen}
        onClose={() => setIsDurationModalOpen(false)}
        onConfirm={handleConfirmOutsideStart}
        projectName={projects.find((p) => p.id === selectedProjectId)?.name}
        projectCode={projects.find((p) => p.id === selectedProjectId)?.code}
        schedule={schedule}
        initialNotes={timerNotes}
        isStarting={isTimerLoading}
      />
    </AppShell>
  );
}
