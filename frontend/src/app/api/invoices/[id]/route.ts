import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { sendInvoice, markInvoiceAsPaid, voidInvoice, deleteInvoice } from "@/lib/server/invoiceService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, accountId: session.accountId },
    include: {
      client: true,
      project: true,
      items: true,
      payments: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, paymentMethod, paymentNotes, voidReason } = body;

  try {
    if (action === "SEND") {
      const result = await sendInvoice(id, session.accountId, session.userId);
      return NextResponse.json(result);
    }

    if (action === "PAY") {
      const result = await markInvoiceAsPaid(id, session.accountId, session.userId, {
        paymentMethod: paymentMethod || "MANUAL",
        notes: paymentNotes,
      });
      return NextResponse.json(result);
    }

    if (action === "VOID") {
      const result = await voidInvoice(id, session.accountId, session.userId, voidReason);
      return NextResponse.json({ invoice: result });
    }

    return NextResponse.json({ error: "Invalid action. Supported actions: SEND, PAY, VOID" }, { status: 400 });
  } catch (err: any) {
    console.error(`Invoice action [${action}] error:`, err);
    return NextResponse.json({ error: err.message || "Failed to process invoice action" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await deleteInvoice(id, session.accountId, session.userId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`Failed to delete invoice ${id}:`, err);
    return NextResponse.json(
      { error: err.message || "Failed to delete invoice" },
      { status: 400 }
    );
  }
}


