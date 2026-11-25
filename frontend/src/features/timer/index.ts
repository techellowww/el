import type { TimeEntry } from '@/types';

export type { TimeEntry };

export async function fetchTimeEntries(): Promise<TimeEntry[]> {
  const res = await fetch('/api/time');
  const data = await res.json();
  return data.entries || data;
}

