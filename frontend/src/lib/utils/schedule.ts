/**
 * Office hours and scheduling logic utilities.
 */

export interface OfficeScheduleData {
  openingTime: string;
  closingTime: string;
  workingDays?: string;
  timezone: string;
  allowOutsideHours?: boolean;
  autoCutoffEnabled: boolean;
  dayTimings?: any;
}

export interface AfterHoursCheckResult {
  isAfterHours: boolean;
  closingTime: string;
  openingTime: string;
  dayOfWeek: string;
  reason?: string;
}

/**
 * Checks whether current time in schedule's timezone is outside standard office hours.
 */
export function checkIsAfterOfficeHours(schedule?: OfficeScheduleData | null): AfterHoursCheckResult {
  if (!schedule) {
    return { isAfterHours: false, closingTime: "18:00", openingTime: "09:00", dayOfWeek: "MON" };
  }
  try {
    const tz = schedule.timezone || "Asia/Kolkata";
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const dayOfWeek = dayFormatter.format(now).toUpperCase();

    let closingTime = schedule.closingTime || "18:00";
    let openingTime = schedule.openingTime || "09:00";
    if (schedule.dayTimings) {
      try {
        const timings =
          typeof schedule.dayTimings === "string"
            ? JSON.parse(schedule.dayTimings)
            : schedule.dayTimings;
        if (timings && timings[dayOfWeek]?.end) {
          closingTime = timings[dayOfWeek].end;
        }
        if (timings && timings[dayOfWeek]?.start) {
          openingTime = timings[dayOfWeek].start;
        }
      } catch {}
    }

    const [closeH, closeM] = closingTime.split(":").map(Number);
    const [openH, openM] = openingTime.split(":").map(Number);
    const closeMinutes = closeH * 60 + closeM;
    const openMinutes = openH * 60 + openM;

    const workingDays = (schedule.workingDays || "MON,TUE,WED,THU,FRI")
      .split(",")
      .map((d) => d.trim().toUpperCase());

    if (!workingDays.includes(dayOfWeek)) {
      return {
        isAfterHours: true,
        closingTime,
        openingTime,
        dayOfWeek,
        reason: `${dayOfWeek} is outside scheduled working days`,
      };
    }

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = timeFormatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMinutes = hour * 60 + minute;

    if (closeMinutes > openMinutes) {
      if (currentMinutes >= closeMinutes) {
        return { isAfterHours: true, closingTime, openingTime, dayOfWeek, reason: `Office hours ended at ${closingTime}` };
      }
      if (currentMinutes < openMinutes) {
        return { isAfterHours: true, closingTime, openingTime, dayOfWeek, reason: `Office opens at ${openingTime}` };
      }
    } else if (closeMinutes < openMinutes) {
      const isInOvernight = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
      if (!isInOvernight) {
        return { isAfterHours: true, closingTime, openingTime, dayOfWeek, reason: `Outside overnight hours (${openingTime}-${closingTime})` };
      }
    }

    return { isAfterHours: false, closingTime, openingTime, dayOfWeek };
  } catch (err) {
    console.error("Error checking isAfterOfficeHours:", err);
    return { isAfterHours: false, closingTime: "18:00", openingTime: "09:00", dayOfWeek: "MON" };
  }
}

/**
 * Checks whether office hours have ended for today in the organization's timezone.
 * Overtime timers and timers started after closing time never auto-stop.
 */
export function isOfficeTimeEnded(
  schedule?: OfficeScheduleData | null,
  timerStartTime?: string | Date,
  description?: string | null
): boolean {
  if (!schedule) return false;
  try {
    // Overtime sessions run until manually stopped
    if (description && /\[Overtime\]/i.test(description)) {
      return false;
    }

    const tz = schedule.timezone || "Asia/Kolkata";
    const now = new Date();

    // Never auto-stop a timer that was just started (within the last 60 seconds)
    if (timerStartTime) {
      const startMs = new Date(timerStartTime).getTime();
      if (!isNaN(startMs) && now.getTime() - startMs < 60000) {
        return false;
      }
    }

    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const dayOfWeek = dayFormatter.format(now).toUpperCase();

    let closingTime = schedule.closingTime || "18:00";
    let openingTime = schedule.openingTime || "09:00";
    if (schedule.dayTimings) {
      try {
        const timings =
          typeof schedule.dayTimings === "string"
            ? JSON.parse(schedule.dayTimings)
            : schedule.dayTimings;
        if (timings && timings[dayOfWeek]?.end) {
          closingTime = timings[dayOfWeek].end;
        }
        if (timings && timings[dayOfWeek]?.start) {
          openingTime = timings[dayOfWeek].start;
        }
      } catch {}
    }

    const [closeH, closeM] = closingTime.split(":").map(Number);
    const [openH, openM] = openingTime.split(":").map(Number);
    const closeMinutes = closeH * 60 + closeM;
    const openMinutes = openH * 60 + openM;

    if (timerStartTime) {
      const timeFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const startParts = timeFormatter.formatToParts(new Date(timerStartTime));
      const sHour = parseInt(startParts.find((p) => p.type === "hour")?.value || "0", 10);
      const sMinute = parseInt(startParts.find((p) => p.type === "minute")?.value || "0", 10);
      const startMinutes = sHour * 60 + sMinute;

      const workingDays = (schedule.workingDays || "MON,TUE,WED,THU,FRI")
        .split(",")
        .map((d) => d.trim().toUpperCase());
      const startDayFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "short",
      });
      const startDayOfWeek = startDayFormatter.format(new Date(timerStartTime)).toUpperCase();

      const isStartOnNonWorkingDay = !workingDays.includes(startDayOfWeek);
      const isStartAfterClosing =
        closeMinutes > openMinutes
          ? startMinutes >= closeMinutes || startMinutes < openMinutes
          : startMinutes >= closeMinutes && startMinutes < openMinutes;

      if (isStartOnNonWorkingDay || isStartAfterClosing) {
        // Started after hours -> Overtime, runs until manually stopped!
        return false;
      }

      // Check if daytime timer started on a previous calendar day
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const startDateStr = dateFormatter.format(new Date(timerStartTime));
      const nowDateStr = dateFormatter.format(now);
      if (startDateStr !== nowDateStr) {
        return true;
      }
    }

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const nowParts = timeFormatter.formatToParts(now);
    const nHour = parseInt(nowParts.find((p) => p.type === "hour")?.value || "0", 10);
    const nMinute = parseInt(nowParts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMinutes = nHour * 60 + nMinute;

    if (closeMinutes > openMinutes) {
      return currentMinutes >= closeMinutes;
    } else if (closeMinutes < openMinutes) {
      return currentMinutes >= closeMinutes && currentMinutes < openMinutes;
    }

    return false;
  } catch (err) {
    console.error("Error checking isOfficeTimeEnded:", err);
    return false;
  }
}
