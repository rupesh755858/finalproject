import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';
import { notifyIncident } from './alert.js';
import { color, createLogger } from '../lib/logger.js';

const log = createLogger('INCIDENT');

export async function evaluate(monitorId, check) {
  const monitor = await Monitor.findById(monitorId);
  if (!monitor) return null;

  monitor.lastCheckedAt = check.checkedAt;

  if (check.ok) {
    monitor.currentFailures = 0;
    monitor.lastStatus = 'up';

    if (monitor.openIncident) {
      const incident = await Incident.findById(monitor.openIncident);
      if (incident && incident.state !== 'resolved') {
        incident.state = 'resolved';
        incident.resolvedAt = new Date();
        incident.updates.push({ at: new Date(), message: 'Recovered automatically.' });
        await incident.save();
        await notifyIncident({ incident, monitor, event: 'resolved' });
        log.ok(`resolved  ${color.bold(monitor.name)}  ${color.gray(`after ${monitor.currentFailures} failure(s)`)}`);
      }
      monitor.openIncident = null;
    }
  } else {
    monitor.currentFailures = (monitor.currentFailures || 0) + 1;
    const threshold = monitor.consecutiveFailuresThreshold || 3;
    const shouldOpen = monitor.currentFailures >= threshold;

    monitor.lastStatus = shouldOpen ? 'down' : 'degraded';

    if (shouldOpen && !monitor.openIncident) {
      const incident = await Incident.create({
        monitor: monitor._id,
        owner: monitor.owner,
        cause: check.error || `HTTP ${check.statusCode || 'N/A'}`,
        failureCount: monitor.currentFailures,
        updates: [{ at: new Date(), message: `Opened after ${monitor.currentFailures} consecutive failure(s).` }],
      });
      monitor.openIncident = incident._id;
      log.fail(
        `opened    ${color.bold(monitor.name)}  ` +
          `${color.gray(`${monitor.currentFailures} consecutive failures`)}  ${color.gray('·')}  ${incident.cause}`
      );
      await notifyIncident({ incident, monitor, event: 'opened' });
    }
  }

  await monitor.save();
  return monitor;
}

export default evaluate;
