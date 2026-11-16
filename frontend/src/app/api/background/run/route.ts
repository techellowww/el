import { NextResponse } from "next/server";
import { runClientHubBackgroundJobs } from "@/lib/server/backgroundJobs";

export const dynamic = "force-dynamic";

// POST or GET /api/background/run
export async function POST(request?: Request) {
  try {
    const summary = await runClientHubBackgroundJobs();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request?: Request) {
  try {
    const summary = await runClientHubBackgroundJobs();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

