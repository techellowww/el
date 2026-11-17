import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { editMessage, deleteMessage } from "@/lib/server/chatService";
import { prisma } from "@/lib/prisma";

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

// GET /api/chat/messages?conversationId=... -> Fetch messages for a conversation via HTTP
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    let targetClientId = "";
    let targetProjectId: string | null = null;
    let isInternalNote = false;

    if (conversationId === "general") {
      const generalClient = await getOrCreateGeneralClient(session.accountId, session.email);
      targetClientId = generalClient.id;
      targetProjectId = null;
      isInternalNote = true;
    } else {
      const proj = await prisma.project.findFirst({
        where: { id: conversationId, accountId: session.accountId },
      });
      if (proj) {
        targetClientId = proj.clientId;
        targetProjectId = proj.id;
        isInternalNote = false;
      } else {
        const client = await prisma.client.findFirst({
          where: { id: conversationId, accountId: session.accountId },
        });
        if (!client) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
        targetClientId = client.id;
        targetProjectId = null;
        isInternalNote = false;
      }
    }

    // Access control check for employees:
    if (session.role === "EMPLOYEE" && conversationId !== "general") {
      const assignment = await prisma.clientAssignment.findUnique({
        where: {
          clientId_userId: {
            clientId: targetClientId,
            userId: session.userId,
          },
        },
      });

      if (!assignment) {
        return NextResponse.json(
          { error: "Access denied: You are not assigned to this client conversation." },
          { status: 403 }
        );
      }
    }

    const rawMessages = await prisma.message.findMany({
      where: {
        accountId: session.accountId,
        clientId: targetClientId,
        projectId: targetProjectId,
        isInternalNote,
        isDeleted: false,
      },
      orderBy: { createdAt: "asc" },
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

    const messages = (rawMessages as any[]).map((m: any) => {
      const isClientMsg = m.senderType === "CLIENT";
      const senderName = isClientMsg
        ? m.clientSenderName || m.client?.name || "Client"
        : m.senderUser?.name || "Team Member";
      const senderRole = isClientMsg ? "CLIENT" : m.senderUser?.role || "EMPLOYEE";
      const senderId = isClientMsg ? m.clientId || "client" : m.senderUserId || "";

      return {
        id: m.id,
        conversationId,
        content: m.content,
        message: m.content,
        senderId,
        senderType: m.senderType as "TEAM" | "CLIENT",
        clientSenderName: m.clientSenderName || m.client?.name || null,
        sender: {
          id: senderId,
          name: senderName,
          role: senderRole,
          employeeId: "",
        },
        isEdited: !!m.editedAt,
        isDeleted: m.isDeleted,
        createdAt: m.createdAt.toISOString(),
      };
    });

    // Mark as read for this user
    await prisma.messageRead.upsert({
      where: {
        clientId_userId: {
          clientId: targetClientId,
          userId: session.userId,
        },
      },
      create: {
        accountId: session.accountId,
        clientId: targetClientId,
        userId: session.userId,
        isClient: false,
        lastReadAt: new Date(),
      },
      update: {
        lastReadAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      conversationId,
      messages,
    });
  } catch (err: any) {
    console.error("Failed to load messages:", err);
    return NextResponse.json({ error: err.message || "Failed to load messages" }, { status: 500 });
  }
}

// POST /api/chat/messages -> Send message via HTTP
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { conversationId, content, attachmentUrl, attachmentName } = body || {};

    if (!conversationId || (!content?.trim() && !attachmentUrl)) {
      return NextResponse.json(
        { error: "conversationId and content are required." },
        { status: 400 }
      );
    }

    let targetClientId = "";
    let targetProjectId: string | null = null;
    let isInternalNote = false;

    if (conversationId === "general") {
      const generalClient = await getOrCreateGeneralClient(session.accountId, session.email);
      targetClientId = generalClient.id;
      targetProjectId = null;
      isInternalNote = true;
    } else {
      const proj = await prisma.project.findFirst({
        where: { id: conversationId, accountId: session.accountId },
      });
      if (proj) {
        targetClientId = proj.clientId;
        targetProjectId = proj.id;
        isInternalNote = false;
      } else {
        const client = await prisma.client.findFirst({
          where: { id: conversationId, accountId: session.accountId },
        });
        if (!client) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
        targetClientId = client.id;
        targetProjectId = null;
        isInternalNote = false;
      }
    }

    // Access control check for employees:
    if (session.role === "EMPLOYEE" && conversationId !== "general") {
      const assignment = await prisma.clientAssignment.findUnique({
        where: {
          clientId_userId: {
            clientId: targetClientId,
            userId: session.userId,
          },
        },
      });

      if (!assignment) {
        return NextResponse.json(
          { error: "Access denied: You are not assigned to this client conversation." },
          { status: 403 }
        );
      }
    }

    const createdMsg = await prisma.message.create({
      data: {
        accountId: session.accountId,
        clientId: targetClientId,
        projectId: targetProjectId,
        senderType: "TEAM",
        senderUserId: session.userId,
        content: content ? content.trim() : attachmentName || "Attachment",
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
      senderId: session.userId,
      sender: {
        id: session.userId,
        name: session.name,
        role: session.role,
        employeeId: "",
      },
      isEdited: false,
      isDeleted: false,
      createdAt: createdMsg.createdAt.toISOString(),
    };

    // Mark as read for sender
    await prisma.messageRead.upsert({
      where: {
        clientId_userId: {
          clientId: targetClientId,
          userId: session.userId,
        },
      },
      create: {
        accountId: session.accountId,
        clientId: targetClientId,
        userId: session.userId,
        isClient: false,
        lastReadAt: new Date(),
      },
      update: {
        lastReadAt: new Date(),
      },
    });

    // Broadcast to chat server if configured/reachable
    try {
      const chatServerUrl =
        process.env.CHAT_SERVER_URL ||
        process.env.NEXT_PUBLIC_CHAT_SERVER_URL ||
        "http://localhost:5001";
      fetch(`${chatServerUrl}/api/internal/chat/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: session.accountId,
          conversationId,
          message: messageItem,
        }),
      }).catch(() => {});
    } catch {}

    return NextResponse.json({
      success: true,
      message: messageItem,
    });
  } catch (err: any) {
    console.error("Failed to send message:", err);
    return NextResponse.json({ error: err.message || "Failed to send message" }, { status: 500 });
  }
}

// PATCH /api/chat/messages -> Edit message (with 5-minute restriction)
export async function PATCH(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const messageId = body.messageId || body.id;
    const newContent = body.newContent || body.content;

    if (!messageId || !newContent?.trim()) {
      return NextResponse.json({ error: "Message ID and content are required" }, { status: 400 });
    }

    const updated = await editMessage({
      messageId,
      accountId: session.accountId,
      userId: session.userId,
      isAdmin: session.role === "ADMIN",
      newContent: newContent.trim(),
    });

    return NextResponse.json({ message: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to edit message" }, { status: 400 });
  }
}

// DELETE /api/chat/messages -> Soft delete message
export async function DELETE(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id") || searchParams.get("messageId");

    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    await deleteMessage(messageId, session.accountId, session.userId, session.role === "ADMIN");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete message" }, { status: 400 });
  }
}
