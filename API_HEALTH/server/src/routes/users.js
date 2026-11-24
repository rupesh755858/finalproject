import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAdmin, requireAuth, requireController } from '../middleware/auth.js';
import { createLogger, color } from '../lib/logger.js';

const router = Router();
const log = createLogger('TEAM');

router.use(requireAuth);
router.use(requireAdmin);

/** GET / — the team roster. */
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ role: 1, createdAt: 1 });
    res.json({ users: users.map((u) => u.toPublic()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST / — an admin adds a login for someone.
 * Any admin may create a plain user; only the controller may create an admin.
 */
router.post('/', async (req, res) => {
  const { email, password, name = '', role = 'user' } = req.body || {};

  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password too short' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be user or admin' });
  if (role === 'admin' && req.user.role !== 'controller') {
    return res.status(403).json({ error: 'only the controller can create an admin' });
  }

  const normalized = String(email).toLowerCase().trim();
  if (await User.findOne({ email: normalized })) {
    return res.status(409).json({ error: 'email already registered' });
  }

  try {
    const user = await User.create({
      email: normalized,
      name: String(name).trim(),
      passwordHash: await bcrypt.hash(String(password), 10),
      role,
      isActive: true,
      createdBy: req.user._id,
    });

    log.ok(
      `login created  ${color.bold(user.email)}  ${color.gray(`· ${user.role} · by ${req.user.email}`)}`
    );
    res.status(201).json({ user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /:id/role — promote or demote. Controller only, and the controller's
 * own role can never be changed (there is exactly one).
 */
router.patch('/:id/role', requireController, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or user' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.role === 'controller') return res.status(403).json({ error: 'the controller cannot be demoted' });

    const previous = user.role;
    user.role = role;
    await user.save();

    log.ok(
      `${role === 'admin' ? 'promoted' : 'demoted'}  ${color.bold(user.email)}  ` +
        `${color.gray(`${previous} → ${role} · by ${req.user.email}`)}`
    );
    res.json({ user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /:id/status — enable or disable a login. */
router.patch('/:id/status', async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.role === 'controller') return res.status(403).json({ error: 'the controller cannot be disabled' });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ error: 'you cannot disable your own account' });
    }

    user.isActive = isActive;
    await user.save();

    log.warn(`${isActive ? 'enabled' : 'disabled'}  ${color.bold(user.email)}  ${color.gray(`· by ${req.user.email}`)}`);
    res.json({ user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /:id/password — set a new password for someone (no email flow needed). */
router.patch('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.role === 'controller' && String(user._id) !== String(req.user._id)) {
      return res.status(403).json({ error: "only the controller can change the controller's password" });
    }

    user.passwordHash = await bcrypt.hash(String(password), 10);
    await user.save();

    log.ok(`password reset  ${color.bold(user.email)}  ${color.gray(`· by ${req.user.email}`)}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Handlers for missing ID in route path
router.patch('/', (req, res) => res.status(400).json({ error: 'User ID is required in URL (e.g. /api/users/<id>/role)' }));
router.delete('/', (req, res) => res.status(400).json({ error: 'User ID is required in URL (e.g. /api/users/<id>)' }));

/** DELETE /:id — remove an account (never the controller, never yourself). */
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.role === 'controller') return res.status(403).json({ error: 'the controller cannot be deleted' });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ error: 'you cannot delete your own account' });
    }

    await user.deleteOne();
    log.warn(`deleted  ${color.bold(user.email)}  ${color.gray(`· by ${req.user.email}`)}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
