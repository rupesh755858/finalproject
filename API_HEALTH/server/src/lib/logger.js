/**
 * Tiny zero-dependency console formatter for ApiMon.
 *
 * Every line has the same shape, so the output reads like a table:
 *
 *   11:46:02 │ DB     │ ✔  connected  apimon
 *   11:46:03 │ CHECK  │ ✔  Google DNS            200    142ms
 *   11:46:04 │ CHECK  │ ✖  mitaoe.ac.in           —    10001ms  ETIMEDOUT
 *
 * Colours are switched off automatically when stdout is not a TTY (CI, pipes,
 * log files) or when NO_COLOR is set, so logs stay readable everywhere.
 */

const stdoutTTY = Boolean(process.stdout.isTTY);
const colorEnabled =
  (stdoutTTY || Boolean(process.env.FORCE_COLOR)) &&
  !('NO_COLOR' in process.env) &&
  process.env.TERM !== 'dumb';

const paint = (code) => (text) => (colorEnabled ? `\x1b[${code}m${text}\x1b[0m` : String(text));

export const color = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
  heading: paint('1;36'),
  gray: paint('90'),
};

export const glyph = { ok: '✔', fail: '✖', warn: '▲', info: '●', debug: '◦' };

export const SCOPE_WIDTH = 8;
const BAR = color.gray('│');

export function padRight(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function padLeft(text, width) {
  const value = String(text);
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

export function truncate(text, width) {
  const value = String(text);
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

export function formatMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '—';
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`;
}

export function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

const muted = !process.env.LOG_SILENT;

function emit(scope, mark, markColor, message) {
  if (!muted) return;
  process.stdout.write(
    `${color.gray(timestamp())} ${BAR} ${color.cyan(padRight(scope.toUpperCase(), SCOPE_WIDTH))} ${BAR} ` +
      `${markColor(mark)}  ${message}\n`
  );
}

/** One logger per subsystem, e.g. createLogger('CHECK'). */
export function createLogger(scope) {
  const log = {
    ok: (message) => emit(scope, glyph.ok, color.green, message),
    fail: (message) => emit(scope, glyph.fail, color.red, message),
    warn: (message) => emit(scope, glyph.warn, color.yellow, message),
    info: (message) => emit(scope, glyph.info, color.cyan, message),
    debug: (message) => emit(scope, glyph.debug, color.gray, message),
    /** Continuation line that lines up under the message column. */
    line: (message) =>
      emit(scope, ' ', color.gray, message),
    /** Continuation line prefixed by a dim gutter, for details under a row. */
    detail: (label, value) =>
      emit(scope, ' ', color.gray, `${color.gray(padRight(`${label}`, 8))} ${value}`),
  };

  /**
   * Standard probe result row:
   *   CHECK │ ✔  Google DNS            200    142ms
   *   CHECK │ ✖  mitaoe.ac.in          —    10001ms  ETIMEDOUT
   */
  log.check = (name, result = {}) => {
    const ok = Boolean(result.ok);
    const label = padRight(truncate(name, 24), 24);
    const status = result.statusCode == null ? '—' : String(result.statusCode);
    const duration = padLeft(formatMs(result.latencyMs), 8);
    const message =
      `${ok ? color.bold(label) : color.bold(color.red(label))} ` +
      `${color.gray(padLeft(status, 3))}  ${color.gray(duration)}` +
      (result.error ? `  ${color.dim(truncate(result.error, 60))}` : '');
    emit(scope, ok ? glyph.ok : glyph.fail, ok ? color.green : color.red, message);
  };

  return log;
}

/** Boxed header used at startup and by the test runner. */
export function banner({ title, subtitle, rows = [] }) {
  const width = 62;
  const out = [];
  out.push('');
  out.push(`  ${color.bold(title)}${subtitle ? `  ${color.gray(subtitle)}` : ''}`);
  out.push(`  ${color.gray('─'.repeat(width))}`);
  for (const [label, value] of rows) {
    out.push(`  ${color.gray(padRight(label, 12))}${value}`);
  }
  if (rows.length) out.push(`  ${color.gray('─'.repeat(width))}`);
  out.push('');
  process.stdout.write(`${out.join('\n')}\n`);
}

export function divider(width = 62) {
  process.stdout.write(`  ${color.gray('─'.repeat(width))}\n`);
}

export function blank() {
  if (muted) process.stdout.write('\n');
}

export default { createLogger, color, glyph, banner, divider, blank, formatMs };
