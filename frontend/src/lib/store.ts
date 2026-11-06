import { create } from 'zustand';
import { requestScreenStream, stopScreenStream, isScreenStreamActive } from './screenshotCapture';

export interface AgencyBranding {
  name: string;
  logoUrl: string | null;
  currency?: string;
}

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EMPLOYEE';
  employeeId: string;
  department?: string | null;
  account?: AgencyBranding & { id: string };
}

export interface ActiveTimerData {
  id: string;
  projectId: string;
  startTime: string;
  status: string;
  isOutsideHours: boolean;
  isOvertime?: boolean;
  targetDuration?: number | null;
  classification: string;
  notes?: string | null;
  description?: string | null;
  project: {
    id: string;
    code: string;
    name: string;
  };
}

import {
  OfficeScheduleData,
  checkIsAfterOfficeHours,
  isOfficeTimeEnded,
  formatSecondsToTimer,
} from './utils';

export type { OfficeScheduleData };
export { checkIsAfterOfficeHours, isOfficeTimeEnded, formatSecondsToTimer };

interface AuthState {
  user: UserSession | null;
  token: string | null;
  agencyBranding: AgencyBranding;
  isLoading: boolean;
  setUser: (user: UserSession | null, token?: string | null) => void;
  setAgencyBranding: (branding: Partial<AgencyBranding>) => void;
  fetchUser: () => Promise<UserSession | null>;
  fetchBranding: () => Promise<AgencyBranding | null>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  agencyBranding: {
    name: 'ClientHub',
    logoUrl: null,
    currency: 'USD',
  },
  isLoading: true,
  setUser: (user, token) => {
    const branding = user?.account
      ? {
          name: user.account.name || 'ClientHub',
          logoUrl: user.account.logoUrl || null,
          currency: user.account.currency || 'USD',
        }
      : undefined;
    set((state) => ({
      user,
      token: token ?? null,
      isLoading: false,
      ...(branding ? { agencyBranding: branding } : {}),
    }));
  },
  setAgencyBranding: (branding) =>
    set((state) => {
      const updated = { ...state.agencyBranding, ...branding };
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('ch_agency_branding_updated', { detail: updated }));
        } catch {}
      }
      return { agencyBranding: updated };
    }),
  fetchBranding: async () => {
    try {
      const res = await fetch('/api/settings/branding');
      if (res.ok) {
        const data = await res.json();
        const branding: AgencyBranding = {
          name: data.name || 'ClientHub',
          logoUrl: data.logoUrl || null,
          currency: data.currency || 'USD',
        };
        set({ agencyBranding: branding });
        return branding;
      }
    } catch {}
    return null;
  },
  fetchUser: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        const account = data.user?.account;
        const branding: AgencyBranding = {
          name: account?.name || 'ClientHub',
          logoUrl: account?.logoUrl || null,
          currency: account?.currency || 'USD',
        };
        set({
          user: data.user,
          token: data.token || null,
          agencyBranding: branding,
          isLoading: false,
        });
        return data.user;
      } else {
        set({ user: null, token: null, isLoading: false });
        return null;
      }
    } catch {
      set({ user: null, token: null, isLoading: false });
      return null;
    }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({ user: null });
      window.location.href = '/login';
    }
  },
}));

export interface ScreenshotSettingData {
  enabled: boolean;
  intervalMinutes: number;
  requireConsent: boolean;
  consentNotice: string;
}

interface TimerState {
  activeTimer: ActiveTimerData | null;
  elapsedSeconds: number;
  serverOffset: number;
  schedule: OfficeScheduleData | null;
  isOutsideHours: boolean;
  screenshotSetting: ScreenshotSettingData | null;
  isLoading: boolean;
  error: string | null;
  syncActiveTimer: () => Promise<void>;
  startTimer: (projectId?: string, notes?: string, isOvertimeOrDuration?: boolean | number) => Promise<boolean>;
  stopTimer: (notes?: string, stoppedAt?: string | Date) => Promise<boolean>;
  tick: () => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  activeTimer: null,
  elapsedSeconds: 0,
  serverOffset: 0,
  schedule: null,
  isOutsideHours: false,
  screenshotSetting: null,
  isLoading: false,
  error: null,

