import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { createDraftInvoice, deleteInvoices } from "@/lib/server/invoiceService";

// GET /api/invoices (Admin only)
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin(session);
  } catch {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const status = searchParams.get("status");

  const whereClause: any = {
    accountId: session.accountId,
  };

  if (clientId) whereClause.clientId = clientId;
  if (status) whereClause.status = status.toUpperCase();

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true, email: true } },
      project: { select: { id: true, name: true } },
      items: true,
      payments: true,
    },
  });

  return NextResponse.json({ invoices });
}

// POST /api/invoices (Admin only)
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
    const { clientId, projectId, dueDate, notes, items } = body;

    if (!clientId) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    const invoice = await createDraftInvoice({
      accountId: session.accountId,
      clientId,
      projectId: projectId || undefined,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
      items,
    });

    return NextResponse.json({ invoice });
  } catch (err: any) {
    console.error("Create invoice error:", err);
    return NextResponse.json({ error: err.message || "Failed to create invoice" }, { status: 400 });
  }
}

// DELETE /api/invoices (Admin only - bulk delete)
export async function DELETE(request: Request) {
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
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No invoice IDs provided" }, { status: 400 });
    }

    const result = await deleteInvoices(ids, session.accountId, session.userId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Bulk delete invoices error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete invoices" }, { status: 400 });
  }
}


