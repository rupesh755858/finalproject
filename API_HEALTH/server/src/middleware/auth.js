import jwt from 'jsonwebtoken';
import User, { isAdminRole } from '../models/User.js';

/**
 * Verifies the bearer token and loads the account on every request, so a role
 * change or a disabled account takes effect immediately instead of when the
 * 7-day token happens to expire.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }

  try {
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) return res.status(401).json({ error: 'account no longer exists' });
    if (!user.isActive) return res.status(403).json({ error: 'account disabled — ask an admin' });

    req.user = user;
    req.userId = String(user._id);
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** controller or admin. */
export function requireAdmin(req, res, next) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ error: 'admin access required' });
  }
  return next();
}

/** controller only — the one account that owns the system. */
export function requireController(req, res, next) {
  if (req.user?.role !== 'controller') {
    return res.status(403).json({ error: 'only the controller can do this' });
  }
  return next();
}

export { isAdminRole };
