'use client';

import Link from 'next/link';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function HeroCTA() {
  const { data: user, isLoading } = useAuth();
  const isLoggedIn = !isLoading && !!user;

  if (isLoggedIn) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
        >
          <LayoutDashboard size={16} />
          Go to Dashboard <ArrowRight size={16} />
        </Link>
        <Link
          href="/projects"
          className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl transition-all hover:bg-gray-50"
        >
          View Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Link
        href="/register"
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
      >
        Start for free <ArrowRight size={16} />
      </Link>
      <Link
        href="/login"
        className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl transition-all hover:bg-gray-50"
      >
        Sign in
      </Link>
    </div>
  );
}
