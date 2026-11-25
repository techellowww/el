/**
 * Centralized Authentication Module
 * Consolidates session management, token handling, access control, and server auth helpers.
 */

// Re-export token utilities and types
export {
  JWT_SECRET,
  type SessionPayload,
  hashToken,
  generateSecureToken,
  signSession,
  verifySession,
} from './auth/token';

// Re-export session helpers
export {
  SESSION_COOKIE_NAME,
  getSessionUser,
  requireAuth as requireSessionAuth,
} from './auth/session';

// Re-export role and access control helpers
export {
  NotFoundError,
  ForbiddenError,
  requireClientAccess,
  requireAdmin as requireAdminAccess,
  getClientByPortalToken,
  getAccessibleClients,
} from './auth/access';

// Re-export server auth helpers
export {
  type AuthUser,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  extractTokenFromRequest,
  invalidateAuthUserCache,
  getAuthUser,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAdmin,
} from './server/auth';

