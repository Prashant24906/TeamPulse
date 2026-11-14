'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Users,ArrowRight } from 'lucide-react';


export default function CTABanner() {
    const {data: user} = useAuth();
  return (
    <section className="py-20 px-6 bg-gray-100">
      <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-emerald-600 to-teal-500 rounded-3xl p-14 shadow-2xl shadow-emerald-200">
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Ready to bring your team together?
        </h2>
        <p className="text-emerald-100 text-lg mb-8">
          Create your workspace in less than 60 seconds. No credit card required.
        </p>
        <Link
          href = { user ? "/dashboard" : "/register"}
          className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-8 py-4 rounded-xl hover:bg-emerald-50 transition-colors shadow-lg"
        >
          Get started for free <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}