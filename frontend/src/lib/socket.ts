// ---------------------------------------------------------------------------
// lib/socket.ts — Socket.IO client singleton
//
// The browser's HttpOnly cookie is automatically included in the WebSocket
// upgrade request when credentials: true is set on the CORS config.
// No manual token passing needed from JS.
// ---------------------------------------------------------------------------

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      withCredentials: true,     // sends HttpOnly cookie on WS handshake
      autoConnect: false,        // caller controls when to connect
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
