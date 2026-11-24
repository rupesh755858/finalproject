import os from 'node:os';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import { probe } from './probe.js';
import { evaluate } from './evaluator.js';
import { color, createLogger } from '../lib/logger.js';

const log = createLogger('CHECK');

const LOCK_MS = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function claimMonitor(workerId) {
  const now = new Date();

  const monitor = await Monitor.findOneAndUpdate(
    {
      isActive: true,
      nextCheckAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
    },
    { $set: { lockedUntil: new Date(Date.now() + LOCK_MS), lockedBy: workerId } },
    { sort: { nextCheckAt: 1 }, returnDocument: 'after' }
  );

  if (!monitor) return null;

  // Push the next run forward with 0-3s of jitter so monitors never fire in lockstep.
  const interval = (monitor.intervalSeconds || 60) * 1000;
  const jitterMs = Math.floor(Math.random() * 3000);
  monitor.nextCheckAt = new Date(Date.now() + interval + jitterMs);
  await Monitor.updateOne({ _id: monitor._id }, { $set: { nextCheckAt: monitor.nextCheckAt } });

  return monitor;
}

export async function executeCheck(monitor) {
  try {
    const result = await probe(monitor);
    const checkDoc = await Check.create({ monitor: monitor._id, ...result });
    await evaluate(monitor._id, result);
    log.check(monitor.name, result);
    return { result, check: checkDoc };
  } catch (err) {
    log.fail(`run failed  ${color.gray(err.message)}`);
    return null;
  } finally {
    await Monitor.updateOne(
      { _id: monitor._id },
      { $set: { lockedUntil: null, lockedBy: null } }
    );
  }
}

export async function tick(workerId, concurrency = 10) {
  const batch = [];
  for (let i = 0; i < concurrency; i += 1) {
    const monitor = await claimMonitor(workerId);
    if (!monitor) break;
    batch.push(monitor);
  }
  if (batch.length) await Promise.all(batch.map(executeCheck));
  return batch.length;
}

export function startEngine({ intervalMs = 1000, concurrency = 10 } = {}) {
  const workerId = `${os.hostname()}:${process.pid}`;
  log.ok(`engine started  ${color.gray(workerId)}`);

  (async () => {
    for (;;) {
      try {
        await tick(workerId, concurrency);
      } catch (err) {
        log.fail(`tick error  ${color.gray(err.message)}`);
      }
      await sleep(intervalMs);
    }
  })();
}
