import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'el_app_super_secure_jwt_secret_key_2026_xyz_production_ready';

export interface AuthenticatedUser {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export interface SocketData {
  user: AuthenticatedUser;
}

// Map of userId -> { user: AuthenticatedUser, socketCount: number }
const onlineUsers = new Map<string, { user: AuthenticatedUser; socketCount: number }>();
let ioInstance: SocketIOServer | null = null;

export function getSocketIOInstance(): SocketIOServer | null {
  return ioInstance;
}

export function broadcastChatMessage(accountId: string, conversationId: string, messageItem: any) {
  if (!ioInstance) return false;
  const roomName = `conv:${conversationId}`;
  ioInstance.to(roomName).to(`admin:${accountId}`).emit('new_message', {
    conversationId,
    message: messageItem,
  });
  return true;
}

function getOnlineUserList() {
  return Array.from(onlineUsers.values()).map(({ user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: '',
  }));
}

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

async function markConversationAsRead(accountId: string, userId: string, conversationId: string) {
  try {
    if (!conversationId) return;
    let targetClientId: string | null = null;
    if (conversationId === 'general') {
      const generalClient = await getOrCreateGeneralClient(accountId);
      targetClientId = generalClient.id;
    } else {
      const proj = await prisma.project.findFirst({
        where: { id: conversationId, accountId },
      });
      if (proj) {
        targetClientId = proj.clientId;
      } else {
        const client = await prisma.client.findFirst({
          where: { id: conversationId, accountId },
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
            userId,
          },
        },
        create: {
          accountId,
          clientId: targetClientId,
          userId,
          isClient: false,
          lastReadAt: new Date(),
        },
        update: {
          lastReadAt: new Date(),
        },
      });
    }
  } catch (err: any) {
    console.warn('[markConversationAsRead error]:', err.message);
  }
}

