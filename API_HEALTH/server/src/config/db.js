import mongoose from 'mongoose';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { color, createLogger } from '../lib/logger.js';

const log = createLogger('DB');

/** mongodb://user:secret@host/db -> mongodb://user:***@host/db */
const maskUri = (uri) => String(uri).replace(/\/\/[^/@]*@/, '//***@');

let mongodProc = null;

function findMongodBinary() {
  const defaultDir = 'C:\\Program Files\\MongoDB\\Server';
  if (fs.existsSync(defaultDir)) {
    const versions = fs.readdirSync(defaultDir);
    for (const v of versions.reverse()) {
      const p = path.join(defaultDir, v, 'bin', 'mongod.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  return 'mongod';
}

async function startLocalMongod() {
  return new Promise((resolve, reject) => {
    const dbPath = path.resolve(process.cwd(), 'data', 'db');
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }

    const mongodBin = findMongodBinary();
    log.info(`starting local mongod  ${color.gray(dbPath)}`);

    try {
      mongodProc = spawn(mongodBin, ['--dbpath', dbPath, '--port', '27017'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return reject(new Error(`Failed to spawn mongod: ${err.message}`));
    }

    let started = false;

    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('mongod startup timed out after 10s'));
      }
    }, 10000);

    mongodProc.stdout.on('data', (chunk) => {
      const msg = chunk.toString();
      if (msg.includes('Waiting for connections') || msg.includes('"msg":"Waiting for connections"')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          log.ok(`local mongod ready  ${color.gray(dbPath)}`);
          resolve();
        }
      }
    });

    mongodProc.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) log.debug(color.gray(message.split('\n').pop()));
    });

    mongodProc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    mongodProc.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`mongod exited prematurely with code ${code}`));
      }
    });
  });
}

function cleanup() {
  if (mongodProc && !mongodProc.killed) {
    try {
      mongodProc.kill();
    } catch {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });

export async function connectDb(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is not set');

  log.info(`connecting  ${color.gray(maskUri(uri))}`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    log.ok(`connected  ${color.bold(mongoose.connection.name)}`);
  } catch (err) {
    const isLocal = uri.includes('localhost') || uri.includes('127.0.0.1');
    if (isLocal) {
      log.warn(`no server on ${color.gray(maskUri(uri))}  ${color.gray('· trying a local mongod')}`);
      try {
        await startLocalMongod();
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        log.ok(`connected  ${color.bold(mongoose.connection.name)} ${color.gray('(local mongod)')}`);
        return;
      } catch (startErr) {
        log.fail(`could not auto-start MongoDB  ${color.gray(startErr.message)}`);
      }
    }
    throw err;
  }
}
