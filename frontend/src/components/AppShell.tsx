'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { formatSecondsToTimer, getInitials } from '@/lib/utils';
import {
  captureAndUploadActivityScreenshot,
  requestScreenStream,
  stopScreenStream,
  isScreenStreamActive,
  getActiveScreenStream,
  getActiveVideoElement,
  ensureVideoPlaying,
  onScreenStreamChange,
} from '@/lib/screenshotCapture';
import { ChatDrawer, FloatingChatButton } from '@/components/ChatDrawer';
import { EditProfileModal } from '@/components/EditProfileModal';
import {
  Clock,
  LayoutDashboard,
  FolderKanban,
  FileSpreadsheet,
  CheckSquare,
  Users,
  UserCheck,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Play,
  Square,
  AlertCircle,
  AlertTriangle,
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
  MessageSquare,
  CreditCard,
  Settings,
  Pencil,
  User,
} from 'lucide-react';


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
  if (pathname === '/dashboard') return { title: 'Dashboard', subtitle: "Today's Work & Client Deliverables", section: 'OPERATIONS' };
  if (pathname === '/clients') return { title: 'Clients', subtitle: 'Client Directory, Notes & Team Assignment', section: 'MANAGEMENT' };
  if (pathname === '/projects') return { title: 'Projects', subtitle: 'Delivery Pipelines, Staging & Updates', section: 'DELIVERY' };
  if (pathname === '/calendar') return { title: 'Calendar', subtitle: 'Meetings, Deadlines & .ics Invites', section: 'SCHEDULE' };
  if (pathname === '/time-sheet') return { title: 'Time Sheet', subtitle: 'Stopwatch Tracking & Project Hours', section: 'HOURS' };
  if (pathname === '/proposals') return { title: 'Proposals', subtitle: 'AI Proposals, Version Locking & Signing', section: 'COMMERCIAL' };
  if (pathname === '/invoices') return { title: 'Invoices', subtitle: 'Sequential Billing, Locking & Payments', section: 'BILLING' };
  if (pathname === '/settings') return { title: 'Settings', subtitle: 'Agency Branding, Logo & Notification Rules', section: 'AGENCY' };
  if (pathname === '/office-timings') return { title: 'Office Timings', subtitle: 'Operating Schedules, Auto-Cutoff & Regular Hours', section: 'SCHEDULE' };
  if (pathname === '/mail') return { title: 'Mail', subtitle: 'Automated Reports, SMTP Configuration & Delivery Logs', section: 'NOTIFICATIONS' };
  if (pathname === '/screenshot') return { title: 'Screenshot', subtitle: 'Automated Interval Captures, Retention & Monitoring', section: 'MONITORING' };
  if (pathname === '/employees') return { title: 'Employees', subtitle: 'Team Directory & Role Assignment', section: 'MANAGEMENT' };
  return { title: 'ClientHub', subtitle: 'Agency Operations Platform', section: 'WORKSPACE' };
}

function SidebarTimerBadge() {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  return (
    <span className="font-mono text-sm font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
      {formatSecondsToTimer(elapsedSeconds)}
    </span>
  );
}

