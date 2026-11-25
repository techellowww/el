import { db } from '@/lib/db';
import type { User } from './types';

export async function getEmployeesByAccount(accountId: string): Promise<User[]> {
  const users = await db.user.findMany({
    where: { accountId },
    orderBy: { name: 'asc' },
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
    },
  });
  return users as unknown as User[];
}

export async function getUserById(userId: string): Promise<User | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
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
    },
  });
  return user as unknown as User | null;
}

