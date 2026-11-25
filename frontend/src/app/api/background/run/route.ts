import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runClientHubBackgroundJobs } from "@/lib/server/backgroundJobs";

export const dynamic = "force-dynamic";

async function authorizeBackgroundTrigger(request?: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request?.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return null;
  }
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }
  return null;
}

// POST or GET /api/background/run
export async function POST(request?: Request) {
  const authErr = await authorizeBackgroundTrigger(request);
  if (authErr) return authErr;
  try {
    const summary = await runClientHubBackgroundJobs();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request?: Request) {
  const authErr = await authorizeBackgroundTrigger(request);
  if (authErr) return authErr;
  try {
    const summary = await runClientHubBackgroundJobs();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

