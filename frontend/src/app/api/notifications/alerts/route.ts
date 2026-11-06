import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getFailedNotificationAlerts } from "@/lib/server/notificationService";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alerts = await getFailedNotificationAlerts(session.accountId);
    return NextResponse.json({ alerts });
  } catch (err: any) {
    return NextResponse.json({ alerts: [] });
  }
}

