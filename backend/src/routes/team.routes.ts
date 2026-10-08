import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import * as teamController     from '../controllers/team.controller';
import * as joinController     from '../controllers/teamJoinRequest.controller';
import * as messageController  from '../controllers/teamMessage.controller';

const router = Router();

// All team routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Team search — MUST be registered before /:teamId so Express does not
// interpret the literal string "search" as a teamId parameter.
// ---------------------------------------------------------------------------

router.get(
  '/search',
  rateLimit({ window: 60, max: 30, prefix: 'rl:search' }),
  joinController.searchTeams
);

// ---------------------------------------------------------------------------
// Team CRUD (direct by teamId — kept for backward compat / standalone use)
// ---------------------------------------------------------------------------

router.get('/',           teamController.getMyTeams);
router.get('/:teamId',    teamController.getTeam);
router.patch('/:teamId',  teamController.updateTeam);
router.delete('/:teamId', teamController.deleteTeam);

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

router.get('/:teamId/members',            teamController.getMembers);
router.post('/:teamId/members',           teamController.addMember);
router.patch('/:teamId/members/:userId',  teamController.updateMemberRole);
router.delete('/:teamId/members/:userId', teamController.removeMember);

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

router.post('/:teamId/join-requests',                      joinController.createJoinRequest);
router.get('/:teamId/join-requests',                       joinController.getJoinRequests);
router.patch('/:teamId/join-requests/:requestId',          joinController.updateJoinRequest);

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

router.get('/:teamId/messages',  messageController.getMessages);
router.post('/:teamId/messages', messageController.sendMessage);

export default router;
