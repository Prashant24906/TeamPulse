import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as projectController from '../controllers/project.controller';
import * as taskController    from '../controllers/task.controller';

const router = Router();

router.use(authenticate);

// Standalone project routes (by projectId)
router.get('/:projectId',    projectController.getProject);
router.patch('/:projectId',  projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

// Task routes (project-scoped)
router.post('/:projectId/tasks', taskController.createTask);
router.get('/:projectId/tasks',  taskController.getTasksByProject);

export default router;
