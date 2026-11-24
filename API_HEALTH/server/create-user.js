/**
 * Create (or reset) an account from the terminal.
 *
 *   npm run user:create -- admin@example.com mysecretpass "Nilesh Patil"
 *
 * The first account ever created becomes the **controller** — the single admin
 * that owns the system and can never be demoted or disabled. After that:
 *
 *   --admin     create a normal admin (controller only)
 *   --reset     reset the password of an existing account
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './src/config/db.js';
import User from './src/models/User.js';
import { banner, color, createLogger } from './src/lib/logger.js';

const log = createLogger('USER');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [email, password, rawName] = args.filter((a) => !a.startsWith('--'));
const name = rawName || '';

if (!email || !password) {
  console.log('');
  log.warn('missing arguments');
  console.log(`\n  ${color.gray('usage')}     npm run user:create -- <email> <password> [name] [--admin|--reset]`);
  console.log(`  ${color.gray('example')}   npm run user:create -- admin@example.com mysecretpass "Nilesh Patil"`);
  console.log(`  ${color.gray('controller')} the first account created becomes the controller\n`);
  process.exit(1);
}

if (password.length < 6) {
  log.fail(`password must be at least 6 characters ${color.gray(`(got ${password.length})`)}`);
  process.exit(1);
}

try {
  await connectDb();

  const normalizedEmail = String(email).toLowerCase().trim();
  const controller = await User.findOne({ role: 'controller' });
  const existing = await User.findOne({ email: normalizedEmail });

  // ── existing account: optionally reset the password ───────────────────────
  if (existing) {
    log.warn(`already exists  ${color.bold(existing.email)}  ${color.gray(`· ${existing.role}`)}`);

    if (flags.has('--reset') || process.env.RESET_PASSWORD === 'true') {
      existing.passwordHash = await bcrypt.hash(password, 10);
      if (name) existing.name = name;

      if (flags.has('--controller')) {
        await User.updateMany({ role: 'controller' }, { $set: { role: 'admin' } });
        existing.role = 'controller';
      } else if (flags.has('--admin')) {
        existing.role = 'admin';
      }

      await existing.save();
      banner({
        title: '✔  account & password updated',
        rows: [
          ['name', color.bold(existing.name || '—')],
          ['email', existing.email],
          ['password', color.bold(password)],
          ['role', existing.role === 'controller' ? color.cyan('controller') : existing.role],
          ['login', color.cyan('http://localhost:5173/login')],
        ],
      });
    } else {
      console.log(`\n  ${color.gray('to reset the password:')} npm run user:create -- ${email} ${password} --reset\n`);
    }

    await mongoose.disconnect();
    process.exit(0);
  }

  // ── decide the role ───────────────────────────────────────────────────────
  let role = 'user';
  if (flags.has('--admin')) role = 'admin';
  if (!controller || flags.has('--controller')) {
    if (controller && flags.has('--controller')) {
      await User.updateMany({ role: 'controller' }, { $set: { role: 'admin' } });
    }
    role = 'controller';
  }

  const user = await User.create({
    email: normalizedEmail,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    isActive: true,
  });

  banner({
    title: role === 'controller' ? '✔  controller created' : `✔  ${role} created`,
    rows: [
      ['name', color.bold(user.name || '—')],
      ['email', user.email],
      ['password', color.bold(password)],
      ['role', role === 'controller' ? color.cyan('controller') : role],
      ['login', color.cyan('http://localhost:5173/login')],
    ],
  });

  if (role === 'controller') {
    console.log(`  ${color.gray('You are the controller: you can add logins and promote admins from the Team page.')}\n`);
  }

  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  log.fail(`could not create the account  ${color.gray(err.message)}`);
  process.exit(1);
}
