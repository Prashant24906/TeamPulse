'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { ArrowRight } from 'lucide-react';

export default function CTABanner() {
  const { data: user } = useAuth();

  return (
    <section className="py-14 sm:py-20 px-4 sm:px-6 bg-gray-100">
      <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-emerald-600 to-teal-500 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-14 shadow-2xl shadow-emerald-200/50">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-3 sm:mb-4 tracking-tight">
          Ready to bring your team together?
        </h2>
        <p className="text-emerald-100 text-sm sm:text-base md:text-lg mb-6 sm:mb-8 max-w-xl mx-auto leading-relaxed">
          Create your workspace in less than 60 seconds. No credit card required.
        </p>
        <Link
          href={user ? '/dashboard' : '/register'}
          className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl hover:bg-emerald-50 transition-colors shadow-lg text-sm sm:text-base w-full sm:w-auto"
        >
          {user ? 'Go to your workspace' : 'Get started for free'} <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
