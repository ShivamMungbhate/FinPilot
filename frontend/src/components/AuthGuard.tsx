'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthContext';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading) {
      if (!user && !isLoginPage) {
        router.replace('/login');
      } else if (user && isLoginPage) {
        router.replace('/');
      }
    }
  }, [user, loading, isLoginPage, router]);

  // Never block the login page itself with the full-screen loading spinner
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Show loading indicator only on protected pages while verifying
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-xs text-slate-500 font-medium">Verifying session...</span>
        </div>
      </div>
    );
  }

  // If unauthenticated on a protected page, wait for router.replace('/login')
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
