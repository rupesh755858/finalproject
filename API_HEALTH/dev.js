/**
 * One command to run the whole stack: `npm run dev`
 * Streams both processes into one tidy, prefixed console.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const paint = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = paint('2');
const cyan = paint('36');
const green = paint('32');
const red = paint('31');
const gray = paint('90');

const isWin = process.platform === 'win32';
const BAR = gray('│');

const WIDTH = 7;
const tag = (label, paintFn) => paintFn(label.padEnd(WIDTH));

console.log('');
console.log(`  ${'\x1b[1m'}⚡ ApiMon · starting full stack${'\x1b[0m'}  ${dim('server + client')}`);
console.log(`  ${gray('─'.repeat(58))}`);
console.log(`  ${dim('api'.padEnd(WIDTH))}${cyan('http://localhost:4000')}`);
console.log(`  ${dim('web'.padEnd(WIDTH))}${cyan('http://localhost:5173')}`);
console.log(`  ${gray('─'.repeat(58))}`);
console.log('');

const children = [];

function run(label, color, cwd) {
  const child = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd: path.resolve(__dirname, cwd), stdio: 'pipe', shell: isWin });
  children.push({ label, child });

  const pipe = (stream, isError) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const text = line.replace(/\s+$/, '');
        if (!text) continue;
        const prefix = `${tag(label, color)} ${BAR}`;
        const out = isError ? red(text) : text;
        process.stdout.write(`${prefix} ${out}\n`);
      }
    });
  };

  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on('exit', (code) => {
    if (code === 0) return;
    console.log(`${tag(label, color)} ${BAR} ${red(`exited with code ${code}`)}`);
    shutdown();
  });

  return child;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (isWin) spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  console.log('');
  console.log(`  ${dim('stopping ApiMon processes…')}`);
  for (const { child } of children) killTree(child.pid);
  setTimeout(() => process.exit(0), 150);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('server', cyan, 'server');
run('client', green, 'client');
