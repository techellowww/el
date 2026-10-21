'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export default function RootPage() {
  const router = useRouter();
  const { fetchUser } = useAuthStore();

  useEffect(() => {
    fetchUser().then((u) => {
      if (u) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    });
  }, [fetchUser, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-medium">Entering EL App workspace...</p>
      </div>
    </div>
  );
}
