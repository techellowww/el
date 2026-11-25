import type { Role, User } from '@/types';

export type { Role, User };

export interface CreateUserData {
  email: string;
  name: string;
  password?: string;
  role?: Role;
  displayName?: string;
  title?: string;
  phone?: string;
  department?: string;
  employeeId?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  displayName?: string;
  title?: string;
  phone?: string;
  avatarUrl?: string;
  timezone?: string;
  bio?: string;
  department?: string;
  employeeId?: string;
  role?: Role;
  isActive?: boolean;
}

