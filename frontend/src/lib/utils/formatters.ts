/**
 * Common formatting and display utility functions across the application.
 */

export interface StageBadge {
  bg: string;
  label: string;
  step: number;
}

/**
 * Returns consistent badge color styling, display label, and progress step (1-4) for a delivery stage.
 * Used across Dashboard, Projects, Sub-Projects, and Client Portal.
 */
export function getStageBadge(stage: string): StageBadge {
  switch (stage) {
    case "DISCOVERY":
      return { bg: "bg-blue-50 text-blue-700 border-blue-200", label: "Discovery", step: 1 };
    case "IN_PROGRESS":
      return { bg: "bg-amber-50 text-amber-700 border-amber-200", label: "In Progress", step: 2 };
    case "AWAITING_REVIEW":
      return { bg: "bg-purple-50 text-purple-700 border-purple-200", label: "Review", step: 3 };
    case "LIVE":
      return { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Live", step: 4 };
    default:
      return { bg: "bg-slate-50 text-slate-700 border-slate-200", label: stage, step: 1 };
  }
}

/**
 * Formats elapsed seconds into standard HH:MM:SS clock format.
 */
export function formatSecondsToTimer(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats duration in seconds into human-readable compact text (e.g. "2h 15m", "45m", "30s").
 */
export function formatDuration(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  if (hours === 0 && minutes === 0) return `${seconds}s`;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Formats a Date object or ISO string into a local YYYY-MM-DD string for HTML date inputs.
 */
export function formatLocalDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date into a clean localized date string (e.g. "Nov 3, 2026").
 */
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", options);
}

/**
 * Formats a time into a clean 12-hour format string (e.g. "10:30 AM").
 */
export function formatTime(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", options);
}

/**
 * Safely extracts up to 2 uppercase initials from a name (e.g. "Sarah Jenkins (Admin)" -> "SJ").
 */
export function getInitials(name?: string | null): string {
  if (!name) return "U";
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "U";
}

/**
 * Formats monetary amounts from integer cents into localized currency (e.g. 10000 -> "$100.00").
 */
export function formatCurrency(amountInCents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountInCents / 100);
}
