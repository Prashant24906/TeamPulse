'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { User } from '@/types/user';

interface AuthResponse {
  status: string;
  data: { user: User };
}

export function useAuth() {
  return useQuery<User>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<AuthResponse>('/auth/me');
      return res.data.data.user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post<AuthResponse>('/auth/login', data);
      return res.data.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: { name: string; username: string; email: string; password: string }) => {
      const res = await api.post<AuthResponse>('/auth/register', data);
      return res.data.data.user;
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string; username?: string }) => {
      const res = await api.patch<AuthResponse>('/users/me', data);
      return res.data.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await api.post('/users/me/change-password', data);
    },
  });
}