export function initChatSocketServer(httpServer: HttpServer) {
  const allowedOrigins = [
    process.env.CLIENT_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean) as string[];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        try {
          const url = new URL(origin);
          if (
            allowedOrigins.includes(origin) ||
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname.endsWith('.vercel.app')
          ) {
            return callback(null, true);
          }
        } catch {}
        return callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  ioInstance = io;

  // Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      let token =
        auth.token ||
        auth.sessionToken ||
        (socket.handshake.headers.authorization &&
          socket.handshake.headers.authorization.replace('Bearer ', '')) ||
        socket.handshake.query?.token;

      // Also try reading from cookies if token not in auth object
      if (!token && socket.handshake.headers.cookie) {
        const cookies = socket.handshake.headers.cookie.split(';').map((c) => c.trim());
        for (const cookie of cookies) {
          if (cookie.startsWith('ch_session=')) {
            token = decodeURIComponent(cookie.substring('ch_session='.length));
            break;
          }
          if (cookie.startsWith('el_token=')) {
            token = decodeURIComponent(cookie.substring('el_token='.length));
            break;
          }
        }
      }

      if (!token || typeof token !== 'string') {
        return next(new Error('Unauthorized: Authentication token is required'));
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (jwtErr) {
        console.error('[Socket Auth JWT Error]:', jwtErr);
        return next(new Error('Unauthorized: Invalid or expired session token'));
      }

      const userId = decoded?.id || decoded?.userId;
      if (!decoded || !userId) {
        return next(new Error('Unauthorized: Malformed token payload'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return next(new Error('Forbidden: Account not found or deactivated'));
      }

      socket.data.user = {
        id: user.id,
        accountId: user.accountId,
        email: user.email,
        name: user.name,
        role: user.role as 'ADMIN' | 'EMPLOYEE',
      };

      next();
    } catch (err: any) {
      console.error('[Socket Auth Error]:', err.message);
      next(new Error('Unauthorized: Authentication failed'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as AuthenticatedUser;
    if (!user) {
      socket.disconnect();
      return;
    }

    console.log(`🔌 [Socket.io Connected] ${user.name} (${user.email}, ${user.role}) - Socket ID: ${socket.id}`);

    // Join account-wide and personal room
    socket.join(`account:${user.accountId}`);
    socket.join(`user:${user.id}`);
    socket.join('conv:general');

    // Admins join an account-level admin room so they receive all client channel messages in real-time
    if (user.role === 'ADMIN') {
      socket.join(`admin:${user.accountId}`);
    }

    // Track online presence
    const existing = onlineUsers.get(user.id);
    if (existing) {
      existing.socketCount += 1;
    } else {
      onlineUsers.set(user.id, { user, socketCount: 1 });
      io.emit('user_online', {
        id: user.id,
        name: user.name,
        role: user.role,
        employeeId: '',
      });
    }

    // Send initial list of online users to the connected socket
    socket.emit('presence_list', { onlineUsers: getOnlineUserList() });
    io.emit('presence_update', { count: onlineUsers.size, onlineUsers: getOnlineUserList() });

    // 1. Get Available Conversations with unread counts
    socket.on('get_conversations', async (ack?: (data: any) => void) => {
      try {
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

        const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);

        // Leave any previously joined client/project conversation rooms before re-joining current accessible channels
        const existingRooms = Array.from(socket.rooms);
        for (const r of existingRooms) {
          if (r.startsWith('conv:') && r !== 'conv:general') {
            socket.leave(r);
          }
        }

        // Auto-join socket to all accessible channels so background notifications arrive
        socket.join('conv:general');
        for (const client of accessibleClients) {
          socket.join(`conv:${client.id}`);
          for (const proj of client.projects) {
            socket.join(`conv:${proj.id}`);
          }
        }

        // Fetch user's message read receipts
        const userReads = await prisma.messageRead.findMany({
          where: { accountId: user.accountId, userId: user.id },
        });
        const readMap = new Map<string, Date>();
        userReads.forEach((r) => {
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
                senderId: generalLastMsg.senderUserId,
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

        if (typeof ack === 'function') {
          ack({ success: true, conversations: conversationList });
        } else {
          socket.emit('conversations_list', { conversations: conversationList });
        }
      } catch (err: any) {
        console.error('[Socket get_conversations error]:', err);
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    });

    // 2. Join Conversation Room
    socket.on('join_room', async ({ conversationId }: { conversationId: string }, ack?: (data: any) => void) => {
      try {
        if (!conversationId) {
          socket.emit('error', { message: 'conversationId is required' });
          return;
        }

        // Employee access control: only staff assigned to this client can join/view
        if (user.role === 'EMPLOYEE' && conversationId !== 'general') {
          let targetClientId = conversationId;
          const proj = await prisma.project.findFirst({
            where: { id: conversationId, accountId: user.accountId },
            select: { clientId: true },
          });
          if (proj) {
            targetClientId = proj.clientId;
          } else {
            const client = await prisma.client.findFirst({
              where: { id: conversationId, accountId: user.accountId },
              select: { id: true },
            });
            if (!client) {
              if (typeof ack === 'function') ack({ success: false, error: 'Channel not found' });
              socket.emit('error', { message: 'Channel not found' });
              return;
            }
          }

          const assignment = await prisma.clientAssignment.findUnique({
            where: {
              clientId_userId: {
                clientId: targetClientId,
                userId: user.id,
              },
            },
          });

          if (!assignment) {
            const errorMsg = 'Access denied: You are not assigned to this client.';
            if (typeof ack === 'function') ack({ success: false, error: errorMsg });
            socket.emit('error', { message: errorMsg });
            return;
          }
        }

        const roomName = `conv:${conversationId}`;
        socket.join(roomName);

        // Mark this conversation as read
        await markConversationAsRead(user.accountId, user.id, conversationId);

        // Fetch recent messages
        let messageWhere: any = {
          accountId: user.accountId,
          isDeleted: false,
        };

        if (conversationId === 'general') {
          const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);
          messageWhere.clientId = generalClient.id;
          messageWhere.projectId = null;
          messageWhere.isInternalNote = true;
        } else {
          // Check if it's a project
          const proj = await prisma.project.findFirst({
            where: { id: conversationId, accountId: user.accountId },
          });
          if (proj) {
            messageWhere.projectId = proj.id;
          } else {
            // It's a client channel
            messageWhere.clientId = conversationId;
            messageWhere.projectId = null;
            messageWhere.isInternalNote = false;
          }
        }

        const rawMessages = await prisma.message.findMany({
          where: messageWhere,
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: {
            senderUser: {
              select: { id: true, name: true, role: true },
            },
            client: {
              select: { id: true, name: true, company: true },
            },
          },
        });

        const formattedMessages = rawMessages.map((m) => {
          const isClientMsg = m.senderType === 'CLIENT';
          const senderName = isClientMsg
            ? (m.clientSenderName || m.client?.name || 'Client')
            : (m.senderUser?.name || 'Team Member');
          const senderRole = isClientMsg ? 'CLIENT' : (m.senderUser?.role || 'EMPLOYEE');
          const senderId = isClientMsg ? (m.clientId || 'client') : (m.senderUserId || '');

          return {
            id: m.id,
            conversationId,
            content: m.content,
            message: m.content,
            senderId,
            senderType: m.senderType as 'TEAM' | 'CLIENT',
            clientSenderName: m.clientSenderName || m.client?.name || null,
            sender: {
              id: senderId,
              name: senderName,
              role: senderRole,
              employeeId: '',
            },
            isEdited: !!m.editedAt,
            isDeleted: m.isDeleted,
            createdAt: m.createdAt.toISOString(),
          };
        });

        const historyPayload = {
          conversationId,
          messages: formattedMessages,
        };

        if (typeof ack === 'function') {
          ack({ success: true, ...historyPayload });
        }
        socket.emit('chat_history', historyPayload);
      } catch (err: any) {
        console.error('[Socket join_room error]:', err);
        socket.emit('error', { message: err.message || 'Failed to join conversation room' });
      }
    });

    // 3. Send Message
    socket.on(
      'send_message',
      async (
        data: {
          conversationId: string;
          content: string;
          attachmentUrl?: string;
          attachmentName?: string;
        },
        ack?: (data: any) => void
      ) => {
        try {
          const { conversationId, content, attachmentUrl, attachmentName } = data || {};

          if (!conversationId || (!content?.trim() && !attachmentUrl)) {
            socket.emit('error', { message: 'Message content or attachment is required.' });
            return;
          }

          let targetClientId = '';
          let targetProjectId: string | null = null;
          let isInternalNote = false;

          if (conversationId === 'general') {
            const generalClient = await getOrCreateGeneralClient(user.accountId, user.email);
            targetClientId = generalClient.id;
            targetProjectId = null;
            isInternalNote = true;
          } else {
            const proj = await prisma.project.findFirst({
              where: { id: conversationId, accountId: user.accountId },
            });
            if (proj) {
              targetClientId = proj.clientId;
              targetProjectId = proj.id;
              isInternalNote = false;
            } else {
              const client = await prisma.client.findFirst({
                where: { id: conversationId, accountId: user.accountId },
              });
              if (!client) {
                socket.emit('error', { message: 'Channel not found' });
                return;
              }
              targetClientId = client.id;
              targetProjectId = null;
              isInternalNote = false;
            }
          }

          // Employee access control: unassigned employees cannot post messages to this client
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
              const errorMsg = 'Access denied: You are not assigned to this client conversation.';
              if (typeof ack === 'function') ack({ success: false, error: errorMsg });
              socket.emit('error', { message: errorMsg });
              return;
            }
          }

          const createdMsg = await prisma.message.create({
            data: {
              accountId: user.accountId,
              clientId: targetClientId,
              projectId: targetProjectId,
              senderType: 'TEAM',
              senderUserId: user.id,
              content: content ? content.trim() : attachmentName || 'Attachment',
              attachmentUrl: attachmentUrl || null,
              attachmentName: attachmentName || null,
              isInternalNote,
            },
            include: {
              senderUser: {
                select: { id: true, name: true, role: true },
              },
            },
          });

          const messageItem = {
            id: createdMsg.id,
            conversationId,
            content: createdMsg.content,
            message: createdMsg.content,
            senderId: user.id,
            sender: {
              id: user.id,
              name: user.name,
              role: user.role,
              employeeId: '',
            },
            isEdited: false,
            isDeleted: false,
            createdAt: createdMsg.createdAt.toISOString(),
          };

          const roomName = `conv:${conversationId}`;
          io.to(roomName).to(`admin:${user.accountId}`).emit('new_message', {
            conversationId,
            message: messageItem,
          });

          // Sender automatically marks conversation as read
          await markConversationAsRead(user.accountId, user.id, conversationId);

          if (typeof ack === 'function') {
            ack({ success: true, message: messageItem });
          }
        } catch (err: any) {
          console.error('[Socket send_message error]:', err);
          socket.emit('error', { message: err.message || 'Failed to deliver message' });
        }
      }
    );

    // Mark Conversation as Read
    socket.on(
      'mark_read',
      async ({ conversationId }: { conversationId: string }, ack?: (data: any) => void) => {
        try {
          if (user.role === 'EMPLOYEE' && conversationId !== 'general') {
            let targetClientId = conversationId;
            const proj = await prisma.project.findFirst({
              where: { id: conversationId, accountId: user.accountId },
              select: { clientId: true },
            });
            if (proj) {
              targetClientId = proj.clientId;
            }
            const assignment = await prisma.clientAssignment.findUnique({
              where: {
                clientId_userId: {
                  clientId: targetClientId,
                  userId: user.id,
                },
              },
            });
            if (!assignment) {
              if (typeof ack === 'function') ack({ success: false, error: 'Access denied' });
              return;
            }
          }
          await markConversationAsRead(user.accountId, user.id, conversationId);
          if (typeof ack === 'function') ack({ success: true, conversationId });
        } catch (err: any) {
          console.error('[Socket mark_read error]:', err);
          if (typeof ack === 'function') ack({ success: false, error: err.message });
        }
      }
    );

    // 4. Typing Indicator
    socket.on(
      'typing',
      async ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
        if (!conversationId) return;
        if (user.role === 'EMPLOYEE' && conversationId !== 'general') {
          let targetClientId = conversationId;
          const proj = await prisma.project.findFirst({
            where: { id: conversationId, accountId: user.accountId },
            select: { clientId: true },
          });
          if (proj) {
            targetClientId = proj.clientId;
          }
          const assignment = await prisma.clientAssignment.findUnique({
            where: {
              clientId_userId: {
                clientId: targetClientId,
                userId: user.id,
              },
            },
          });
          if (!assignment) return;
        }
        const roomName = `conv:${conversationId}`;
        socket.to(roomName).emit('user_typing', {
          conversationId,
          userId: user.id,
          userName: user.name,
          isTyping: Boolean(isTyping),
        });
      }
    );

    // 5. Edit Message (Author only)
    socket.on(
      'edit_message',
      async (
        { messageId, newContent }: { messageId: string; newContent: string },
        ack?: (data: any) => void
      ) => {
        try {
          const message = await prisma.message.findFirst({
            where: { id: messageId, accountId: user.accountId },
          });

          if (!message || message.isDeleted) {
            socket.emit('error', { message: 'Message not found or deleted' });
            return;
          }

          if (message.senderUserId !== user.id && user.role !== 'ADMIN') {
            socket.emit('error', { message: 'You can only edit your own messages' });
            return;
          }

          const updated = await prisma.message.update({
            where: { id: messageId },
            data: {
              content: newContent.trim(),
              editedAt: new Date(),
            },
            include: {
              senderUser: {
                select: { id: true, name: true, role: true },
              },
            },
          });

          const convId = updated.isInternalNote && !updated.projectId ? 'general' : (updated.projectId || updated.clientId);
          const messageItem = {
            id: updated.id,
            conversationId: convId,
            content: updated.content,
            message: updated.content,
            senderId: updated.senderUserId || '',
            sender: {
              id: updated.senderUser?.id || '',
              name: updated.senderUser?.name || 'User',
              role: updated.senderUser?.role || 'EMPLOYEE',
              employeeId: '',
            },
            isEdited: true,
            isDeleted: false,
            createdAt: updated.createdAt.toISOString(),
          };

          io.to(`conv:${convId}`).to(`admin:${user.accountId}`).emit('message_updated', {
            conversationId: convId,
            message: messageItem,
          });

          if (typeof ack === 'function') ack({ success: true, message: messageItem });
        } catch (err: any) {
          console.error('[Socket edit_message error]:', err);
          socket.emit('error', { message: err.message || 'Failed to edit message' });
        }
      }
    );

    // 6. Delete Message (Author or Admin)
    socket.on(
      'delete_message',
      async ({ messageId }: { messageId: string }, ack?: (data: any) => void) => {
        try {
          const message = await prisma.message.findFirst({
            where: { id: messageId, accountId: user.accountId },
          });

          if (!message || message.isDeleted) {
            socket.emit('error', { message: 'Message not found' });
            return;
          }

          if (message.senderUserId !== user.id && user.role !== 'ADMIN') {
            socket.emit('error', { message: 'Unauthorized to delete this message' });
            return;
          }

          await prisma.message.update({
            where: { id: messageId },
            data: { isDeleted: true },
          });

          const convId = message.isInternalNote && !message.projectId ? 'general' : (message.projectId || message.clientId);
          io.to(`conv:${convId}`).to(`admin:${user.accountId}`).emit('message_deleted', {
            conversationId: convId,
            messageId,
          });

          if (typeof ack === 'function') ack({ success: true, messageId });
        } catch (err: any) {
          console.error('[Socket delete_message error]:', err);
          socket.emit('error', { message: err.message || 'Failed to delete message' });
        }
      }
    );

    // 7. Disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 [Socket.io Disconnected] ${user.name} - Socket ID: ${socket.id}`);
      const entry = onlineUsers.get(user.id);
      if (entry) {
        entry.socketCount -= 1;
        if (entry.socketCount <= 0) {
          onlineUsers.delete(user.id);
          io.emit('user_offline', { id: user.id });
          io.emit('presence_update', { count: onlineUsers.size, onlineUsers: getOnlineUserList() });
        }
      }
    });
  });

  return io;
}
