'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Users } from 'lucide-react';

export default function Navbar() {
  const { data: user, isLoading } = useAuth();
  const isLoggedIn = !isLoading && !!user;

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-gray-100/80 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
          TeamPulse
        </span>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
          <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#why-us" className="hover:text-gray-900 transition-colors">Why TeamPulse</a>

          {/* Show Dashboard & Teams links when logged in */}
          {isLoggedIn && (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
              >
                <LayoutDashboard size={14} />
                Dashboard
              </Link>
              <Link
                href="/teams"
                className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
              >
                <Users size={14} />
                Teams
              </Link>
            </>
          )}
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <span className="hidden md:block text-sm text-gray-500 font-medium">
                Hi, {user.name.split(' ')[0]} 👋
              </span>
              <Link
                href="/dashboard"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Sign in
              </Link>
              <Link
                href="/register"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Get started free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
