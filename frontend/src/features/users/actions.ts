import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { validateCreateUser, validateUpdateUser } from './schemas';
import type { CreateUserData, UpdateUserData, User } from './types';

export async function createUser(accountId: string, data: CreateUserData): Promise<User> {
  const validation = validateCreateUser(data);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const passwordHash = await hashPassword(data.password || 'Password@123');

  const created = await db.user.create({
    data: {
      accountId,
      email: data.email.toLowerCase().trim(),
      name: data.name.trim(),
      passwordHash,
      role: data.role || 'EMPLOYEE',
      displayName: data.displayName,
      title: data.title,
      phone: data.phone,
      department: data.department,
      employeeId: data.employeeId,
      isActive: true,
    },
  });

  return created as unknown as User;
}

export async function updateUser(userId: string, data: UpdateUserData): Promise<User> {
  const validation = validateUpdateUser(data);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const updated = await db.user.update({
    where: { id: userId },
    data,
  });

  return updated as unknown as User;
}

