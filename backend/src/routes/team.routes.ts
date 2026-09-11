import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as teamController from '../controllers/team.controller';
import * as projectController from '../controllers/project.controller';

const router = Router();

// All team routes require authentication
router.use(authenticate);

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

router.get('/:teamId/members',              teamController.getMembers);
router.post('/:teamId/members',             teamController.addMember);
router.patch('/:teamId/members/:userId',    teamController.updateMemberRole);
router.delete('/:teamId/members/:userId',   teamController.removeMember);

// ---------------------------------------------------------------------------
// Projects (team-scoped)
// ---------------------------------------------------------------------------

router.post('/:teamId/projects', projectController.createProject);
router.get('/:teamId/projects',  projectController.getProjectsByTeam);

export default router;
