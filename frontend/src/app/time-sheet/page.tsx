"use client";

import React, { useEffect, useState, useMemo } from "react";
import { requestScreenStream, isScreenStreamActive, stopScreenStream } from '@/lib/screenshotCapture';
import { useAuthStore, useTimerStore, formatSecondsToTimer, checkIsAfterOfficeHours } from "@/lib/store";
import { formatLocalDate, getInitials } from "@/lib/utils";
import {
  Clock,
  Play,
  Square,
  Plus,
  Calendar,
  History,
  AlertCircle,
  Building,
  Moon,
  Filter,
  Users,
  User as UserIcon,
  RotateCcw,
  Briefcase,
  Layers,
  ChevronDown,
} from "lucide-react";


const getPresetDates = (preset: string) => {
  const now = new Date();
  if (preset === "today") {
    const todayStr = formatLocalDate(now);
    return { start: todayStr, end: todayStr, allDates: false };
  }
  if (preset === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yStr = formatLocalDate(yesterday);
    return { start: yStr, end: yStr, allDates: false };
  }
  if (preset === "this_week") {
    const current = new Date(now);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(current.setDate(diff));
    return { start: formatLocalDate(monday), end: formatLocalDate(now), allDates: false };
  }
  if (preset === "this_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: formatLocalDate(firstDay), end: formatLocalDate(now), allDates: false };
  }
  if (preset === "all_time") {
    return { start: "", end: "", allDates: true };
  }
  return { start: formatLocalDate(now), end: formatLocalDate(now), allDates: false };
};

const PRESET_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "all_time", label: "All Time" },
];

