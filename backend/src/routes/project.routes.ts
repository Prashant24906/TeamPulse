import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as projectController from '../controllers/project.controller';
import * as taskController    from '../controllers/task.controller';
import * as joinController    from '../controllers/teamJoinRequest.controller';
import * as messageController from '../controllers/teamMessage.controller';
import * as teamController    from '../controllers/team.controller';

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

router.post('/',           projectController.createProject);
router.get('/',            projectController.getMyProjects);
router.get('/:projectId',  projectController.getProject);
router.patch('/:projectId', projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

// ---------------------------------------------------------------------------
// Teams nested under a project
// ---------------------------------------------------------------------------

router.get('/:projectId/teams',  projectController.getProjectTeams);
router.post('/:projectId/teams', projectController.createTeamInProject);

// Team detail (scoped under project)
router.get('/:projectId/teams/:teamId',    teamController.getTeam);
router.patch('/:projectId/teams/:teamId',  teamController.updateTeam);
router.delete('/:projectId/teams/:teamId', teamController.deleteTeam);

// Members
router.get('/:projectId/teams/:teamId/members',            teamController.getMembers);
router.post('/:projectId/teams/:teamId/members',           teamController.addMember);
router.patch('/:projectId/teams/:teamId/members/:userId',  teamController.updateMemberRole);
router.delete('/:projectId/teams/:teamId/members/:userId', teamController.removeMember);

// Join requests
router.post('/:projectId/teams/:teamId/join-requests',           joinController.createJoinRequest);
router.get('/:projectId/teams/:teamId/join-requests',            joinController.getJoinRequests);
router.patch('/:projectId/teams/:teamId/join-requests/:requestId', joinController.updateJoinRequest);

// Chat
router.get('/:projectId/teams/:teamId/messages',  messageController.getMessages);
router.post('/:projectId/teams/:teamId/messages', messageController.sendMessage);

// ---------------------------------------------------------------------------
// Tasks nested under project > team
// ---------------------------------------------------------------------------

router.post('/:projectId/teams/:teamId/tasks',  taskController.createTask);
router.get('/:projectId/teams/:teamId/tasks',   taskController.getTasksByTeam);

export default router;
