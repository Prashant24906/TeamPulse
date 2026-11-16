'use client';

import { useState } from 'react';
import {
  useProjectResources,
  useCreateProjectResource,
  useUpdateProjectResource,
  useDeleteProjectResource,
} from '@/hooks/useProjectResources';
import type { ProjectResource } from '@/types/projectResource';
import {
  Link2,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  Globe,
} from 'lucide-react';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const resourceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Resource name is required')
    .max(100, 'Resource name must be at most 100 characters'),
  url: z
    .string()
    .trim()
    .min(1, 'URL is required')
    .max(2048, 'URL must be at most 2048 characters')
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'URL must start with http:// or https://' }
    ),
});

// ---------------------------------------------------------------------------
// Resource Modal (Add or Edit)
// ---------------------------------------------------------------------------

interface ResourceModalProps {
  projectId: string;
  resource?: ProjectResource | null;
  onClose: () => void;
}

export function ResourceModal({ projectId, resource, onClose }: ResourceModalProps) {
  const isEditing = !!resource;
  const createMutation = useCreateProjectResource(projectId);
  const updateMutation = useUpdateProjectResource(projectId);

  const [form, setForm] = useState({
    name: resource?.name ?? '',
    url: resource?.url ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = resourceSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      const fe = parsed.error.flatten().fieldErrors;
      Object.entries(fe).forEach(([k, v]) => {
        if (v?.[0]) fieldErrors[k] = v[0];
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      if (isEditing && resource) {
        await updateMutation.mutateAsync({
          resourceId: resource.id,
          data: parsed.data,
        });
      } else {
        await createMutation.mutateAsync(parsed.data);
      }
      onClose();
    } catch (err: any) {
      setErrors({
        general:
          err.response?.data?.message ||
          `Failed to ${isEditing ? 'update' : 'add'} resource. Please check the inputs and try again.`,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            {isEditing ? 'Edit Resource' : 'Add Resource'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-600">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" id="resource-form">
          <div>
            <label
              htmlFor="resource-name"
              className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5"
            >
              Resource Name
            </label>
            <input
              id="resource-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm transition"
              placeholder="e.g. GitHub Repository, Figma Design, Docs"
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label
              htmlFor="resource-url"
              className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5"
            >
              URL
            </label>
            <input
              id="resource-url"
              type="text"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm transition"
              placeholder="https://github.com/example/repository"
            />
            {errors.url && <p className="mt-1 text-xs text-red-500">{errors.url}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-gray-600 hover:bg-gray-50 transition text-sm font-medium"
            >
              Cancel
            </button>
            <button
              id="resource-submit-btn"
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-white font-semibold transition text-sm shadow-sm flex items-center justify-center gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{isEditing ? 'Saving…' : 'Adding…'}</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Add Resource'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectResources Section Component
// ---------------------------------------------------------------------------

interface ProjectResourcesProps {
  projectId: string;
  isOwnerOrAdmin: boolean;
  onOpenAddModal?: () => void;
}

export function ProjectResources({
  projectId,
  isOwnerOrAdmin,
}: ProjectResourcesProps) {
  const { data: resources, isLoading, isError, refetch } = useProjectResources(projectId);
  const deleteMutation = useDeleteProjectResource(projectId);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    resource?: ProjectResource | null;
  }>({
    isOpen: false,
    resource: null,
  });

  const handleDelete = async (resource: ProjectResource) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the resource "${resource.name}"?`
      )
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(resource.id);
    } catch {
      alert('Failed to delete resource. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
        <Loader2 className="animate-spin" size={20} />
        <span>Loading resources…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
        <AlertCircle size={28} className="text-red-400" />
        <p className="text-sm">Failed to load project resources.</p>
        <button
          onClick={() => refetch()}
          className="text-sm text-emerald-600 hover:underline font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Subheader */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={16} className="text-emerald-600" />
            Project Resources
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            External links, repositories, and documentation for project members.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            id="add-resource-btn"
            onClick={() => setModalState({ isOpen: true, resource: null })}
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl transition shadow-sm self-start sm:self-auto flex-shrink-0"
          >
            <Plus size={14} /> Add Resource
          </button>
        )}
      </div>

      {/* Empty State */}
      {(!resources || resources.length === 0) && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
          <Globe size={36} className="text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-700">No resources yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Save useful links such as GitHub repositories, Figma designs, or documentation.
            </p>
          </div>
          {isOwnerOrAdmin && (
            <button
              onClick={() => setModalState({ isOpen: true, resource: null })}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-lg border border-emerald-200 transition"
            >
              <Plus size={13} /> Add the first resource
            </button>
          )}
        </div>
      )}

      {/* Resources Grid */}
      {resources && resources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {resources.map((resource) => (
            <div
              key={resource.id}
              id={`resource-card-${resource.id}`}
              className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-gray-300 hover:shadow-sm transition flex flex-col justify-between gap-3 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 text-emerald-600">
                    <Link2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {resource.name}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Added {new Date(resource.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Edit & Delete Controls for OWNER and ADMIN */}
                {isOwnerOrAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      id={`edit-resource-${resource.id}`}
                      onClick={() => setModalState({ isOpen: true, resource })}
                      title="Edit resource"
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      id={`delete-resource-${resource.id}`}
                      onClick={() => handleDelete(resource)}
                      title="Delete resource"
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Clickable External Link */}
              <div className="pt-2 border-t border-gray-100 flex items-center">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium truncate max-w-full hover:underline group-hover:text-emerald-700"
                >
                  <span className="truncate">{resource.url}</span>
                  <ExternalLink size={12} className="flex-shrink-0" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalState.isOpen && (
        <ResourceModal
          projectId={projectId}
          resource={modalState.resource}
          onClose={() => setModalState({ isOpen: false, resource: null })}
        />
      )}
    </div>
  );
}
