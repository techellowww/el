import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { prisma } from '@/lib/prisma';
import { getServerCache, setServerCache, invalidateServerCache } from '@/lib/server/apiServerCache';

const generalClientCache = new Map<string, any>();

async function getOrCreateGeneralClient(accountId: string, email?: string) {
  const cached = generalClientCache.get(accountId);
  if (cached) return cached;

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
  if (genClient) {
    generalClientCache.set(accountId, genClient);
  }
  return genClient;
}

// GET /api/chat/unread -> Returns real-time unread counts per channel and total for authenticated user
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cacheKey = `chat-unread:${user.accountId}:${user.id}`;
  const cachedData = getServerCache<{ totalUnreadCount: number; unreadCounts: Record<string, number> }>(cacheKey);
  if (cachedData) {
    return NextResponse.json({
      success: true,
      ...cachedData,
    });
  }

  try {
    // Query accessible clients filter
    const clientWhere: any = {
      accountId: user.accountId,
      company: { not: '__INTERNAL_GENERAL_TEAM__' },
    };
    if (user.role === 'EMPLOYEE') {
      clientWhere.assignments = {
        some: { userId: user.id },
      };
    }

    // Execute all required queries in a single concurrent Promise.all batch
    const [generalClient, accessibleClients, userReads, candidateMessages] = await Promise.all([
      getOrCreateGeneralClient(user.accountId, user.email),
      prisma.client.findMany({
        where: clientWhere,
        select: {
          id: true,
          name: true,
          projects: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.messageRead.findMany({
        where: { accountId: user.accountId, userId: user.id },
      }),
      prisma.message.findMany({
        where: {
          accountId: user.accountId,
          isDeleted: false,
          OR: [
            { senderUserId: { not: user.id } },
            { senderUserId: null },
          ],
        },
        select: {
          id: true,
          clientId: true,
          projectId: true,
          isInternalNote: true,
          createdAt: true,
        },
      }),
    ]);

    // Build read timestamps lookup
    const readMap = new Map<string, Date>();
    userReads.forEach((r: any) => {
      readMap.set(r.clientId, r.lastReadAt);
    });

    const unreadCounts: Record<string, number> = {};

    // 1. General channel unread count (calculated in-memory)
    const generalLastRead = readMap.get(generalClient.id);
    let generalUnread = 0;
    for (const m of candidateMessages) {
      if (m.clientId === generalClient.id && !m.projectId && m.isInternalNote) {
        if (!generalLastRead || m.createdAt > generalLastRead) {
          generalUnread++;
        }
      }
    }
    unreadCounts['general'] = generalUnread;

    // 2. Client & Project channels (calculated in-memory without N+1 SQL queries)
    for (const client of accessibleClients) {
      const clientLastRead = readMap.get(client.id);
      let clientUnread = 0;
      for (const m of candidateMessages) {
        if (m.clientId === client.id && !m.projectId && !m.isInternalNote) {
          if (!clientLastRead || m.createdAt > clientLastRead) {
            clientUnread++;
          }
        }
      }
      unreadCounts[client.id] = clientUnread;

      for (const proj of client.projects) {
        const projLastRead = readMap.get(proj.id) || clientLastRead;
        let projUnread = 0;
        for (const m of candidateMessages) {
          if (m.projectId === proj.id) {
            if (!projLastRead || m.createdAt > projLastRead) {
              projUnread++;
            }
          }
        }
        unreadCounts[proj.id] = projUnread;
      }
    }

    const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);
    const result = { totalUnreadCount, unreadCounts };

    // Cache unread calculation for 10 seconds per user
    setServerCache(cacheKey, result, 10000);

    return NextResponse.json({
      success: true,
      ...result,
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

    // Invalidate cached unread counts for this user immediately
    invalidateServerCache(`chat-unread:${user.accountId}:${user.id}`);

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
      // Access control check for employees: unassigned staff cannot access or mark unassigned client channels as read
      if (user.role === 'EMPLOYEE' && conversationId !== 'general') {
        const assignment = await prisma.clientAssignment.findUnique({
          where: {
            clientId_userId: {
              clientId: targetClientId,
              userId: user.id,
            },
          },
        });
        if (!assignment) {
          return NextResponse.json({ error: 'Forbidden: You are not assigned to this client' }, { status: 403 });
        }
      }

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
