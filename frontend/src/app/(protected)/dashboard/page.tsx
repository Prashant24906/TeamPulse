'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useTeams } from '@/hooks/useTeams';
import { Users, Plus, Loader2, AlertCircle } from 'lucide-react';
import type { TeamRole } from '@/types/team';

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-400 bg-amber-400/10',
  ADMIN:  'text-violet-400 bg-violet-400/10',
  MEMBER: 'text-gray-400 bg-gray-400/10',
};

export default function DashboardPage() {
  const { data: user } = useAuth();
  const { data: teams, isLoading, isError, refetch } = useTeams();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-1 text-gray-400 text-sm">Here are your active teams.</p>
      </div>

      {/* Teams Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Teams</h2>
          <Link
            href="/teams"
            id="go-to-teams"
            className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Plus size={15} /> New Team
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
            <Loader2 className="animate-spin" size={20} />
            <span>Loading teams…</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 text-gray-500 py-12 justify-center">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-sm">Unable to load teams.</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-violet-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && teams?.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
            <Users size={32} className="text-gray-700" />
            <p className="text-sm">No teams yet.</p>
            <Link href="/teams" className="text-sm text-violet-400 hover:underline">
              Create your first team
            </Link>
          </div>
        )}

        {!isLoading && teams && teams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                id={`team-card-${team.id}`}
                className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-violet-500/50 hover:bg-gray-800/60 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Users size={18} className="text-violet-400" />
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[team.role]}`}>
                    {team.role}
                  </span>
                </div>
                <h3 className="text-white font-semibold group-hover:text-violet-300 transition-colors">
                  {team.name}
                </h3>
                <p className="text-gray-500 text-xs mt-1">
                  Max {team.max_size} members
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
