import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getServerCache, setServerCache } from "@/lib/server/apiServerCache";

export const dynamic = 'force-dynamic';

// GET /api/settings/branding (Accessible by all authenticated users: Admin and Employee)
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized: Session required" }, { status: 401 });
  }

  const cacheKey = `branding:${session.accountId}`;
  const cached = getServerCache<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const account = await prisma.account.findUnique({
    where: { id: session.accountId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      currency: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const branding = {
    id: account.id,
    name: account.name || "ClientHub",
    logoUrl: account.logoUrl || null,
    currency: account.currency || "USD",
  };
  setServerCache(cacheKey, branding, 60000);
  return NextResponse.json(branding);
}

