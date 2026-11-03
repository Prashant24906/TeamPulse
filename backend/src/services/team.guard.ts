// ---------------------------------------------------------------------------
// team.guard.ts — Relationship validation guard
//
// Asserts that a given teamId actually belongs to the given projectId.
// Called at the top of every service function that operates on a team
// through a project-scoped route (/projects/:projectId/teams/:teamId/...).
//
// Design:
//   - Independent of Express — takes plain string IDs, returns Promise<void>.
//   - Returns 404 (not 403) on mismatch so callers cannot enumerate
//     cross-project team IDs by observing error-type differences.
//   - Always fetches from DB (not cache) to guarantee fresh project_id.
// ---------------------------------------------------------------------------

import * as teamRepo from '../repositories/team.repository';
import { AppError } from '../middleware/error.middleware';

/**
 * Throws `AppError(404, 'Team not found')` if:
 *   - The team does not exist, OR
 *   - The team exists but belongs to a different project.
 *
 * @param teamId    The team UUID from the URL parameter.
 * @param projectId The project UUID from the URL parameter.
 */
export async function assertTeamBelongsToProject(
  teamId: string,
  projectId: string
): Promise<void> {
  const team = await teamRepo.findTeamById(teamId);
  if (!team || team.project_id !== projectId) {
    throw new AppError(404, 'Team not found');
  }
}
