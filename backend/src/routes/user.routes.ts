import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as userController from '../controllers/user.controller';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.patch('/me',                 userController.updateProfile);
router.post('/me/change-password',  userController.changePassword);

export default router;
