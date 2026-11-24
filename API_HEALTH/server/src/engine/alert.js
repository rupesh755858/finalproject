import crypto from 'node:crypto';
import AlertChannel from '../models/AlertChannel.js';
import NotificationLog from '../models/NotificationLog.js';
import { color, createLogger } from '../lib/logger.js';

const log = createLogger('ALERT');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sign = (secret, body) =>
  'sha256=' + crypto.createHmac('sha256', secret || '').update(body).digest('hex');

export async function notifyIncident({ incident, monitor, event }) {
  if (!monitor || !incident) return;
  // Channels are team-wide: a monitor's alerts go to every enabled channel.
  const channels = await AlertChannel.find({ enabled: true }).lean();

  if (!channels.length) {
    log.debug(`${monitor.name}  ${color.gray('no alert channel configured · skipped')}`);
    return;
  }

  await Promise.all(channels.map((ch) => deliver({ ch, incident, monitor, event })));
}

async function deliver({ ch, incident, monitor, event }) {
  const dedupKey = `${incident._id}:${ch._id}:${event}`;

  try {
    await NotificationLog.create({ dedupKey, incident: incident._id, channel: ch._id, event });
  } catch (err) {
    if (err && err.code === 11000) return; // already recorded/sent
    log.fail(`could not record notification  ${color.gray(err.message)}`);
  }

  const payload = {
    event,
    sentAt: new Date().toISOString(),
    monitor: {
      id: String(monitor._id),
      name: monitor.name,
      url: monitor.url,
      lastStatus: monitor.lastStatus,
    },
    incident: {
      id: String(incident._id),
      cause: incident.cause,
      state: incident.state,
      startedAt: incident.startedAt,
      resolvedAt: incident.resolvedAt,
    },
  };

  const body = JSON.stringify(payload);
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (ch.type === 'console') {
        const title = event === 'resolved' ? 'recovered' : 'down';
        const write = event === 'resolved' ? log.ok : log.fail;
        write(`${title.padEnd(9)}  ${color.bold(monitor.name)}  ${color.gray(`· ${ch.name}`)}`);
        log.detail('url', color.gray(monitor.url));
        log.detail('cause', incident.cause);
      } else if (ch.type === 'slack') {
        const text = event === 'resolved'
          ? `🟢 *RESOLVED:* Monitor *${monitor.name}* (${monitor.url}) recovered successfully.`
          : `🔴 *ALERT:* Monitor *${monitor.name}* (${monitor.url}) is DOWN. Cause: \`${incident.cause}\``;

        await fetch(ch.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(8000),
        });
      } else if (ch.type === 'discord') {
        const color = event === 'resolved' ? 0x22c55e : 0xef4444;
        const embed = {
          title: `Monitor ${event === 'resolved' ? 'Recovered' : 'Down'}: ${monitor.name}`,
          description: event === 'resolved' ? 'The service is back up and responding normally.' : `Service is failing assertions or unreachable.\n**Cause:** ${incident.cause}`,
          color,
          fields: [
            { name: 'URL', value: monitor.url, inline: true },
            { name: 'Event', value: event.toUpperCase(), inline: true },
          ],
          timestamp: new Date().toISOString(),
        };

        await fetch(ch.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
          signal: AbortSignal.timeout(8000),
        });
      } else {
        // Generic Webhook
        const res = await fetch(ch.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-apimon-event': event,
            'x-apimon-signature': sign(ch.secret, body),
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`webhook_status_${res.status}`);
      }

      await NotificationLog.updateOne({ dedupKey }, { $set: { status: 'sent', attempts: attempt } });
      return;
    } catch (err) {
      lastError = err.message;
      if (attempt < 3) await sleep(250 * 2 ** (attempt - 1));
    }
  }

  log.fail(`delivery failed  ${color.gray(`${ch.type} · ${ch.name} · ${lastError}`)}`);
  await NotificationLog.updateOne(
    { dedupKey },
    { $set: { status: 'failed', attempts: 3, lastError } }
  );
}
