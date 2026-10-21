'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Lock, Mail, ArrowRight, ShieldCheck, UserCheck, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to authenticate');
        setIsLoading(false);
        return;
      }

      setUser(data.user);
      router.push('/dashboard');
    } catch {
      setError('Connection error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password@123');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 mx-auto flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-blue-500/30">
          EL
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          EL App Workspace
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Employee Project Time Tracking & Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900/90 py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 backdrop-blur sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/50 border border-red-800/60 flex items-center gap-2.5 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="login-email"
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee@elapp.local"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="login-password"
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              data-testid="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  Sign In to Workspace <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Preset Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-xs font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">
              Quick 1-Click Demo Accounts
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                id="demo-admin-btn"
                data-testid="demo-admin-btn"
                type="button"
                onClick={() => handleQuickLogin('ellowwwstudio@gmail.com')}
                className="w-full py-2 px-3 text-left rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 flex items-center justify-between text-xs text-slate-200 transition"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <div>
                    <span className="font-semibold text-white">System Admin</span>
                    <span className="block text-[10px] text-slate-400">ellowwwstudio@gmail.com</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">
                  Fill Admin
                </span>
              </button>

              <button
                id="demo-employee-john-btn"
                data-testid="demo-employee-john-btn"
                type="button"
                onClick={() => handleQuickLogin('john.doe@elapp.local')}
                className="w-full py-2 px-3 text-left rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 flex items-center justify-between text-xs text-slate-200 transition"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="font-semibold text-white">John Doe (Engineering)</span>
                    <span className="block text-[10px] text-slate-400">john.doe@elapp.local</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                  Fill Employee
                </span>
              </button>

              <button
                id="demo-employee-sarah-btn"
                data-testid="demo-employee-sarah-btn"
                type="button"
                onClick={() => handleQuickLogin('sarah.connor@elapp.local')}
                className="w-full py-2 px-3 text-left rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 flex items-center justify-between text-xs text-slate-200 transition"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-white">Sarah Connor (Design)</span>
                    <span className="block text-[10px] text-slate-400">sarah.connor@elapp.local</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                  Fill Employee
                </span>
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 text-center">
              Default password for all demo accounts: <code className="text-slate-400">Password@123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
