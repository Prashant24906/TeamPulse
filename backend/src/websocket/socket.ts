import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { createCorsOriginValidator } from '../config/cors';
import * as teamRepo from '../repositories/team.repository';

// ---------------------------------------------------------------------------
// Module-level Socket.IO instance — accessed via getIO()
// ---------------------------------------------------------------------------

let io: SocketIOServer;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO has not been initialized. Call initSocket() first.');
  return io;
}

// ---------------------------------------------------------------------------
// JWT payload shape (matches auth.middleware)
// ---------------------------------------------------------------------------

interface JwtPayload {
  userId: string;
}

// ---------------------------------------------------------------------------
// Extend Socket with our user context
// ---------------------------------------------------------------------------

interface AuthenticatedSocket extends Socket {
  user: { userId: string };
}

// ---------------------------------------------------------------------------
// Room naming convention
// ---------------------------------------------------------------------------

export function teamRoom(teamId: string): string {
  return `team:${teamId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// ---------------------------------------------------------------------------
// initSocket — attach Socket.IO to the existing HTTP server
// ---------------------------------------------------------------------------

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: createCorsOriginValidator(env.CORS_ORIGIN),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // -------------------------------------------------------------------------
  // Authentication middleware — runs before the socket is established.
  //
  // Token resolution priority:
  //   1. HttpOnly cookie 'token' from handshake headers
  //   2. Explicit socket.handshake.auth.token (Bearer prefix stripped if present)
  //   3. socket.handshake.headers.authorization (Bearer prefix stripped if present)
  //   4. socket.handshake.query.token (query parameter fallback)
  // -------------------------------------------------------------------------

  io.use((socket, next) => {
    // 1. Try cookie from the HTTP upgrade request headers
    const rawCookie = socket.handshake.headers?.cookie ?? '';
    const cookieToken = rawCookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('token='))
      ?.slice('token='.length);

    // 2. Explicit socket.handshake.auth.token
    let explicitToken = socket.handshake.auth?.token as string | undefined;
    if (explicitToken?.startsWith('Bearer ')) {
      explicitToken = explicitToken.slice(7).trim();
    }

    // 3. Authorization header
    const authHeader = socket.handshake.headers?.authorization;
    let headerToken: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      headerToken = authHeader.slice(7).trim();
    } else if (authHeader) {
      headerToken = authHeader.trim();
    }

    // 4. Query token fallback
    let queryToken = socket.handshake.query?.token as string | undefined;
    if (queryToken?.startsWith('Bearer ')) {
      queryToken = queryToken.slice(7).trim();
    }

    const token = cookieToken || explicitToken || headerToken || queryToken;

    if (!token) {
      console.warn(`[ws] Connection rejected: No auth token provided (socketId=${socket.id})`);
      return next(new Error('Authentication required'));
    }

    if (!env.JWT_SECRET) {
      console.error('[ws] Connection rejected: JWT_SECRET not configured');
      return next(new Error('Server misconfiguration'));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      (socket as AuthenticatedSocket).user = { userId: payload.userId };
      next();
    } catch (err) {
      console.warn(`[ws] Connection rejected: Invalid JWT token (${(err as Error).message}) (socketId=${socket.id})`);
      next(new Error('Invalid or expired token'));
    }
  });

  // -------------------------------------------------------------------------
  // Connection handler
  // -------------------------------------------------------------------------

  io.on('connection', async (socket) => {
    const { userId } = (socket as AuthenticatedSocket).user;
    console.log(`[ws] connected  userId=${userId} socketId=${socket.id}`);

    // -----------------------------------------------------------------------
    // Auto-join personal user room (for user-specific notifications, e.g.
    // join request approval/rejection delivered only to the requester).
    // -----------------------------------------------------------------------
    await socket.join(userRoom(userId));
    console.log(`[ws] ${userId} joined personal room ${userRoom(userId)}`);

    // -----------------------------------------------------------------------
    // Auto-join all team rooms for this user.
    // Team IDs come from the DATABASE — never from the client.
    // -----------------------------------------------------------------------

    try {
      const teams = await teamRepo.findTeamsByUserId(userId);
      for (const team of teams) {
        await socket.join(teamRoom(team.id));
        console.log(`[ws] ${userId} auto-joined ${teamRoom(team.id)}`);
      }
    } catch (err) {
      console.error('[ws] Failed to auto-join rooms:', err);
    }

    // -----------------------------------------------------------------------
    // join:team — explicit room join requested by the client.
    //
    // Security model:
    //   1. Client sends the teamId it wants to join
    //   2. Server checks team_members table (DB, never trusted from client)
    //   3. Only join if membership is confirmed
    //   4. Reject silently (or with callback error) otherwise
    // -----------------------------------------------------------------------

    socket.on('join:team', async (teamId: string, callback?: (err?: string) => void) => {
      try {
        if (typeof teamId !== 'string' || !teamId) {
          return callback?.('Invalid teamId');
        }

        const role = await teamRepo.findMemberRole(teamId, userId);

        if (!role) {
          console.warn(`[ws] REJECTED join:team — userId=${userId} teamId=${teamId} (not a member)`);
          return callback?.('Not a member of this team');
        }

        await socket.join(teamRoom(teamId));
        console.log(`[ws] ${userId} joined ${teamRoom(teamId)} (role=${role})`);
        callback?.();
      } catch (err) {
        console.error('[ws] join:team error:', err);
        callback?.('Internal error');
      }
    });

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------

    socket.on('disconnect', (reason) => {
      console.log(`[ws] disconnected userId=${userId} socketId=${socket.id} reason=${reason}`);
    });
  });

  console.log('[ws] Socket.IO initialized');
  return io;
}
