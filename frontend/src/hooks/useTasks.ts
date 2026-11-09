'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Task, ClosedTask } from '@/types/task';

interface TasksResponse       { status: string; data: { tasks: Task[] } }
interface ClosedTasksResponse { status: string; data: { tasks: ClosedTask[] } }
interface TaskResponse        { status: string; data: { task: Task } }

export function useTasks(projectId: string, teamId: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', teamId],
    queryFn: async () => {
      const res = await api.get<TasksResponse>(
        `/projects/${projectId}/teams/${teamId}/tasks`
      );
      return res.data.data.tasks;
    },
    enabled: !!projectId && !!teamId,
  });
}

export function useClosedTasks(projectId: string, teamId: string) {
  return useQuery<ClosedTask[]>({
    queryKey: ['closed-tasks', teamId],
    queryFn: async () => {
      const res = await api.get<ClosedTasksResponse>(
        `/projects/${projectId}/teams/${teamId}/tasks/closed`
      );
      return res.data.data.tasks;
    },
    enabled: !!projectId && !!teamId,
  });
}

export function useCreateTask(projectId: string, teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      assigned_to?: string;
      status?: string;
      priority?: string;
      due_date?: string;
    }) => {
      const res = await api.post<TaskResponse>(
        `/projects/${projectId}/teams/${teamId}/tasks`,
        data
      );
      return res.data.data.task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', teamId] }),
  });
}

export function useUpdateTask(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, data }: {
      taskId: string;
      data: {
        name?: string;
        description?: string | null;
        assigned_to?: string | null;
        status?: string;
        priority?: string;
        due_date?: string | null;
      };
    }) => {
      const res = await api.patch<TaskResponse>(`/tasks/${taskId}`, data);
      return res.data.data.task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', teamId] });
      qc.invalidateQueries({ queryKey: ['closed-tasks', teamId] });
    },
  });
}

export function useCloseTask(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.post<TaskResponse>(`/tasks/${taskId}/close`);
      return res.data.data.task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', teamId] });
      qc.invalidateQueries({ queryKey: ['closed-tasks', teamId] });
    },
  });
}

export function useReopenTask(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.post<TaskResponse>(`/tasks/${taskId}/reopen`);
      return res.data.data.task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', teamId] });
      qc.invalidateQueries({ queryKey: ['closed-tasks', teamId] });
    },
  });
}

export function useDeleteTask(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/tasks/${taskId}`);
      return taskId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', teamId] });
      qc.invalidateQueries({ queryKey: ['closed-tasks', teamId] });
    },
  });
}
