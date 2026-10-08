'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects';
import {
  FolderOpen, Plus, Trash2, ChevronRight, Loader2, AlertCircle, X,
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

// ---------------------------------------------------------------------------
// Create project modal
// ---------------------------------------------------------------------------

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useCreateProject();
  const [name, setName]   = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsed = schema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    try {
      await createProject.mutateAsync(parsed.data);
      onClose();
    } catch {
      setError('Failed to create project. Try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition"><X size={18} /></button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="create-project-form">
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1.5">Project Name</label>
            <input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              placeholder="e.g. TeamPulse v2"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50 transition text-sm font-medium">
              Cancel
            </button>
            <button
              id="create-project-submit"
              type="submit"
              disabled={createProject.isPending}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-semibold transition text-sm"
            >
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectsPage
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const deleteProject = useDeleteProject();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-gray-500 text-sm">Your projects — each contains teams and tasks.</p>
        </div>
        <button
          id="open-create-project"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
          <Loader2 className="animate-spin" size={20} /><span>Loading projects…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 text-gray-500 py-12">
          <AlertCircle size={24} className="text-red-400" />
          <p className="text-sm">Unable to load projects.</p>
          <button onClick={() => refetch()} className="text-sm text-emerald-600 hover:underline">Retry</button>
        </div>
      )}

      {!isLoading && !isError && projects?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <FolderOpen size={36} className="text-gray-300" />
          <p className="text-sm">No projects yet. Create one to get started.</p>
        </div>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="relative group">
              <Link
                href={`/projects/${project.id}`}
                id={`project-card-${project.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-50 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <FolderOpen size={18} className="text-emerald-600" />
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[project.role]}`}>
                    {project.role}
                  </span>
                </div>
                <h3 className="text-gray-900 font-semibold group-hover:text-emerald-600 transition-colors">
                  {project.name}
                </h3>
                <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                  View teams & tasks <ChevronRight size={12} />
                </p>
              </Link>

              {project.role === 'OWNER' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Delete project "${project.name}"? This will also delete all teams and tasks.`)) {
                      deleteProject.mutate(project.id);
                    }
                  }}
                  id={`delete-project-${project.id}`}
                  className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1.5 rounded"
                  title="Delete project"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
