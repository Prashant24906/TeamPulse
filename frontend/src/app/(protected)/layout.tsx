'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { LayoutDashboard, Users, LogOut, Loader2, Search, UserCircle } from 'lucide-react';

function Sidebar() {
  const logout = useLogout();
  const { data: user } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/teams',     label: 'Teams',     icon: Users },
    { href: '/search',   label: 'Search',    icon: Search },
    { href: '/profile',  label: 'Profile',   icon: UserCircle },
  ];

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-200">
        <Link href="/">
          <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            TeamPulse
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-gray-200 space-y-1">
        {user && (
          <div className="px-3 py-2 text-xs text-gray-400 truncate">
            {user.name} · {user.email}
          </div>
        )}
        <button
          id="logout-btn"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors text-sm font-medium"
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

  useSocket();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace('/login');
    }
  }, [isLoading, isError, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (isError || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-100">
        {children}
      </main>
    </div>
  );
}
