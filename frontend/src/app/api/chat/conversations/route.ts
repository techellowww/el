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

// GET /api/chat/conversations -> Returns list of conversations accessible to the user with unread counts & last messages
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);

    // Query accessible clients and projects for this tenant account
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
      orderBy: { name: 'asc' },
      include: {
        projects: {
          orderBy: { name: 'asc' },
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

    const conversationList: any[] = [];

    // 1. General Team Chat channel
    const generalLastMsg = await prisma.message.findFirst({
      where: {
        accountId: user.accountId,
        clientId: generalClient.id,
        projectId: null,
        isInternalNote: true,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      include: { senderUser: { select: { id: true, name: true, role: true } } },
    });

    const generalCount = await prisma.message.count({
      where: {
        accountId: user.accountId,
        clientId: generalClient.id,
        projectId: null,
        isInternalNote: true,
        isDeleted: false,
      },
    });

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

    conversationList.push({
      id: 'general',
      name: 'General Team Chat',
      title: 'General Team Chat',
      type: 'GENERAL',
      projectId: null,
      lastMessage: generalLastMsg
        ? {
            id: generalLastMsg.id,
            conversationId: 'general',
            content: generalLastMsg.content,
            message: generalLastMsg.content,
            senderId: generalLastMsg.senderUserId || '',
            senderType: generalLastMsg.senderType,
            clientSenderName: generalLastMsg.clientSenderName,
            sender: {
              id: generalLastMsg.senderUser?.id || '',
              name: generalLastMsg.senderUser?.name || 'Team Member',
              role: generalLastMsg.senderUser?.role || 'EMPLOYEE',
              employeeId: '',
            },
            isEdited: !!generalLastMsg.editedAt,
            isDeleted: generalLastMsg.isDeleted,
            createdAt: generalLastMsg.createdAt.toISOString(),
          }
        : null,
      totalMessages: generalCount,
      unreadCount: generalUnread,
      updatedAt: generalLastMsg?.createdAt.toISOString() || new Date().toISOString(),
    });

    // 2. Client Channels
    for (const client of accessibleClients) {
      const clientLastMsg = await prisma.message.findFirst({
        where: {
          accountId: user.accountId,
          clientId: client.id,
          projectId: null,
          isInternalNote: false,
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          senderUser: { select: { id: true, name: true, role: true } },
          client: { select: { id: true, name: true, company: true } },
        },
      });

      const clientMsgCount = await prisma.message.count({
        where: {
          accountId: user.accountId,
          clientId: client.id,
          projectId: null,
          isInternalNote: false,
          isDeleted: false,
        },
      });

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

      const isClientLast = clientLastMsg?.senderType === 'CLIENT';
      const clientSenderName = isClientLast
        ? (clientLastMsg?.clientSenderName || clientLastMsg?.client?.name || client.name)
        : (clientLastMsg?.senderUser?.name || 'Team Member');
      const clientSenderRole = isClientLast ? 'CLIENT' : (clientLastMsg?.senderUser?.role || 'EMPLOYEE');
      const clientSenderId = isClientLast ? client.id : (clientLastMsg?.senderUserId || '');

      conversationList.push({
        id: client.id,
        name: client.name,
        title: client.name + (client.company ? ` (${client.company})` : ''),
        type: 'CLIENT',
        projectId: null,
        lastMessage: clientLastMsg
          ? {
              id: clientLastMsg.id,
              conversationId: client.id,
              content: clientLastMsg.content,
              message: clientLastMsg.content,
              senderId: clientSenderId,
              senderType: clientLastMsg.senderType,
              clientSenderName: clientLastMsg.clientSenderName || client.name,
              sender: {
                id: clientSenderId,
                name: clientSenderName,
                role: clientSenderRole,
                employeeId: '',
              },
              isEdited: !!clientLastMsg.editedAt,
              isDeleted: clientLastMsg.isDeleted,
              createdAt: clientLastMsg.createdAt.toISOString(),
            }
          : null,
        totalMessages: clientMsgCount,
        unreadCount: clientUnread,
        updatedAt: clientLastMsg?.createdAt.toISOString() || client.updatedAt.toISOString(),
      });

      // 3. Project Channels under this Client
      for (const proj of client.projects) {
        const projLastMsg = await prisma.message.findFirst({
          where: {
            accountId: user.accountId,
            projectId: proj.id,
            isDeleted: false,
          },
          orderBy: { createdAt: 'desc' },
          include: {
            senderUser: { select: { id: true, name: true, role: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        });

        const projMsgCount = await prisma.message.count({
          where: {
            accountId: user.accountId,
            projectId: proj.id,
            isDeleted: false,
          },
        });

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

        const isProjClientLast = projLastMsg?.senderType === 'CLIENT';
        const projSenderName = isProjClientLast
          ? (projLastMsg?.clientSenderName || projLastMsg?.client?.name || client.name)
          : (projLastMsg?.senderUser?.name || 'Team Member');
        const projSenderRole = isProjClientLast ? 'CLIENT' : (projLastMsg?.senderUser?.role || 'EMPLOYEE');
        const projSenderId = isProjClientLast ? client.id : (projLastMsg?.senderUserId || '');

        conversationList.push({
          id: proj.id,
          name: proj.name,
          title: `${proj.name} [${client.name}]`,
          type: 'PROJECT',
          projectId: proj.id,
          lastMessage: projLastMsg
            ? {
                id: projLastMsg.id,
                conversationId: proj.id,
                content: projLastMsg.content,
                message: projLastMsg.content,
                senderId: projSenderId,
                senderType: projLastMsg.senderType,
                clientSenderName: projLastMsg.clientSenderName || client.name,
                sender: {
                  id: projSenderId,
                  name: projSenderName,
                  role: projSenderRole,
                  employeeId: '',
                },
                isEdited: !!projLastMsg.editedAt,
                isDeleted: projLastMsg.isDeleted,
                createdAt: projLastMsg.createdAt.toISOString(),
              }
            : null,
          totalMessages: projMsgCount,
          unreadCount: projUnread,
          updatedAt: projLastMsg?.createdAt.toISOString() || proj.updatedAt.toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      conversations: conversationList,
    });
  } catch (err: any) {
    console.error('Failed to get conversations:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch conversations' }, { status: 500 });
  }
}

