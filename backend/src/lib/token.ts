import crypto from 'crypto';

/**
 * Deterministically hash client portal tokens or proposal/invoice tokens with SHA-256
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a cryptographically secure random url-safe token
 */
export function generateSecureToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

