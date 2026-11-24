import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/repository.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  role: z.enum(['admin', 'staff']).default('staff'),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'staff']),
});

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await db.listUsers();
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl || '',
      createdAt: u.createdAt,
    })),
  });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { name, email, password, role } = req.body as z.infer<typeof createUserSchema>;
  const existing = await db.findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await db.createUser({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    avatarUrl: '',
  });

  res.status(201).json({
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      avatarUrl: created.avatarUrl || '',
      createdAt: created.createdAt,
    },
  });
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { role } = req.body as z.infer<typeof updateUserRoleSchema>;

  const target = await db.findUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.role === 'admin' && role === 'staff') {
    const adminCount = await db.countAdmins();
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot demote the last remaining administrator.' });
      return;
    }
  }

  const updated = await db.updateUser(id, { role });
  if (!updated) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      avatarUrl: updated.avatarUrl || '',
      createdAt: updated.createdAt,
    },
  });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (req.user?.userId === id) {
    res.status(400).json({ error: 'You cannot delete your own active account.' });
    return;
  }

  const target = await db.findUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.role === 'admin') {
    const adminCount = await db.countAdmins();
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot delete the last remaining administrator.' });
      return;
    }
  }

  await db.deleteUser(id);
  res.json({ message: 'User removed.' });
}
