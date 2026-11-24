import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

/**
 * Public signup. Always creates a plain 'user' — a role sent in the body is
 * ignored, so nobody can self-promote. Admins are made by the controller from
 * the Team page, or bootstrapped with `npm run user:create`.
 */
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password too short' });

  const normalized = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalized });
  if (exists) return res.status(409).json({ error: 'email already registered' });

  const user = await User.create({
    email: normalized,
    name: name || '',
    passwordHash: await bcrypt.hash(String(password), 10),
    role: 'user',
    isActive: true,
  });

  res.status(201).json({
    token: signToken(user),
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  if (!user.isActive) return res.status(403).json({ error: 'account disabled — ask an admin' });

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: signToken(user),
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  });
});

/** Who am I — the client uses this to decide what to show. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

export default router;
