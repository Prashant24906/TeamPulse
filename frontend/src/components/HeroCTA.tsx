'use client';

import Link from 'next/link';
import { ArrowRight, LayoutDashboard, FolderKanban } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function HeroCTA() {
  const { data: user, isLoading } = useAuth();
  const isLoggedIn = !isLoading && !!user;

  if (isLoggedIn) {
    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-sm sm:max-w-none mx-auto w-full">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 sm:px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-200/50 hover:shadow-emerald-300 hover:-translate-y-0.5 text-sm sm:text-base w-full sm:w-auto"
        >
          <LayoutDashboard size={16} />
          Go to Dashboard <ArrowRight size={16} />
        </Link>
        <Link
          href="/projects"
          className="flex items-center justify-center gap-2 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 font-semibold px-6 sm:px-7 py-3.5 rounded-xl transition-all hover:bg-gray-50 text-sm sm:text-base w-full sm:w-auto"
        >
          <FolderKanban size={16} className="text-gray-500" />
          View Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-sm sm:max-w-none mx-auto w-full">
      <Link
        href="/register"
        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 sm:px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-200/50 hover:shadow-emerald-300 hover:-translate-y-0.5 text-sm sm:text-base w-full sm:w-auto"
      >
        Start for free <ArrowRight size={16} />
      </Link>
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-700 font-semibold px-6 sm:px-7 py-3.5 rounded-xl transition-all hover:bg-gray-50 text-sm sm:text-base w-full sm:w-auto"
      >
        Sign in
      </Link>
    </div>
  );
}
