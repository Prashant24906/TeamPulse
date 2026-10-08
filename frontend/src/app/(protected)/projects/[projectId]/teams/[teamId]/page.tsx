'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useTeam, useTeamMembers, useUpdateTeam, useRemoveMember,
  useUpdateMemberRole, useAddMember, useLeaveTeam,
} from '@/hooks/useTeams';
import { useAuth } from '@/hooks/useAuth';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { useJoinRequests, useUpdateJoinRequest } from '@/hooks/useTeamDiscovery';
import { ChatPanel } from '@/components/chat/ChatPanel';
import {
  FolderOpen, Users, Plus, Trash2, ChevronRight,
  Loader2, AlertCircle, X, ArrowLeft, UserCheck, Inbox, Pencil,
  ShieldCheck, UserPlus, LogOut,
} from 'lucide-react';
import type { TeamRole } from '@/types/team';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: { status: TaskStatus; label: string; color: string; bg: string }[] = [
  { status: 'TODO',        label: 'To Do',       color: 'text-gray-500',    bg: 'bg-gray-50' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'text-amber-600',   bg: 'bg-amber-50' },
  { status: 'COMPLETED',   label: 'Completed',   color: 'text-emerald-600', bg: 'bg-emerald-50' },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  HIGH:   'text-red-500   bg-red-50   border-red-200',
  MEDIUM: 'text-amber-500 bg-amber-50 border-amber-200',
  LOW:    'text-gray-400  bg-gray-100 border-gray-200',
};

const ROLE_COLORS: Record<TeamRole, string> = {
  OWNER:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  ADMIN:  'text-sky-400   bg-sky-400/10   border-sky-400/20',
  MEMBER: 'text-gray-400  bg-gray-400/10  border-gray-700',
};

const taskSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  status:      z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).default('TODO'),
  assigned_to: z.string().optional(),
  due_date:    z.string().optional(),
});

// ---------------------------------------------------------------------------
// TaskModal
// ---------------------------------------------------------------------------

