'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, formatSecondsToTimer } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  FileSpreadsheet,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  Award,
  CheckCircle2,
  Clock,
  Layers,
  BarChart2,
} from 'lucide-react';

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'custom' | 'completed'>('daily');
  const [isLoading, setIsLoading] = useState(false);

  // Daily State
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyData, setDailyData] = useState<any>(null);

  // Weekly State
  const [weeklyDate, setWeeklyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weeklyData, setWeeklyData] = useState<any>(null);

  // Custom Range State
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [customProject, setCustomProject] = useState('ALL');
  const [customData, setCustomData] = useState<any>(null);

  // Completed Projects State
  const [completedProjects, setCompletedProjects] = useState<any[]>([]);

  // Reference projects
  const [projectsList, setProjectsList] = useState<any[]>([]);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((d) => setProjectsList(d.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'daily') loadDaily();
    else if (activeTab === 'weekly') loadWeekly();
    else if (activeTab === 'custom') loadCustom();
    else if (activeTab === 'completed') loadCompleted();
  }, [activeTab, dailyDate, weeklyDate]);

  const loadDaily = async (overrideDate?: string) => {
    const dateToUse = overrideDate || dailyDate || new Date().toISOString().slice(0, 10);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?date=${dateToUse}`);
      if (res.ok) {
        const data = await res.json();
        setDailyData(data.report || null);
      } else {
        setDailyData(null);
      }
    } catch {
      setDailyData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWeekly = async (overrideDate?: string) => {
    const dateToUse = overrideDate || weeklyDate || new Date().toISOString().slice(0, 10);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/reports/weekly?date=${dateToUse}`);
      if (res.ok) {
        const data = await res.json();
        setWeeklyData(data.report || null);
      } else {
        setWeeklyData(null);
      }
    } catch {
      setWeeklyData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCustom = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (customStart) params.append('startDate', customStart);
      if (customEnd) params.append('endDate', customEnd);
      if (customProject !== 'ALL') params.append('projectId', customProject);

      const res = await fetch(`/api/reports/custom?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomData(data.report || null);
      } else {
        setCustomData(null);
      }
    } catch {
      setCustomData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCompleted = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports/completed-projects');
      const data = await res.json();
      setCompletedProjects(data.completedProjects || []);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (activeTab === 'daily') {
      params.append('startDate', dailyDate);
      params.append('endDate', dailyDate);
    } else if (activeTab === 'weekly' && weeklyData) {
      params.append('startDate', weeklyData.weekStart);
      params.append('endDate', weeklyData.weekEnd);
    } else if (activeTab === 'custom') {
      if (customStart) params.append('startDate', customStart);
      if (customEnd) params.append('endDate', customEnd);
      if (customProject !== 'ALL') params.append('projectId', customProject);
    }
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800 no-print">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-6 h-6 text-blue-500" />
              Reports & Analytics Center
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Automated reporting, productivity breakdowns, and exportable financial audit sheets.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleExport('csv')}
              className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" /> Export CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Export Excel
            </button>
            <button
              onClick={handlePrint}
              className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 no-print overflow-x-auto">
          {[
            { id: 'daily', label: 'Daily Reports' },
            { id: 'weekly', label: 'Weekly Reports' },
            { id: 'custom', label: 'Custom Date Range' },
            { id: 'completed', label: 'Completed Projects' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-4 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: DAILY REPORT                                                       */}
        {/* ========================================================================= */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 no-print">
              <label className="text-xs text-slate-400 font-medium">Select Date:</label>
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="py-1.5 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {isLoading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3 bg-slate-900/30 rounded-2xl border border-slate-800/80">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-slate-400">Loading daily report analytics...</span>
              </div>
            ) : dailyData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400 font-medium">Total Tracked Today</span>
                    <div className="text-2xl font-bold text-white font-mono mt-1">
                      {formatSecondsToTimer(dailyData.totalTrackedSeconds || 0)}
                    </div>
                    <span className="text-xs text-slate-500">
                      {((dailyData.totalTrackedSeconds || 0) / 3600).toFixed(2)} hours
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400 font-medium">Regular Office Hours</span>
                    <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                      {formatSecondsToTimer(dailyData.regularSeconds || 0)}
                    </div>
                    <span className="text-xs text-slate-500">
                      {((dailyData.regularSeconds || 0) / 3600).toFixed(2)} hours
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400 font-medium">Outside Hours Tracked</span>
                    <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                      {formatSecondsToTimer(dailyData.outsideHoursSeconds || 0)}
                    </div>
                    <span className="text-xs text-slate-500">
                      {((dailyData.outsideHoursSeconds || 0) / 3600).toFixed(2)} hours
                    </span>
                  </div>
                </div>

                {/* Employee-wise Table or Empty State Box */}
                {dailyData.employeeBreakdown && dailyData.employeeBreakdown.length > 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <h3 className="text-base font-semibold text-white mb-4">
                      Employee-Wise Daily Breakdown ({dailyData.date})
                    </h3>
                    <div className="space-y-4">
                      {dailyData.employeeBreakdown.map((emp: any) => (
                        <div key={emp.user.id} className="p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
                            <div>
                              <span className="font-semibold text-white text-sm">{emp.user.name}</span>
                              <span className="text-xs text-slate-400 font-mono ml-2">({emp.user.employeeId})</span>
                            </div>
                            <div className="text-xs font-mono">
                              Total: <strong className="text-white">{formatSecondsToTimer(emp.totalDuration)}</strong> | Regular: <span className="text-emerald-400">{formatSecondsToTimer(emp.regularDuration)}</span> | Outside: <span className="text-amber-400">{formatSecondsToTimer(emp.outsideHoursDuration)}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {emp.projects.map((pr: any, i: number) => (
                              <div key={i} className="p-2 rounded-lg bg-slate-900 text-xs flex justify-between">
                                <span className="text-slate-300">
                                  <strong className="text-blue-400">{pr.project.code}</strong> — {pr.project.name}
                                </span>
                                <span className="font-mono text-white font-medium">{formatSecondsToTimer(pr.duration)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-14 px-6 text-center bg-slate-900/40 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-3.5 shadow-sm">
                      <FileSpreadsheet className="w-6 h-6 text-slate-400" />
                    </div>
                    <h4 className="text-base font-bold text-white tracking-tight">No Time Records Found for This Date</h4>
                    <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
                      No employee recorded working hours on <span className="font-semibold text-slate-200">{dailyData.date || dailyDate}</span>. Select another date or check weekly reports.
                    </p>
                    <div className="flex items-center gap-2.5 mt-5">
                      <button
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setDailyDate(today);
                          loadDaily(today);
                        }}
                        className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                      >
                        Select Today
                      </button>
                      <button
                        onClick={() => setActiveTab('weekly')}
                        className="py-2 px-4 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-semibold text-blue-300 transition cursor-pointer"
                      >
                        View Weekly Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-14 px-6 text-center bg-slate-900/40 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-3.5 shadow-sm">
                  <FileSpreadsheet className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-base font-bold text-white tracking-tight">No Time Records Found for This Date</h4>
                <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
                  No employee recorded working hours on <span className="font-semibold text-slate-200">{dailyDate}</span>. Select another date or check weekly reports.
                </p>
                <div className="flex items-center gap-2.5 mt-5">
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      setDailyDate(today);
                      loadDaily(today);
                    }}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                  >
                    Select Today
                  </button>
                  <button
                    onClick={() => setActiveTab('weekly')}
                    className="py-2 px-4 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-semibold text-blue-300 transition cursor-pointer"
                  >
                    View Weekly Report
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: WEEKLY REPORT                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'weekly' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 no-print">
              <label className="text-xs text-slate-400 font-medium">Select Week Containing:</label>
              <input
                type="date"
                value={weeklyDate}
                onChange={(e) => setWeeklyDate(e.target.value)}
                className="py-1.5 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {isLoading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3 bg-slate-900/30 rounded-2xl border border-slate-800/80">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-slate-400">Loading weekly report analytics...</span>
              </div>
            ) : weeklyData ? (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Weekly Reporting Window (Monday to Sunday)</span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {weeklyData.weekStart} &nbsp;→&nbsp; {weeklyData.weekEnd}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 font-medium">Total Tracked Project Hours</span>
                    <div className="text-2xl font-bold text-white font-mono">
                      {((weeklyData.totalTrackedSeconds || 0) / 3600).toFixed(2)} hrs
                    </div>
                  </div>
                </div>

                {/* Highest & Lowest Project Time highlight card */}
                {(weeklyData.highestProjectTime || weeklyData.lowestProjectTime) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {weeklyData.highestProjectTime && (
                      <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/50 flex items-center gap-3">
                        <Award className="w-8 h-8 text-blue-400 shrink-0" />
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-blue-300 font-semibold">
                            Highest Project Time
                          </span>
                          <p className="text-sm font-bold text-white">
                            {weeklyData.highestProjectTime.user.name} on {weeklyData.highestProjectTime.project.name}
                          </p>
                          <span className="text-xs font-mono text-blue-300 font-semibold">
                            {formatSecondsToTimer(weeklyData.highestProjectTime.duration)} ({(weeklyData.highestProjectTime.duration / 3600).toFixed(1)} hrs)
                          </span>
                        </div>
                      </div>
                    )}

                    {weeklyData.lowestProjectTime && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
                        <Clock className="w-8 h-8 text-slate-500 shrink-0" />
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                            Lowest Tracked Project
                          </span>
                          <p className="text-sm font-bold text-white">
                            {weeklyData.lowestProjectTime.user.name} on {weeklyData.lowestProjectTime.project.name}
                          </p>
                          <span className="text-xs font-mono text-slate-400 font-semibold">
                            {formatSecondsToTimer(weeklyData.lowestProjectTime.duration)} ({(weeklyData.lowestProjectTime.duration / 3600).toFixed(1)} hrs)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project Breakdown List */}
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h3 className="text-base font-semibold text-white mb-4">
                    Weekly Project Duration & Contributor Breakdown
                  </h3>

                  {weeklyData.projectBreakdown && weeklyData.projectBreakdown.length > 0 ? (
                    <div className="space-y-4">
                      {weeklyData.projectBreakdown.map((p: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-white">
                              <strong className="text-blue-400">{p.project.code}</strong> — {p.project.name}
                            </span>
                            <span className="font-mono text-sm font-bold text-white">
                              {(p.duration / 3600).toFixed(2)} hrs
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-900 text-xs">
                            {p.employeeHours.map((eh: any, i: number) => (
                              <div key={i} className="text-slate-400">
                                {eh.employeeName}: <strong className="text-slate-200">{(eh.duration / 3600).toFixed(1)}h</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-500">
                      No project activity recorded for this week.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 px-6 text-center bg-slate-900/40 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-slate-500 mb-2" />
                <h4 className="text-sm font-bold text-white">No Weekly Records Found</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">No time tracking entries were logged during this Monday–Sunday window.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CUSTOM DATE RANGE REPORT                                           */}
        {/* ========================================================================= */}
        {activeTab === 'custom' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center gap-3 no-print">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <select
                value={customProject}
                onChange={(e) => setCustomProject(e.target.value)}
                className="py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
              >
                <option value="ALL">All Projects</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>

              <button
                onClick={loadCustom}
                className="py-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
              >
                Filter Analytics
              </button>
            </div>

            {customData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400">Total Range Hours</span>
                    <div className="text-2xl font-bold text-white font-mono mt-1">
                      {(customData.totalSeconds / 3600).toFixed(2)} hrs
                    </div>
                    <span className="text-xs text-slate-500">{customData.entriesCount} total records</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400">Regular Working Hours</span>
                    <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                      {(customData.regularSeconds / 3600).toFixed(2)} hrs
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-xs text-slate-400">Outside Hours Tracked</span>
                    <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                      {(customData.outsideHoursSeconds / 3600).toFixed(2)} hrs
                    </div>
                  </div>
                </div>

                {/* Daily Timeline Table */}
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h3 className="text-base font-semibold text-white mb-4">
                    Daily Timeline Aggregation
                  </h3>
                  <div className="overflow-x-auto">
                    {customData.dailyTimeline && customData.dailyTimeline.length > 0 ? (
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                            <th className="pb-3">Date</th>
                            <th className="pb-3">Regular Hours</th>
                            <th className="pb-3">Outside Hours</th>
                            <th className="pb-3 font-bold text-white">Daily Total Hours</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {customData.dailyTimeline.map((item: any) => (
                            <tr key={item.date} className="text-slate-300">
                              <td className="py-2.5 font-medium">{item.date}</td>
                              <td className="py-2.5 font-mono text-emerald-400">{(item.regular / 3600).toFixed(2)}h</td>
                              <td className="py-2.5 font-mono text-amber-400">{(item.outside / 3600).toFixed(2)}h</td>
                              <td className="py-2.5 font-mono font-bold text-white">{(item.duration / 3600).toFixed(2)}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-slate-500 py-6 text-center">No time records found in this custom date range.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: COMPLETED PROJECTS REPORT                                          */}
        {/* ========================================================================= */}
        {activeTab === 'completed' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
              <p>
                <strong>Completed Project Analysis:</strong> Clearly distinguishes total elapsed calendar time between project creation and closure from the actual recorded working hours.
              </p>
            </div>

            {completedProjects.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                No completed or closed projects yet.
              </div>
            ) : (
              <div className="space-y-4">
                {completedProjects.map((p) => (
                  <div key={p.projectId} className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
                      <div>
                        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {p.code} (COMPLETED)
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1">{p.name}</h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <div>
                          <span className="text-slate-500 block">Created</span>
                          <span className="text-slate-300">{p.creationDate}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Closed</span>
                          <span className="text-slate-300">{p.closureDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-xs text-slate-400">Total Calendar Elapsed Time</span>
                        <div className="text-xl font-bold text-white mt-1">
                          {p.calendarElapsedFormatted}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">Duration on calendar from start to closure</p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-xs text-slate-400">Total Actual Tracked Working Time</span>
                        <div className="text-xl font-bold text-blue-400 mt-1 font-mono">
                          {p.totalTrackedFormatted}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">Sum of employee working durations</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Employee Contributions
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {p.employeeBreakdown.map((eb: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-lg bg-slate-950 text-xs flex justify-between">
                            <span className="text-slate-300">{eb.user.name}</span>
                            <span className="font-mono text-white font-medium">{eb.durationFormatted}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
