import React from 'react';
import type { Role } from '../types';

interface UserBadgeProps {
  role: Role;
  isActive?: boolean;
}

export function UserBadge({ role, isActive = true }: UserBadgeProps) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
        Inactive
      </span>
    );
  }

  if (role === 'ADMIN') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        Admin
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
      Employee
    </span>
  );
}

export default UserBadge;

