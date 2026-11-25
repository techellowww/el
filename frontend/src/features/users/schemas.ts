import type { CreateUserData, UpdateUserData } from './types';

export function validateCreateUser(data: CreateUserData): { isValid: boolean; error?: string } {
  if (!data.email || !data.email.includes('@')) {
    return { isValid: false, error: 'A valid email address is required.' };
  }
  if (!data.name || data.name.trim().length === 0) {
    return { isValid: false, error: 'User name is required.' };
  }
  if (data.password && data.password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters.' };
  }
  return { isValid: true };
}

export function validateUpdateUser(data: UpdateUserData): { isValid: boolean; error?: string } {
  if (data.email && !data.email.includes('@')) {
    return { isValid: false, error: 'A valid email address is required.' };
  }
  if (data.name !== undefined && data.name.trim().length === 0) {
    return { isValid: false, error: 'Name cannot be empty.' };
  }
  return { isValid: true };
}

