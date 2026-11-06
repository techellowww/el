import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { editMessage, deleteMessage } from "@/lib/server/chatService";

// PATCH /api/chat/messages -> Edit message (with 5-minute restriction)
export async function PATCH(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { messageId, newContent } = body;

    if (!messageId || !newContent?.trim()) {
      return NextResponse.json({ error: "Message ID and content are required" }, { status: 400 });
    }

    const updated = await editMessage({
      messageId,
      accountId: session.accountId,
      userId: session.userId,
      isAdmin: session.role === "ADMIN",
      newContent,
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
    const messageId = searchParams.get("id");

    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    await deleteMessage(messageId, session.accountId, session.userId, session.role === "ADMIN");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete message" }, { status: 400 });
  }
}

