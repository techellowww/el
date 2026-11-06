import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/prisma';

// GET /api/mail/settings — Fetch current email schedule settings
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const setting = await prisma.emailScheduleSetting.findFirst();
    return NextResponse.json({
      success: true,
      setting,
      settings: setting,
      envDefaults: {
        smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        smtpUser: process.env.SMTP_USER || '',
        smtpFrom: process.env.SMTP_FROM || 'ClientHub Notifications <notifications@clienthub.local>',
        hasEnvPass: Boolean(process.env.SMTP_PASS),
      },
    });
  } catch (error) {
    console.error('Error fetching mail settings:', error);
    return NextResponse.json({ error: 'Failed to fetch mail settings' }, { status: 500 });
  }
}

// POST /api/mail/settings — Save/update email schedule settings
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const body = await req.json();
    const {
      enabled,
      scheduleType,
      scheduleTime,
      dailyEnabled,
      dailyTime,
      weeklyEnabled,
      weeklyDay,
      weeklyTime,
      monthlyEnabled,
      monthlyDay,
      monthlyTime,
      recipients,
      timezone,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
    } = body;

    const setting = await prisma.emailScheduleSetting.upsert({
      where: { id: 'default-email-setting' },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(scheduleType !== undefined && { scheduleType }),
        ...(scheduleTime !== undefined && { scheduleTime }),
        ...(dailyEnabled !== undefined && { dailyEnabled }),
        ...(dailyTime && { dailyTime }),
        ...(weeklyEnabled !== undefined && { weeklyEnabled }),
        ...(weeklyDay && { weeklyDay }),
        ...(weeklyTime && { weeklyTime }),
        ...(monthlyEnabled !== undefined && { monthlyEnabled }),
        ...(monthlyDay !== undefined && { monthlyDay }),
        ...(monthlyTime && { monthlyTime }),
        ...(recipients !== undefined && { recipients }),
        ...(timezone && { timezone }),
        ...(smtpHost !== undefined && { smtpHost }),
        ...(smtpPort !== undefined && { smtpPort: Number(smtpPort) }),
        ...(smtpUser !== undefined && { smtpUser }),
        ...(smtpPass !== undefined && { smtpPass }),
        ...(smtpFrom !== undefined && { smtpFrom }),
        // If timing or schedule is modified, clear lastSentKey so updated schedule can dispatch
        ...((scheduleTime !== undefined || dailyTime !== undefined || weeklyTime !== undefined || monthlyTime !== undefined || scheduleType !== undefined) && {
          lastSentKey: null,
        }),
      },
      create: {
        id: 'default-email-setting',
        enabled: enabled ?? true,
        scheduleType: scheduleType || 'DAILY',
        scheduleTime: scheduleTime || dailyTime || '18:00',
        dailyEnabled: dailyEnabled ?? true,
        dailyTime: dailyTime || scheduleTime || '18:00',
        weeklyEnabled: weeklyEnabled ?? true,
        weeklyDay: weeklyDay || 'FRI',
        weeklyTime: weeklyTime || scheduleTime || '18:00',
        monthlyEnabled: monthlyEnabled ?? false,
        monthlyDay: monthlyDay || 1,
        monthlyTime: monthlyTime || scheduleTime || '18:00',
        recipients: recipients || '',
        timezone: timezone || 'Asia/Kolkata',
        smtpHost: smtpHost || 'smtp.gmail.com',
        smtpPort: smtpPort ? Number(smtpPort) : 587,
        smtpUser: smtpUser || null,
        smtpPass: smtpPass || null,
        smtpFrom: smtpFrom || 'ClientHub <notifications@clienthub.local>',
      },
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    console.error('Error saving mail settings:', error);
    return NextResponse.json({ error: 'Failed to save mail settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
