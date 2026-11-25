'use client';

import { useAuthStore } from '@/lib/store';

export function useAuth() {
  const { user, isLoading, isLoggingOut, fetchUser, logout } = useAuthStore();
  return {
    user,
    isLoading,
    isLoggingOut,
    isAdmin: user?.role === 'ADMIN',
    isEmployee: user?.role === 'EMPLOYEE',
    fetchUser,
    logout,
  };
}

export default useAuth;

