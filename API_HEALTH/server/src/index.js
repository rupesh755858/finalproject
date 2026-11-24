import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDb } from './config/db.js';
import './models/User.js';
import './models/Monitor.js';
import './models/Check.js';
import './models/AlertChannel.js';
import './models/Incident.js';
import './models/NotificationLog.js';
import authRoutes from './routes/auth.js';
import monitorRoutes from './routes/monitors.js';
import statusRoutes from './routes/status.js';
import alertRoutes from './routes/alerts.js';
import userRoutes from './routes/users.js';
import { startEngine } from './engine/engine.js';
import { banner, color, createLogger, formatMs } from './lib/logger.js';

const log = createLogger('API');
const httpLog = createLogger('HTTP');

const app = express();

app.use(cors());
app.use(express.json());

// Compact access log:  HTTP │ ●  200  GET     /api/monitors              12ms
if (String(process.env.LOG_HTTP || 'true') !== 'false') {
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const path = req.originalUrl.split('?')[0];
      const line =
        `${color.gray(String(res.statusCode).padStart(3))}  ` +
        `${color.cyan(req.method.padEnd(6))} ${path.padEnd(28)} ` +
        `${color.gray(formatMs(ms).padStart(7))}`;

      if (res.statusCode >= 500) httpLog.fail(line);
      else if (res.statusCode >= 400) httpLog.warn(line);
      else httpLog.info(line);
    });
    next();
  });
}

// Root & API Welcome Handler (Supports both Browser HTML and JSON clients)
app.get(['/', '/api'], (req, res) => {
  if (req.accepts('html')) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ApiMon — API Gateway</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #f0f6fc; padding: 3rem 1.5rem; margin: 0; line-height: 1.6; }
          .card { max-width: 600px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 2.25rem; box-shadow: 0 12px 28px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.65rem; border-radius: 999px; background: rgba(46,160,67,0.15); color: #3fb950; border: 1px solid rgba(63,185,80,0.3); font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 1.25rem; }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
          p { color: #8b949e; font-size: 0.9rem; margin-bottom: 1.75rem; }
          .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.75rem; }
          .btn { display: inline-flex; align-items: center; padding: 0.55rem 1.15rem; background: #238636; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.875rem; transition: background 0.15s ease; }
          .btn:hover { background: #2ea043; }
          .btn-secondary { background: #21262d; border: 1px solid #30363d; color: #f0f6fc; }
          .btn-secondary:hover { background: #30363d; }
          .links { border-top: 1px solid #30363d; padding-top: 1.25rem; font-size: 0.85rem; }
          .links a { color: #58a6ff; text-decoration: none; font-family: monospace; }
          .links a:hover { text-decoration: underline; }
          ul { list-style: none; padding: 0; margin: 0.75rem 0 0 0; }
          li { padding: 0.35rem 0; color: #8b949e; display: flex; align-items: center; justify-content: space-between; }
          code { font-family: ui-monospace, monospace; background: #0d1117; padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid #30363d; color: #e6edf3; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge"><span class="dot"></span> Online · Port 4000</span>
          <h1>ApiMon API Gateway</h1>
          <p>The backend REST API server and automated probe engine are running. The primary user interface is hosted on port 5173.</p>
          <div class="actions">
            <a href="http://localhost:5173" class="btn">Open Web Dashboard →</a>
            <a href="/api/status" class="btn btn-secondary">Public Status Feed</a>
          </div>
          <div class="links">
            <strong style="color: #f0f6fc;">Core API Endpoints:</strong>
            <ul>
              <li><span>Health Check</span> <a href="/api/health">/api/health</a></li>
              <li><span>Public Status Feed</span> <a href="/api/status">/api/status</a></li>
              <li><span>Monitors API</span> <code>/api/monitors</code></li>
              <li><span>Authentication</span> <code>/api/auth/login</code></li>
              <li><span>Team Management</span> <code>/api/users</code></li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  res.json({
    name: 'ApiMon API Gateway',
    version: '1.0.0',
    status: 'online',
    clientUrl: 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      status: '/api/status',
      monitors: '/api/monitors',
      auth: '/api/auth',
      users: '/api/users',
      alerts: '/api/alerts',
    },
  });
});

// Health check endpoint (supports /api/health and /health)
app.get(['/api/health', '/health'], (req, res) => res.json({ ok: true, timestamp: new Date() }));

// Public routes (supports both /api/* and /*)
app.use(['/api/status', '/status'], statusRoutes);
app.use(['/api/auth', '/auth'], authRoutes);

// Protected routes (supports both /api/* and /*)
app.use(['/api/monitors', '/monitors'], monitorRoutes);
app.use(['/api/alerts', '/alerts'], alertRoutes);
app.use(['/api/users', '/users'], userRoutes);

// Informative handler for non-GET methods on root / and /api
app.all(['/', '/api'], (req, res) => {
  res.status(405).json({
    error: `Method ${req.method} is not supported directly on ${req.path}.`,
    message: 'Specify a resource endpoint such as /api/monitors or /api/auth/login.',
    availableEndpoints: {
      auth: ['POST /api/auth/register', 'POST /api/auth/login'],
      monitors: ['GET /api/monitors', 'POST /api/monitors', 'PATCH /api/monitors/:id', 'DELETE /api/monitors/:id'],
      users: ['GET /api/users', 'POST /api/users', 'PATCH /api/users/:id/role', 'DELETE /api/users/:id'],
      alerts: ['GET /api/alerts', 'POST /api/alerts', 'DELETE /api/alerts/:id'],
    },
  });
});

// Fallback 404 handler for API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = Number(process.env.PORT) || 4000;
const engineEnabled = String(process.env.ENGINE_ENABLED || 'true') === 'true';

try {
  await connectDb();

  app.listen(PORT, () => {
    banner({
      title: '⚡ ApiMon · API Health Monitor',
      subtitle: 'v1.0.0',
      rows: [
        ['api', color.cyan(`http://localhost:${PORT}`)],
        ['database', `${color.gray(process.env.MONGO_URI?.replace(/\/\/.*@/, '//***@') || 'n/a')}  ${color.gray('→')}  ${mongoose.connection.name}`],
        ['engine', engineEnabled ? `${color.green('running')} ${color.gray('· 1s tick · 10 workers')}` : color.gray('disabled')],
        ['env', color.gray(process.env.NODE_ENV || 'development')],
      ],
    });
  });

  if (engineEnabled) {
    startEngine({ intervalMs: 1000, concurrency: 10 });
  } else {
    log.warn(`probe engine disabled ${color.gray('(ENGINE_ENABLED=false)')}`);
  }
} catch (err) {
  log.fail(`server failed to start  ${color.gray(err.message)}`);
  process.exit(1);
}