export default function TimeSheetPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const { activeTimer, elapsedSeconds, schedule, startTimer, stopTimer, error } = useTimerStore();

  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [timerDesc, setTimerDesc] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States - Default to Today
  const [startDate, setStartDate] = useState(() => formatLocalDate(new Date()));
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));
  const [isAllDates, setIsAllDates] = useState(false);
  const [datePreset, setDatePreset] = useState("today");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  // Office timing & after-hours detection
  const afterHoursInfo = checkIsAfterOfficeHours(schedule);
  const isAfterHours = afterHoursInfo.isAfterHours;

  // Load projects list
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((pData) => {
        if (pData?.projects) {
          setProjects(pData.projects);
          if (pData.projects.length > 0 && !selectedProjectId) {
            setSelectedProjectId(pData.projects[0].id);
          }
        }
      })
      .catch((err) => console.error("Error fetching projects:", err));
  }, []);

  // Load employees list for Admin filter
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/employees")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.employees) {
            setEmployees(data.employees);
          }
        })
        .catch((err) => console.error("Error fetching employees:", err));
    }
  }, [isAdmin]);

  // Main data fetcher applying all filters
  const fetchTimeData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllDates) {
        params.set("allDates", "true");
      } else {
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
      }
      if (filterProjectId) params.set("projectId", filterProjectId);
      if (filterUserId && isAdmin) params.set("userId", filterUserId);

      const res = await fetch(`/api/time?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error("Time sheet fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch whenever filters or active timer state changes
  useEffect(() => {
    fetchTimeData();
  }, [startDate, endDate, isAllDates, filterProjectId, filterUserId, activeTimer]);

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const config = getPresetDates(preset);
    setStartDate(config.start);
    setEndDate(config.end);
    setIsAllDates(config.allDates);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    setIsAllDates(false);
    setDatePreset("custom");
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    setIsAllDates(false);
    setDatePreset("custom");
  };

  const handleResetFilters = () => {
    const todayStr = formatLocalDate(new Date());
    setStartDate(todayStr);
    setEndDate(todayStr);
    setIsAllDates(false);
    setDatePreset("today");
    setFilterProjectId("");
    setFilterUserId("");
  };

  const isFiltered =
    datePreset !== "today" ||
    Boolean(filterProjectId) ||
    Boolean(filterUserId);

  const handleStartTimer = async (e: React.FormEvent) => {
    if (typeof window !== 'undefined' && !isScreenStreamActive()) {
      try { await requestScreenStream(); } catch {}
    }
    e.preventDefault();
    if (!selectedProjectId) return;

    let targetProjectId = selectedProjectId;
    let finalDesc = timerDesc ? timerDesc.trim() : "";

    if (selectedProjectId.includes("::")) {
      const parts = selectedProjectId.split("::");
      targetProjectId = parts[0];
      const subName = parts[2] || parts[1];
      finalDesc = finalDesc ? `[${subName}] ${finalDesc}` : `[${subName}]`;
    }

    const ok = await startTimer(targetProjectId, finalDesc || undefined, isAfterHours);
    if (ok) {
      setTimerDesc("");
      fetchTimeData();
    }
  };

  const handleStopTimer = async () => {
    const ok = await stopTimer();
    if (ok) {
      fetchTimeData();
    }
  };

  const isOvertimeRunning = Boolean(
    activeTimer?.isOvertime ||
    (activeTimer?.description && /\[Overtime\]/i.test(activeTimer.description))
  );

  // Summary Metrics calculations
  const totalTrackedSeconds = useMemo(() => {
    return entries.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
  }, [entries]);

  const uniqueProjectsCount = useMemo(() => {
    return new Set(entries.map((e) => e.projectId).filter(Boolean)).size;
  }, [entries]);

  const uniqueUsersCount = useMemo(() => {
    return new Set(entries.map((e) => e.userId).filter(Boolean)).size;
  }, [entries]);

  // Descriptive text for the currently active date filter
  const filterSummaryText = useMemo(() => {
    let datePart = "";
    if (datePreset === "today") {
      datePart = "Today";
    } else if (datePreset === "yesterday") {
      datePart = "Yesterday";
    } else if (datePreset === "this_week") {
      datePart = "This Week";
    } else if (datePreset === "this_month") {
      datePart = "This Month";
    } else if (isAllDates) {
      datePart = "All Time";
    } else if (startDate && endDate) {
      if (startDate === endDate) {
        datePart = startDate;
      } else {
        datePart = `${startDate} to ${endDate}`;
      }
    } else if (startDate) {
      datePart = `From ${startDate}`;
    } else if (endDate) {
      datePart = `Up to ${endDate}`;
    } else {
      datePart = "Today";
    }

    const projectPart = filterProjectId
      ? ` • Project: ${projects.find((p) => p.id === filterProjectId)?.name || "Selected"}`
      : "";

    const userPart = filterUserId && isAdmin
      ? ` • Member: ${employees.find((e) => e.id === filterUserId)?.name || "Selected"}`
      : "";

    return `${datePart}${projectPart}${userPart}`;
  }, [datePreset, isAllDates, startDate, endDate, filterProjectId, filterUserId, projects, employees, isAdmin]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-heading text-text-primary flex items-center gap-2">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span>Time Sheet</span>
          </h1>
          <p className="helper-text text-text-secondary mt-1">
            {isAdmin
              ? "All team members' time log history • Filter by date range, project, or individual member."
              : "Your personal logged time entries and stopwatch tracking."}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 helper-text text-error font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Stopwatch Widget */}
      <div className="p-4 sm:p-6 lg:p-8 rounded-card bg-white border border-border shadow-sm space-y-5 sm:space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                  activeTimer
                    ? isOvertimeRunning
                      ? "bg-amber-50 text-amber-800 border border-amber-300"
                      : "bg-green-50 text-success border border-green-200"
                    : isAfterHours
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-text-secondary border border-border"
                }`}
              >
                <span className="relative flex h-2.5 w-2.5">
                  {activeTimer && (
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        isOvertimeRunning ? "bg-amber-400" : "bg-green-400"
                      }`}
                    />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      activeTimer
                        ? isOvertimeRunning
                          ? "bg-amber-500"
                          : "bg-success"
                        : "bg-slate-400"
                    }`}
                  />
                </span>
                <span>
                  {activeTimer
                    ? isOvertimeRunning
                      ? "OVERTIME RUNNING"
                      : "TIMER RUNNING"
                    : isAfterHours
                    ? "AFTER OFFICE HOURS"
                    : "STOPWATCH READY"}
                </span>
              </div>

              {activeTimer && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    isOvertimeRunning
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : schedule?.autoCutoffEnabled
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                  title={
                    isOvertimeRunning
                      ? "Overtime session runs until stopped manually"
                      : schedule?.autoCutoffEnabled
                      ? `Automatic stop enabled: Timer will stop automatically when office hours end at ${afterHoursInfo.closingTime || "18:00"}`
                      : "Automatic stop disabled: Timer will run past office hours until stopped manually"
                  }
                >
                  {isOvertimeRunning ? (
                    <>
                      <Moon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Overtime • Runs until manually stopped</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-current shrink-0" />
                      <span>
                        {schedule?.autoCutoffEnabled
                          ? `Auto-Stop: ${afterHoursInfo.closingTime || "18:00"}`
                          : "Manual Stop Only"}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="font-mono text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary tracking-tight">
              {formatSecondsToTimer(elapsedSeconds)}
            </div>

            {activeTimer && (
              <p className="helper-text text-text-secondary font-medium">
                Tracking: <strong className="text-text-primary">{activeTimer.project?.name}</strong>
                {activeTimer.description ? ` (${activeTimer.description})` : ""}
              </p>
            )}
          </div>

          {activeTimer ? (
            <button
              onClick={handleStopTimer}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-error hover:bg-red-700 text-white btn-text shadow-sm transition cursor-pointer self-start xl:self-auto shrink-0 whitespace-nowrap"
            >
              <Square className="w-4 h-4 fill-white shrink-0" />
              <span>Stop Timer</span>
            </button>
          ) : (
            <form
              onSubmit={handleStartTimer}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full xl:w-auto"
            >
              <select
                id="timesheet-timer-project-select"
                data-testid="timesheet-timer-project-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary max-w-xs sm:max-w-sm truncate"
              >
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

              <input
                type="text"
                placeholder="What are you working on?"
                value={timerDesc}
                onChange={(e) => setTimerDesc(e.target.value)}
                className="px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-w-[220px]"
              />

              <button
                type="submit"
                disabled={!selectedProjectId}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white btn-text shadow-sm transition cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                  isAfterHours
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-success hover:bg-green-700"
                }`}
              >
                {isAfterHours ? (
                  <>
                    <Moon className="w-3.5 h-3.5 fill-white" />
                    <span>Start Overtime</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Start</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between gap-3">
            <span className="helper-text font-medium text-text-secondary uppercase tracking-wider text-xs">
              Total Logged Time
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-text-primary">
            {formatSecondsToTimer(totalTrackedSeconds)}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {(totalTrackedSeconds / 3600).toFixed(1)} hrs in selected filter
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between gap-3">
            <span className="helper-text font-medium text-text-secondary uppercase tracking-wider text-xs">
              Logged Sessions
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <History className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {entries.length}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {entries.length === 1 ? "1 completed session" : `${entries.length} completed sessions`}
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between gap-3">
            <span className="helper-text font-medium text-text-secondary uppercase tracking-wider text-xs">
              Projects Involved
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {uniqueProjectsCount}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {uniqueProjectsCount === 1 ? "1 project tracked" : `${uniqueProjectsCount} projects tracked`}
          </p>
        </div>

        {isAdmin ? (
          <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between gap-3">
              <span className="helper-text font-medium text-text-secondary uppercase tracking-wider text-xs">
                Active Contributors
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-primary">
              {uniqueUsersCount}
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {uniqueUsersCount === 1 ? "1 team member active" : `${uniqueUsersCount} team members active`}
            </p>
          </div>
        ) : (
          <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-xs hover:border-slate-300 transition">
            <div className="flex items-center justify-between gap-3">
              <span className="helper-text font-medium text-text-secondary uppercase tracking-wider text-xs">
                Account Role
              </span>
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-success">
                <UserIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg font-bold text-text-primary">
              Personal Time Sheet
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              Showing only your own logged hours
            </p>
          </div>
        )}
      </div>

      {/* Filter Options Bar */}
      <div className="p-4 sm:p-5 rounded-card bg-white border border-border shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3.5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Filter Time Logs
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-text-secondary border border-border">
              {filterSummaryText}
            </span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                title="Reset filters back to today"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Today</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-text-secondary mr-1">Quick Select:</span>
          {PRESET_OPTIONS.map((preset) => {
            const isActive = datePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetChange(preset.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-primary text-white shadow-xs font-semibold"
                    : "bg-slate-100 text-text-secondary hover:bg-slate-200/80 hover:text-text-primary"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Filter Controls (Date Pickers, Project, Employee) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* From Date */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              From Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={handleStartDateChange}
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              />
            </div>
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              To Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={handleEndDateChange}
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              />
            </div>
          </div>

          {/* Project Wise Filter */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Project Filter
            </label>
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.client?.name ? `(${p.client.name})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Admin: Employee Filter */}
          {isAdmin ? (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Team Member
              </label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-border rounded-xl text-xs sm:text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              >
                <option value="">All Team Members ({employees.length || "Everyone"})</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Scope
              </label>
              <div className="px-3 py-2 bg-slate-50 border border-border rounded-xl text-xs sm:text-sm text-text-secondary font-medium">
                {user?.name || "Your Own Entries"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Time Entries Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="section-heading text-text-primary flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <span>Time Log History</span>
            <span className="text-xs font-normal text-text-secondary">
              ({entries.length} {entries.length === 1 ? "entry" : "entries"})
            </span>
          </h2>
          <span className="text-xs text-text-secondary">
            Sorted by most recent logs first
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center helper-text text-text-secondary bg-white border border-border rounded-card shadow-xs">
            <Clock className="w-6 h-6 text-primary mx-auto mb-2 animate-pulse" />
            <span>Loading time logs...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center bg-white border border-border rounded-card body-text text-text-secondary shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="font-medium text-text-primary">
              No time entries found for this filter
            </div>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              {datePreset === "today"
                ? "No time entries recorded for today yet. Start the stopwatch above to track your work."
                : `No time entries match the selected filter (${filterSummaryText}). Try picking another date range or selecting all projects.`}
            </p>
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-primary hover:text-primary-hover bg-primary/10 hover:bg-primary/15 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Today</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-text-secondary table-header-text uppercase font-semibold text-xs">
                    {isAdmin && <th className="py-3 px-4">Team Member</th>}
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                  {entries.map((entry) => {
                    const isEntryOvertime = Boolean(
                      entry.isOvertime ||
                      (entry.description && /\[Overtime\]/i.test(entry.description))
                    );

                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                        {/* Admin-only Team Member Column */}
                        {isAdmin && (
                          <td className="py-3 px-4 whitespace-nowrap table-cell-text">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                                {getInitials(entry.user?.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-text-primary text-xs sm:text-sm flex items-center gap-1.5">
                                  <span>{entry.user?.name || "Unknown"}</span>
                                  {entry.userId === user?.id && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-text-secondary font-semibold">
                                      You
                                    </span>
                                  )}
                                </div>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                  entry.user?.role === "ADMIN"
                                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}>
                                  {entry.user?.role || "USER"}
                                </span>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Date & Time */}
                        <td className="py-3 px-4 whitespace-nowrap text-text-secondary table-cell-text">
                          <div className="font-medium text-text-primary">
                            {new Date(entry.startedAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <span className="helper-text text-text-secondary text-xs">
                            {new Date(entry.startedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>

                        {/* Project */}
                        <td className="py-3 px-4 font-medium text-text-primary whitespace-nowrap table-cell-text">
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                            <span>{entry.project?.name || "—"}</span>
                          </div>
                        </td>

                        {/* Client */}
                        <td className="py-3 px-4 whitespace-nowrap text-text-secondary table-cell-text">
                          {entry.client?.name || "—"}
                        </td>

                        {/* Description */}
                        <td className="py-3 px-4 text-text-secondary max-w-xs truncate table-cell-text">
                          <div className="flex items-center gap-2">
                            {isEntryOvertime && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 shrink-0">
                                <Moon className="w-2.5 h-2.5" />
                                <span>Overtime</span>
                              </span>
                            )}
                            <span className="truncate">{entry.description || "—"}</span>
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-text-primary whitespace-nowrap table-cell-text">
                          {formatSecondsToTimer(entry.durationSeconds || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