function TaskModal({
  projectId, teamId, editTask, defaultStatus, onClose,
}: {
  projectId: string;
  teamId: string;
  editTask?: Task;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}) {
  const { data: members } = useTeamMembers(teamId);
  const createTask = useCreateTask(projectId, teamId);
  const updateTask = useUpdateTask(teamId);

  const [form, setForm] = useState({
    name:        editTask?.name        ?? '',
    description: editTask?.description ?? '',
    priority:    (editTask?.priority   ?? 'MEDIUM') as TaskPriority,
    status:      (editTask?.status     ?? defaultStatus ?? 'TODO') as TaskStatus,
    assigned_to: editTask?.assigned_to ?? '',
    due_date:    editTask?.due_date ? String(editTask.due_date).slice(0, 10) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = taskSchema.safeParse({
      ...form,
      assigned_to: form.assigned_to || undefined,
      due_date:    form.due_date ? new Date(form.due_date).toISOString() : undefined,
    });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const fe: Record<string, string> = {};
      Object.entries(fieldErrors).forEach(([k, v]) => { if (v?.[0]) fe[k] = v[0]; });
      setErrors(fe);
      return;
    }
    try {
      if (editTask) {
        await updateTask.mutateAsync({ taskId: editTask.id, data: parsed.data });
      } else {
        await createTask.mutateAsync(parsed.data);
      }
      onClose();
    } catch {
      setErrors({ general: 'Failed to save task. Try again.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{editTask ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {errors.general && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{errors.general}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Task name" autoFocus />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              rows={2} placeholder="Optional description" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                <option value="">Unassigned</option>
                {members?.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={createTask.isPending || updateTask.isPending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-semibold text-sm">
              {createTask.isPending || updateTask.isPending ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamDetailPage
// ---------------------------------------------------------------------------

export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; teamId: string }>;
}) {
  const { projectId, teamId } = use(params);
  const router = useRouter();
  const { data: user } = useAuth();

  const { data: team,    isLoading: teamLoading }  = useTeam(teamId);
  const { data: members, isLoading: membersLoading } = useTeamMembers(teamId);
  const { data: tasks,   isLoading: tasksLoading }  = useTasks(projectId, teamId);
  const { data: joinRequests } = useJoinRequests(teamId);

  const leaveTeam       = useLeaveTeam(teamId);
  const deleteTask      = useDeleteTask(teamId);
  const updateJoinReq   = useUpdateJoinRequest(teamId);

  const [taskModal, setTaskModal] = useState<{
    open: boolean; edit?: Task; defaultStatus?: TaskStatus;
  }>({ open: false });
  const [activeTab, setActiveTab] = useState<'board' | 'members' | 'requests' | 'chat'>('board');

  const myRole = team?.role;
  const isOwnerOrAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  if (teamLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
        <Loader2 className="animate-spin" size={20} /><span>Loading team…</span>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-500 py-16">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm">Team not found.</p>
        <Link href={`/projects/${projectId}`} className="text-sm text-emerald-600 hover:underline">Back to Project</Link>
      </div>
    );
  }

  // Organise tasks by column
  const byStatus = (status: TaskStatus) => (tasks ?? []).filter((t) => t.status === status);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 mb-1">
          <Link href={`/projects/${projectId}`} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft size={18} />
          </Link>
          <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Users size={16} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{team.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {myRole && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[myRole]}`}>
                {myRole}
              </span>
            )}
            {myRole !== 'OWNER' && (
              <button
                onClick={async () => {
                  if (!confirm('Leave this team?')) return;
                  await leaveTeam.mutateAsync(user!.id);
                  router.push(`/projects/${projectId}`);
                }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition"
              >
                <LogOut size={14} /> Leave
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mt-4">
          {(['board', 'members', 'requests', 'chat'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {tab === 'requests'
                ? `Requests${joinRequests?.length ? ` (${joinRequests.length})` : ''}`
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {activeTab === 'board' && (
            <button
              onClick={() => setTaskModal({ open: true })}
              className="ml-auto flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition"
            >
              <Plus size={14} /> New Task
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* Board */}
        {activeTab === 'board' && (
          <div className="p-6 flex gap-4 items-start min-h-full">
            {tasksLoading ? (
              <div className="flex items-center gap-2 text-gray-400 py-12 w-full justify-center">
                <Loader2 className="animate-spin" size={18} /><span>Loading tasks…</span>
              </div>
            ) : (
              COLUMNS.map((col) => (
                <div key={col.status} className={`flex-1 min-w-[260px] rounded-xl ${col.bg} p-4`}>
                  <div className={`flex items-center justify-between mb-3`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>{col.label}</span>
                    <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                      {byStatus(col.status).length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {byStatus(col.status).map((task) => (
                      <div
                        key={task.id}
                        className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 leading-snug">{task.name}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                            <button onClick={() => setTaskModal({ open: true, edit: task })}
                              className="text-gray-400 hover:text-emerald-600 p-1"><Pencil size={12} /></button>
                            {isOwnerOrAdmin && (
                              <button onClick={() => {
                                if (confirm('Delete this task?')) deleteTask.mutate(task.id);
                              }} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                        {task.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority as TaskPriority]}`}>
                            {task.priority}
                          </span>
                          {task.due_date && (
                            <span className="text-xs text-gray-400">
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setTaskModal({ open: true, defaultStatus: col.status })}
                    className="mt-2 w-full text-xs text-gray-400 hover:text-emerald-600 flex items-center gap-1 py-1.5 hover:bg-white/60 rounded-lg transition justify-center"
                  >
                    <Plus size={12} /> Add task
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Members */}
        {activeTab === 'members' && (
          <div className="p-8 max-w-2xl">
            <div className="space-y-3">
              {membersLoading ? (
                <div className="flex items-center gap-2 text-gray-400"><Loader2 className="animate-spin" size={16} /></div>
              ) : members?.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Join Requests */}
        {activeTab === 'requests' && (
          <div className="p-8 max-w-2xl">
            {!joinRequests?.length ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <Inbox size={28} className="text-gray-300" />
                <p className="text-sm">No pending join requests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{req.name ?? req.user_id}</p>
                      <p className="text-xs text-gray-400">{req.email}</p>
                    </div>
                    {isOwnerOrAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateJoinReq.mutate({ requestId: req.id, status: 'APPROVED' })}
                          className="text-xs font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => updateJoinReq.mutate({ requestId: req.id, status: 'REJECTED' })}
                          className="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {activeTab === 'chat' && (
          <div className="h-full">
            <ChatPanel teamId={teamId} />
          </div>
        )}
      </div>

      {/* Task Modal */}
      {taskModal.open && (
        <TaskModal
          projectId={projectId}
          teamId={teamId}
          editTask={taskModal.edit}
          defaultStatus={taskModal.defaultStatus}
          onClose={() => setTaskModal({ open: false })}
        />
      )}
    </div>
  );
}
