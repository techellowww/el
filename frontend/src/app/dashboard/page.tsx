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
  ExternalLink,
  X,
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
  CartesianGrid,
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
    monthInsideHours?: number;
    monthOutsideHours?: number;
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
    monthTimingPieChart?: Array<{ name: string; label: string; hours: number; seconds: number; color: string; percent?: number }>;
    topProjectsPieChart?: Array<{ id: string; code: string; name: string; label: string; hours: number; seconds: number }>;
    dailyTrendChart: Array<{ date: string; regularHours: number; outsideHours: number; totalHours: number }>;
    projectDistributionChart: Array<{ name: string; hours: number }>;
    topEmployeesPieChart?: Array<{ name: string; hours: number; employeeId: string }>;
  };
}

export interface WeeklyDayTiming {
  date: string;
  day: string;
  fullDay: string;
  formattedDate: string;
  insideHours: number;
  outsideHours: number;
  totalHours: number;
  insideSeconds: number;
  outsideSeconds: number;
  totalSeconds: number;
  isToday: boolean;
}

interface EmployeeDashboardData {
  todayTotalSeconds: number;
  todayRegularSeconds: number;
  todayOutsideHoursSeconds: number;
  weekTotalSeconds: number;
  weekInsideSeconds: number;
  weekOutsideSeconds: number;
  weeklyTimingChart: WeeklyDayTiming[];
  weekRangeText: string;
  todayProjects: Array<{ project: { code: string; name: string }; duration: number }>;
  pendingCorrectionsCount: number;
}

