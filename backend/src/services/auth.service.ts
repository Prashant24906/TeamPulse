import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import * as userRepo from '../repositories/user.repository';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signToken(userId: string): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function register(input: RegisterInput) {
  // 1. Check email is not already taken
  const existing = await userRepo.findByEmail(input.email);
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // 3. Persist
  const user = await userRepo.createUser(input.name, input.email, passwordHash);

  // 4. Issue JWT
  const token = signToken(user.id);

  return { user, token };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(input: LoginInput) {
  // 1. Fetch user (include password_hash for comparison)
  const user = await userRepo.findByEmail(input.email);
  if (!user) {
    // Same error as wrong password — avoids user enumeration
    throw new AppError(401, 'Invalid email or password');
  }

  // 2. Compare password
  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  // 3. Build safe public user (no hash)
  const { password_hash: _omit, ...publicUser } = user;

  // 4. Issue JWT
  const token = signToken(publicUser.id);

  return { user: publicUser, token };
}

// ---------------------------------------------------------------------------
// Get current user (for GET /api/auth/me)
// ---------------------------------------------------------------------------

export async function getMe(userId: string) {
  const user = await userRepo.findById(userId);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}
