import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/api/employees", request.url));
}

export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/api/employees", request.url), 307);
}