  syncActiveTimer: async () => {
    try {
      const res = await fetch('/api/time');
      if (res.ok) {
        const data = await res.json();
        const schedule = data.schedule || get().schedule || null;
        const screenshotSetting = data.screenshotSetting || null;
        if (data.activeTimer) {
          const startMs = new Date(data.activeTimer.startedAt).getTime();
          const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          const isTimerOvertime = Boolean(
            data.activeTimer.description && /\[Overtime\]/i.test(data.activeTimer.description)
          );
          set({
            activeTimer: {
              id: data.activeTimer.id,
              projectId: data.activeTimer.projectId,
              startTime: data.activeTimer.startedAt,
              status: 'RUNNING',
              isOutsideHours: isTimerOvertime,
              isOvertime: isTimerOvertime,
              classification: isTimerOvertime ? 'OVERTIME' : 'PROJECT_TRACKING',
              project: data.activeTimer.project,
              description: data.activeTimer.description,
            },
            elapsedSeconds: elapsed,
            serverOffset: 0,
            schedule,
            isOutsideHours: isTimerOvertime,
            screenshotSetting,
            error: null,
          });
        } else {
          set({
            activeTimer: null,
            elapsedSeconds: 0,
            schedule,
            isOutsideHours: false,
            screenshotSetting,
            error: null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to sync active timer:', err);
    }
  },

  startTimer: async (projectId?: string, notes?: string, isOvertimeOrDuration?: boolean | number) => {
    if (typeof window !== 'undefined' && !isScreenStreamActive()) {
      try {
        await requestScreenStream();
      } catch (err) {
        console.warn('[ScreenCapture] Screen share prompt dismissed:', err);
      }
    }
    set({ isLoading: true, error: null });
    const isOvertime = typeof isOvertimeOrDuration === 'boolean' ? isOvertimeOrDuration : false;
    try {
      const res = await fetch('/api/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START', projectId, description: notes, isOvertime }),
      });
      const data = await res.json();

      if (!res.ok) {
        set({ isLoading: false, error: data.error || 'Failed to start timer' });
        return false;
      }

      const timer = data.timer;
      const schedule = data.schedule || get().schedule || null;
      const screenshotSetting = data.screenshotSetting || get().screenshotSetting || null;
      const startMs = new Date(timer.startedAt).getTime();
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const isTimerOvertime = Boolean(isOvertime || (timer.description && /\[Overtime\]/i.test(timer.description)));

      set({
        activeTimer: {
          id: timer.id,
          projectId: timer.projectId,
          startTime: timer.startedAt,
          status: 'RUNNING',
          isOutsideHours: isTimerOvertime,
          isOvertime: isTimerOvertime,
          classification: isTimerOvertime ? 'OVERTIME' : 'PROJECT_TRACKING',
          project: timer.project,
          description: timer.description,
        },
        elapsedSeconds: elapsed,
        serverOffset: 0,
        schedule,
        screenshotSetting,
        isLoading: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('el_last_activity_time', String(Date.now()));
        } catch {}
      }

      return true;
    } catch (err) {
      set({ isLoading: false, error: 'Network error starting timer.' });
      return false;
    }
  },

  stopTimer: async (notes?: string, stoppedAt?: string | Date) => {
    if (typeof window !== 'undefined') {
      try {
        stopScreenStream();
      } catch {}
    }
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'STOP',
          description: notes,
          stoppedAt: stoppedAt ? new Date(stoppedAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        set({ isLoading: false, error: data.error || 'Failed to stop timer' });
        return false;
      }

      set({
        activeTimer: null,
        elapsedSeconds: 0,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err) {
      set({ isLoading: false, error: 'Network error stopping timer.' });
      return false;
    }
  },

  tick: () => {
    const active = get().activeTimer;
    if (active) {
      const startMs = new Date(active.startTime).getTime();
      const nowMs = Date.now() + (get().serverOffset || 0);
      const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));

      const schedule = get().schedule;
      const isOvertime = Boolean(
        active.isOvertime ||
        (active.description && /\[Overtime\]/i.test(active.description))
      );

      // Rule 1: If timer is running and office time is ended, and if checkbox is checked (autoCutoffEnabled),
      // stop daytime timers automatically. Overtime timers run until manually stopped!
      if (schedule && schedule.autoCutoffEnabled && !isOvertime && !get().isLoading) {
        const ended = isOfficeTimeEnded(schedule, active.startTime, active.description);
        if (ended) {
          const closing = schedule.closingTime || 'closing time';
          get().stopTimer(`[Auto-stopped: Office hours ended at ${closing}]`);
          return;
        }
      }

      // Rule 2: Inactivity auto-cutoff (15 minutes of no keyboard or mouse movement)
      if (!get().isLoading && typeof window !== 'undefined') {
        const isTesting = window.location.search.includes('testIdle=1');
        const autocutLimit = isTesting ? 15 * 1000 : 15 * 60 * 1000;
        const savedLastActivity = localStorage.getItem('el_last_activity_time');
        if (savedLastActivity) {
          const lastAct = parseInt(savedLastActivity, 10);
          if (!isNaN(lastAct) && (Date.now() - lastAct >= autocutLimit)) {
            const cutTime = new Date(lastAct + autocutLimit);
            get().stopTimer('[Auto-stopped: 15 minutes of inactivity - no keyboard or mouse movement]', cutTime);
            return;
          }
        }
      }

      set({ elapsedSeconds: elapsed });
    }
  },
}));


