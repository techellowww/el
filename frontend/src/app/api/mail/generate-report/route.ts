import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { getCustomReport, formatDurationHours } from '@/lib/server/reportEngine';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Both From Date and To Date are required.' }, { status: 400 });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format for From Date or To Date.' }, { status: 400 });
    }

    if (end < start) {
      return NextResponse.json({ error: 'To Date must be on or after From Date.' }, { status: 400 });
    }

    const report = await getCustomReport({ startDate: start, endDate: end });

    return NextResponse.json({
      success: true,
      report: {
        startDate,
        endDate,
        totalTrackedSeconds: report.totalTrackedSeconds,
        totalHoursFormatted: formatDurationHours(report.totalTrackedSeconds),
        regularSeconds: report.regularSeconds,
        regularHoursFormatted: formatDurationHours(report.regularSeconds),
        outsideHoursSeconds: report.outsideHoursSeconds,
        outsideHoursFormatted: formatDurationHours(report.outsideHoursSeconds),
        totalEntriesCount: report.totalEntriesCount,
        employeeBreakdown: report.employeeBreakdown || [],
        dailyBreakdown: report.dailyBreakdown,
      },
    });
  } catch (error) {
    console.error('Error generating manual report:', error);
    return NextResponse.json({ error: 'Failed to generate report for selected date range.' }, { status: 500 });
  }
}
