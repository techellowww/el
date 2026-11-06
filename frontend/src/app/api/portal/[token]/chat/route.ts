import { NextResponse } from "next/server";
import { getClientMessages, postClientMessage } from "@/lib/server/chatService";

// GET /api/portal/[token]/chat -> Get messages for client
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const data = await getClientMessages(token);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load chat messages" },
      { status: 404 }
    );
  }
}

// POST /api/portal/[token]/chat -> Send message from client
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { content, projectId, attachmentUrl, attachmentName, attachmentSize } = body;

    if (!content?.trim() && !attachmentUrl) {
      return NextResponse.json(
        { error: "Message content or file attachment is required" },
        { status: 400 }
      );
    }

    const result = await postClientMessage({
      portalToken: token,
      content: content || attachmentName || "Attachment",
      projectId,
      attachmentUrl,
      attachmentName,
      attachmentSize,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Client chat error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to deliver message" },
      { status: 400 }
    );
  }
}

