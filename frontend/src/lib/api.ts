// ---------------------------------------------------------------------------
// lib/api.ts — Axios instance
//
// - baseURL from env
// - Sends credentials (cookies) on every request — credentials: 'include'
// - No manual token management — HttpOnly cookie is sent automatically
// - On 401 → redirect to /login
// ---------------------------------------------------------------------------

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,   // send HttpOnly cookie on every request
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor: redirect to /login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
