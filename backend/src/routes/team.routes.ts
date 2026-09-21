import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import * as teamController     from '../controllers/team.controller';
import * as projectController  from '../controllers/project.controller';
import * as joinController     from '../controllers/teamJoinRequest.controller';

const router = Router();

// All team routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Team search — MUST be registered before /:teamId so Express does not
// interpret the literal string "search" as a teamId parameter.
// Tighter rate limit (30 req/min) to protect the ILIKE query.
// ---------------------------------------------------------------------------

router.get(
  '/search',
  rateLimit({ window: 60, max: 30, prefix: 'rl:search' }),
  joinController.searchTeams
);

// ---------------------------------------------------------------------------
// Team CRUD
// ---------------------------------------------------------------------------

router.post('/',          teamController.createTeam);
router.get('/',           teamController.getMyTeams);
router.get('/:teamId',    teamController.getTeam);
router.patch('/:teamId',  teamController.updateTeam);
router.delete('/:teamId', teamController.deleteTeam);

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

router.get('/:teamId/members',           teamController.getMembers);
router.post('/:teamId/members',          teamController.addMember);
router.patch('/:teamId/members/:userId', teamController.updateMemberRole);
router.delete('/:teamId/members/:userId',teamController.removeMember);

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

router.post('/:teamId/join-requests',                      joinController.createJoinRequest);
router.get('/:teamId/join-requests',                       joinController.getJoinRequests);
router.patch('/:teamId/join-requests/:requestId',          joinController.updateJoinRequest);

// ---------------------------------------------------------------------------
// Projects (team-scoped)
// ---------------------------------------------------------------------------

router.post('/:teamId/projects', projectController.createProject);
router.get('/:teamId/projects',  projectController.getProjectsByTeam);

export default router;
