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
    if (typeof window !== 'undefined') {
      console.log('[socket] Initializing Socket.IO client instance for target:', wsUrl);
    }
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

    // Diagnostic event listeners
    socket.on('connect', () => {
      console.log('[socket] connect event fired. Socket ID:', socket?.id, '| connected:', socket?.connected);
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error event fired:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnect event fired. Reason:', reason);
    });

    const token = getStoredToken();
    if (token) {
      socket.auth = { token };
    }
  }
  return socket;
}

export function connectSocket(): void {
  console.log('[socket] connectSocket() invoked.');
  const token = getStoredToken();
  console.log('[socket] Token retrieval in connectSocket(): token present =', !!token);
  if (!token) {
    console.warn('[socket] connectSocket() aborted: No auth token found in storage.');
    return;
  }
  const s = getSocket();
  s.auth = { token };
  console.log('[socket] Socket connection attempt to:', resolveWsUrl(), '| currently connected =', s.connected);
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    console.log('[socket] disconnectSocket() invoked.');
    socket.disconnect();
    socket = null;
  }
}
