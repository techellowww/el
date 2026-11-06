import { NextResponse } from "next/server";
import { getClientByPortalToken, NotFoundError } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const client = await getClientByPortalToken(token);

    // Fetch published proposals & invoices for this client
    const [proposals, invoices] = await Promise.all([
      prisma.proposal.findMany({
        where: {
          clientId: client.id,
          status: { in: ["SENT", "SIGNED", "DECLINED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          tokenHash: true,
          sentAt: true,
          expiresAt: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          clientId: client.id,
          status: { in: ["SENT", "PAID"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumberDisplay: true,
          status: true,
          totalCents: true,
          currency: true,
          dueDate: true,
          tokenHash: true,
          sentAt: true,
          paidAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        agency: {
          name: client.account.name,
          currency: client.account.currency,
          logoUrl: client.account.logoUrl,
        },
        projects: client.projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          stage: p.stage,
          stagingUrl: p.stagingUrl,
          liveUrl: p.liveUrl,
          statusUpdates: p.statusUpdates.map((u: any) => ({
            id: u.id,
            title: u.title,
            body: u.body,
            createdAt: u.createdAt,
          })),
        })),
        proposals,
        invoices,
      },
    });
  } catch (error: any) {
    if (error instanceof NotFoundError || error.statusCode === 404) {
      return NextResponse.json(
        { error: "Invalid, expired, or non-existent portal link" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