function SidebarTimerLimit({ targetDuration }: { targetDuration: number }) {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  return (
    <div className="mt-2 pt-2 border-t border-slate-700/80">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-amber-300 font-semibold flex items-center gap-1">
          <Moon className="w-3 h-3 text-amber-400" /> Planned Limit
        </span>
        <span className="font-mono text-amber-200">
          {targetDuration - elapsedSeconds > 0
            ? `${formatSecondsToTimer(targetDuration - elapsedSeconds)} left`
            : 'Limit reached'}
        </span>
      </div>
      <div className="w-full bg-slate-900 rounded-full h-1.5 mt-1.5 overflow-hidden border border-slate-800">
        <div
          className="bg-primary h-1.5 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, Math.round((elapsedSeconds / targetDuration) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

function MobileTimerBadge() {
  const elapsedSeconds = useTimerStore((s) => s.elapsedSeconds);
  return <>{formatSecondsToTimer(elapsedSeconds)}</>;
}

function ShellRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, agencyBranding, setAgencyBranding, fetchBranding, isLoading, isLoggingOut, fetchUser, logout } = useAuthStore();
  const { activeTimer, screenshotSetting, syncActiveTimer, stopTimer, tick } = useTimerStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const lastCapturedIndexRef = useRef<number>(-1);
  // Track previous active timer ID to detect a new timer start
  const prevTimerIdRef = useRef<string | null>(null);

  // 10 to 15 min no movement on keyboard or mouse - autocut active timer
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const showIdleWarningRef = useRef<boolean>(false);
  useEffect(() => {
    showIdleWarningRef.current = showIdleWarning;
  }, [showIdleWarning]);

  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState<number>(300);
  const [showIdleStoppedModal, setShowIdleStoppedModal] = useState(false);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const idleWarningSoundPlayedRef = useRef<boolean>(false);
  const isAutoStoppingRef = useRef<boolean>(false);

  // Keep screen sharing status in sync with active timer
  useEffect(() => {
    const syncStreamState = () => {
      const active = isScreenStreamActive();
      setIsScreenSharing(active);
      if (active) {
        ensureVideoPlaying();
      }
    };
    syncStreamState();
    const unsubscribe = onScreenStreamChange((active) => {
      setIsScreenSharing(active);
      if (active) {
        ensureVideoPlaying();
      }
    });
    window.addEventListener('focus', syncStreamState);
    window.addEventListener('visibilitychange', syncStreamState);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', syncStreamState);
      window.removeEventListener('visibilitychange', syncStreamState);
    };
  }, [activeTimer]);

  // Global enhancement: clicking anywhere on any date input opens the native calendar picker
  useEffect(() => {
    const handleGlobalDateInputClick = (e: MouseEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement &&
        (target.type === 'date' || target.type === 'datetime-local') &&
        !target.disabled &&
        !target.readOnly
      ) {
        try {
          target.showPicker();
        } catch {
          // Ignore if already open or unsupported
        }
      }
    };

    document.addEventListener('click', handleGlobalDateInputClick);
    return () => {
      document.removeEventListener('click', handleGlobalDateInputClick);
    };
  }, []);

  // Auto-prompt for screen share when screenshot capture is enabled and a new timer session starts
  useEffect(() => {
    if (!activeTimer || !user || !screenshotSetting?.enabled) {
      // Timer stopped — stop the screen stream
      if (!activeTimer && prevTimerIdRef.current) {
        stopScreenStream();
        setIsScreenSharing(false);
        prevTimerIdRef.current = null;
        lastCapturedIndexRef.current = -1;
      }
      return;
    }

    // Only auto-prompt once per new timer session
    if (prevTimerIdRef.current === activeTimer.id) return;
    prevTimerIdRef.current = activeTimer.id;
    lastCapturedIndexRef.current = -1;

    // Clear any milestone state from a previous session for this timer id
    const storageKey = `el_screenshot_milestone_${activeTimer.id}`;
    try { sessionStorage.removeItem(storageKey); } catch {}

        // Ensure screen stream is active and capture initial milestone
    (async () => {
      let stream = getActiveScreenStream();
      if (!stream && !isScreenStreamActive()) {
        stream = await requestScreenStream();
      }
      if (stream) {
        setIsScreenSharing(true);
        // Immediately capture an initial frame (milestone 0)
        const intervalMinutes = Math.max(1, screenshotSetting.intervalMinutes || 15);
        try {
          sessionStorage.setItem(storageKey, '0');
        } catch {}
        lastCapturedIndexRef.current = 0;
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId || '',
          timeEntryId: activeTimer.id,
          projectCode: (activeTimer.project as any)?.code || '',
          projectName: activeTimer.project.name,
          elapsedSeconds: 0,
          intervalMinutes,
          intervalIndex: 0,
        }).catch((err) => {
          console.error('[Screenshot] Initial capture error:', err);
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer?.id, screenshotSetting?.enabled]);

  const handlePromptShareScreen = async () => {
    const stream = await requestScreenStream();
    if (stream) {
      setIsScreenSharing(true);
      ensureVideoPlaying();
      if (user && activeTimer && screenshotSetting?.enabled) {
        const currentElapsed = useTimerStore.getState().elapsedSeconds;
        const intervalMinutes = Math.max(1, screenshotSetting.intervalMinutes || 15);
        const intervalSec = intervalMinutes * 60;
        const targetMilestone = Math.floor(currentElapsed / intervalSec);

        const storageKey = `el_screenshot_milestone_${activeTimer.id}`;
        try {
          sessionStorage.setItem(storageKey, String(targetMilestone));
        } catch {}
        lastCapturedIndexRef.current = targetMilestone;

        await captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId || "",
          timeEntryId: activeTimer.id,
          projectCode: (activeTimer.project as any)?.code || "",
          projectName: activeTimer.project.name,
          elapsedSeconds: currentElapsed,
          intervalMinutes,
          intervalIndex: targetMilestone,
        });
      }
    }
  };

  // Automated screenshot capture: for any user currently running an active timer
  // Polls milestone status every 5 seconds without triggering 1-second re-renders on AppShell
  useEffect(() => {
    if (!activeTimer || !user || !screenshotSetting?.enabled) {
      return;
    }

    const checkAndCapture = () => {
      if (!isScreenStreamActive()) return;

      const currentElapsed = useTimerStore.getState().elapsedSeconds;
      const intervalMinutes = Math.max(1, screenshotSetting.intervalMinutes || 15);
      const intervalSec = intervalMinutes * 60;
      const targetMilestone = Math.floor(currentElapsed / intervalSec);

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
          employeeId: user.employeeId || "",
          timeEntryId: activeTimer.id,
          projectCode: (activeTimer.project as any)?.code || "",
          projectName: activeTimer.project.name,
          elapsedSeconds: currentElapsed,
          intervalMinutes,
          intervalIndex: targetMilestone,
        }).catch((err) => {
          console.error('[Screenshot] Capture upload error:', err);
        });
      }
    };

    checkAndCapture();
    const interval = setInterval(checkAndCapture, 5000);
    return () => clearInterval(interval);
  }, [activeTimer?.id, user?.id, screenshotSetting?.enabled, screenshotSetting?.intervalMinutes, isScreenSharing]);


  const isPublicRoute =
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/proposal/') ||
    pathname.startsWith('/invoice/');

  // Real-time synchronization of agency branding (agency name & brand logo) for the sidebar
  useEffect(() => {
    if (user) {
      fetchBranding();
    }
  }, [user, fetchBranding]);

  // Periodic background check for automated email report dispatch
  useEffect(() => {
    if (!user) return;
    const checkDispatch = async () => {
      try {
        await fetch('/api/mail/dispatch-check');
      } catch {}
    };
    const timer = setTimeout(checkDispatch, 5000);
    const interval = setInterval(checkDispatch, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [user]);

  // Reset isLoggingOut flag once on login page
  useEffect(() => {
    if (pathname === '/login' && isLoggingOut) {
      useAuthStore.setState({ isLoggingOut: false });
    }
  }, [pathname, isLoggingOut]);

  // Initial user fetch (only once if not loaded and not logging out)
  useEffect(() => {
    if (isLoggingOut || pathname === '/login') return;
    if (!user) {
      if (isPublicRoute) return;
      fetchUser().then((u) => {
        if (!u && !isPublicRoute) {
          router.replace('/login');
        } else if (u) {
          syncActiveTimer();
        }
      });
    }
  }, [user, fetchUser, pathname, router, syncActiveTimer, isPublicRoute, isLoggingOut]);

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

  const playIdleChime = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  const getInactivityThresholds = () => {
    const isTesting = typeof window !== 'undefined' && window.location.search.includes('testIdle=1');
    return {
      warnMs: isTesting ? 10 * 1000 : 10 * 60 * 1000, // 10 minutes warning (or 10s test)
      autoCutMs: isTesting ? 15 * 1000 : 15 * 60 * 1000, // 15 minutes auto-cut (or 15s test)
    };
  };

  const handleKeepTimerRunning = () => {
    const now = Date.now();
    lastActivityTimeRef.current = now;
    try {
      localStorage.setItem('el_last_activity_time', String(now));
    } catch {}
    idleWarningSoundPlayedRef.current = false;
    showIdleWarningRef.current = false;
    setShowIdleWarning(false);

    // Keep screen sharing active throughout active session
    if (isScreenStreamActive()) {
      setIsScreenSharing(true);
      ensureVideoPlaying();
    }
  };

  const performAutoCut = async () => {
    if (isAutoStoppingRef.current || !activeTimer) return;
    isAutoStoppingRef.current = true;
    showIdleWarningRef.current = false;
    setShowIdleWarning(false);
    idleWarningSoundPlayedRef.current = false;

    const { autoCutMs } = getInactivityThresholds();
    const effectiveCutoffTime = new Date(lastActivityTimeRef.current + autoCutMs);

    try {
      const autoCutNote = '[Auto-stopped: 15 minutes of inactivity - no keyboard or mouse movement]';
      const ok = await stopTimer(autoCutNote, effectiveCutoffTime);
      if (ok) {
        setShowIdleStoppedModal(true);
      }
    } catch (err) {
      console.error('[InactivityAutoCut] Error executing stopTimer:', err);
    } finally {
      isAutoStoppingRef.current = false;
      const now = Date.now();
      lastActivityTimeRef.current = now;
      try {
        localStorage.setItem('el_last_activity_time', String(now));
      } catch {}
    }
  };

  // Track user activity strictly via keyboard and mouse / touch / pointer movement
  useEffect(() => {
    let lastThrottled = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      const { warnMs, autoCutMs } = getInactivityThresholds();
      const idleMs = now - lastActivityTimeRef.current;

      // If warning box is currently active or idle time was within warning threshold (>= warnMs and < autoCutMs),
      // any mouse/keyboard movement immediately resumes active session, dismisses warning,
      // and guarantees screen sharing remains ON!
      if (showIdleWarningRef.current || (idleMs >= warnMs && idleMs < autoCutMs)) {
        lastActivityTimeRef.current = now;
        try {
          localStorage.setItem('el_last_activity_time', String(now));
        } catch {}
        showIdleWarningRef.current = false;
        setShowIdleWarning(false);
        idleWarningSoundPlayedRef.current = false;

        // Ensure screen sharing remains active without interruption
        if (isScreenStreamActive()) {
          setIsScreenSharing(true);
          ensureVideoPlaying();
        }
        return;
      }

      // If active timer was running and inactivity has already crossed the full 15-minute threshold without resume,
      // trigger auto-cut
      if (activeTimer && idleMs >= autoCutMs) {
        performAutoCut();
        return;
      }

      if (now - lastThrottled > 1000) {
        lastThrottled = now;
        lastActivityTimeRef.current = now;
        try {
          localStorage.setItem('el_last_activity_time', String(now));
        } catch {}

        // Maintain screen sharing in active state while timer is running
        if (isScreenStreamActive()) {
          setIsScreenSharing(true);
          ensureVideoPlaying();
        }
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'keypress', 'wheel', 'scroll', 'touchstart', 'pointerdown'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    try {
      const saved = localStorage.getItem('el_last_activity_time');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= Date.now()) {
          lastActivityTimeRef.current = parsed;
        }
      }
    } catch {}

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
    };
  }, [activeTimer?.id]);

  // 10 to 15 min no movement on keyboard or mouse - autocut active timer
  useEffect(() => {
    if (!activeTimer) {
      setShowIdleWarning(false);
      idleWarningSoundPlayedRef.current = false;
      isAutoStoppingRef.current = false;
      return;
    }

    const checkInactivity = () => {
      if (!activeTimer || isAutoStoppingRef.current) return;

      const { warnMs, autoCutMs } = getInactivityThresholds();
      const now = Date.now();
      const idleMs = now - lastActivityTimeRef.current;

      // Auto-cut when inactivity reaches 15 minutes (or 10-15 min window expires)
      if (idleMs >= autoCutMs) {
        performAutoCut();
      } else if (idleMs >= warnMs) {
        // Warning at 10 minutes: Countdown to 15 minutes
        const remaining = Math.max(0, Math.ceil((autoCutMs - idleMs) / 1000));
        setIdleSecondsRemaining(remaining);
        if (!idleWarningSoundPlayedRef.current) {
          playIdleChime();
          idleWarningSoundPlayedRef.current = true;
        }
        showIdleWarningRef.current = true;
        setShowIdleWarning(true);
      } else {
        showIdleWarningRef.current = false;
        setShowIdleWarning(false);
        idleWarningSoundPlayedRef.current = false;
      }
    };

    // Check every second continuously
    const interval = setInterval(checkInactivity, 1000);

    // Immediate check on tab focus or visibility change (waking from background or sleep)
    const onWakeOrFocus = () => {
      checkInactivity();
    };
    window.addEventListener('visibilitychange', onWakeOrFocus);
    window.addEventListener('focus', onWakeOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onWakeOrFocus);
      window.removeEventListener('focus', onWakeOrFocus);
    };
  }, [activeTimer?.id, stopTimer]);

  useEffect(() => {
    setCurrentDateStr(
      new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    );
  }, []);

  const isAdmin = user?.role === 'ADMIN';

  // Redirect non-admin / employee users away from admin-only modules
  useEffect(() => {
    if (user && !isAdmin && (pathname === '/proposals' || pathname === '/invoices' || pathname === '/settings')) {
      router.replace('/dashboard');
    }
  }, [user, isAdmin, pathname, router]);

  // Public client-facing private links (no login or staff shell required)
  // Standalone pages without Shell (login and root redirect)
  if (pathname === '/login' || (!user && pathname === '/')) {
    return <>{children}</>;
  }

  // Public client portal & token links (only singular paths with trailing slash/token, e.g. /proposal/[token], /invoice/[token], /portal/[token])
  // Note: /proposals and /invoices are internal agency admin modules and MUST render inside the AppShell with the sidebar.
  const isPublicClientRoute =
    pathname.startsWith('/portal/') ||
    pathname === '/portal' ||
    pathname.startsWith('/proposal/') ||
    pathname.startsWith('/invoice/');

  if (isPublicClientRoute) {
    return <>{children}</>;
  }

  // If logging out or unauthenticated on protected route, show clean neutral background matching login page
  if (isLoggingOut || (!user && !isLoading)) {
    return <div className="min-h-screen bg-app-background" />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-text-secondary text-sm font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const pageMeta = getPageMetadata(pathname);

  // Application Navigation Sections:
  const navSections = [
    {
      title: 'OPERATIONS',
      items: [
        { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
        { href: '/clients', label: 'Clients', icon: Users },
        { href: '/projects', label: 'Projects', icon: FolderKanban },
        { href: '/calendar', label: 'Calendar', icon: Calendar },
        { href: '/time-sheet', label: 'Time Sheet', icon: Clock },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'COMMERCIAL',
            items: [
              { href: '/proposals', label: 'Proposals', icon: Sparkles },
              { href: '/invoices', label: 'Invoices', icon: CreditCard },
              { href: '/settings', label: 'Settings', icon: Settings },
              { href: '/employees', label: 'Employees', icon: UserCheck },
            ],
          },
        ]
      : []),
    {
      title: 'MODULES',
      items: [
        { href: '/office-timings', label: 'Office Timings', icon: History },
        ...(isAdmin
          ? [
              { href: '/mail', label: 'Mail', icon: Mail },
              { href: '/screenshot', label: 'Screenshot', icon: Camera },
            ]
          : []),
      ],
    },
  ];

  const navItems = navSections.flatMap((section) => section.items);

  return (
    <div className="min-h-screen bg-app-background text-text-primary flex flex-col font-sans antialiased selection:bg-primary selection:text-white">
      {/* Sleek Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 border-r border-slate-800 bg-navy z-30 shadow-sm">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 group min-w-0 flex-1">
            {agencyBranding?.logoUrl ? (
              <div className="h-9 max-w-[110px] flex items-center justify-center shrink-0">
                <img
                  src={agencyBranding.logoUrl}
                  alt={agencyBranding.name || 'Agency Logo'}
                  className="max-h-9 max-w-[110px] w-auto h-auto object-contain rounded"
                  onError={(e) => {
                    (e.target as any).style.display = 'none';
                    const initialsFallback = document.getElementById('sidebar-brand-initials');
                    if (initialsFallback) initialsFallback.style.display = 'flex';
                  }}
                />
              </div>
            ) : null}
            <div
              id="sidebar-brand-initials"
              className={`w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-bold text-white text-sm shadow-sm group-hover:scale-105 transition-transform duration-200 shrink-0 ${
                agencyBranding?.logoUrl ? 'hidden' : 'flex'
              }`}
            >
              {getInitials(agencyBranding?.name || 'ClientHub')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  id="sidebar-agency-name"
                  data-testid="sidebar-agency-name"
                  className="font-bold text-white tracking-tight text-sm leading-none truncate block"
                  title={agencyBranding?.name || 'ClientHub'}
                >
                  {agencyBranding?.name || 'ClientHub'}
                </span>
                <span className="text-[9px] font-semibold bg-primary/20 text-blue-300 border border-primary/30 px-1 py-0.5 rounded leading-none shrink-0">
                  AGENCY
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal tracking-wide block truncate mt-0.5">
                Client &amp; Project Hub
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto overscroll-contain space-y-4">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {section.title}
              </div>
              {section.items.map((item) => {
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
                    className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-white shadow-sm font-medium'
                        : 'text-slate-300 hover:text-white hover:bg-navy-surface'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm"></span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Card & Sign Out Footer */}
        <div className="p-3 border-t border-slate-800 bg-navy shrink-0 space-y-2.5">
          {/* Timer Section: Placed Above Username */}
          <div>
            {activeTimer ? (
              <div className="p-3 rounded-xl bg-navy-surface border border-slate-700/80 shadow-sm shrink-0 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-blue-300 font-semibold mb-1">
                  <span className="flex items-center gap-1.5 text-[11px] tracking-wide">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    TRACKING NOW
                  </span>
                  <SidebarTimerBadge />
                </div>
                <p className="text-xs text-slate-200 font-medium truncate mt-1.5">
                  {activeTimer.project.name}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Started at {new Date(activeTimer.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                {activeTimer.isOvertime || (activeTimer.description && /\[Overtime\]/i.test(activeTimer.description)) ? (
                  <div className="mt-2 pt-2 border-t border-slate-700/80">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-amber-300 font-semibold flex items-center gap-1">
                        <Moon className="w-3 h-3 text-amber-400" /> Overtime Active
                      </span>
                      <span className="text-slate-400 text-[10px]">Runs until stopped</span>
                    </div>
                  </div>
                ) : activeTimer.targetDuration ? (
                  <SidebarTimerLimit targetDuration={activeTimer.targetDuration} />
                ) : null}
                {screenshotSetting?.enabled && (
                  <div className="mt-2 pt-2 border-t border-slate-700/80 flex items-center justify-between text-[11px]">
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
                  className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-error hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Timer
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-navy-surface border border-slate-700/80 text-xs text-slate-400 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-slate-500 shrink-0"></div>
                <div className="flex-1 truncate">
                  <span className="font-medium text-slate-200 block leading-tight">Timer Idle</span>
                  <span className="text-[10px] text-slate-400">Ready on Dashboard</span>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Card (Slack Style) */}
          <div className="relative mb-2">
            <button
              type="button"
              id="sidebar-profile-card-btn"
              data-testid="sidebar-profile-card-btn"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-navy-surface border border-slate-700/80 hover:border-slate-500 hover:bg-slate-800/80 transition text-left cursor-pointer group"
              title="Click to view & edit profile"
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm border border-slate-700">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{getInitials(user?.displayName || user?.name)}</span>
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition">
                    {user?.displayName || user?.name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {user?.title ? (
                      <span className="text-[10px] text-slate-400 truncate max-w-[95px]">{user.title}</span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400">{user?.employeeId || user?.role}</span>
                    )}
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-300 bg-primary/20 px-1 rounded">
                      {user?.role}
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 group-hover:text-white group-hover:bg-slate-700/70 transition shrink-0">
                <Pencil className="w-3 h-3" />
              </div>
            </button>

            {/* Slack-style profile popover */}
            {isProfileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsProfileMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-navy-surface border border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-start gap-3 pb-2.5 border-b border-slate-700/80">
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-primary text-white font-bold flex items-center justify-center text-sm shrink-0 border border-slate-600 shadow-sm">
                      {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{getInitials(user?.displayName || user?.name)}</span>
                      )}
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                      {user?.displayName && (
                        <p className="text-[11px] text-blue-300 truncate font-medium">@{user.displayName}</p>
                      )}
                      {user?.title && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{user.title}</p>
                      )}
                      <p className="text-[10px] text-slate-500 font-mono truncate">{user?.email}</p>
                    </div>
                  </div>

                  {user?.bio && (
                    <p className="text-[11px] text-slate-300 italic bg-navy/60 p-2 rounded-lg border border-slate-800">
                      &quot;{user.bio}&quot;
                    </p>
                  )}

                  <div className="space-y-1">
                    <button
                      type="button"
                      id="popover-edit-profile-btn"
                      data-testid="popover-edit-profile-btn"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        setIsEditProfileOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white bg-primary hover:bg-primary-hover transition cursor-pointer shadow-xs"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Profile</span>
                    </button>

                    <button
                      type="button"
                      id="popover-sign-out-btn"
                      data-testid="popover-sign-out-btn"
                      onClick={() => logout()}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Desktop Header / Topbar */}
        <header className="hidden lg:flex items-center justify-between h-16 px-6 lg:px-8 border-b border-border bg-white sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {pageMeta.section}
                </span>
                <span className="text-slate-300">/</span>
                <h1 className="text-base font-semibold text-text-primary tracking-tight">{pageMeta.title}</h1>
              </div>
              <p className="text-xs font-normal text-text-secondary">{pageMeta.subtitle}</p>
            </div>
          </div>

          {/* Topbar Right Controls */}
          <div className="flex items-center gap-3">
            {/* Date display */}
            {currentDateStr && (
              <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-border text-xs text-text-secondary font-medium">
                <Calendar className="w-3.5 h-3.5 text-text-secondary" />
                <span>{currentDateStr}</span>
              </div>
            )}

            {/* User pill (Slack Style) */}
            <div className="relative">
              <button
                type="button"
                id="header-user-menu-btn"
                data-testid="header-user-menu-btn"
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="flex items-center gap-2 pl-2 border-l border-border hover:opacity-85 transition cursor-pointer group"
                title="Account & Profile options"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{getInitials(user?.displayName || user?.name)}</span>
                  )}
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-semibold text-text-primary leading-tight truncate max-w-[120px] group-hover:text-primary transition">
                    {user?.displayName || user?.name}
                  </p>
                  <p className="text-[10px] text-text-secondary font-mono leading-tight">
                    {user?.title || `${user?.employeeId || ''} • ${user?.role}`}
                  </p>
                </div>
              </button>

              {/* Desktop Header User Dropdown */}
              {isHeaderMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsHeaderMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 z-50 bg-white border border-border rounded-2xl shadow-xl p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-border">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                        {user?.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>{getInitials(user?.displayName || user?.name)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text-primary truncate">{user?.name}</p>
                        {user?.displayName && (
                          <p className="text-[11px] text-primary truncate font-medium">@{user.displayName}</p>
                        )}
                        <p className="text-[10px] text-text-secondary truncate font-mono">{user?.email}</p>
                      </div>
                    </div>

                    {user?.title && (
                      <p className="text-[11px] text-text-secondary px-1 truncate">
                        {user.title}
                      </p>
                    )}

                    <div className="space-y-1">
                      <button
                        type="button"
                        id="header-edit-profile-btn"
                        data-testid="header-edit-profile-btn"
                        onClick={() => {
                          setIsHeaderMenuOpen(false);
                          setIsEditProfileOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-text-primary hover:bg-slate-50 transition cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-primary" />
                        <span>Edit Profile</span>
                      </button>

                      <button
                        type="button"
                        id="header-sign-out-btn"
                        data-testid="header-sign-out-btn"
                        onClick={() => logout()}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile & Tablet Topbar */}
        <header className="lg:hidden flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 border-b border-border bg-white sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {agencyBranding?.logoUrl ? (
              <img
                src={agencyBranding.logoUrl}
                alt={agencyBranding.name || 'Agency Logo'}
                className="max-h-7 max-w-[80px] object-contain rounded shrink-0"
                onError={(e) => {
                  (e.target as any).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0">
                {getInitials(agencyBranding?.name || 'ClientHub')}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-text-primary text-xs sm:text-sm truncate">
                  {agencyBranding?.name || 'ClientHub'}
                </span>
                <span className="hidden sm:inline text-slate-300">/</span>
                <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-primary shrink-0">
                  {pageMeta.section}
                </span>
              </div>
              <span className="text-[9px] sm:text-[11px] text-text-secondary block truncate -mt-0.5">{pageMeta.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* User Avatar badge for tablet */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(true)}
                className="w-7 h-7 rounded-lg overflow-hidden bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center text-xs font-bold hover:opacity-80 transition cursor-pointer"
                title="Edit profile"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                ) : (
                  getInitials(user?.displayName || user?.name)
                )}
              </button>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-slate-100 transition"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile & Tablet Navigation Drawer with Backdrop */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-out Drawer */}
            <div className="relative w-4/5 max-w-xs bg-navy border-r border-slate-800 flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200 text-white">
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {agencyBranding?.logoUrl ? (
                    <img
                      src={agencyBranding.logoUrl}
                      alt={agencyBranding.name || 'Agency Logo'}
                      className="max-h-7 max-w-[80px] object-contain rounded shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-xs shrink-0">
                      {getInitials(agencyBranding?.name || 'ClientHub')}
                    </div>
                  )}
                  <span className="font-bold text-white text-sm truncate">
                    {agencyBranding?.name || 'ClientHub'}
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-navy-surface shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile User Card (Slack Style) */}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsEditProfileOpen(true);
                }}
                className="w-full p-3 bg-navy-surface border-b border-slate-800 flex items-center justify-between text-left hover:bg-slate-800/80 transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary/20 text-blue-300 font-bold flex items-center justify-center text-xs border border-primary/30 shrink-0">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-full h-full object-cover" />
                    ) : (
                      getInitials(user?.displayName || user?.name)
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition">
                      {user?.displayName || user?.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {user?.title || `${user?.employeeId || ''} • ${user?.role}`}
                    </p>
                  </div>
                </div>
                <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition shrink-0" />
              </button>

              {/* Mobile Active Timer Card */}
              {activeTimer && (
                <div className="p-3 bg-navy-surface/80 border-b border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Active Timer
                    </span>
                    <span className="font-mono text-xs font-bold text-blue-300">
                      <MobileTimerBadge />
                    </span>
                  </div>
                  <p className="text-xs text-white font-medium truncate mb-2">
                    {activeTimer.project.name}
                  </p>
                  <button
                    id="mobile-drawer-stop-timer"
                    onClick={() => {
                      stopTimer();
                      stopScreenStream();
                      setIsScreenSharing(false);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-error hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" /> Stop Timer
                  </button>
                </div>
              )}

              {/* Mobile Navigation links */}
              <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
                {navSections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {section.title}
                    </div>
                    {section.items.map((item) => {
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
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                            isActive
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-slate-300 hover:bg-navy-surface'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>

              {/* Sign Out & Profile */}
              <div className="p-3 border-t border-slate-800 shrink-0 space-y-1.5">
                <button
                  type="button"
                  id="mobile-nav-edit-profile"
                  data-testid="mobile-nav-edit-profile"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsEditProfileOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover transition cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
                <button
                  id="mobile-nav-sign-out"
                  data-testid="mobile-nav-sign-out"
                  onClick={() => logout()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-navy-surface transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 min-w-0 bg-app-background p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {/* Workstation Screen Sharing Compliance Banner */}
            {activeTimer && screenshotSetting?.enabled && (
              !isScreenSharing ? (
                <div
                  id="screen-sharing-prompt-banner"
                  data-testid="screen-sharing-prompt-banner"
                  className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-sm animate-in fade-in"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-warning border border-amber-300 flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                          <span>Workstation Screen Verification Required</span>
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                            Timer Active: {activeTimer.project.name}
                          </span>
                        </h4>
                        <p className="text-xs text-amber-800/90 mt-0.5">
                          Screen verification is active every {screenshotSetting.intervalMinutes || 15} minutes. Click below and select <strong>&quot;Entire Screen&quot;</strong> so your deliverable progress is verified.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      id="btn-prompt-share-screen"
                      data-testid="btn-prompt-share-screen"
                      onClick={handlePromptShareScreen}
                      className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
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
                  className="mb-6 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 flex items-center justify-between text-xs text-green-900 animate-in fade-in"
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    <span className="font-semibold text-green-900">Live Screen Verification Connected:</span>
                    <span className="text-green-800">Capturing desktop automatically every {screenshotSetting.intervalMinutes || 15} minutes.</span>
                  </div>
                  <span className="text-[10px] font-mono text-green-800 bg-green-100 px-2 py-0.5 rounded border border-green-300">
                    Entire Screen Active
                  </span>
                </div>
              )
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Real-time Socket.IO Team Chat Drawer */}
      <ChatDrawer />

      {/* Floating Chat Quick Action Button */}
      <FloatingChatButton />

      {/* 10-15 Min Inactivity Warning Modal */}
      {showIdleWarning && activeTimer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-text-primary">
                  Inactivity Detected (No Movement)
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  No keyboard or mouse movement has been detected for <strong>10 minutes</strong> while your timer is running on <strong>{activeTimer.project.name}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-center">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block mb-1">
                Timer Auto-Cut Countdown
              </span>
              <div className="font-mono text-2xl font-black text-amber-700 tracking-wider">
                {Math.floor(idleSecondsRemaining / 60)}:
                {String(idleSecondsRemaining % 60).padStart(2, '0')}
              </div>
              <p className="text-[11px] text-amber-700 mt-1">
                Timer will automatically cut off at 15 minutes of inactivity.
              </p>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Moving your mouse, pressing any key, or clicking below will immediately resume your timer.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                id="btn-keep-timer-running"
                data-testid="btn-keep-timer-running"
                onClick={handleKeepTimerRunning}
                className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>I&apos;m Still Working (Keep Running)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inactivity Auto-Cut Notification Modal */}
      {showIdleStoppedModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIdleStoppedModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-text-primary">
                  Timer Automatically Stopped
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Your timer was automatically cut off because no keyboard or mouse movement was detected for <strong>15 minutes</strong>.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-border text-xs text-text-secondary">
              The idle period has been logged with note:
              <span className="font-mono text-slate-700 block mt-1 bg-white p-2 rounded border border-border">
                [Auto-stopped: 15 minutes of inactivity - no keyboard or mouse movement]
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                id="btn-dismiss-idle-stopped"
                data-testid="btn-dismiss-idle-stopped"
                onClick={() => setShowIdleStoppedModal(false)}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slack-style Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />
    </div>
  );
}
