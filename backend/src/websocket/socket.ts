import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
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

// ---------------------------------------------------------------------------
// initSocket — attach Socket.IO to the existing HTTP server
// ---------------------------------------------------------------------------

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // -------------------------------------------------------------------------
  // Authentication middleware — runs before the socket is established.
  // The client must pass { auth: { token: '<JWT>' } } in the handshake.
  // -------------------------------------------------------------------------

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    if (!env.JWT_SECRET) {
      return next(new Error('Server misconfiguration'));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      (socket as AuthenticatedSocket).user = { userId: payload.userId };
      next();
    } catch {
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
