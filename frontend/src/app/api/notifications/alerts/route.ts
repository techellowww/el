import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getFailedNotificationAlerts,
  retryFailedNotifications,
  dismissFailedNotifications,
} from "@/lib/server/notificationService";
import { getServerCache, setServerCache, invalidateServerCache } from "@/lib/server/apiServerCache";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `alerts:${session.accountId}`;
  const cached = getServerCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const alerts = await getFailedNotificationAlerts(session.accountId);
    const result = { alerts };
    setServerCache(cacheKey, result, 15000); // 15s cache
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ alerts: [] });
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  invalidateServerCache(`alerts:${session.accountId}`);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action || "retry";

    if (action === "dismiss") {
      const result = await dismissFailedNotifications(session.accountId);
      return NextResponse.json({ success: true, ...result, alerts: [] });
    } else {
      const result = await retryFailedNotifications(session.accountId);
      const remainingAlerts = await getFailedNotificationAlerts(session.accountId);
      return NextResponse.json({ success: true, ...result, alerts: remainingAlerts });
    }
  } catch (err: any) {
    console.error("[POST /api/notifications/alerts error]:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to process notification alerts action" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  invalidateServerCache(`alerts:${session.accountId}`);

  try {
    const result = await dismissFailedNotifications(session.accountId);
    return NextResponse.json({ success: true, ...result, alerts: [] });
  } catch (err: any) {
    console.error("[DELETE /api/notifications/alerts error]:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to dismiss notification alerts" },
      { status: 500 }
    );
  }
}