export interface ChatState {
  isOpen: boolean;
  activeConvId: string | null;
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;
  onlineCount: number;
  isConnected: boolean;
  setIsOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  openChat: (convId?: string) => void;
  toggleChat: () => void;
  closeChat: () => void;
  setActiveConvId: (convId: string | null) => void;
  setAllUnreadCounts: (counts: Record<string, number>) => void;
  incrementUnreadForConv: (convId: string) => void;
  clearUnreadForConv: (convId: string) => void;
  setOnlineCount: (count: number) => void;
  setIsConnected: (connected: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  activeConvId: null,
  unreadCounts: {},
  totalUnreadCount: 0,
  onlineCount: 0,
  isConnected: false,
  setIsOpen: (isOpen) =>
    set((state) => ({
      isOpen: typeof isOpen === 'function' ? isOpen(state.isOpen) : isOpen,
    })),
  openChat: (convId) =>
    set((state) => {
      const activeConvId = convId !== undefined ? convId : state.activeConvId;
      const unreadCounts = activeConvId
        ? { ...state.unreadCounts, [activeConvId]: 0 }
        : state.unreadCounts;
      const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);
      return {
        isOpen: true,
        activeConvId,
        unreadCounts,
        totalUnreadCount,
      };
    }),
  toggleChat: () =>
    set((state) => ({
      isOpen: !state.isOpen,
    })),
  closeChat: () => set({ isOpen: false }),
  setActiveConvId: (convId) => set({ activeConvId: convId }),
  setAllUnreadCounts: (counts) => {
    const total = Object.values(counts).reduce((acc, c) => acc + (c || 0), 0);
    set({ unreadCounts: counts, totalUnreadCount: total });
  },
  incrementUnreadForConv: (convId) =>
    set((state) => {
      const current = state.unreadCounts[convId] || 0;
      const unreadCounts = { ...state.unreadCounts, [convId]: current + 1 };
      const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);
      return { unreadCounts, totalUnreadCount };
    }),
  clearUnreadForConv: (convId) =>
    set((state) => {
      const unreadCounts = { ...state.unreadCounts, [convId]: 0 };
      const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);
      return { unreadCounts, totalUnreadCount };
    }),
  setOnlineCount: (count) => set({ onlineCount: count }),
  setIsConnected: (connected) => set({ isConnected: connected }),
}));
