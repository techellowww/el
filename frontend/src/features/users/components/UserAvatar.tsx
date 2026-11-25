'use client';

import React from 'react';
import { getInitials } from '@/lib/utils';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({ name, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'User'}
        className={`rounded-full object-cover shrink-0 border border-slate-700 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-primary/20 text-primary font-semibold flex items-center justify-center shrink-0 border border-primary/30 ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}

export default UserAvatar;

