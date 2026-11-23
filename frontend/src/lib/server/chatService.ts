import { prisma } from "../prisma";
import { getClientByPortalToken } from "../auth/access";

// Rate limiting in-memory store: Map<identifier, timestamp[]>
const postRateLimitMap = new Map<string, number[]>();

export function checkChatRateLimit(identifier: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const windowStart = now - 60000;
  const timestamps = (postRateLimitMap.get(identifier) || []).filter((t) => t > windowStart);

  if (timestamps.length >= maxPerMinute) {
    return false; // Rate limit exceeded!
  }

  timestamps.push(now);
  postRateLimitMap.set(identifier, timestamps);
  return true;
}

/**
 * Client-facing chat access via portal token:
 * - Identifies client by portal token without login
 * - Name taken from client record, never typed in
 * - Rate limit: 20 msgs / min
 */
export async function postClientMessage(params: {
  portalToken: string;
  content: string;
  projectId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
}) {
  const client = await getClientByPortalToken(params.portalToken);

  // Rate limit by client ID
  if (!checkChatRateLimit(`client:${client.id}`, 20)) {
    throw new Error("Rate limit exceeded. You may only post up to 20 messages per minute.");
  }

  if (params.attachmentSize && params.attachmentSize > 10 * 1024 * 1024) {
    throw new Error("File attachment exceeds 10 MB limit.");
  }

  // Ensure project strictly belongs to this client and account
  let validProjectId: string | null = null;
  if (params.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: params.projectId, clientId: client.id, accountId: client.accountId },
      select: { id: true },
    });
    if (proj) validProjectId = proj.id;
  }

  const message = await prisma.message.create({
    data: {
      accountId: client.accountId,
      clientId: client.id,
      projectId: validProjectId,
      senderType: "CLIENT",
      clientSenderName: client.name,
      content: params.content.trim(),
      attachmentUrl: params.attachmentUrl || null,
      attachmentName: params.attachmentName || null,
      attachmentSize: params.attachmentSize || null,
      isInternalNote: false,
    },
  });

  // Real-time broadcast to agency team via chat server
  const conversationId = validProjectId || client.id;
  const messageItem = {
    id: message.id,
    conversationId,
    content: message.content,
    message: message.content,
    senderId: client.id,
    senderType: 'CLIENT' as const,
    clientSenderName: client.name,
    sender: {
      id: client.id,
      name: client.name,
      role: 'CLIENT',
      employeeId: '',
    },
    isEdited: false,
    isDeleted: false,
    createdAt: message.createdAt.toISOString(),
  };

  try {
    const chatServerUrl = process.env.CHAT_SERVER_URL || process.env.NEXT_PUBLIC_CHAT_SERVER_URL || 'http://localhost:5001';
    fetch(`${chatServerUrl}/api/internal/chat/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: client.accountId,
        conversationId,
        message: messageItem,
      }),
    }).catch(() => {});
  } catch {}

  return { message, client };
}

/**
 * Get chat messages for a client portal token:
 * Client only sees non-internal, non-deleted messages
 */
export async function getClientMessages(portalToken: string) {
  const client = await getClientByPortalToken(portalToken);

  const messages = await prisma.message.findMany({
    where: {
      accountId: client.accountId,
      clientId: client.id,
      isInternalNote: false,
    },
    orderBy: { createdAt: "asc" },
    include: {
      senderUser: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  return {
    client: {
      id: client.id,
      name: client.name,
      company: client.company,
      projects: client.projects,
    },
    messages: messages.map((m: any) => ({
      id: m.id,
      content: m.isDeleted ? "This message was deleted." : m.content,
      isDeleted: m.isDeleted,
      senderType: m.senderType,
      senderName: m.senderType === "CLIENT" ? m.clientSenderName || client.name : m.senderUser?.name || "Agency Team",
      attachmentUrl: m.isDeleted ? null : m.attachmentUrl,
      attachmentName: m.attachmentName,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    })),
  };
}

/**
 * Staff edit message:
 * Per Section 9: "Allow editing for 5 minutes after sending."
 */
export async function editMessage(params: {
  messageId: string;
  accountId: string;
  userId: string;
  isAdmin: boolean;
  newContent: string;
}) {
  const message = await prisma.message.findFirst({
    where: { id: params.messageId, accountId: params.accountId },
  });

  if (!message || message.isDeleted) {
    throw new Error("Message not found or has been deleted.");
  }

  if (message.senderUserId !== params.userId && !params.isAdmin) {
    throw new Error("You can only edit your own messages.");
  }

  // 5-MINUTE EDIT LIMIT (Section 9)
  const diffMinutes = (Date.now() - new Date(message.createdAt).getTime()) / 60000;
  if (diffMinutes > 5 && !params.isAdmin) {
    throw new Error("Messages can only be edited within 5 minutes of sending.");
  }

  const updated = await prisma.message.update({
    where: { id: params.messageId },
    data: {
      content: params.newContent.trim(),
      editedAt: new Date(),
    },
  });

  return updated;
}

/**
 * Soft delete: hides message but keeps in database (Section 9)
 */
export async function deleteMessage(messageId: string, accountId: string, userId: string, isAdmin: boolean) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, accountId },
  });

  if (!message) throw new Error("Message not found");
  if (message.senderUserId !== userId && !isAdmin) {
    throw new Error("You can only delete your own messages");
  }

  return prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true },
  });
}

