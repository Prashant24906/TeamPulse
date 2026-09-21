'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { LayoutDashboard, Users, LogOut, Loader2 } from 'lucide-react';

function Sidebar() {
  const logout = useLogout();
  const { data: user } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teams',     label: 'Teams',     icon: Users },
  ];

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
          TeamPulse
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        {user && (
          <div className="px-3 py-2 text-xs text-gray-500 truncate">
            {user.name} · {user.email}
          </div>
        )}
        <button
          id="logout-btn"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useAuth();

  // Wire up Socket.IO for real-time updates across all protected pages
  useSocket();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace('/login');
    }
  }, [isLoading, isError, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" size={32} />
      </div>
    );
  }

  if (isError || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
}
