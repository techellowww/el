import { NextResponse } from "next/server";
import { getInvoiceByToken } from "@/lib/server/invoiceService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const invoice = await getInvoiceByToken(token);
    return NextResponse.json({ invoice });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Invalid or expired invoice link" },
      { status: 404 }
    );
  }
}

