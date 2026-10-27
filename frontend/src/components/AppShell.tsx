'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, useTimerStore } from '@/lib/store';
import {
  captureAndUploadActivityScreenshot,
  requestScreenStream,
  stopScreenStream,
  isScreenStreamActive,
  onScreenStreamChange,
} from '@/lib/screenshotCapture';
import {
  Clock,
  LayoutDashboard,
  FolderKanban,
  FileSpreadsheet,
  CheckSquare,
  Users,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Play,
  Square,
  AlertCircle,
  Camera,
  Mail,
  History,
  Building2,
  ChevronRight,
  Sparkles,
  Layers,
  Calendar,
  Activity,
  ArrowUpRight,
  Moon,
} from 'lucide-react';

export function formatSecondsToTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ShellContext = createContext<boolean>(false);

export function AppShell({ children }: { children: React.ReactNode }) {
  const isNested = useContext(ShellContext);
  if (isNested) {
    return <>{children}</>;
  }

  return (
    <ShellContext.Provider value={true}>
      <ShellRoot>{children}</ShellRoot>
    </ShellContext.Provider>
  );
}

function getPageMetadata(pathname: string) {
  if (pathname === '/dashboard') return { title: 'Dashboard', subtitle: 'Overview & Real-time Metrics', section: 'WORKSPACE' };
  if (pathname === '/employees') return { title: 'Employees', subtitle: 'Directory & Access Control', section: 'ORGANIZATION' };
  if (pathname === '/office-timings' || pathname === '/settings/office-hours') return { title: 'Office Timings', subtitle: 'Day-wise Schedules & Auto Cutoff', section: 'TIMINGS' };
  if (pathname === '/mail' || pathname === '/settings/email') return { title: 'Mail', subtitle: 'Automated Reports & Delivery Audit', section: 'COMMUNICATION' };
  if (pathname === '/screenshot' || pathname === '/settings/screenshots') return { title: 'Screenshot', subtitle: 'Activity Capture & Compliance History', section: 'MONITORING' };
  return { title: 'Workspace', subtitle: 'EL App Management System', section: 'WORKSPACE' };
}

function ShellRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, fetchUser, logout } = useAuthStore();
  const { activeTimer, elapsedSeconds, screenshotSetting, syncActiveTimer, stopTimer, tick } = useTimerStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState<number>(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const lastCapturedIndexRef = useRef<number>(0);

  // Keep screen sharing status in sync with active timer
  useEffect(() => {
    setIsScreenSharing(isScreenStreamActive());
    const unsubscribe = onScreenStreamChange((active) => {
      setIsScreenSharing(active);
    });
    return () => unsubscribe();
  }, [activeTimer]);

  const handlePromptShareScreen = async () => {
    const stream = await requestScreenStream();
    if (stream && user && activeTimer && screenshotSetting?.enabled) {
      setIsScreenSharing(true);
      const intervalMinutes = Math.max(1, screenshotSetting.intervalMinutes || 15);
      const intervalSec = intervalMinutes * 60;
      const targetMilestone = Math.floor(elapsedSeconds / intervalSec);

      const storageKey = `el_screenshot_milestone_${activeTimer.id}`;
      try {
        sessionStorage.setItem(storageKey, String(targetMilestone));
      } catch {}
      lastCapturedIndexRef.current = targetMilestone;

      await captureAndUploadActivityScreenshot({
        userId: user.id,
        userName: user.name,
        employeeId: user.employeeId,
        timeEntryId: activeTimer.id,
        projectCode: activeTimer.project.code,
        projectName: activeTimer.project.name,
        elapsedSeconds,
        intervalMinutes,
        intervalIndex: targetMilestone,
      });
    }
  };

  // Automated screenshot capture: for any user currently running an active timer
  useEffect(() => {
    // Only capture when there is an active running timer, screenshots are enabled in settings, and screen is shared
    if (!activeTimer || !user || !screenshotSetting?.enabled || !isScreenStreamActive()) {
      return;
    }

    const intervalMinutes = Math.max(1, screenshotSetting.intervalMinutes || 15);
    const intervalSec = intervalMinutes * 60;
    const targetMilestone = Math.floor(elapsedSeconds / intervalSec);

    // Persist milestones per active timer ID so page navigation & refreshes don't drop or duplicate captures
    const storageKey = `el_screenshot_milestone_${activeTimer.id}`;
    let lastCapturedMilestone = -1;
    try {
      const stored = sessionStorage.getItem(storageKey);
      lastCapturedMilestone = stored !== null ? parseInt(stored, 10) : -1;
    } catch {
      lastCapturedMilestone = lastCapturedIndexRef.current;
    }

    if (targetMilestone > lastCapturedMilestone) {
      try {
        sessionStorage.setItem(storageKey, String(targetMilestone));
      } catch {}
      lastCapturedIndexRef.current = targetMilestone;

      captureAndUploadActivityScreenshot({
        userId: user.id,
        userName: user.name,
        employeeId: user.employeeId,
        timeEntryId: activeTimer.id,
        projectCode: activeTimer.project.code,
        projectName: activeTimer.project.name,
        elapsedSeconds,
        intervalMinutes,
        intervalIndex: targetMilestone,
      }).catch((err) => {
        console.error('[Screenshot] Capture upload error:', err);
      });
    }
  }, [elapsedSeconds, activeTimer, user, screenshotSetting, isScreenSharing]);

  // Poll pending correction requests count
  useEffect(() => {
    if (!user) return;
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/corrections/pending-count');
        if (res.ok) {
          const data = await res.json();
          setPendingCorrectionsCount(data.count || 0);
        }
      } catch {
        // ignore
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000);
    return () => clearInterval(interval);
  }, [user, pathname]);

  // Initial user fetch (only once if not loaded)
  useEffect(() => {
    if (!user) {
      fetchUser().then((u) => {
        if (!u && pathname !== '/login' && pathname !== '/') {
          router.push('/login');
        } else if (u) {
          syncActiveTimer();
        }
      });
    }
  }, [user, fetchUser, pathname, router, syncActiveTimer]);

  // Real-time 1s ticker for running timer
  useEffect(() => {
    const interval = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // Background server sync every 30 seconds
  useEffect(() => {
    if (!user) return;
    const syncInterval = setInterval(() => {
      syncActiveTimer();
    }, 30000);
    return () => clearInterval(syncInterval);
  }, [user, syncActiveTimer]);

  useEffect(() => {
    setCurrentDateStr(
      new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    );
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium">Entering EL App workspace...</p>
        </div>
      </div>
    );
  }

  // Standalone pages without Shell (login and root redirect)
  if (pathname === '/login' || (!user && pathname === '/')) {
    return <>{children}</>;
  }

  const isAdmin = user?.role === 'ADMIN';

  const pageMeta = getPageMetadata(pathname);

  // Required navigation items:
  // Top: Dashboard, Employee
  // Timer Section
  // Below Timer Section: 1. Office Timings, 2. Mail, 3. Screenshot
  const topNavItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin ? [{ href: '/employees', label: 'Employee', icon: Users }] : []),
  ];

  const bottomNavItems = [
    { href: '/office-timings', label: 'Office Timings', icon: Clock },
    ...(isAdmin
      ? [
          { href: '/mail', label: 'Mail', icon: Mail },
          { href: '/screenshot', label: 'Screenshot', icon: Camera },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Sleek Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 border-r border-slate-800/80 bg-slate-900/95 backdrop-blur-xl z-30 shadow-xl shadow-black/40">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform duration-200">
              EL
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tracking-tight text-base leading-none">EL App</span>
                <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded leading-none">
                  PRO
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                Enterprise Intelligence
              </span>
            </div>
          </Link>
        </div>

        {/* Grouped Navigation Links with Timer Section in between */}
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto overscroll-contain">
          {/* Top Section: Dashboard, Employee */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              MAIN
            </div>
            {topNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const navId = `nav-${item.href.replace(/\//g, '-').replace(/^-/, '')}`;
              return (
                <Link
                  key={item.href}
                  id={navId}
                  data-testid={navId}
                  href={item.href}
                  prefetch={true}
                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400"></span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Modules Below Main Section: Office Timings, Mail, Screenshot */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              MODULES
            </div>
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const navId = `nav-${item.href.replace(/\//g, '-').replace(/^-/, '')}`;
              return (
                <Link
                  key={item.href}
                  id={navId}
                  data-testid={navId}
                  href={item.href}
                  prefetch={true}
                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400"></span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Card & Sign Out Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 shrink-0 space-y-2.5">
          {/* Timer Section: Placed Above Username */}
          <div>
            {activeTimer ? (
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-950/70 to-indigo-950/40 border border-blue-500/30 shadow-lg shadow-blue-950/50 shrink-0 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-blue-300 font-semibold mb-1">
                  <span className="flex items-center gap-1.5 text-[11px] tracking-wide">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    TRACKING NOW
                  </span>
                  <span className="font-mono text-sm font-bold text-white bg-blue-900/40 px-2 py-0.5 rounded border border-blue-700/40">
                    {formatSecondsToTimer(elapsedSeconds)}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium truncate mt-1.5">
                  {activeTimer.project.name}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Started at {new Date(activeTimer.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                {activeTimer.targetDuration && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-amber-300 font-semibold flex items-center gap-1">
                        <Moon className="w-3 h-3 text-amber-400" /> Overtime Limit
                      </span>
                      <span className="font-mono text-amber-200">
                        {activeTimer.targetDuration - elapsedSeconds > 0
                          ? `${formatSecondsToTimer(activeTimer.targetDuration - elapsedSeconds)} left`
                          : 'Limit reached'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 mt-1.5 overflow-hidden border border-slate-800">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((elapsedSeconds / activeTimer.targetDuration) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {screenshotSetting?.enabled && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Activity Capture:</span>
                    {isScreenSharing ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Desktop
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePromptShareScreen}
                        className="text-blue-400 hover:text-blue-300 font-medium underline flex items-center gap-1 cursor-pointer"
                      >
                        Share Desktop
                      </button>
                    )}
                  </div>
                )}
                <button
                  id="sidebar-stop-timer"
                  data-testid="sidebar-stop-timer"
                  onClick={() => {
                    stopTimer();
                    stopScreenStream();
                    setIsScreenSharing(false);
                  }}
                  className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm shadow-red-900/40 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Timer
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-slate-600 shrink-0"></div>
                <div className="flex-1 truncate">
                  <span className="font-semibold text-slate-300 block leading-tight">Timer Idle</span>
                  <span className="text-[10px] text-slate-500">Ready to track on Dashboard</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-700/40 mb-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400">{user?.employeeId}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1 rounded">
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            id="nav-sign-out"
            data-testid="nav-sign-out"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-300 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Desktop Header / Topbar */}
        <header className="hidden md:flex items-center justify-between h-16 px-6 lg:px-8 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  {pageMeta.section}
                </span>
                <span className="text-slate-600">/</span>
                <h1 className="text-sm font-bold text-white tracking-tight">{pageMeta.title}</h1>
              </div>
              <p className="text-[11px] text-slate-400">{pageMeta.subtitle}</p>
            </div>
          </div>

          {/* Topbar Right Controls: Live Universal Timer & Quick Badges */}
          <div className="flex items-center gap-3">
            {/* Global Running Timer Quick Bar */}
            {activeTimer ? (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border border-blue-500/30 shadow-md shadow-blue-950/50">
                <div className="flex items-center gap-2 text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold text-blue-200 truncate max-w-[140px]">
                    {activeTimer.project.name}
                  </span>
                  <span className="font-mono text-xs font-bold text-white bg-blue-900/50 px-2 py-0.5 rounded border border-blue-700/40">
                    {formatSecondsToTimer(elapsedSeconds)}
                  </span>
                </div>
                {screenshotSetting?.enabled && (
                  isScreenSharing ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1 font-medium">
                      <Camera className="w-3 h-3" /> Monitored
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePromptShareScreen}
                      className="text-[10px] text-blue-300 hover:text-white bg-blue-900/40 hover:bg-blue-800/60 px-2 py-0.5 rounded border border-blue-700/40 transition flex items-center gap-1 font-medium cursor-pointer"
                      title="Share entire desktop for activity tracking"
                    >
                      <Camera className="w-3 h-3" /> Share Desktop
                    </button>
                  )
                )}
                <button
                  onClick={() => {
                    stopTimer();
                    stopScreenStream();
                    setIsScreenSharing(false);
                  }}
                  className="py-1 px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Stop active timer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            ) : null}

            {/* Date display */}
            {currentDateStr && (
              <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{currentDateStr}</span>
              </div>
            )}

            {/* User pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:block text-left">
                {activeTimer ? (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold leading-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{formatSecondsToTimer(elapsedSeconds)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium leading-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    <span>Timer Idle</span>
                  </div>
                )}
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[100px]">{user?.name}</p>
                <p className="text-[10px] text-slate-400 font-mono leading-tight">{user?.employeeId}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Topbar */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-sm">
              EL
            </div>
            <div>
              <span className="font-bold text-white text-sm">EL App</span>
              <span className="text-[10px] text-slate-400 block -mt-1">{pageMeta.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTimer && (
              <div className="flex items-center gap-1.5 bg-blue-950/80 border border-blue-700/50 px-2 py-1 rounded-lg text-xs font-mono text-blue-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{formatSecondsToTimer(elapsedSeconds)}</span>
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer with Backdrop */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-out Drawer */}
            <div className="relative w-4/5 max-w-xs bg-slate-900 border-r border-slate-800 flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                    EL
                  </div>
                  <span className="font-bold text-white text-sm">EL App Workspace</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile User Card */}
              <div className="p-3 bg-slate-800/40 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
                    {user?.name.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    {activeTimer ? (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold leading-tight">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Active: {formatSecondsToTimer(elapsedSeconds)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium leading-tight">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                        <span>Timer Idle</span>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {user?.employeeId} • {user?.role}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mobile Navigation links */}
              <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
                {/* Top Section: Dashboard, Employee */}
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    MAIN
                  </div>
                  {topNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    const mobileNavId = `mobile-nav-${item.href.replace(/\//g, '-').replace(/^-/, '')}`;
                    return (
                      <Link
                        key={item.href}
                        id={mobileNavId}
                        data-testid={mobileNavId}
                        href={item.href}
                        prefetch={true}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                {/* Mobile Timer Section */}
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    TIMER
                  </div>
                  {activeTimer ? (
                    <div className="p-3 rounded-xl bg-blue-950/70 border border-blue-600/40 space-y-2">
                      <div className="flex items-center justify-between text-xs text-blue-200">
                        <span className="font-semibold">{activeTimer.project.name}</span>
                        <span className="font-mono font-bold text-white bg-blue-900/60 px-2 py-0.5 rounded">
                          {formatSecondsToTimer(elapsedSeconds)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          stopTimer();
                          stopScreenStream();
                          setIsScreenSharing(false);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" /> Stop Timer
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
                      Timer Idle • Ready on Dashboard
                    </div>
                  )}
                </div>

                {/* Three Modules Below Timer Section: 1. Office Timings, 2. Mail, 3. Screenshot */}
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    MODULES
                  </div>
                  {bottomNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    const mobileNavId = `mobile-nav-${item.href.replace(/\//g, '-').replace(/^-/, '')}`;
                    return (
                      <Link
                        key={item.href}
                        id={mobileNavId}
                        data-testid={mobileNavId}
                        href={item.href}
                        prefetch={true}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>

              {/* Sign Out */}
              <div className="p-3 border-t border-slate-800 shrink-0">
                <button
                  id="mobile-nav-sign-out"
                  data-testid="mobile-nav-sign-out"
                  onClick={() => logout()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 hover:bg-red-950/40 border border-red-900/30 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 min-w-0 bg-slate-950 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {/* Workstation Screen Sharing Compliance Banner */}
            {activeTimer && screenshotSetting?.enabled && (
              !isScreenSharing ? (
                <div
                  id="screen-sharing-prompt-banner"
                  data-testid="screen-sharing-prompt-banner"
                  className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/60 shadow-xl shadow-amber-950/40 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Workstation Screen Verification Required</span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Timer Active: {activeTimer.project.name}
                          </span>
                        </h4>
                        <p className="text-xs text-amber-200/80 mt-0.5">
                          Screen verification is active every {screenshotSetting.intervalMinutes || 15} minutes. Click below and select <strong>&quot;Entire Screen&quot;</strong> so what you are working on is verified.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      id="btn-prompt-share-screen"
                      data-testid="btn-prompt-share-screen"
                      onClick={handlePromptShareScreen}
                      className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-transform active:scale-95 cursor-pointer shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Share Entire Screen Now</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  id="screen-sharing-active-banner"
                  data-testid="screen-sharing-active-banner"
                  className="mb-6 px-4 py-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in"
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-semibold text-white">Live Screen Verification Connected:</span>
                    <span className="text-emerald-400">Capturing your current desktop automatically every {screenshotSetting.intervalMinutes || 15} minutes.</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-700/40">
                    Entire Screen Active
                  </span>
                </div>
              )
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
