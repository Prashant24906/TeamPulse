'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useProject } from '@/hooks/useProjects';
import { useTeam, useTeamMembers } from '@/hooks/useTeams';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import {
  ArrowLeft, Plus, X, Loader2, AlertCircle,
  Calendar, User, Flag, Trash2, Pencil
} from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'TODO',        label: 'Todo',        color: 'text-gray-400' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'text-amber-400' },
  { status: 'COMPLETED',   label: 'Completed',   color: 'text-emerald-400' },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  HIGH:   'text-red-400   bg-red-400/10   border-red-400/20',
  MEDIUM: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  LOW:    'text-gray-400  bg-gray-400/10  border-gray-700',
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
// Task Modal (Create / Edit)
// ---------------------------------------------------------------------------

function TaskModal({
  projectId,
  teamId,
  editTask,
  defaultStatus,
  onClose,
}: {
  projectId: string;
  teamId: string;
  editTask?: Task;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}) {
  const { data: members } = useTeamMembers(teamId);
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);

  const [form, setForm] = useState({
    name:        editTask?.name        ?? '',
    description: editTask?.description ?? '',
    priority:    editTask?.priority    ?? 'MEDIUM',
    status:      editTask?.status      ?? defaultStatus ?? 'TODO',
    assigned_to: editTask?.assigned_to ?? '',
    due_date:    editTask?.due_date    ? editTask.due_date.slice(0, 10) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = taskSchema.safeParse({
      ...form,
      assigned_to: form.assigned_to || undefined,
      due_date:    form.due_date    ? new Date(form.due_date).toISOString() : undefined,
    });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      Object.entries(fe).forEach(([k, v]) => { if (v?.[0]) fieldErrors[k] = v[0]; });
      setErrors(fieldErrors);
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
      setErrors({ general: 'Failed to save task.' });
    }
  };

  const isPending = createTask.isPending || updateTask.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{editTask ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition"><X size={18} /></button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="task-form">
          {/* Name */}
          <div>
            <label htmlFor="task-name" className="block text-sm text-gray-400 mb-1.5">Task Name</label>
            <input
              id="task-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              placeholder="e.g. Implement JWT auth"
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="task-desc" className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              id="task-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
              placeholder="Optional description…"
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-status" className="block text-sm text-gray-400 mb-1.5">Status</label>
              <select
                id="task-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              >
                <option value="TODO">Todo</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div>
              <label htmlFor="task-priority" className="block text-sm text-gray-400 mb-1.5">Priority</label>
              <select
                id="task-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label htmlFor="task-assignee" className="block text-sm text-gray-400 mb-1.5">Assign To</label>
            <select
              id="task-assignee"
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            >
              <option value="">Unassigned</option>
              {members?.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="task-due" className="block text-sm text-gray-400 mb-1.5">Due Date</label>
            <input
              id="task-due"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-gray-400 hover:text-white transition text-sm">Cancel</button>
            <button
              id="task-submit"
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-white font-medium transition text-sm"
            >
              {isPending ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  members,
  projectId,
  onEdit,
}: {
  task: Task;
  members: { user_id: string; name: string }[];
  projectId: string;
  onEdit: (task: Task) => void;
}) {
  const deleteTask = useDeleteTask(projectId);
  const assigneeName = members.find((m) => m.user_id === task.assigned_to)?.name;

  return (
    <div className="group bg-gray-950 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-white text-sm font-medium leading-snug flex-1">{task.name}</h4>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onEdit(task)}
            id={`edit-task-${task.id}`}
            className="text-gray-600 hover:text-violet-400 transition p-1 rounded"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${task.name}"?`)) deleteTask.mutate(task.id); }}
            id={`delete-task-${task.id}`}
            className="text-gray-600 hover:text-red-400 transition p-1 rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {task.description && (
        <p className="text-gray-500 text-xs mb-3 line-clamp-2">{task.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>
          <Flag size={10} className="inline mr-1" />{task.priority}
        </span>

        {assigneeName && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <User size={11} />{assigneeName}
          </span>
        )}

        {task.due_date && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar size={11} />
            {new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  status,
  label,
  color,
  tasks,
  members,
  projectId,
  teamId,
  onEdit,
  canManage,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  members: { user_id: string; name: string }[];
  projectId: string;
  teamId: string;
  onEdit: (task: Task) => void;
  canManage: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex flex-col bg-gray-900/50 border border-gray-800 rounded-xl min-h-[400px]">
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${color}`}>{label}</span>
          <span className="text-xs text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">{tasks.length}</span>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            id={`add-task-${status}`}
            className="text-gray-600 hover:text-violet-400 transition p-1 rounded"
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Tasks */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="text-center text-gray-700 text-xs py-8">No tasks</p>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            members={members}
            projectId={projectId}
            onEdit={onEdit}
          />
        ))}
      </div>

      {showCreate && (
        <TaskModal
          projectId={projectId}
          teamId={teamId}
          defaultStatus={status}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project (Kanban) Page
// ---------------------------------------------------------------------------

export default function ProjectPage({
  params,
}: {
  params: Promise<{ teamId: string; projectId: string }>;
}) {
  const { teamId, projectId } = use(params);
  const { data: project, isLoading: projLoading } = useProject(projectId);
  const { data: tasks,   isLoading: tasksLoading, isError, refetch } = useTasks(projectId);
  const { data: members = [] } = useTeamMembers(teamId);
  const { data: team }  = useTeam(teamId);

  const [editTask, setEditTask] = useState<Task | undefined>();

  const myRole = team?.role ?? 'MEMBER';
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'MEMBER'; // all can create

  const tasksByStatus = (status: TaskStatus) =>
    tasks?.filter((t) => t.status === status) ?? [];

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Back */}
      <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition mb-6">
        <ArrowLeft size={15} /> {project?.name ?? 'Project'}
      </Link>

      {/* Header */}
      {projLoading ? (
        <div className="h-7 w-56 bg-gray-800 rounded animate-pulse mb-6" />
      ) : (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{project?.name}</h1>
          <span className="text-xs text-gray-500">{project?.status}</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
          <AlertCircle size={24} className="text-red-400" />
          <p className="text-sm">Unable to load tasks.</p>
          <button onClick={() => refetch()} className="text-sm text-violet-400 hover:underline">Retry</button>
        </div>
      )}

      {tasksLoading && !isError && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-500" size={24} />
        </div>
      )}

      {/* Kanban Board */}
      {!tasksLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          {COLUMNS.map(({ status, label, color }) => (
            <KanbanColumn
              key={status}
              status={status}
              label={label}
              color={color}
              tasks={tasksByStatus(status)}
              members={members}
              projectId={projectId}
              teamId={teamId}
              onEdit={setEditTask}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {/* Edit task modal */}
      {editTask && (
        <TaskModal
          projectId={projectId}
          teamId={teamId}
          editTask={editTask}
          onClose={() => setEditTask(undefined)}
        />
      )}
    </div>
  );
}

