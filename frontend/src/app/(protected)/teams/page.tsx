'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useTeams, useCreateTeam, useDeleteTeam } from '@/hooks/useTeams';
import { useTeamSearch, useCreateJoinRequest } from '@/hooks/useTeamDiscovery';
import {
  Users, Plus, Trash2, ChevronRight, Loader2, AlertCircle,
  X, Search, CheckCircle, Clock,
} from 'lucide-react';
import type { TeamRole } from '@/types/team';
import type { TeamSearchResult } from '@/types/joinRequest';
import { z } from 'zod';

const createTeamSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  max_size: z.coerce.number().int().min(2).max(100).default(10),
});

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-700 bg-amber-50 border border-amber-200',
  ADMIN:  'text-sky-700 bg-sky-50 border border-sky-200',
  MEMBER: 'text-gray-600 bg-gray-100 border border-gray-200',
};

// ---------------------------------------------------------------------------
// CreateTeamModal
// ---------------------------------------------------------------------------

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const createTeam = useCreateTeam();
  const [form, setForm]     = useState({ name: '', max_size: '10' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = createTeamSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      Object.entries(fe).forEach(([k, v]) => { if (v?.[0]) fieldErrors[k] = v[0]; });
      setErrors(fieldErrors);
      return;
    }
    try {
      await createTeam.mutateAsync(parsed.data);
      onClose();
    } catch {
      setErrors({ general: 'Failed to create team. Try again.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">New Team</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition"><X size={18} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="create-team-form">
          <div>
            <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-1.5">Team Name</label>
            <input
              id="team-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              placeholder="e.g. Backend Team"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="team-size" className="block text-sm font-medium text-gray-700 mb-1.5">Max Members</label>
            <input
              id="team-size"
              type="number"
              min={2}
              max={100}
              value={form.max_size}
              onChange={(e) => setForm({ ...form, max_size: e.target.value })}
              className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {errors.max_size && <p className="mt-1 text-xs text-red-500">{errors.max_size}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50 transition text-sm font-medium">
              Cancel
            </button>
            <button
              id="create-team-submit"
              type="submit"
              disabled={createTeam.isPending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-semibold transition text-sm"
            >
              {createTeam.isPending ? 'Creating…' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// TeamsPage
// ---------------------------------------------------------------------------

export default function TeamsPage() {
  const { data: teams, isLoading, isError, refetch } = useTeams();
  const deleteTeam = useDeleteTeam();
  const [showCreate, setShowCreate] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-gray-500 text-sm">Manage your teams and members.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="open-search-teams"
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2.5 rounded-lg bg-white hover:bg-gray-50 transition"
          >
            <Search size={15} /> Search Teams
          </button>
          <button
            id="open-create-team"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
          >
            <Plus size={16} /> New Team
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
          <Loader2 className="animate-spin" size={20} /><span>Loading teams…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 text-gray-500 py-12">
          <AlertCircle size={24} className="text-red-400" />
          <p className="text-sm">Unable to load teams.</p>
          <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Retry</button>
        </div>
      )}

      {!isLoading && !isError && teams?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Users size={36} className="text-gray-300" />
          <p className="text-sm">No teams yet. Create one or search for a team to join.</p>
        </div>
      )}

      {!isLoading && teams && teams.length > 0 && (
        <div className="space-y-2">
          {teams.map((team) => (
            <Link href={`/teams/${team.id}`} key={team.id} className="bg-white border border-gray-200 rounded-xl flex items-center px-5 py-4 gap-4 hover:border-gray-300 hover:shadow-sm transition">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Users size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-gray-900 font-semibold truncate">{team.name}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLORS[team.role]}`}>
                    {team.role}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">Max {team.max_size} members</p>
              </div>
              <div className="flex items-center gap-1">
                {(team.role === 'OWNER' || team.role === 'ADMIN') && (
                  <button
                    onClick={() => { if (confirm(`Delete "${team.name}"?`)) deleteTeam.mutate(team.id); }}
                    id={`delete-team-${team.id}`}
                    className="text-gray-300 hover:text-red-500 transition p-1.5 rounded"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}

    </div>
  );
}
