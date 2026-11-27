'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useTimerStore } from '@/lib/store';
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

      setUser(data.user, data.token);
      try {
        useTimerStore.getState().syncActiveTimer();
      } catch {}
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
    <div className="min-h-screen bg-app-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-primary mx-auto flex items-center justify-center font-bold text-white text-xl shadow-sm">
          CH
        </div>
        <h1 className="page-heading text-text-primary mt-4">
          ClientHub Workspace
        </h1>
        <p className="helper-text text-text-secondary mt-1">
          Agency & Client Operations Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-md rounded-card border border-border sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 body-text text-error font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-error" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block label-text text-text-primary font-medium uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  id="login-email"
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee@elapp.local"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block label-text text-text-primary font-medium uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  id="login-password"
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              data-testid="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
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
          <div className="mt-8 pt-6 border-t border-border">
            <p className="label-text text-text-secondary font-semibold mb-3 text-center uppercase tracking-wider">
              Quick 1-Click ClientHub Accounts
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                id="demo-admin-btn"
                data-testid="demo-admin-btn"
                type="button"
                onClick={() => handleQuickLogin('admin@clienthub.local')}
                className="w-full py-2.5 px-3.5 text-left rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-border hover:border-blue-200 flex items-center justify-between text-text-primary transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <div>
                    <span className="card-title text-text-primary">Agency Admin</span>
                    <span className="block helper-text text-text-secondary">admin@clienthub.local</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-primary font-mono helper-text">
                  Fill Admin
                </span>
              </button>

              <button
                id="demo-employee-alex-btn"
                data-testid="demo-employee-alex-btn"
                type="button"
                onClick={() => handleQuickLogin('employee@clienthub.local')}
                className="w-full py-2.5 px-3.5 text-left rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-border hover:border-blue-200 flex items-center justify-between text-text-primary transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-success" />
                  <div>
                    <span className="card-title text-text-primary">Alex Miller (Staff Employee)</span>
                    <span className="block helper-text text-text-secondary">employee@clienthub.local</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-green-100 text-success font-mono helper-text">
                  Fill Employee
                </span>
              </button>
            </div>
            <p className="mt-3 helper-text text-text-secondary text-center">
              Default password for all demo accounts: <code className="text-text-primary font-mono font-medium">Password@123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
