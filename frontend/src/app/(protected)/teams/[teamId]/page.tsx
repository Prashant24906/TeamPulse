'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useTeam, useTeamMembers, useUpdateTeam } from '@/hooks/useTeams';
import { useProjects, useDeleteProject, useCreateProject } from '@/hooks/useProjects';
import { useJoinRequests, useUpdateJoinRequest } from '@/hooks/useTeamDiscovery';
import { ChatPanel } from '@/components/chat/ChatPanel';
import {
  FolderOpen, Users, Plus, Trash2, ChevronRight,
  Loader2, AlertCircle, X, ArrowLeft, UserCheck, Inbox, Pencil,
} from 'lucide-react';
import type { TeamRole } from '@/types/team';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const createProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

const editTeamSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  max_size: z.coerce.number().int().min(2, 'Min 2').max(100, 'Max 100'),
});

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  ADMIN:  'text-sky-400 bg-sky-400/10 border-sky-400/20',
  MEMBER: 'text-gray-400 bg-gray-400/10 border-gray-700',
};

// ---------------------------------------------------------------------------
// EditTeamModal
// ---------------------------------------------------------------------------

function EditTeamModal({
  teamId,
  currentName,
  currentMaxSize,
  onClose,
}: {
  teamId: string;
  currentName: string;
  currentMaxSize: number;
  onClose: () => void;
}) {
  const updateTeam = useUpdateTeam(teamId);
  const [form, setForm] = useState({ name: currentName, max_size: String(currentMaxSize) });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = editTeamSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      Object.entries(fe).forEach(([k, v]) => { if (v?.[0]) fieldErrors[k] = v[0]; });
      setErrors(fieldErrors);
      return;
    }
    try {
      await updateTeam.mutateAsync(parsed.data);
      onClose();
    } catch {
      setErrors({ general: 'Failed to update team. Try again.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Edit Team</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X size={18} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="edit-team-form">
          <div>
            <label htmlFor="edit-team-name" className="block text-sm text-gray-400 mb-1.5">Team Name</label>
            <input
              id="edit-team-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              placeholder="e.g. Backend Team"
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="edit-team-size" className="block text-sm text-gray-400 mb-1.5">Max Members</label>
            <input
              id="edit-team-size"
              type="number"
              min={2}
              max={100}
              value={form.max_size}
              onChange={(e) => setForm({ ...form, max_size: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {errors.max_size && <p className="mt-1 text-xs text-red-400">{errors.max_size}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-gray-400 hover:text-white transition text-sm">Cancel</button>
            <button
              id="edit-team-submit"
              type="submit"
              disabled={updateTeam.isPending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-medium transition text-sm"
            >
              {updateTeam.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateProjectModal
// ---------------------------------------------------------------------------

function CreateProjectModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const createProject = useCreateProject(teamId);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsed = createProjectSchema.safeParse({ name });
    if (!parsed.success) { setError(parsed.error.flatten().fieldErrors.name?.[0] ?? 'Invalid name'); return; }
    try {
      await createProject.mutateAsync({ name: parsed.data.name });
      onClose();
    } catch {
      setError('Failed to create project.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New Project</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X size={18} /></button>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4" id="create-project-form">
          <div>
            <label htmlFor="project-name" className="block text-sm text-gray-400 mb-1.5">Project Name</label>
            <input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              placeholder="e.g. Backend API"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-gray-400 hover:text-white transition text-sm">Cancel</button>
            <button
              id="create-project-submit"
              type="submit"
              disabled={createProject.isPending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-medium transition text-sm"
            >
              {createProject.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JoinRequestsPanel — OWNER/ADMIN only
// ---------------------------------------------------------------------------

function JoinRequestsPanel({ teamId }: { teamId: string }) {
  const { data: requests, isLoading, isError, refetch } = useJoinRequests(teamId);
  const updateRequest = useUpdateJoinRequest(teamId);
  const [actionError, setActionError] = useState('');

  const handleAction = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    setActionError('');
    try {
      await updateRequest.mutateAsync({ requestId, status });
    } catch {
      setActionError(`Failed to ${status.toLowerCase()} request. Try again.`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
        <Loader2 className="animate-spin" size={20} /><span>Loading requests…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm">Unable to load join requests.</p>
        <button onClick={() => refetch()} className="text-sm text-emerald-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
        <Inbox size={36} className="text-gray-700" />
        <p className="text-sm">No pending join requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}
      {requests.map((req) => (
        <div
          key={req.id}
          id={`join-request-${req.id}`}
          className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4"
        >
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-semibold text-sm flex-shrink-0">
            {req.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{req.name}</p>
            <p className="text-gray-500 text-xs truncate">{req.email}</p>
            <p className="text-gray-600 text-xs mt-0.5">
              Requested {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              id={`approve-request-${req.id}`}
              onClick={() => handleAction(req.id, 'APPROVED')}
              disabled={updateRequest.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-3 py-1.5 rounded-lg border border-emerald-400/20 transition disabled:opacity-50"
            >
              {updateRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={13} />}
              Approve
            </button>
            <button
              id={`reject-request-${req.id}`}
              onClick={() => handleAction(req.id, 'REJECTED')}
              disabled={updateRequest.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-lg border border-red-400/20 transition disabled:opacity-50"
            >
              <X size={13} /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamPage
// ---------------------------------------------------------------------------

type Tab = 'projects' | 'members' | 'requests' | 'chat';

export default function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data: members } = useTeamMembers(teamId);
  const { data: projects, isLoading: projLoading, isError: projError, refetch } = useProjects(teamId);
  const { data: joinRequests } = useJoinRequests(teamId);
  const deleteProject = useDeleteProject(teamId);

  const myRole = team?.role ?? 'MEMBER';
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';

  const [tab, setTab] = useState<Tab>('projects');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'projects', label: 'Projects' },
    { id: 'members',  label: 'Members' },
    ...(canManage
      ? [{ id: 'requests' as Tab, label: 'Join Requests', badge: joinRequests?.length ?? 0 }]
      : []),
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <div className="p-8">
      {/* Back */}
      <Link href="/teams" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition mb-6">
        <ArrowLeft size={15} /> Teams
      </Link>

      {/* Header */}
      {teamLoading ? (
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-6" />
      ) : (
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-black">{team?.name}</h1>
              {canManage && (
                <button
                  id="open-edit-team"
                  onClick={() => setShowEdit(true)}
                  className="text-gray-600 hover:text-emerald-400 transition p-1 rounded"
                  title="Edit team"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {members?.length ?? 0} / {team?.max_size} members
              {team && (
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[team.role]}`}>
                  {team.role}
                </span>
              )}
            </p>
          </div>
          {tab === 'projects' && canManage && (
            <button
              id="open-create-project"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
            >
              <Plus size={16} /> New Project
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1 w-fit border border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="bg-emerald-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Projects tab */}
      {tab === 'projects' && (
        <>
          {projLoading && (
            <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
              <Loader2 className="animate-spin" size={20} /><span>Loading projects…</span>
            </div>
          )}
          {projError && (
            <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
              <AlertCircle size={24} className="text-red-400" />
              <p className="text-sm">Unable to load projects.</p>
              <button onClick={() => refetch()} className="text-sm text-emerald-400 hover:underline">Retry</button>
            </div>
          )}
          {!projLoading && !projError && projects?.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
              <FolderOpen size={36} className="text-gray-700" />
              <p className="text-sm">{canManage ? 'No projects yet. Create the first one.' : 'No projects in this team yet.'}</p>
            </div>
          )}
          {!projLoading && projects && projects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div key={project.id} className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-emerald-500/40 transition-all flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="h-9 w-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                      <FolderOpen size={16} className="text-teal-400" />
                    </div>
                    {canManage && (
                      <button
                        onClick={() => { if (confirm(`Delete "${project.name}"?`)) deleteProject.mutate(project.id); }}
                        id={`delete-project-${project.id}`}
                        className="text-gray-700 hover:text-red-400 transition p-1 rounded opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{project.name}</h3>
                    <span className="text-xs text-gray-500">{project.status}</span>
                  </div>
                  <Link
                    href={`/teams/${teamId}/projects/${project.id}`}
                    id={`view-project-${project.id}`}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-400 transition"
                  >
                    Open <ChevronRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-2">
          {!members && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-500" size={20} /></div>}
          {members?.map((m) => (
            <div key={m.user_id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3.5 flex items-center gap-4">
              <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-semibold text-sm flex-shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{m.name}</p>
                <p className="text-gray-500 text-xs truncate">{m.email}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                {m.role}
              </span>
            </div>
          ))}
          {members?.length === 0 && (
            <div className="flex flex-col items-center py-12 text-gray-500">
              <Users size={32} className="text-gray-700 mb-2" />
              <p className="text-sm">No members found.</p>
            </div>
          )}
        </div>
      )}

      {/* Join Requests tab — OWNER/ADMIN only */}
      {tab === 'requests' && canManage && (
        <JoinRequestsPanel teamId={teamId} />
      )}

      {/* Chat tab — all members */}
      {tab === 'chat' && (
        <ChatPanel teamId={teamId} />
      )}

      {showCreate && <CreateProjectModal teamId={teamId} onClose={() => setShowCreate(false)} />}

      {showEdit && team && (
        <EditTeamModal
          teamId={teamId}
          currentName={team.name}
          currentMaxSize={team.max_size}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
