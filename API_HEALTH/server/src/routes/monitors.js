import { Router } from 'express';
import mongoose from 'mongoose';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';
import { requireAuth } from '../middleware/auth.js';
import { probe } from '../engine/probe.js';
import { evaluate } from '../engine/evaluator.js';

const router = Router();
router.use(requireAuth);

// Helper to calculate 24-hour uptime percentage
async function get24hUptime(monitorId) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const checks = await Check.find({ monitor: monitorId, checkedAt: { $gte: oneDayAgo } })
    .select('ok')
    .lean();

  if (!checks.length) return null;
  const okCount = checks.filter((c) => c.ok).length;
  return Math.round((okCount / checks.length) * 1000) / 10;
}

// GET / - List all monitors (the whole team shares one list)
router.get('/', async (req, res) => {
  try {
    const monitors = await Monitor.find({}).sort({ createdAt: -1 }).populate('owner', 'email name').lean();

    const enriched = await Promise.all(
      monitors.map(async (m) => {
        const uptime24h = await get24hUptime(m._id);
        const recentChecks = await Check.find({ monitor: m._id })
          .sort({ checkedAt: -1 })
          .limit(10)
          .select('ok latencyMs checkedAt')
          .lean();

        return {
          ...m,
          uptime24h,
          recentChecks: recentChecks.reverse(),
        };
      })
    );

    res.json({ monitors: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - Create monitor
router.post('/', async (req, res) => {
  const { name, url, method = 'GET', intervalSeconds = 60, timeoutMs = 10000 } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    return res.status(400).json({ error: 'invalid url (must start with http:// or https://)' });
  }

  try {
    const monitor = await Monitor.create({
      name: String(name).trim(),
      url: String(url).trim(),
      method: ['GET', 'HEAD', 'POST', 'PUT'].includes(method) ? method : 'GET',
      intervalSeconds: Math.max(10, Number(intervalSeconds) || 60),
      timeoutMs: Math.max(1000, Number(timeoutMs) || 10000),
      followRedirects: req.body.followRedirects !== false,
      isActive: true,
      assertions: {
        statusIn: Array.isArray(req.body.assertions?.statusIn) && req.body.assertions.statusIn.length
          ? req.body.assertions.statusIn
          : [200],
        bodyContains: req.body.assertions?.bodyContains || '',
        maxResponseMs: Number(req.body.assertions?.maxResponseMs) || 0,
      },
      consecutiveFailuresThreshold: Number(req.body.consecutiveFailuresThreshold) || 3,
      owner: req.userId,
      nextCheckAt: new Date(),
    });

    res.status(201).json({ monitor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - Get single monitor details
router.get('/:id', async (req, res) => {
  try {
    const monitor = await Monitor.findById(req.params.id).lean();
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });

    const uptime24h = await get24hUptime(monitor._id);
    const totalChecks = await Check.countDocuments({ monitor: monitor._id });

    // Recent active incident if any
    const activeIncident = monitor.openIncident
      ? await Incident.findById(monitor.openIncident).lean()
      : null;

    res.json({
      monitor: {
        ...monitor,
        uptime24h,
        totalChecks,
        activeIncident,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/checks - Check history for charts and table
router.get('/:id/checks', async (req, res) => {
  try {
    const monitor = await Monitor.findById(req.params.id);
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const checks = await Check.find({ monitor: monitor._id })
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    res.json({ checks: checks.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/check - Trigger immediate check on demand
router.post('/:id/check', async (req, res) => {
  try {
    const monitor = await Monitor.findById(req.params.id);
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });

    const result = await probe(monitor);
    const checkDoc = await Check.create({ monitor: monitor._id, ...result });
    await evaluate(monitor._id, result);

    const updatedMonitor = await Monitor.findById(monitor._id).lean();

    res.json({
      result,
      check: checkDoc,
      monitor: updatedMonitor,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/toggle - Pause / resume monitoring
router.patch('/:id/toggle', async (req, res) => {
  try {
    const monitor = await Monitor.findById(req.params.id);
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });

    monitor.isActive = !monitor.isActive;
    if (monitor.isActive) {
      monitor.nextCheckAt = new Date();
    }
    await monitor.save();

    res.json({ ok: true, isActive: monitor.isActive, monitor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Handlers for missing ID in route path
router.patch('/', (req, res) => res.status(400).json({ error: 'Monitor ID is required in URL (e.g. /api/monitors/<id>)' }));
router.put('/', (req, res) => res.status(400).json({ error: 'Monitor ID is required in URL (e.g. /api/monitors/<id>)' }));
router.delete('/', (req, res) => res.status(400).json({ error: 'Monitor ID is required in URL (e.g. /api/monitors/<id>)' }));

// PUT & PATCH /:id - Update monitor
const updateMonitor = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid monitor ID format' });
  }

  try {
    const monitor = await Monitor.findById(req.params.id);
    if (!monitor) return res.status(404).json({ error: 'monitor not found' });

    const { name, url, method, intervalSeconds, timeoutMs, assertions, consecutiveFailuresThreshold } = req.body || {};

    if (name) monitor.name = String(name).trim();
    if (url) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      monitor.url = String(url).trim();
    }
    if (method && ['GET', 'HEAD', 'POST', 'PUT'].includes(method)) monitor.method = method;
    if (intervalSeconds) monitor.intervalSeconds = Math.max(10, Number(intervalSeconds));
    if (timeoutMs) monitor.timeoutMs = Math.max(1000, Number(timeoutMs));
    if (consecutiveFailuresThreshold) monitor.consecutiveFailuresThreshold = Number(consecutiveFailuresThreshold);

    if (assertions) {
      if (assertions.statusIn) monitor.assertions.statusIn = assertions.statusIn;
      if (assertions.bodyContains !== undefined) monitor.assertions.bodyContains = assertions.bodyContains;
      if (assertions.maxResponseMs !== undefined) monitor.assertions.maxResponseMs = Number(assertions.maxResponseMs);
    }

    await monitor.save();
    res.json({ monitor });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

router.put('/:id', updateMonitor);
router.patch('/:id', updateMonitor);

// DELETE /:id - Delete monitor & associated records
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid monitor ID format' });
  }

  try {
    const deleted = await Monitor.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ error: 'monitor not found' });

    // Clean up checks and incidents
    await Promise.all([
      Check.deleteMany({ monitor: req.params.id }),
      Incident.deleteMany({ monitor: req.params.id }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
