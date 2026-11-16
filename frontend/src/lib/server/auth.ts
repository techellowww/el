import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '../prisma';
import { JWT_SECRET } from '../auth/token';

export interface AuthUser {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EMPLOYEE';
  account?: {
    id: string;
    name: string;
    logoUrl?: string | null;
    currency?: string;
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Extracts the session token from a Next.js Request (cookie or Bearer header).
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Check cookies in request headers
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('ch_session=')) {
        return decodeURIComponent(cookie.substring('ch_session='.length));
      }
      if (cookie.startsWith('el_token=')) {
        return decodeURIComponent(cookie.substring('el_token='.length));
      }
    }
  }

  // 2. Check Authorization Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Authenticates the user from the incoming request and verifies account status against DB.
 */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;

  const decoded = verifyToken(token) as any;
  const userId = decoded?.id || decoded?.userId;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      accountId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      account: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          currency: true,
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    accountId: user.accountId,
    email: user.email,
    name: user.name,
    role: user.role as 'ADMIN' | 'EMPLOYEE',
    account: user.account
      ? {
          id: user.account.id,
          name: user.account.name,
          logoUrl: user.account.logoUrl,
          currency: user.account.currency,
        }
      : undefined,
  };
}

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: 'ch_session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
  response.cookies.set({
    name: 'el_token',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: 'ch_session',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set({
    name: 'el_token',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function requireAuth(user: AuthUser | null): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }
  return null;
}

export function requireAdmin(user: AuthUser | null): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }
  return null;
}
