import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, generateToken, setAuthCookie } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: {
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

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact an administrator.' },
        { status: 403 }
      );
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const payload = {
      id: user.id,
      userId: user.id,
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

    const token = generateToken(payload as any);

    try {
      await logAuditEvent({
        userId: user.id,
        action: 'USER_LOGIN',
        targetEntity: 'User',
        targetId: user.id,
        mandatoryReason: 'User authenticated successfully',
        details: { email: user.email, role: user.role },
        ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
      });
    } catch {
      // Audit log soft fail if schema differences
    }

    const response = NextResponse.json({
      success: true,
      user: payload,
      token,
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred during login.' },
      { status: 500 }
    );
  }
}
