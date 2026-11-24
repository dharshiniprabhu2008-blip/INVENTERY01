import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { db, runInTransaction, type StoredUser } from '../db/repository.js';

const AVATAR_DEFAULT = '/src/assets/images/avatar_manager_1795368919229.jpg';

export const setupAdminSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(128),
});

function signUserToken(user: StoredUser): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    ENV.JWT_SECRET,
    { expiresIn: ENV.JWT_EXPIRES_IN }
  );
}

function toPublicUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl || AVATAR_DEFAULT,
    createdAt: user.createdAt,
  };
}

export async function getAuthStatus(_req: Request, res: Response): Promise<void> {
  const adminCount = await db.countAdmins();
  res.json({ needsSetup: adminCount === 0 });
}

export async function setupAdmin(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as z.infer<typeof setupAdminSchema>;

  const result = await runInTransaction(async () => {
    const adminCount = await db.countAdmins();
    if (adminCount > 0) {
      return { error: 'Admin account has already been configured. Please sign in.' as const };
    }
    const existing = await db.findUserByEmail(email);
    if (existing) {
      return { error: 'An account with this email already exists.' as const };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await db.createUser({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin',
      avatarUrl: AVATAR_DEFAULT,
    });
    return { user: created };
  });

  if ('error' in result) {
    res.status(409).json({ error: result.error });
    return;
  }

  const token = signUserToken(result.user);
  res.status(201).json({
    token,
    user: toPublicUser(result.user),
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as z.infer<typeof registerSchema>;

  const adminCount = await db.countAdmins();
  if (adminCount === 0) {
    res.status(400).json({ error: 'Please complete initial admin setup first.' });
    return;
  }

  const existing = await db.findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await db.createUser({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: 'staff',
    avatarUrl: '',
  });

  const token = signUserToken(created);
  res.status(201).json({
    token,
    user: toPublicUser(created),
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const user = await db.findUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signUserToken(user);
  res.json({
    token,
    user: toPublicUser(user),
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = await db.findUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toPublicUser(user) });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { name, email } = req.body as z.infer<typeof updateProfileSchema>;
  const normalizedEmail = email.toLowerCase();

  const existing = await db.findUserByEmail(normalizedEmail);
  if (existing && existing.id !== req.user.userId) {
    res.status(409).json({ error: 'Email is already used by another user.' });
    return;
  }

  const updated = await db.updateUser(req.user.userId, { name, email: normalizedEmail });
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toPublicUser(updated) });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  const user = await db.findUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.updateUser(user.id, { passwordHash });
  res.json({ message: 'Password updated successfully.' });
}
