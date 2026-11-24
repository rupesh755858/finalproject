/**
 * A ~100-line test runner so the suite output is a tidy, aligned report
 * instead of a wall of `console.log`.
 *
 *    SYSTEM
 *      ✔  01  Health endpoint                              2ms       200
 *      ✔  02  Register user                               58ms       201
 *      ✖  03  Login with a wrong password                  9ms       401
 *             status: expected 401, received 200
 *
 *      ────────────────────────────────────────────────────────────────
 *      ✔ 11 passed   ✖ 1 failed                         total 1.42s
 */

import {
  banner,
  color,
  formatMs,
  glyph,
  padLeft,
  padRight,
  truncate,
} from './src/lib/logger.js';

const NAME_WIDTH = 42;
const META_WIDTH = 13;
const DURATION_WIDTH = 8;

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function expect(actual, expected, label = 'value') {
  if (actual !== expected) {
    throw new AssertionError(`${label}: expected ${expected}, received ${actual}`);
  }
}

export function expectTruthy(value, message) {
  if (!value) throw new AssertionError(message);
}

const duration = (startNs) => Number(process.hrtime.bigint() - startNs) / 1e6;

export function createSuite({ title, subtitle = '', meta = [] } = {}) {
  const results = [];
  const startedAt = Date.now();
  let counter = 0;
  let firstGroup = true;

  banner({ title, subtitle, rows: meta });

  const write = (line = '') => process.stdout.write(`${line}\n`);

  const suite = {
    /** Visual grouping, e.g. suite.group('AUTH') */
    group(name) {
      if (firstGroup) firstGroup = false;
      else write();
      write(`  ${color.heading(name.toUpperCase())}`);
    },

    /** Run one test. Return a short meta string (e.g. '201') to show in the row. */
    async test(name, fn) {
      counter += 1;
      const index = color.gray(padLeft(String(counter), 2));
      const label = padRight(truncate(name, NAME_WIDTH), NAME_WIDTH);
      const startNs = process.hrtime.bigint();

      try {
        const output = await fn();
        const meta = typeof output === 'string' ? output : output?.meta ?? '';
        results.push({ name, status: 'pass' });
        write(
          `    ${color.green(glyph.ok)}  ${index}  ${label}  ` +
            `${color.gray(padLeft(truncate(meta, META_WIDTH), META_WIDTH))}  ` +
            `${color.gray(padLeft(formatMs(duration(startNs)), DURATION_WIDTH))}`
        );
      } catch (err) {
        results.push({ name, status: 'fail', error: err });
        write(
          `    ${color.red(glyph.fail)}  ${index}  ${color.red(label)}  ` +
            `${color.gray(padLeft('', META_WIDTH))}  ` +
            `${color.gray(padLeft(formatMs(duration(startNs)), DURATION_WIDTH))}`
        );
        const reason = err?.message || String(err);
        for (const line of reason.split('\n')) {
          write(`           ${color.red(truncate(line, 96))}`);
        }
      }
    },

    skip(name, reason = '') {
      counter += 1;
      results.push({ name, status: 'skip' });
      write(
        `    ${color.gray(glyph.debug)}  ${color.gray(padLeft(String(counter), 2))}  ` +
          `${color.gray(padRight(truncate(name, NAME_WIDTH), NAME_WIDTH))}  ` +
          `${color.gray(padLeft(truncate(reason, META_WIDTH), META_WIDTH))}`
      );
    },

    /** Abort the whole run with a readable reason (no stack trace). */
    abort(message, hint) {
      write();
      write(`  ${color.red(`${glyph.fail}  ${message}`)}`);
      if (hint) write(`     ${color.gray(hint)}`);
      write();
      process.exit(1);
    },

    /** Print the summary. Returns the number of failures. */
    summary() {
      const passed = results.filter((r) => r.status === 'pass').length;
      const failed = results.filter((r) => r.status === 'fail').length;
      const skipped = results.filter((r) => r.status === 'skip').length;
      const total = formatMs(Date.now() - startedAt);

      const parts = [
        passed ? `${color.green(glyph.ok)} ${color.green(`${passed} passed`)}` : '',
        failed ? `${color.red(glyph.fail)} ${color.red(`${failed} failed`)}` : '',
        skipped ? `${color.gray(glyph.debug)} ${color.gray(`${skipped} skipped`)}` : '',
      ].filter(Boolean);

      const left = parts.join('   ');
      const right = `total ${total}`;
      const visible = left.replace(/\x1b\[[0-9;]*m/g, '').length;
      const gap = Math.max(2, 62 - visible - right.length);

      write();
      write(`  ${color.gray('─'.repeat(62))}`);
      write(`  ${left}${' '.repeat(gap)}${color.gray(right)}`);
      write();

      return failed;
    },
  };

  return suite;
}

export default { createSuite, expect, expectTruthy, AssertionError };
