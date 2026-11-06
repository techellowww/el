import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { prisma } from '@/lib/prisma';

async function getOrCreateGeneralClient(accountId: string, email?: string) {
  let genClient = await prisma.client.findFirst({
    where: { accountId, company: '__INTERNAL_GENERAL_TEAM__' },
  });
  if (!genClient) {
    genClient = await prisma.client.create({
      data: {
        accountId,
        name: 'General Agency Team',
        email: email || 'general-team@agency.local',
        company: '__INTERNAL_GENERAL_TEAM__',
      },
    });
  }
  return genClient;
}

// GET /api/chat/unread -> Returns real-time unread counts per channel and total for authenticated user
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);

    // Query accessible clients and projects for this user
    const clientWhere: any = {
      accountId: user.accountId,
      company: { not: '__INTERNAL_GENERAL_TEAM__' },
    };
    if (user.role === 'EMPLOYEE') {
      clientWhere.assignments = {
        some: { userId: user.id },
      };
    }

    const accessibleClients = await prisma.client.findMany({
      where: clientWhere,
      select: {
        id: true,
        name: true,
        projects: {
          select: { id: true, name: true },
        },
      },
    });

    // Fetch user's message read receipts
    const userReads = await prisma.messageRead.findMany({
      where: { accountId: user.accountId, userId: user.id },
    });
    const readMap = new Map<string, Date>();
    userReads.forEach((r: any) => {
      readMap.set(r.clientId, r.lastReadAt);
    });

    const unreadCounts: Record<string, number> = {};

    // 1. General channel unread count
    const generalLastRead = readMap.get(generalClient.id);
    const generalUnread = await prisma.message.count({
      where: {
        accountId: user.accountId,
        clientId: generalClient.id,
        projectId: null,
        isInternalNote: true,
        isDeleted: false,
        OR: [
          { senderUserId: { not: user.id } },
          { senderUserId: null },
        ],
        ...(generalLastRead ? { createdAt: { gt: generalLastRead } } : {}),
      },
    });
    unreadCounts['general'] = generalUnread;

    // 2. Client & Project channels
    for (const client of accessibleClients) {
      const clientLastRead = readMap.get(client.id);
      const clientUnread = await prisma.message.count({
        where: {
          accountId: user.accountId,
          clientId: client.id,
          projectId: null,
          isInternalNote: false,
          isDeleted: false,
          OR: [
            { senderUserId: { not: user.id } },
            { senderUserId: null },
          ],
          ...(clientLastRead ? { createdAt: { gt: clientLastRead } } : {}),
        },
      });
      unreadCounts[client.id] = clientUnread;

      for (const proj of client.projects) {
        const projLastRead = readMap.get(proj.id) || clientLastRead;
        const projUnread = await prisma.message.count({
          where: {
            accountId: user.accountId,
            projectId: proj.id,
            isDeleted: false,
            OR: [
              { senderUserId: { not: user.id } },
              { senderUserId: null },
            ],
            ...(projLastRead ? { createdAt: { gt: projLastRead } } : {}),
          },
        });
        unreadCounts[proj.id] = projUnread;
      }
    }

    const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);

    return NextResponse.json({
      success: true,
      totalUnreadCount,
      unreadCounts,
    });
  } catch (err: any) {
    console.error('Failed to get chat unread counts:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch unread counts' }, { status: 500 });
  }
}

// POST /api/chat/unread -> Marks a conversation as read in DB
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { conversationId } = body || {};

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    let targetClientId: string | null = null;
    if (conversationId === 'general') {
      const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);
      targetClientId = generalClient.id;
    } else {
      const proj = await prisma.project.findFirst({
        where: { id: conversationId, accountId: user.accountId },
      });
      if (proj) {
        targetClientId = proj.clientId;
      } else {
        const client = await prisma.client.findFirst({
          where: { id: conversationId, accountId: user.accountId },
        });
        if (client) {
          targetClientId = client.id;
        }
      }
    }

    if (targetClientId) {
      await prisma.messageRead.upsert({
        where: {
          clientId_userId: {
            clientId: targetClientId,
            userId: user.id,
          },
        },
        create: {
          accountId: user.accountId,
          clientId: targetClientId,
          userId: user.id,
          isClient: false,
          lastReadAt: new Date(),
        },
        update: {
          lastReadAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      conversationId,
      clearedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Failed to mark conversation read:', err);
    return NextResponse.json({ error: err.message || 'Failed to mark read' }, { status: 500 });
  }
}
