import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';
import * as userService from '../services/user.service';

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(72),
});

// ---------------------------------------------------------------------------
// PATCH /api/users/me  — update name / username
// ---------------------------------------------------------------------------

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(new AppError(400, 'Validation failed', details));
    }

    const user = await userService.updateProfile(req.user!.userId, result.data);

    res.status(200).json({ status: 'success', data: { user } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/users/me/change-password
// ---------------------------------------------------------------------------

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(new AppError(400, 'Validation failed', details));
    }

    await userService.changePassword(
      req.user!.userId,
      result.data.currentPassword,
      result.data.newPassword
    );

    res.status(200).json({ status: 'success', message: 'Password updated' });
  } catch (err) {
    next(err);
  }
}
