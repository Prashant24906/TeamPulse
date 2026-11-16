// ---------------------------------------------------------------------------
// lib/socket.ts — Socket.IO client singleton
//
// Supports both HttpOnly cookies and explicit auth token passing for cross-origin environments.
// Uses WebSocket transport first to avoid Engine.IO polling session loss on proxies.
// ---------------------------------------------------------------------------

import { io, Socket } from 'socket.io-client';
import { getStoredToken } from './api';

let socket: Socket | null = null;

function resolveWsUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
  return url.replace(/\/+$/, '');
}

export function getSocket(): Socket {
  if (!socket) {
    const wsUrl = resolveWsUrl();
    socket = io(wsUrl, {
      transports: ['websocket', 'polling'], // Prioritize WebSocket to prevent Railway session stickiness loss
      withCredentials: true,                // sends HttpOnly cookie on WS handshake if available
      autoConnect: false,                   // caller controls when to connect
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: (cb) => {
        const token = getStoredToken();
        cb({ token: token || '' });
      },
    });

    const token = getStoredToken();
    if (token) {
      socket.auth = { token };
    }
  }
  return socket;
}

export function connectSocket(): void {
  const token = getStoredToken();
  if (!token) {
    // Prevent unauthenticated connections that trigger HTTP 400 handshake errors
    return;
  }
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
