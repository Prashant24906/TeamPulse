'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Users, Menu, X, ArrowRight } from 'lucide-react';

export default function Navbar() {
  const { data: user, isLoading } = useAuth();
  const isLoggedIn = !isLoading && !!user;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-gray-100/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            TeamPulse
          </span>
        </Link>

        {/* Desktop Nav links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
          <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#why-us" className="hover:text-gray-900 transition-colors">Why TeamPulse</a>

          {/* Show Dashboard & Projects links when logged in */}
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
                href="/projects"
                className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
              >
                <Users size={14} />
                Projects
              </Link>
            </>
          )}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <span className="hidden md:block text-sm text-gray-500 font-medium">
                Hi, {user.name.split(' ')[0]} 👋
              </span>
              <Link
                href="/dashboard"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-2 py-1">
                Sign in
              </Link>
              <Link
                href="/register"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                Get started free
              </Link>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex sm:hidden items-center gap-2">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-xs font-semibold text-gray-700 px-2 py-1"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 py-5 shadow-lg animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-3 text-sm font-medium text-gray-700">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              How it works
            </a>
            <a
              href="#why-us"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Why TeamPulse
            </a>

            {isLoggedIn ? (
              <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                <div className="px-3 py-1 text-xs text-gray-400">
                  Signed in as <span className="font-semibold text-gray-700">{user.name}</span>
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 font-semibold"
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
                <Link
                  href="/projects"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
                >
                  <Users size={16} />
                  Projects
                </Link>
              </div>
            ) : (
              <div className="pt-3 border-t border-gray-100 flex flex-col gap-2.5">
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold px-4 py-2.5 rounded-xl text-center text-sm shadow-sm"
                >
                  Get started free <ArrowRight size={15} />
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center border border-gray-200 text-gray-700 font-medium px-4 py-2 rounded-xl text-center text-sm hover:bg-gray-50"
                >
                  Sign in
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
