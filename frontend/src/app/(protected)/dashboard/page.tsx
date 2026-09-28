'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useTeams } from '@/hooks/useTeams';
import { Users, Plus, Loader2, AlertCircle } from 'lucide-react';
import type { TeamRole } from '@/types/team';

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-700 bg-amber-50 border border-amber-200',
  ADMIN:  'text-sky-700 bg-sky-50 border border-sky-200',
  MEMBER: 'text-gray-600 bg-gray-100 border border-gray-200',
};

export default function DashboardPage() {
  const { data: user } = useAuth();
  const { data: teams, isLoading, isError, refetch } = useTeams();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-1 text-gray-500 text-sm">Here are your active teams.</p>
      </div>

      {/* Teams Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Teams</h2>
          <Link
            href="/teams"
            id="go-to-teams"
            className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-500 font-medium transition-colors"
          >
            <Plus size={15} /> New Team
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
            <Loader2 className="animate-spin" size={20} />
            <span>Loading teams…</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 text-gray-500 py-12 justify-center">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-sm">Unable to load teams.</p>
            <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Retry</button>
          </div>
        )}

        {!isLoading && !isError && teams?.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
            <Users size={32} className="text-gray-300" />
            <p className="text-sm">No teams yet.</p>
            <Link href="/teams" className="text-sm text-emerald-600 hover:underline">Create your first team</Link>
          </div>
        )}

        {!isLoading && teams && teams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                id={`team-card-${team.id}`}
                className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-50 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Users size={18} className="text-emerald-600" />
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[team.role]}`}>
                    {team.role}
                  </span>
                </div>
                <h3 className="text-gray-900 font-semibold group-hover:text-emerald-600 transition-colors">
                  {team.name}
                </h3>
                <p className="text-gray-400 text-xs mt-1">Max {team.max_size} members</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
