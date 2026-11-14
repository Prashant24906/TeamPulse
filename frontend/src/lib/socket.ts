// ---------------------------------------------------------------------------
// lib/socket.ts — Socket.IO client singleton
//
// Supports both HttpOnly cookies and explicit auth token passing for cross-origin environments.
// ---------------------------------------------------------------------------

import { io, Socket } from 'socket.io-client';
import { getStoredToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = getStoredToken();
    socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      withCredentials: true,     // sends HttpOnly cookie on WS handshake if available
      autoConnect: false,        // caller controls when to connect
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: (cb) => {
        cb({ token: getStoredToken() });
      },
    });
    if (token) {
      socket.auth = { token };
    }
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  const token = getStoredToken();
  if (token) {
    s.auth = { token };
  }
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
