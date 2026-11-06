import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessibleClients, requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { generateSecureToken, hashToken } from "@/lib/auth/token";

// GET /api/clients
// Admin sees all clients in account, Employee sees only assigned clients
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getAccessibleClients(session);
  return NextResponse.json({ clients });
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
    const { name, company, email, phone, notes, assignedUserIds } = body;

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

    const client = await prisma.client.create({
      data: {
        accountId: session.accountId,
        name,
        company: company || null,
        email,
        phone: phone || null,
        notes: notes || null,
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

    return NextResponse.json({
      client,
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
