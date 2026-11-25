/**
 * Global application constants
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export const SESSION_COOKIE_NAME = 'ch_session';
export const LEGACY_SESSION_COOKIE_NAME = 'el_token';

export const PROJECT_STAGES = [
  'PLANNING',
  'IN_PROGRESS',
  'REVIEW',
  'COMPLETED',
  'ON_HOLD',
] as const;

export const INVOICE_STATUSES = [
  'DRAFT',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;

export const PROPOSAL_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
] as const;

export const DEFAULT_OFFICE_SCHEDULE = {
  openingTime: '09:00',
  closingTime: '18:00',
  workingDays: 'MON,TUE,WED,THU,FRI',
  timezone: 'Asia/Kolkata',
  allowOutsideHours: true,
  autoCutoffEnabled: true,
} as const;

export const INACTIVITY_THRESHOLDS = {
  warnMs: 10 * 60 * 1000, // 10 minutes warning
  autoCutMs: 15 * 60 * 1000, // 15 minutes auto cutoff
} as const;

export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/portal',
  '/proposal',
  '/invoice',
] as const;

