import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAdmin } from '@/lib/server/auth';
import { format } from 'date-fns';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    const logs = await prisma.emailDeliveryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const auditList = logs.map((log: any) => ({
      id: log.id,
      date: format(log.createdAt, 'yyyy-MM-dd'),
      time: format(log.createdAt, 'HH:mm:ss'),
      status: log.status === 'SENT' || log.status === 'SIMULATED' ? 'Success' : 'Failed',
      rawStatus: log.status,
      recipients: log.recipient,
      subject: log.subject,
      type: log.type,
      error: log.error || null,
      sentAt: log.sentAt,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({ success: true, logs: auditList });
  } catch (error) {
    console.error('Error fetching mail audit list:', error);
    return NextResponse.json({ error: 'Failed to retrieve mail audit logs' }, { status: 500 });
  }
}
