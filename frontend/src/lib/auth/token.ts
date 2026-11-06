import crypto from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "clienthub_fallback_secret_key_2026_xyz";

export interface SessionPayload {
  userId: string;
  accountId: string;
  email: string;
  name: string;
  role: "ADMIN" | "EMPLOYEE";
}

/**
 * Deterministically hash client portal tokens or proposal/invoice tokens with SHA-256
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a cryptographically secure random url-safe token
 */
export function generateSecureToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

/**
 * Sign JWT session cookie
 */
export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

/**
 * Verify JWT session cookie
 */
export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || (!decoded.userId && !decoded.id)) return null;
    return {
      userId: decoded.userId || decoded.id,
      accountId: decoded.accountId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}
