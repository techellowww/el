import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, generateToken, setAuthCookie, verifyPassword, hashPassword } from '@/lib/server/auth';
import { logAuditEvent } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: auth.id },
        select: {
          id: true,
          accountId: true,
          email: true,
          name: true,
          displayName: true,
          title: true,
          phone: true,
          avatarUrl: true,
          timezone: true,
          bio: true,
          department: true,
          employeeId: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
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
    } catch (err: any) {
      if (err?.message?.includes('displayName') || err?.message?.includes('Unknown field') || err?.code === 'P2009') {
        user = await prisma.user.findUnique({
          where: { id: auth.id },
          select: {
            id: true,
            accountId: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
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
        if (user) {
          try {
            const rows: any = await prisma.$queryRawUnsafe(
              `SELECT "displayName", "title", "phone", "avatarUrl", "timezone", "bio", "department", "employeeId" FROM clienthub.ch_users WHERE id = $1`,
              auth.id
            );
            if (rows && rows[0]) {
              Object.assign(user, rows[0]);
            }
          } catch {}
        }
      } else {
        throw err;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('GET /api/auth/profile error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      displayName,
      title,
      phone,
      avatarUrl,
      timezone,
      bio,
      department,
      currentPassword,
      newPassword,
    } = body;

    // Validate name
    if (name !== undefined && (!name || typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json({ error: 'Full name cannot be empty.' }, { status: 400 });
    }

    // Verify current user from database
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.id },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Optional password change
    let updatedPasswordHash: string | undefined = undefined;
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to set a new password.' },
          { status: 400 }
        );
      }
      if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return NextResponse.json(
          { error: 'New password must be at least 6 characters long.' },
          { status: 400 }
        );
      }
      const isMatch = await verifyPassword(currentPassword, currentUser.passwordHash);
      if (!isMatch) {
        return NextResponse.json(
          { error: 'Current password is incorrect.' },
          { status: 400 }
        );
      }
      updatedPasswordHash = await hashPassword(newPassword.trim());
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (displayName !== undefined) updateData.displayName = displayName?.trim() || null;
    if (title !== undefined) updateData.title = title?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl || null;
    if (timezone !== undefined) updateData.timezone = timezone?.trim() || 'Asia/Kolkata';
    if (bio !== undefined) updateData.bio = bio?.trim() || null;
    if (department !== undefined) updateData.department = department?.trim() || null;
    if (updatedPasswordHash) updateData.passwordHash = updatedPasswordHash;

    let updatedUser: any = null;
    try {
      updatedUser = await prisma.user.update({
        where: { id: auth.id },
        data: updateData,
        select: {
          id: true,
          accountId: true,
          email: true,
          name: true,
          displayName: true,
          title: true,
          phone: true,
          avatarUrl: true,
          timezone: true,
          bio: true,
          department: true,
          employeeId: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
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
    } catch (err: any) {
      if (err?.message?.includes('displayName') || err?.message?.includes('Unknown field') || err?.code === 'P2009') {
        // Fallback: update standard fields first
        const baseUpdate: any = {};
        if (updateData.name) baseUpdate.name = updateData.name;
        if (updateData.passwordHash) baseUpdate.passwordHash = updateData.passwordHash;

        updatedUser = await prisma.user.update({
          where: { id: auth.id },
          data: baseUpdate,
          select: {
            id: true,
            accountId: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
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

        // Update profile fields via raw SQL directly in postgres
        await prisma.$executeRawUnsafe(
          `UPDATE clienthub.ch_users SET 
            "displayName" = COALESCE($1, "displayName"),
            "title" = COALESCE($2, "title"),
            "phone" = COALESCE($3, "phone"),
            "avatarUrl" = COALESCE($4, "avatarUrl"),
            "timezone" = COALESCE($5, "timezone"),
            "bio" = COALESCE($6, "bio"),
            "department" = COALESCE($7, "department")
           WHERE id = $8`,
          displayName !== undefined ? (displayName?.trim() || null) : null,
          title !== undefined ? (title?.trim() || null) : null,
          phone !== undefined ? (phone?.trim() || null) : null,
          avatarUrl !== undefined ? (avatarUrl || null) : null,
          timezone !== undefined ? (timezone?.trim() || 'Asia/Kolkata') : null,
          bio !== undefined ? (bio?.trim() || null) : null,
          department !== undefined ? (department?.trim() || null) : null,
          auth.id
        );

        // Fetch the fresh values
        const rows: any = await prisma.$queryRawUnsafe(
          `SELECT "displayName", "title", "phone", "avatarUrl", "timezone", "bio", "department", "employeeId" FROM clienthub.ch_users WHERE id = $1`,
          auth.id
        );
        if (rows && rows[0]) {
          Object.assign(updatedUser, rows[0]);
        }
      } else {
        throw err;
      }
    }

    // Re-issue token with updated user information
    const newToken = generateToken({
      id: updatedUser.id,
      accountId: updatedUser.accountId,
      email: updatedUser.email,
      name: updatedUser.name,
      displayName: updatedUser.displayName,
      title: updatedUser.title,
      phone: updatedUser.phone,
      avatarUrl: updatedUser.avatarUrl,
      timezone: updatedUser.timezone,
      bio: updatedUser.bio,
      department: updatedUser.department,
      employeeId: updatedUser.employeeId,
      role: updatedUser.role as 'ADMIN' | 'EMPLOYEE',
      account: updatedUser.account
        ? {
            id: updatedUser.account.id,
            name: updatedUser.account.name,
            logoUrl: updatedUser.account.logoUrl,
            currency: updatedUser.account.currency,
          }
        : undefined,
    });

    try {
      await logAuditEvent({
        userId: auth.id,
        action: 'USER_PROFILE_UPDATED',
        targetEntity: 'User',
        targetId: auth.id,
        mandatoryReason: 'User updated their personal profile details',
        details: {
          updatedFields: Object.keys(updateData).filter((k) => k !== 'passwordHash'),
          passwordChanged: Boolean(updatedPasswordHash),
        },
        ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
      });
    } catch {}

    const response = NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      token: newToken,
    });

    setAuthCookie(response, newToken);
    return response;
  } catch (error: any) {
    console.error('PATCH /api/auth/profile error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}

