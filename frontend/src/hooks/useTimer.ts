'use client';

import { useTimerStore } from '@/lib/store';

export function useTimer() {
  const {
    activeTimer,
    elapsedSeconds,
    startTimer,
    stopTimer,
    syncActiveTimer,
    tick,
  } = useTimerStore();

  return {
    activeTimer,
    elapsedSeconds,
    isRunning: Boolean(activeTimer),
    startTimer,
    stopTimer,
    syncActiveTimer,
    tick,
  };
}

export default useTimer;