function getLogHoursBreakdown(
  log: { startTime: string; endTime?: string | null; duration: number; isOutsideHours: boolean },
  schedule?: { openingTime?: string; closingTime?: string } | null
): { insideSeconds: number; outsideSeconds: number } {
  if (!log.duration || log.duration <= 0) {
    return { insideSeconds: 0, outsideSeconds: 0 };
  }

  // Explicit outside-hours sessions
  if (log.isOutsideHours) {
    return { insideSeconds: 0, outsideSeconds: log.duration };
  }

  // If schedule closing time is defined, check if session extended past closing
  if (schedule?.closingTime) {
    try {
      const start = new Date(log.startTime);
      const end = log.endTime ? new Date(log.endTime) : new Date(start.getTime() + log.duration * 1000);
      const [closeH, closeM] = schedule.closingTime.split(':').map(Number);

      const closingDate = new Date(start);
      closingDate.setHours(closeH, closeM, 0, 0);

      // Session finished before closing time
      if (end.getTime() <= closingDate.getTime()) {
        return { insideSeconds: log.duration, outsideSeconds: 0 };
      }

      // Session started after closing time
      if (start.getTime() >= closingDate.getTime()) {
        return { insideSeconds: 0, outsideSeconds: log.duration };
      }

      // Session spans across closing time
      const insideMs = Math.max(0, closingDate.getTime() - start.getTime());
      const insideSec = Math.min(log.duration, Math.round(insideMs / 1000));
      const outsideSec = Math.max(0, log.duration - insideSec);
      return { insideSeconds: insideSec, outsideSeconds: outsideSec };
    } catch {
      // Fallback to isOutsideHours flag on calculation error
    }
  }

  return { insideSeconds: log.duration, outsideSeconds: 0 };
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
  const [isAllTrackingModalOpen, setIsAllTrackingModalOpen] = useState(false);
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
        const [prjRes, dailyRes, weeklyRes, corrRes] = await Promise.all([
          fetch('/api/projects?status=ACTIVE'),
          fetch('/api/reports/daily'),
          fetch('/api/reports/weekly'),
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

        // Build weekly timing chart data
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayDateStr = `${year}-${month}-${day}`;

        let weeklyTimingChart: WeeklyDayTiming[] = [];
        let weekInsideSeconds = weeklyData?.report?.weekInsideSeconds || 0;
        let weekOutsideSeconds = weeklyData?.report?.weekOutsideSeconds || 0;

        if (weeklyData?.report?.dailyBreakdown && weeklyData.report.dailyBreakdown.length > 0) {
          weeklyTimingChart = weeklyData.report.dailyBreakdown.map((d: any) => ({
            ...d,
            isToday: d.date === todayDateStr,
          }));
        } else {
          const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const fullDaysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const currentDay = now.getDay();
          const mondayDiff = currentDay === 0 ? -6 : 1 - currentDay;
          const monday = new Date(now);
          monday.setDate(now.getDate() + mondayDiff);
          monday.setHours(0, 0, 0, 0);

          const dayMap = new Map<string, WeeklyDayTiming>();
          for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dYear = d.getFullYear();
            const dMonth = String(d.getMonth() + 1).padStart(2, '0');
            const dDay = String(d.getDate()).padStart(2, '0');
            const key = `${dYear}-${dMonth}-${dDay}`;
            dayMap.set(key, {
              date: key,
              day: daysOfWeek[i],
              fullDay: fullDaysOfWeek[i],
              formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              insideHours: 0,
              outsideHours: 0,
              totalHours: 0,
              insideSeconds: 0,
              outsideSeconds: 0,
              totalSeconds: 0,
              isToday: key === todayDateStr,
            });
          }

          if (weeklyData?.report?.rawEntries) {
            for (const entry of weeklyData.report.rawEntries) {
              const entryDate = entry.startTime.split('T')[0];
              const dayItem = dayMap.get(entryDate);
              if (dayItem) {
                const breakdown = getLogHoursBreakdown(entry, schedule);
                dayItem.insideSeconds += breakdown.insideSeconds;
                dayItem.outsideSeconds += breakdown.outsideSeconds;
                dayItem.totalSeconds += entry.duration;
                dayItem.insideHours = Number((dayItem.insideSeconds / 3600).toFixed(2));
                dayItem.outsideHours = Number((dayItem.outsideSeconds / 3600).toFixed(2));
                dayItem.totalHours = Number((dayItem.totalSeconds / 3600).toFixed(2));
              }
            }
          }

          weeklyTimingChart = Array.from(dayMap.values());
          weekInsideSeconds = weeklyTimingChart.reduce((acc, curr) => acc + curr.insideSeconds, 0);
          weekOutsideSeconds = weeklyTimingChart.reduce((acc, curr) => acc + curr.outsideSeconds, 0);
        }

        const weekRangeText = weeklyData?.report?.weekStart && weeklyData?.report?.weekEnd
          ? `${new Date(weeklyData.report.weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weeklyData.report.weekEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : 'Current Week';

        setEmpData({
          todayTotalSeconds: dailyData?.report?.totalTrackedSeconds || 0,
          todayRegularSeconds: dailyData?.report?.regularSeconds || 0,
          todayOutsideHoursSeconds: dailyData?.report?.outsideHoursSeconds || 0,
          weekTotalSeconds: weeklyData?.report?.totalTrackedSeconds || (weekInsideSeconds + weekOutsideSeconds),
          weekInsideSeconds,
          weekOutsideSeconds,
          weeklyTimingChart,
          weekRangeText,
          todayProjects: Array.from(todayProjectsMap.values()),
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
    const targetProject = selectedProjectId || (projects.length > 0 ? projects[0].id : '');

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

    const ok = await startTimer(targetProject);
    if (ok) {
      setTimerNotes('');
      loadDashboardData();

      // Immediately take live milestone 0 screenshot of workstation
      const currentActive = useTimerStore.getState().activeTimer;
      if (currentActive && user && isScreenStreamActive()) {
        const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 60);
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId,
          timeEntryId: currentActive.id,
          projectCode: currentActive.project?.code || 'PRJ',
          projectName: currentActive.project?.name || 'Workspace',
          elapsedSeconds: 0,
          intervalMinutes,
          intervalIndex: 0,
        }).catch(console.error);
      }
    }
  };

  const handleConfirmOutsideStart = async (durationMinutes: number) => {
    const targetProject = selectedProjectId || (projects.length > 0 ? projects[0].id : '');

    if (screenshotSetting?.enabled && !isScreenStreamActive()) {
      const stream = await requestScreenStream();
      if (!stream) {
        throw new Error('Screen sharing is required to track overtime. Please select "Entire Screen" to proceed.');
      }
    }

    const ok = await startTimer(targetProject, undefined, durationMinutes);
    if (ok) {
      setIsDurationModalOpen(false);
      setTimerNotes('');
      loadDashboardData();

      // Immediately take live milestone 0 screenshot of workstation
      const currentActive = useTimerStore.getState().activeTimer;
      if (currentActive && user && isScreenStreamActive()) {
        const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 60);
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId,
          timeEntryId: currentActive.id,
          projectCode: currentActive.project?.code || 'PRJ',
          projectName: currentActive.project?.name || 'Workspace',
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
                        Click Start Timer to begin tracking your work.
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
                <button
                  id="timer-start-btn"
                  data-testid="timer-start-btn"
                  onClick={handleStartTimer}
                  disabled={isTimerLoading}
                  className={`py-3 px-8 rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 shadow-lg transition disabled:opacity-50 cursor-pointer ${
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
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    id="timer-stop-btn"
                    data-testid="timer-stop-btn"
                    onClick={handleStopTimer}
                    disabled={isTimerLoading}
                    className="py-3 px-8 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition cursor-pointer"
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
                  <span>Total Employees</span>
                  <Users className="w-4 h-4 text-purple-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {adminData.summary.totalEmployees}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Total registered workforce</p>
              </div>
            </div>

            {/* Live Active Timers List */}
            {adminData.runningEmployees.length > 0 && (
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <h3 className="text-base font-semibold text-white">
                      Employees Currently Tracking Time
                    </h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {adminData.runningEmployees.length} active
                    </span>
                  </div>

                  <button
                    type="button"
                    id="view-all-tracking-employees-btn"
                    data-testid="view-all-tracking-employees-btn"
                    onClick={() => setIsAllTrackingModalOpen(true)}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 cursor-pointer"
                  >
                    <span>View All ({adminData.runningEmployees.length})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {adminData.runningEmployees.slice(0, 4).map((t) => (
                    <div
                      key={t.entryId}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{t.user.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{t.user.employeeId}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-semibold rounded-md border border-emerald-500/30 shrink-0">
                          Active
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-800/80">
                        <p className="text-xs text-blue-400 font-medium truncate" title={`${t.project.code}: ${t.project.name}`}>
                          {t.project.code}: {t.project.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Started: {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
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

              {/* Current Month Work Timing Breakdown (Inside vs Outside) */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <PieIcon className="w-4 h-4 text-blue-400" />
                      Current Month Timing
                    </h3>
                    <p className="text-xs text-slate-400">
                      Inside Timing vs Outside Timing ({new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})
                    </p>
                  </div>
                  <Clock className="w-5 h-5 text-slate-500" />
                </div>

                {(() => {
                  let pieData = adminData.charts.monthTimingPieChart;
                  const totalMonthHours = adminData.summary.monthHours || 0;

                  // Robust fallback if monthTimingPieChart wasn't populated
                  if (!pieData || pieData.length === 0) {
                    const insideH = adminData.summary.monthInsideHours ?? 0;
                    const outsideH = adminData.summary.monthOutsideHours ?? (totalMonthHours > insideH ? Number((totalMonthHours - insideH).toFixed(2)) : 0);
                    const totalH = insideH + outsideH || totalMonthHours;
                    const insidePct = totalH > 0 ? Math.round((insideH / totalH) * 100) : 0;
                    const outsidePct = totalH > 0 ? 100 - insidePct : 0;

                    pieData = [
                      {
                        name: 'Inside Timing',
                        label: 'Inside Office Hours',
                        hours: insideH,
                        seconds: Math.round(insideH * 3600),
                        percent: insidePct,
                        color: '#10b981',
                      },
                      {
                        name: 'Outside Timing',
                        label: 'Outside Hours (Overtime)',
                        hours: outsideH,
                        seconds: Math.round(outsideH * 3600),
                        percent: outsidePct,
                        color: '#f59e0b',
                      },
                    ];
                  }

                  const hasData = pieData.some((p) => (p.hours || 0) > 0 || (p.seconds || 0) > 0) || totalMonthHours > 0;
                  const insideSlice = pieData.find((p) => p.name === 'Inside Timing') || pieData[0];
                  const outsideSlice = pieData.find((p) => p.name === 'Outside Timing') || pieData[1];

                  return (
                    <div className="flex flex-col flex-1 justify-between">
                      <div className="h-56 w-full relative flex items-center justify-center">
                        {!hasData ? (
                          <div className="text-center py-6 text-slate-500">
                            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">No hours tracked this month yet.</p>
                          </div>
                        ) : (
                          <>
                            <ResponsiveContainer width="100%" height={224}>
                              <PieChart>
                                <Pie
                                  data={pieData}
                                  dataKey="hours"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={55}
                                  outerRadius={80}
                                  paddingAngle={pieData.every((p) => (p.hours || 0) > 0) ? 2 : 0}
                                  label={({ name, percent }: { name?: string; percent?: number }) =>
                                    (percent || 0) >= 0.08 ? `${name === 'Inside Timing' ? 'Inside' : 'Outside'} ${((percent || 0) * 100).toFixed(0)}%` : ''
                                  }
                                  labelLine={false}
                                >
                                  {pieData.map((entry, index) => (
                                    <Cell
                                      key={`timing-cell-${index}`}
                                      fill={entry.color || (index === 0 ? '#10b981' : '#f59e0b')}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                                  formatter={(value: any, name: any, item: any) => [
                                    `${value} hrs (${item?.payload?.percent ?? 0}%)`,
                                    item?.payload?.label || name,
                                  ]}
                                  itemStyle={{ fontSize: '12px' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* Center Donut Metric */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-bold font-mono text-white tracking-tight">{totalMonthHours}h</span>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Month Timing Legend & Cards */}
                      {hasData && (
                        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="font-semibold text-slate-200">Inside Timing</span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="font-mono text-base font-bold text-emerald-400">
                                {insideSlice?.hours || 0} <span className="text-[10px] font-normal text-slate-400">hrs</span>
                              </span>
                              <span className="text-[11px] font-mono font-medium text-slate-400">
                                {insideSlice?.percent ?? 0}%
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">Regular office schedule</p>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="font-semibold text-slate-200">Outside Timing</span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="font-mono text-base font-bold text-amber-400">
                                {outsideSlice?.hours || 0} <span className="text-[10px] font-normal text-slate-400">hrs</span>
                              </span>
                              <span className="text-[11px] font-mono font-medium text-slate-400">
                                {outsideSlice?.percent ?? 0}%
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">Overtime / after hours</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium">Today's Tracked Time</div>
                <div className="mt-2 text-2xl font-bold text-white font-mono">
                  {formatSecondsToTimer(empData.todayTotalSeconds)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Total recorded today</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
                  <span>Inside Hours (Today)</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
                  {formatSecondsToTimer(empData.todayRegularSeconds || 0)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Regular office schedule</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
                  <span>Outside Hours (Today)</span>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-400 font-mono">
                  {formatSecondsToTimer(empData.todayOutsideHoursSeconds || 0)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Overtime / after hours</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-400 text-xs font-medium">Weekly Tracked Hours</div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {(empData.weekTotalSeconds / 3600).toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-400">hours</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {empData.pendingCorrectionsCount > 0
                    ? `${empData.pendingCorrectionsCount} correction(s) pending`
                    : 'Monday to Sunday period'}
                </p>
              </div>
            </div>

            {/* Current Week Work Timing as a Graph */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    Current Week Work Timing
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your daily work hours breakdown (Inside Office Hours &amp; Outside Hours) for {empData.weekRangeText}
                  </p>
                </div>

                {/* Summary Stat Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>Week Total:</span>
                    <span className="font-mono font-bold text-white">
                      {formatSecondsToTimer(empData.weekTotalSeconds)}
                    </span>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Inside:</span>
                    <span className="font-mono font-bold">
                      {formatSecondsToTimer(empData.weekInsideSeconds)}
                    </span>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Outside:</span>
                    <span className="font-mono font-bold">
                      {formatSecondsToTimer(empData.weekOutsideSeconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Weekly Timing Bar Chart */}
              <div className="h-72 w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={empData.weeklyTimingChart}
                    margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="day"
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      tick={({ x, y, payload }: any) => {
                        const item = empData.weeklyTimingChart.find((d) => d.day === payload.value);
                        const isToday = item?.isToday;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={0}
                              dy={14}
                              textAnchor="middle"
                              fill={isToday ? '#60a5fa' : '#94a3b8'}
                              fontWeight={isToday ? '700' : '500'}
                              fontSize={12}
                            >
                              {payload.value}
                            </text>
                            {isToday && (
                              <circle cx={0} cy={22} r={2.5} fill="#60a5fa" />
                            )}
                          </g>
                        );
                      }}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      unit="h"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }}
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const data: WeeklyDayTiming = payload[0].payload;
                          return (
                            <div className="bg-slate-950 border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs space-y-2 min-w-[210px]">
                              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                                <span className="font-semibold text-white flex items-center gap-1.5">
                                  {data.fullDay}
                                  {data.isToday && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      Today
                                    </span>
                                  )}
                                </span>
                                <span className="text-slate-400 font-mono text-[11px]">{data.formattedDate}</span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-emerald-400">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    Inside Hours:
                                  </span>
                                  <span className="font-mono font-semibold">
                                    {formatSecondsToTimer(data.insideSeconds)} ({data.insideHours}h)
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-amber-400">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    Outside Hours:
                                  </span>
                                  <span className="font-mono font-semibold">
                                    {formatSecondsToTimer(data.outsideSeconds)} ({data.outsideHours}h)
                                  </span>
                                </div>
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-white font-medium">
                                  <span>Total Timing:</span>
                                  <span className="font-mono font-bold text-blue-400">
                                    {formatSecondsToTimer(data.totalSeconds)} ({data.totalHours}h)
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                      formatter={(val) => <span className="text-slate-300 font-medium">{val}</span>}
                    />
                    <Bar
                      dataKey="insideHours"
                      name="Inside Hours (Regular)"
                      fill="#10b981"
                      stackId="timing"
                      radius={[0, 0, 0, 0]}
                      maxBarSize={44}
                    />
                    <Bar
                      dataKey="outsideHours"
                      name="Outside Hours (Overtime)"
                      fill="#f59e0b"
                      stackId="timing"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 7-Day Quick Glance Cards Strip */}
              <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 relative z-10">
                {empData.weeklyTimingChart.map((d) => (
                  <div
                    key={d.date}
                    className={`p-3 rounded-xl border transition flex flex-col justify-between ${
                      d.isToday
                        ? 'bg-blue-950/30 border-blue-500/40 shadow-sm shadow-blue-500/10'
                        : d.totalSeconds > 0
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        : 'bg-slate-950/30 border-slate-800/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${d.isToday ? 'text-blue-400' : 'text-slate-300'}`}>
                        {d.day}
                      </span>
                      {d.isToday ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 uppercase tracking-wider">
                          Today
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">{d.formattedDate}</span>
                      )}
                    </div>

                    <div className="mt-2.5">
                      <div className="text-base font-bold font-mono text-white">
                        {d.totalSeconds > 0 ? formatSecondsToTimer(d.totalSeconds) : '00:00:00'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono">
                        {d.insideSeconds > 0 && (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {d.insideHours}h
                          </span>
                        )}
                        {d.outsideSeconds > 0 && (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {d.outsideHours}h
                          </span>
                        )}
                        {d.totalSeconds === 0 && (
                          <span className="text-slate-500">No logs</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

      {/* View All Active Tracking Employees Modal */}
      {isAllTrackingModalOpen && adminData && (
        <div
          id="active-tracking-employees-modal"
          data-testid="active-tracking-employees-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsAllTrackingModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/80 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">Employees Currently Tracking Time</h3>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {adminData.runningEmployees.length} Online
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live overview of all active project time tracking sessions across the organization.
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="close-tracking-modal-btn"
                data-testid="close-tracking-modal-btn"
                onClick={() => setIsAllTrackingModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Neat Grid View */}
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {adminData.runningEmployees.map((t) => (
                  <div
                    key={t.entryId}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 transition flex flex-col justify-between gap-3 shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                          {t.user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{t.user.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{t.user.employeeId}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-semibold rounded-md border border-emerald-500/30 shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Active
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium truncate">
                        <FolderKanban className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t.project.code}: {t.project.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/60">
                        <span>Started:</span>
                        <span className="text-slate-300">
                          {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>Showing all {adminData.runningEmployees.length} currently running employee timers</span>
              <button
                type="button"
                onClick={() => setIsAllTrackingModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}