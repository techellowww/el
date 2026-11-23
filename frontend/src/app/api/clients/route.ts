import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessibleClients, requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { generateSecureToken, hashToken } from "@/lib/auth/token";
import { getServerCache, setServerCache, invalidateServerCache } from "@/lib/server/apiServerCache";

export function invalidateClientsCache(accountId: string) {
  invalidateServerCache(`clients:${accountId}`);
}

export function extractClientChatLink(c: any): string | null {
  if (c?.chatLink) return c.chatLink;
  if (!c?.notes) return null;
  const match = c.notes.match(/(?:\[Chat Link\]|Chat Link|chatLink):\s*(https?:\/\/\S+|\S+)/i);
  return match ? match[1].trim() : null;
}

// GET /api/clients
// Admin sees all clients in account, Employee sees only assigned clients
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `clients:${session.accountId}:${session.role}:${session.role === "EMPLOYEE" ? session.userId : "all"}`;
  const cached = getServerCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const clients = await getAccessibleClients(session);
  const enrichedClients = clients.map((c: any) => ({
    ...c,
    chatLink: (c as any).chatLink || extractClientChatLink(c),
  }));
  const responseData = { clients: enrichedClients };
  setServerCache(cacheKey, responseData, 30000);
  return NextResponse.json(responseData);
}

// POST /api/clients (Admin only)
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, company, email, phone, notes, chatLink, assignedUserIds } = body;

    if (company === "__INTERNAL_GENERAL_TEAM__") {
      return NextResponse.json(
        { error: "Reserved company name cannot be used" },
        { status: 400 }
      );
    }

    if (!name || !email) {
      return NextResponse.json(
        { error: "Client name and email are required" },
        { status: 400 }
      );
    }

    // Generate random 64-char private portal token and hash it
    const rawPortalToken = "ch_live_" + generateSecureToken(32);
    const tokenHash = hashToken(rawPortalToken);

    let storedNotes = notes ? notes.trim() : "";
    if (chatLink && typeof chatLink === "string" && chatLink.trim()) {
      const linkTag = `[Chat Link]: ${chatLink.trim()}`;
      storedNotes = storedNotes ? `${storedNotes}\n${linkTag}` : linkTag;
    }

    const client = await prisma.client.create({
      data: {
        accountId: session.accountId,
        name,
        company: company || null,
        email,
        phone: phone || null,
        notes: storedNotes || null,
        portalTokenHash: tokenHash,
        portalTokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
        assignments: {
          create: Array.isArray(assignedUserIds)
            ? assignedUserIds.map((userId: string) => ({
                accountId: session.accountId,
                userId,
              }))
            : [],
        },
      },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (chatLink && typeof chatLink === "string" && chatLink.trim()) {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE ch_clients SET "chatLink" = $1 WHERE id = $2',
          chatLink.trim(),
          client.id
        );
      } catch {}
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        action: "CREATE",
        entityType: "CLIENT",
        entityId: client.id,
        details: JSON.stringify({ name: client.name, email: client.email }),
      },
    });

    invalidateClientsCache(session.accountId);

    return NextResponse.json({
      client: {
        ...client,
        chatLink: chatLink?.trim() || null,
      },
      rawPortalToken, // Returned once upon creation so admin can copy the client link
      portalUrl: `/portal/${rawPortalToken}`,
    });
  } catch (error: any) {
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
