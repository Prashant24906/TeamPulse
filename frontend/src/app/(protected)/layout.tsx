'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import {
  LayoutDashboard, Users, LogOut, Loader2,
  Search, UserCircle, Menu, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects',  label: 'Projects',  icon: Users },
  { href: '/search',    label: 'Search',    icon: Search },
  { href: '/profile',   label: 'Profile',   icon: UserCircle },
];

function DesktopSidebar() {
  const logout = useLogout();
  const { data: user } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-shrink-0 bg-white border-r border-gray-200 flex-col">
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
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon size={17} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
              {label}
            </Link>
          );
        })}
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
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useAuth();
  const logout = useLogout();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useSocket();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace('/login');
    }
  }, [isLoading, isError, user, router]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (isError || !user) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gray-100">
      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <DesktopSidebar />

      {/* ── Mobile Top Header ───────────────────────────────────── */}
      <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-30">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            TeamPulse
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center border border-emerald-200"
          >
            {user.name.charAt(0).toUpperCase()}
          </Link>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            aria-label="Toggle navigation menu"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
          >
            {mobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Slide-over Drawer & Backdrop ─────────────────── */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer container */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {/* Drawer header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                TeamPulse
              </span>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 font-semibold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* User profile & sign out */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <div className="px-2 py-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 text-sm font-medium transition"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content Area ───────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-100 pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Mobile Bottom Navigation Bar ────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-center justify-around z-30 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[11px] font-medium transition ${
                isActive ? 'text-emerald-600 font-semibold' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
