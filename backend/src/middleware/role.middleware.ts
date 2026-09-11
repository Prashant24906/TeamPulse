import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';
import * as teamRepo from '../repositories/team.repository';
import type { TeamRole } from '../repositories/team.repository';

// ---------------------------------------------------------------------------
// Extend Express Request with teamRole
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      teamRole?: TeamRole;
    }
  }
}

// ---------------------------------------------------------------------------
// requireTeamRole(...allowed)
//
// Middleware factory that:
//   1. Reads req.params.teamId
//   2. Looks up the caller's role in that team
//   3. Attaches it to req.teamRole
//   4. If `allowed` roles are specified, returns 403 if caller's role
//      is not in the list
//
// Usage (in routes):
//   router.delete('/:teamId', authenticate, requireTeamRole('OWNER'), controller.deleteTeam)
//   router.get('/:teamId/members', authenticate, requireTeamRole(), controller.getMembers)
// ---------------------------------------------------------------------------

export function requireTeamRole(...allowed: TeamRole[]) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { teamId } = req.params;
      const userId = req.user!.userId;

      const role = await teamRepo.findMemberRole(teamId, userId);

      if (!role) {
        return next(new AppError(403, 'You are not a member of this team'));
      }

      req.teamRole = role;

      if (allowed.length > 0 && !allowed.includes(role)) {
        return next(
          new AppError(403, 'You do not have permission to perform this action')
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
