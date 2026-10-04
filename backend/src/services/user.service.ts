import bcrypt from 'bcrypt';
import { AppError } from '../middleware/error.middleware';
import * as userRepo from '../repositories/user.repository';

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Update profile (name, username)
// ---------------------------------------------------------------------------

export async function updateProfile(
  userId: string,
  fields: { name?: string; username?: string }
) {
  if (!fields.name && !fields.username) {
    throw new AppError(400, 'Provide at least one field to update');
  }

  // Check username uniqueness if being changed
  if (fields.username) {
    const existing = await userRepo.findByUsername(fields.username);
    if (existing && existing.id !== userId) {
      throw new AppError(409, 'This username is already taken');
    }
  }

  const updated = await userRepo.updateUser(userId, fields);
  return updated;
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await userRepo.findByIdWithHash(userId);
  if (!user) throw new AppError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new AppError(401, 'Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userRepo.updatePasswordHash(userId, newHash);
}
