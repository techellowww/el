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

    if (!process.env.DATABASE_URL && !process.env.POSTGRES_PRISMA_URL && !process.env.POSTGRES_URL) {
      return NextResponse.json(
        {
          error: 'DATABASE_URL is missing in deployment. Please add your PostgreSQL connection string in Vercel Project Settings > Environment Variables.',
        },
        { status: 500 }
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

    // Ensure profile fields are present even if cached schema differs
    if (user.displayName === undefined) {
      try {
        const rows: any = await prisma.$queryRawUnsafe(
          `SELECT "displayName", "title", "phone", "avatarUrl", "timezone", "bio", "department", "employeeId" FROM clienthub.ch_users WHERE id = $1`,
          user.id
        );
        if (rows && rows[0]) {
          Object.assign(user, rows[0]);
        }
      } catch {}
    }

    const payload = {
      id: user.id,
      userId: user.id,
      accountId: user.accountId,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      title: user.title,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      bio: user.bio,
      department: user.department,
      employeeId: user.employeeId,
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
  } catch (error: any) {
    console.error('Login error:', error);
    let errorMessage = error?.message || 'An unexpected server error occurred during login.';
    if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || error?.code === 'P2021') {
      errorMessage = 'Database tables have not been created yet. The next deployment will automatically create and seed all tables!';
    }
    return NextResponse.json(
      {
        error: errorMessage,
        details: error?.message || String(error),
        code: error?.code,
        name: error?.name,
      },
      { status: 500 }
    );
  }
}
