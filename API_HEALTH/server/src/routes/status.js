import { Router } from 'express';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const monitors = await Monitor.find({ isActive: true })
      .select('name url lastStatus lastCheckedAt intervalSeconds openIncident')
      .lean();

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const enriched = await Promise.all(
      monitors.map(async (m) => {
        const checks = await Check.find({
          monitor: m._id,
          checkedAt: { $gte: oneDayAgo },
        })
          .sort({ checkedAt: -1 })
          .limit(30)
          .select('ok latencyMs checkedAt')
          .lean();

        let uptime24h = null;
        if (checks.length > 0) {
          const okCount = checks.filter((c) => c.ok).length;
          uptime24h = Math.round((okCount / checks.length) * 1000) / 10;
        }

        return {
          id: m._id,
          name: m.name,
          url: m.url,
          status: m.lastStatus,
          lastCheckedAt: m.lastCheckedAt,
          uptime24h,
          recentChecks: checks.reverse(),
        };
      })
    );

    const hasDown = enriched.some((m) => m.status === 'down');
    const hasDegraded = enriched.some((m) => m.status === 'degraded');
    const systemStatus = hasDown ? 'Major Outage' : hasDegraded ? 'Degraded Performance' : 'All Systems Operational';

    // Active incidents
    const openIncidents = await Incident.find({ state: { $ne: 'resolved' } })
      .populate('monitor', 'name url')
      .sort({ startedAt: -1 })
      .limit(5)
      .lean();

    res.json({
      systemStatus,
      updatedAt: new Date(),
      monitors: enriched,
      openIncidents,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
