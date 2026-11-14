// ---------------------------------------------------------------------------
// lib/api.ts — Axios instance with JWT Authorization & Persistence
//
// - baseURL from NEXT_PUBLIC_API_URL
// - Sends credentials (cookies) on every request for cookie-compatible environments
// - Persists JWT token in localStorage and attaches Authorization: Bearer <token>
// - Response interceptor handles 401s without breaking public pages or login errors
// ---------------------------------------------------------------------------

import axios from 'axios';

const TOKEN_KEY = 'teampulse_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Authorization: Bearer <token> to every request
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 unauthorized gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const url = error.config?.url || '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

      // Do not redirect on login or register errors so the form can display validation errors
      if (!isAuthEndpoint) {
        clearStoredToken();

        // Avoid redirecting visitors on public pages or during initial auth-check (/auth/me)
        const isMeEndpoint = url.includes('/auth/me');
        const isPublicPage =
          window.location.pathname === '/' ||
          window.location.pathname === '/login' ||
          window.location.pathname === '/register';

        if (!isPublicPage && !isMeEndpoint && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
