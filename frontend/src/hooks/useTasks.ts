'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';

interface TasksResponse { status: string; data: { tasks: Task[] } }
interface TaskResponse  { status: string; data: { task: Task } }

export function useTasks(projectId: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await api.get<TasksResponse>(`/projects/${projectId}/tasks`);
      return res.data.data.tasks;
    },
    enabled: !!projectId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigned_to?: string;
      due_date?: string;
    }) => {
      const res = await api.post<TaskResponse>(`/projects/${projectId}/tasks`, data);
      return res.data.data.task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, data }: {
      taskId: string;
      data: {
        name?: string;
        description?: string | null;
        status?: TaskStatus;
        priority?: TaskPriority;
        assigned_to?: string | null;
        due_date?: string | null;
      };
    }) => {
      const res = await api.patch<TaskResponse>(`/tasks/${taskId}`, data);
      return res.data.data.task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/tasks/${taskId}`);
      return taskId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}
