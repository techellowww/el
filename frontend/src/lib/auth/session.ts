import { cookies } from "next/headers";
import { verifySession, SessionPayload } from "./token";

export const SESSION_COOKIE_NAME = "ch_session";

/**
 * Server-side helper to read the authenticated session from cookies in Next.js Server Components / Route Handlers
 */
export async function getSessionUser(request?: Request): Promise<SessionPayload | null> {
  // If request object is passed (e.g. in Route Handlers or tests), check headers first
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const verified = verifySession(token);
      if (verified) return verified;
    }

    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookiesObj: Record<string, string> = {};
      cookieHeader.split(";").forEach((pair) => {
        const [k, v] = pair.trim().split("=");
        if (k && v) cookiesObj[k] = decodeURIComponent(v);
      });
      const token = cookiesObj[SESSION_COOKIE_NAME] || cookiesObj["el_token"];
      if (token) {
        const verified = verifySession(token);
        if (verified) return verified;
      }
    }
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || cookieStore.get("el_token")?.value;
    if (!token) return null;
    return verifySession(token);
  } catch (error) {
    return null;
  }
}

/**
 * Server-side helper to require an authenticated session or throw / return null
 */
export async function requireAuth(): Promise<SessionPayload> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
