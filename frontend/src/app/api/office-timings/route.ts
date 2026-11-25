import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { logAuditEvent } from '@/lib/server/audit';
import { prisma } from '@/lib/prisma';
import { invalidateOfficeScheduleCache } from '@/lib/server/timerEngine';

export const dynamic = "force-dynamic";

// Office Timings Route - auto-cutoff supported
export async function GET(request?: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const schedule = await prisma.officeSchedule.findUnique({
      where: { id: 'default-schedule' },
    });
    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('Error fetching office schedule:', error);
    return NextResponse.json({ error: 'Failed to retrieve office schedule' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));

    const {
      openingTime = '09:00',
      closingTime = '18:00',
      workingDays = 'MON,TUE,WED,THU,FRI,SAT,SUN',
      timezone = 'Asia/Kolkata',
      allowOutsideHours = true,
      autoCutoffEnabled = true,
      dayTimings,
    } = body;

    const serializedDayTimings = dayTimings
      ? typeof dayTimings === 'string'
        ? dayTimings
        : JSON.stringify(dayTimings)
      : null;

    const updated = await prisma.officeSchedule.upsert({
      where: { id: 'default-schedule' },
      update: {
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: session?.userId || null,
      },
      create: {
        id: 'default-schedule',
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '18:00',
        workingDays: workingDays || 'MON,TUE,WED,THU,FRI,SAT,SUN',
        timezone: timezone || 'Asia/Kolkata',
        allowOutsideHours: allowOutsideHours ?? true,
        autoCutoffEnabled: autoCutoffEnabled ?? true,
        dayTimings: serializedDayTimings,
        updatedById: session?.userId || null,
      },
    });

    invalidateOfficeScheduleCache();

    if (session?.userId) {
      try {
        await logAuditEvent({
          userId: session.userId,
          action: 'OFFICE_SCHEDULE_UPDATED',
          targetEntity: 'OfficeSchedule',
          targetId: 'default-schedule',
          mandatoryReason: 'User updated office timings and auto-cutoff configuration',
          details: { openingTime, closingTime, workingDays, timezone, autoCutoffEnabled, dayTimings: serializedDayTimings },
        });
      } catch (auditErr) {
        console.warn('Audit log write skipped:', auditErr);
      }
    }

    return NextResponse.json({ success: true, schedule: updated });
  } catch (error: any) {
    console.error('Error updating office schedule:', error);
    return NextResponse.json({ error: 'Failed to update office schedule', details: error?.message }, { status: 500 });
  }
}
