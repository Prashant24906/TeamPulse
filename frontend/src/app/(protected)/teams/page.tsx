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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const createTeamSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  max_size: z.coerce.number().int().min(2).max(100).default(10),
});

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-400 bg-amber-400/10',
  ADMIN:  'text-violet-400 bg-violet-400/10',
  MEMBER: 'text-gray-400 bg-gray-400/10',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New Team</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X size={18} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="create-team-form">
          <div>
            <label htmlFor="team-name" className="block text-sm text-gray-400 mb-1.5">Team Name</label>
            <input
              id="team-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              placeholder="e.g. Backend Team"
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="team-size" className="block text-sm text-gray-400 mb-1.5">Max Members</label>
            <input
              id="team-size"
              type="number"
              min={2}
              max={100}
              value={form.max_size}
              onChange={(e) => setForm({ ...form, max_size: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
            {errors.max_size && <p className="mt-1 text-xs text-red-400">{errors.max_size}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-gray-400 hover:text-white transition text-sm">
              Cancel
            </button>
            <button
              id="create-team-submit"
              type="submit"
              disabled={createTeam.isPending}
              className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-white font-medium transition text-sm"
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
// JoinButton — shows correct state for a search result
// ---------------------------------------------------------------------------

function JoinButton({ team }: { team: TeamSearchResult }) {
  const createJoinRequest = useCreateJoinRequest();
  const [localPending, setLocalPending] = useState(false);

  const isPending   = team.has_pending_request || localPending;
  const isMember    = team.is_member;
  const isSubmitting = createJoinRequest.isPending;

  const handleJoin = useCallback(async () => {
    try {
      await createJoinRequest.mutateAsync(team.id);
      setLocalPending(true);
    } catch {
      // Error handled silently — the search will re-fetch on next query
    }
  }, [createJoinRequest, team.id]);

  if (isMember) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20">
        <CheckCircle size={13} /> Joined
      </span>
    );
  }

  if (isPending) {
    return (
      <span
        id={`join-pending-${team.id}`}
        className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20"
      >
        <Clock size={13} /> Request Sent
      </span>
    );
  }

  return (
    <button
      id={`join-team-${team.id}`}
      onClick={handleJoin}
      disabled={isSubmitting}
      className="flex items-center gap-1.5 text-xs font-medium text-violet-400 bg-violet-400/10 hover:bg-violet-400/20 px-3 py-1.5 rounded-lg border border-violet-400/20 transition disabled:opacity-50"
    >
      {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
      Join
    </button>
  );
}

// ---------------------------------------------------------------------------
// TeamSearchModal
// ---------------------------------------------------------------------------

function TeamSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { data: results, isLoading, isError } = useTeamSearch(query);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-20">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Search Teams</h2>
          <button id="close-search-modal" onClick={onClose} className="text-gray-500 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition">
            <Search size={16} className="text-gray-500 flex-shrink-0" />
            <input
              id="team-search-input"
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Team name…"
              className="bg-transparent text-white placeholder-gray-500 text-sm flex-1 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-600 hover:text-gray-400 transition">
                <X size={14} />
              </button>
            )}
          </div>
          {query.length > 0 && query.trim().length < 2 && (
            <p className="mt-1.5 text-xs text-gray-600">Type at least 2 characters to search</p>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Idle state */}
          {query.trim().length < 2 && (
            <div className="flex flex-col items-center gap-2 py-12 text-gray-600">
              <Search size={28} className="text-gray-700" />
              <p className="text-sm">Search for teams to join</p>
            </div>
          )}

          {/* Loading */}
          {query.trim().length >= 2 && isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="animate-spin" size={18} />
              <span className="text-sm">Searching…</span>
            </div>
          )}

          {/* Error */}
          {query.trim().length >= 2 && isError && (
            <div className="flex flex-col items-center gap-2 py-12 text-gray-500">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-sm">Search failed. Try again.</p>
            </div>
          )}

          {/* Empty */}
          {query.trim().length >= 2 && !isLoading && !isError && results?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-gray-600">
              <Users size={28} className="text-gray-700" />
              <p className="text-sm">No teams found matching &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* Results list */}
          {!isLoading && results && results.length > 0 && (
            <ul className="divide-y divide-gray-800/60">
              {results.map((team) => (
                <li
                  key={team.id}
                  id={`search-result-${team.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/40 transition"
                >
                  <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                    <Users size={16} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{team.name}</p>
                    <p className="text-gray-500 text-xs">
                      {team.member_count} / {team.max_size} members
                    </p>
                  </div>
                  <JoinButton team={team} />
                </li>
              ))}
            </ul>
          )}
        </div>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="mt-1 text-gray-400 text-sm">Manage your teams and members.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="open-search-teams"
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
          >
            <Search size={15} /> Search Teams
          </button>
          <button
            id="open-create-team"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
          >
            <Plus size={16} /> New Team
          </button>
        </div>
      </div>

      {/* My Teams list */}
      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader2 className="animate-spin" size={20} /><span>Loading teams…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 text-gray-500 py-12">
          <AlertCircle size={24} className="text-red-400" />
          <p className="text-sm">Unable to load teams.</p>
          <button onClick={() => refetch()} className="text-sm text-violet-400 hover:underline">Retry</button>
        </div>
      )}

      {!isLoading && !isError && teams?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
          <Users size={36} className="text-gray-700" />
          <p className="text-sm">No teams yet. Create one or search for a team to join.</p>
        </div>
      )}

      {!isLoading && teams && teams.length > 0 && (
        <div className="space-y-3">
          {teams.map((team) => (
            <div key={team.id} className="bg-gray-900 border border-gray-800 rounded-xl flex items-center px-5 py-4 gap-4 hover:border-gray-700 transition">
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Users size={18} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium truncate">{team.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLORS[team.role]}`}>
                    {team.role}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">Max {team.max_size} members</p>
              </div>
              <div className="flex items-center gap-2">
                {(team.role === 'OWNER' || team.role === 'ADMIN') && (
                  <button
                    onClick={() => { if (confirm(`Delete "${team.name}"?`)) deleteTeam.mutate(team.id); }}
                    id={`delete-team-${team.id}`}
                    className="text-gray-600 hover:text-red-400 transition p-1.5 rounded"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <Link
                  href={`/teams/${team.id}`}
                  id={`view-team-${team.id}`}
                  className="text-gray-500 hover:text-violet-400 transition p-1.5 rounded"
                >
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
      {showSearch && <TeamSearchModal onClose={() => setShowSearch(false)} />}
    </div>
  );
}
