import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as taskController from '../controllers/task.controller';

const router = Router();

router.use(authenticate);

// Standalone task routes (by taskId)
router.get('/:taskId',    taskController.getTask);
router.patch('/:taskId',  taskController.updateTask);
router.delete('/:taskId', taskController.deleteTask);

export default router;
