'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useProjectSearch, useCreateProjectJoinRequest } from '@/hooks/useProjectDiscovery';
import type { ProjectSearchResult } from '@/hooks/useProjectDiscovery';
import {
  FolderOpen, Users, Plus, Loader2, AlertCircle,
  X, Search, CheckCircle, Clock, ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// JoinButton
// ---------------------------------------------------------------------------

function JoinButton({ project }: { project: ProjectSearchResult }) {
  const createRequest = useCreateProjectJoinRequest();
  const [localPending, setLocalPending] = useState(false);

  const isPending    = project.has_pending_request || localPending;
  const isMember     = project.is_member;
  const isSubmitting = createRequest.isPending;

  const handleJoin = useCallback(async () => {
    try {
      await createRequest.mutateAsync(project.id);
      setLocalPending(true);
    } catch { /* silent */ }
  }, [createRequest, project.id]);

  if (isMember) {
    return (
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
      >
        <ChevronRight size={13} /> Open
      </Link>
    );
  }

  if (isPending) {
    return (
      <span
        id={`join-pending-${project.id}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200"
      >
        <Clock size={13} /> Request Sent
      </span>
    );
  }

  return (
    <button
      id={`join-project-${project.id}`}
      onClick={handleJoin}
      disabled={isSubmitting}
      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition disabled:opacity-50"
    >
      {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
      Request Access
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectSearchResult }) {
  return (
    <div
      id={`search-result-${project.id}`}
      className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-gray-900 font-semibold truncate">{project.name}</p>
            <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
              <Users size={11} />
              {project.team_count} team{project.team_count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <JoinButton project={project} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchPage
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const { data: results, isLoading, isError, refetch } = useProjectSearch(query);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Discover Projects</h1>
        <p className="mt-1 text-gray-500 text-sm">
          Browse all projects or search by name — request access to join one.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition mb-6 max-w-xl">
        <Search size={17} className="text-gray-400 flex-shrink-0" />
        <input
          id="project-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by project name…"
          className="bg-transparent text-gray-900 placeholder-gray-400 text-sm flex-1 outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 transition">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
          <Loader2 className="animate-spin" size={22} />
          <span className="text-sm">Loading projects…</span>
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <AlertCircle size={28} className="text-red-400" />
          <p className="text-sm">Failed to load projects.</p>
          <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Retry</button>
        </div>
      )}

      {/* Empty — no projects at all */}
      {!isLoading && !isError && results?.length === 0 && !query && (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <FolderOpen size={36} className="text-gray-300" />
          <p className="text-sm">No projects available right now.</p>
        </div>
      )}

      {/* Empty — no search match */}
      {!isLoading && !isError && results?.length === 0 && query && (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <Search size={32} className="text-gray-300" />
          <p className="text-sm">No projects match &ldquo;{query}&rdquo;</p>
          <button onClick={() => setQuery('')} className="text-sm text-emerald-600 hover:underline">
            Clear filter
          </button>
        </div>
      )}

      {/* Results grid */}
      {!isLoading && !isError && results && results.length > 0 && (
        <>
          <p className="text-xs text-gray-400 mb-4">
            {results.length} project{results.length !== 1 ? 's' : ''} found
            {query ? ` for "${query}"` : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}