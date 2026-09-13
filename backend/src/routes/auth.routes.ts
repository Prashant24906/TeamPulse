import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes — strict rate limit (10 req/min per IP)
router.post('/register', authRateLimit, authController.register);
router.post('/login',    authRateLimit, authController.login);

// Protected routes
router.get('/me', authenticate, authController.me);

export default router;
