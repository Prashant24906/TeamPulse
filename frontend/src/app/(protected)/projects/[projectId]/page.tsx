'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useProject, useProjectTeams, useCreateTeam, useDeleteProject,
  useProjectMembers, useUpdateProjectMemberRole, useKickProjectMember,
} from '@/hooks/useProjects';
import type { ProjectMember } from '@/hooks/useProjects';
import { useProjectJoinRequests, useResolveProjectJoinRequest } from '@/hooks/useProjectDiscovery';
import {
  ArrowLeft, Users, Plus, Trash2, ChevronRight, Loader2, AlertCircle, X,
  FolderOpen, Bell, Check, XCircle, UserCircle, UserMinus,
} from 'lucide-react';
import type { ProjectRole } from '@/types/project';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<ProjectRole, string> = {
  OWNER:  'text-amber-700 bg-amber-50 border border-amber-200',
  ADMIN:  'text-sky-700 bg-sky-50 border border-sky-200',
  MEMBER: 'text-gray-600 bg-gray-100 border border-gray-200',
};

const createTeamSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  max_size: z.coerce.number().int().min(2).max(100).default(10),
});

// ---------------------------------------------------------------------------
// Create team modal (within project)
// ---------------------------------------------------------------------------

function CreateTeamModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const createTeam = useCreateTeam(projectId);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">New Team</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition"><X size={18} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-600">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="create-team-form">
          <div>
            <label htmlFor="team-name" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">Team Name</label>
            <input
              id="team-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm transition"
              placeholder="e.g. Backend Team"
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="team-size" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">Max Members</label>
            <input
              id="team-size"
              type="number"
              min={2}
              max={100}
              value={form.max_size}
              onChange={(e) => setForm({ ...form, max_size: e.target.value })}
              className="w-full rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm transition"
            />
            {errors.max_size && <p className="mt-1 text-xs text-red-500">{errors.max_size}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50 transition text-sm font-medium">
              Cancel
            </button>
            <button
              id="create-team-submit"
              type="submit"
              disabled={createTeam.isPending}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-semibold transition text-sm shadow-sm"
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
// ProjectDetailPage
// ---------------------------------------------------------------------------

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();

  const { data: project, isLoading: projectLoading, isError: projectError } = useProject(projectId);
  const { data: teams,   isLoading: teamsLoading,   isError: teamsError }   = useProjectTeams(projectId);
  const deleteProject  = useDeleteProject();

  // Derive role early so hook conditions can use it
  const isOwnerOrAdmin = project?.role === 'OWNER' || project?.role === 'ADMIN';
  const isOwner        = project?.role === 'OWNER';

  const { data: joinRequests } = useProjectJoinRequests(isOwnerOrAdmin ? projectId : '');
  const resolveJoinReq         = useResolveProjectJoinRequest(projectId);
  const pendingCount           = joinRequests?.length ?? 0;

  const { data: members, isLoading: membersLoading } = useProjectMembers(isOwnerOrAdmin ? projectId : '');
  const updateMemberRole = useUpdateProjectMemberRole(projectId);
  const kickMember       = useKickProjectMember(projectId);

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [activeTab, setActiveTab]           = useState<'teams' | 'members' | 'requests'>('teams');

  const handleDeleteProject = async () => {
    if (!confirm(`Delete project "${project?.name}"? This removes all teams and tasks.`)) return;
    await deleteProject.mutateAsync(projectId);
    router.push('/projects');
  };

  if (projectLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
        <Loader2 className="animate-spin" size={20} /><span>Loading project…</span>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-500 py-16 text-center px-4">
        <AlertCircle size={28} className="text-red-400" />
        <p className="text-sm">Project not found or access denied.</p>
        <Link href="/projects" className="text-sm text-emerald-600 font-semibold hover:underline">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/projects" className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200/60 transition flex-shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{project.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Your role: <span className="font-semibold text-gray-700">{project.role}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
          {isOwnerOrAdmin && (
            <button
              id="create-team-btn"
              onClick={() => setShowCreateTeam(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus size={15} /> New Team
            </button>
          )}
          {isOwner && (
            <button
              id="delete-project-btn"
              onClick={handleDeleteProject}
              className="text-gray-400 hover:text-red-500 transition p-2 rounded-xl hover:bg-red-50 flex-shrink-0"
              title="Delete project"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {isOwnerOrAdmin && (
        <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto pb-1 flex-nowrap">
          <button
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-2 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition ${
              activeTab === 'teams'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Teams
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition ${
              activeTab === 'requests'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bell size={13} />
            Join Requests
            {pendingCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition ${
              activeTab === 'members'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={13} />
            Members
          </button>
        </div>
      )}

      {/* ── Teams tab ───────────────────────────────────────────── */}
      {activeTab === 'teams' && (
        <>
          {teamsLoading && (
            <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
              <Loader2 className="animate-spin" size={20} /><span>Loading teams…</span>
            </div>
          )}

          {teamsError && (
            <div className="text-center py-12 text-gray-500 text-sm">Unable to load teams.</div>
          )}

          {!teamsLoading && !teamsError && teams?.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
              <Users size={36} className="text-gray-300" />
              <p className="text-sm">No teams yet. Create the first one.</p>
            </div>
          )}

          {!teamsLoading && teams && teams.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {teams.map((team) => (
                <div key={team.id} className="relative group">
                  <Link
                    href={`/projects/${projectId}/teams/${team.id}`}
                    id={`team-card-${team.id}`}
                    className="block bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Users size={18} className="text-emerald-600" />
                      </div>
                    </div>
                    <h3 className="text-gray-900 font-semibold text-sm sm:text-base group-hover:text-emerald-600 transition-colors">
                      {team.name}
                    </h3>
                    <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                      Max {team.max_size} members <ChevronRight size={12} />
                    </p>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Join Requests tab ───────────────────────────────────── */}
      {activeTab === 'requests' && isOwnerOrAdmin && (
        <div className="space-y-3">
          {!joinRequests || joinRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
              <Bell size={32} className="text-gray-300" />
              <p className="text-sm">No pending join requests.</p>
            </div>
          ) : (
            joinRequests.map((req) => (
              <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{req.name}</p>
                  <p className="text-xs text-gray-400 truncate">{req.email}</p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    id={`approve-req-${req.id}`}
                    onClick={() => resolveJoinReq.mutateAsync({ requestId: req.id, status: 'APPROVED' })}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    id={`reject-req-${req.id}`}
                    onClick={() => resolveJoinReq.mutateAsync({ requestId: req.id, status: 'REJECTED' })}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition"
                  >
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Members tab ─────────────────────────────────────────── */}
      {activeTab === 'members' && isOwnerOrAdmin && (
        <div className="max-w-2xl space-y-3">
          {membersLoading ? (
            <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
              <Loader2 className="animate-spin" size={18} />
              <span className="text-sm">Loading members…</span>
            </div>
          ) : !members || members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
              <UserCircle size={32} className="text-gray-300" />
              <p className="text-sm">No members found.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-2">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              {members.map((m: ProjectMember) => (
                <div
                  key={m.user_id}
                  id={`project-member-${m.user_id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <UserCircle size={18} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                      {m.role}
                    </span>
                    {/* Promote / demote buttons — OWNER only, not on OWNER row */}
                    {isOwner && m.role !== 'OWNER' && (
                      <>
                        {m.role === 'MEMBER' ? (
                          <button
                            id={`promote-${m.user_id}`}
                            onClick={() => updateMemberRole.mutate({ userId: m.user_id, role: 'ADMIN' })}
                            disabled={updateMemberRole.isPending}
                            className="text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                          >
                            → Admin
                          </button>
                        ) : (
                          <button
                            id={`demote-${m.user_id}`}
                            onClick={() => updateMemberRole.mutate({ userId: m.user_id, role: 'MEMBER' })}
                            disabled={updateMemberRole.isPending}
                            className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                          >
                            → Member
                          </button>
                        )}
                        <button
                          id={`kick-${m.user_id}`}
                          onClick={() => {
                            if (confirm(`Remove ${m.name} from this project?`)) {
                              kickMember.mutate(m.user_id);
                            }
                          }}
                          disabled={kickMember.isPending}
                          title="Kick member"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition disabled:opacity-50"
                        >
                          <UserMinus size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {showCreateTeam && (
        <CreateTeamModal projectId={projectId} onClose={() => setShowCreateTeam(false)} />
      )}
    </div>
  );
}
