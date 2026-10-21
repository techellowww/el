import { create } from 'zustand';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EMPLOYEE';
  employeeId: string;
  department?: string | null;
}

export interface ActiveTimerData {
  id: string;
  projectId: string;
  startTime: string;
  status: string;
  isOutsideHours: boolean;
  targetDuration?: number | null;
  classification: string;
  notes?: string | null;
  project: {
    id: string;
    code: string;
    name: string;
  };
}

export interface OfficeScheduleData {
  openingTime: string;
  closingTime: string;
  workingDays: string;
  timezone: string;
  allowOutsideHours: boolean;
  autoCutoffEnabled: boolean;
}

interface AuthState {
  user: UserSession | null;
  isLoading: boolean;
  setUser: (user: UserSession | null) => void;
  fetchUser: () => Promise<UserSession | null>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  fetchUser: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, isLoading: false });
        return data.user;
      } else {
        set({ user: null, isLoading: false });
        return null;
      }
    } catch {
      set({ user: null, isLoading: false });
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
  startTimer: (projectId: string, notes?: string, targetDurationMinutes?: number) => Promise<boolean>;
  stopTimer: (notes?: string) => Promise<boolean>;
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
      const res = await fetch('/api/timer/active');
      if (res.ok) {
        const data = await res.json();
        if (data.activeTimer) {
          const startMs = new Date(data.activeTimer.startTime).getTime();
          const serverMs = new Date(data.serverTime || Date.now()).getTime();
          const serverOffset = serverMs - Date.now();
          const elapsed = Math.max(0, Math.floor((serverMs - startMs) / 1000));
          set({
            activeTimer: data.activeTimer,
            elapsedSeconds: elapsed,
            serverOffset,
            schedule: data.schedule || null,
            isOutsideHours: !!data.isOutsideHours,
            screenshotSetting: data.screenshotSetting || null,
            error: null,
          });
        } else {
          set({
            activeTimer: null,
            elapsedSeconds: 0,
            schedule: data.schedule || null,
            isOutsideHours: !!data.isOutsideHours,
            screenshotSetting: data.screenshotSetting || null,
            error: null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to sync active timer:', err);
    }
  },

  startTimer: async (projectId: string, notes?: string, targetDurationMinutes?: number) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, notes, targetDurationMinutes }),
      });
      const data = await res.json();

      if (!res.ok) {
        set({ isLoading: false, error: data.error || 'Failed to start timer' });
        return false;
      }

      const startMs = new Date(data.activeTimer.startTime).getTime();
      const serverMs = new Date(data.serverTime || Date.now()).getTime();
      const serverOffset = serverMs - Date.now();
      const elapsed = Math.max(0, Math.floor((serverMs - startMs) / 1000));

      set({
        activeTimer: data.activeTimer,
        elapsedSeconds: elapsed,
        serverOffset,
        screenshotSetting: data.screenshotSetting || null,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err) {
      set({ isLoading: false, error: 'Network error starting timer.' });
      return false;
    }
  },

  stopTimer: async (notes?: string) => {
    set({ isLoading: true, error: null });
    try {
      const active = get().activeTimer;
      const res = await fetch('/api/timer/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeEntryId: active?.id, notes }),
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

      // Client auto-cutoff if targetDuration reached
      if (active.targetDuration && active.targetDuration > 0 && elapsed >= active.targetDuration && !get().isLoading) {
        get().stopTimer('[Planned outside-hours session limit reached]');
        return;
      }

      set({ elapsedSeconds: elapsed });
    }
  },
}));
