# ⚡ ApiMon - Real-Time API Health & Uptime Monitoring

A modern, full-stack, distributed-ready API and web service health monitoring system built with Express, MongoDB, and React (Vite).

---

## 🚀 Features

- **Automated Health Probes**: High-precision HTTP/HTTPS latency probe measuring DNS lookup, TCP connect, TLS handshake, TTFB, and total response time.
- **Background Execution Engine**: Asynchronous queue runner with jitter and worker locking to prevent race conditions across distributed instances.
- **Smart Incident Management**: Automatically creates incidents when endpoints fail consecutive checks and resolves them upon recovery.
- **Multi-Channel Alerting**: Built-in alerting system supporting Console, Webhooks, Slack, and Discord.
- **SSRF Security Protection**: IP validation blocking internal and private RFC1918 IPs unless explicitly allowed.
- **Live Public Status Page**: GitHub/Datadog-style public status dashboard displaying system status, 24-hour uptime percentages, and 30-pip check timeline history.
- **Interactive Metrics Dashboard**: Real-time response time charts with Recharts, manual check triggers, pause/resume toggles, and detailed check logs.

---

## 📁 Architecture & Directory Structure

```
API_HEALTH/
├── client/                     # Frontend (React 19, Vite, Recharts, React Router)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Overview, metrics cards, monitor management
│   │   │   ├── MonitorDetail.jsx   # Latency charts, timing breakdown, check history
│   │   │   ├── PublicStatus.jsx    # Public-facing status page
│   │   │   ├── Team.jsx            # Admin: add logins, promote, disable, reset
│   │   │   └── Login.jsx           # Authentication (Login / Register)
│   │   ├── api.js                  # API fetch client with JWT auth headers
│   │   ├── auth.jsx                # Signed-in user + role context (useAuth)
│   │   ├── App.jsx                 # Navigation bar, routing & role guards
│   │   └── index.css               # Modern dark-mode dashboard styling
│   └── vite.config.js              # Proxy configuration for backend API (/api -> 4000)
│
├── server/                     # Backend (Node.js ESM, Express 5, Mongoose)
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js               # MongoDB connection with local mongod auto-start
│   │   ├── engine/
│   │   │   ├── probe.js            # Network request probe with socket timings
│   │   │   ├── evaluator.js        # Incident lifecycle & threshold evaluator
│   │   │   ├── alert.js            # Webhook, Slack & Discord notification engine
│   │   │   └── engine.js           # Distributed worker check scheduler
│   │   ├── models/
│   │   │   ├── User.js             # Accounts, bcrypt credentials, role & active flag
│   │   │   ├── Monitor.js          # Monitor configuration, scheduling & state
│   │   │   ├── Check.js            # Historical check records & latency metrics
│   │   │   ├── Incident.js         # Incident tracking & state transitions
│   │   │   ├── AlertChannel.js     # Notification channels (Webhooks/Slack/Discord)
│   │   │   └── NotificationLog.js  # Deduplication log for outgoing alerts
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verify + requireAdmin / requireController
│   │   ├── lib/
│   │   │   ├── logger.js           # Aligned, colourised console output
│   │   │   └── tester.js           # Tiny test runner used by test-e2e.js
│   │   ├── routes/
│   │   │   ├── auth.js             # /api/auth/register & /api/auth/login
│   │   │   ├── monitors.js         # /api/monitors CRUD, check triggers & toggles
│   │   │   ├── status.js           # /api/status public status endpoint
│   │   │   ├── alerts.js           # /api/alerts alert channels CRUD
│   │   │   └── users.js            # /api/users admin-only team management
│   │   └── index.js                # Express app initialization & server entry point
│   ├── test-e2e.js                 # Automated end-to-end integration test
│   └── .env.example                # Environment template (copy to .env)
└── package.json                # Root package scripts
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **MongoDB** (Local instance or MongoDB Atlas URI)

### 2. Run the whole stack (recommended)
From the repository root:
```bash
npm --prefix server install     # once
npm --prefix client install     # once
npm run dev                     # starts API + client together, with prefixed logs
```

Or start each half on its own:
```bash
npm run dev:server     # API on http://localhost:4000
npm run dev:client     # UI  on http://localhost:5173
```
*The server will automatically connect to MongoDB, start the background check engine, and listen on port 4000 (`http://localhost:4000`).*

*The client dev server proxies `/api` to port 4000 automatically.*

### 3. Run the end-to-end suite
With the API running:
```bash
npm test                                   # from the repo root
API_BASE=http://localhost:4000/api npm test # or point it anywhere
```
The suite exits non-zero when any test fails, so it drops straight into CI.

The Team tests need the controller's credentials — without them they are reported as
skipped rather than failed:

```bash
CONTROLLER_EMAIL=admin@example.com CONTROLLER_PASSWORD=mysecretpass npm test
```

---

## 🔐 Roles & Access

Three roles, in order of authority:

| Role | What it can do |
|---|---|
| **controller** | Exactly one account. Owns the system: creates admins, promotes/demotes, and can never be demoted, disabled or deleted. |
| **admin** | Adds logins, disables members, resets passwords. Cannot change anyone's role. |
| **user** (member) | Signs in, sees and manages the shared monitors. No team management. |

**Bootstrapping the controller.** The first account ever created becomes the controller:

```bash
npm run user:create -- admin@example.com mysecretpass "Nilesh Patil"
```

Every account after that is a normal member. Add an admin later from the Team page, or with
`npm run user:create -- ops@example.com pass "Ops" --admin`. `--reset` changes an existing
password.

**Public signup still works** (`/api/auth/register`) but always creates a plain member — a
`role` sent in the body is ignored, so nobody can promote themselves.

### Admin endpoints (`/api/users`, admin or controller only)

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/users` | admin | List the roster |
| `POST /api/users` | admin (admin role: controller only) | Create a login |
| `PATCH /api/users/:id/role` | controller | Promote to admin / demote to member |
| `PATCH /api/users/:id/status` | admin | Enable or disable a login |
| `PATCH /api/users/:id/password` | admin | Set a new password |
| `DELETE /api/users/:id` | admin | Remove a login (never the controller or yourself) |

Roles are re-read from the database on every request, so a promotion, a demotion or a
disabled account takes effect immediately — not when the 7-day token expires.

**Monitors and alert channels are team-wide.** Every signed-in user sees and manages the
same list; `owner` is kept only to show who added a monitor. Alert channels fire for every
monitor, regardless of who created them.

---

## 🖥️ Console Output

Every line the server prints has the same shape — `time │ scope │ status │ message` — so
startup, HTTP traffic, probe results and incidents read as one table:

```
11:54:41 │ DB       │ ●  connecting  mongodb://localhost:27017/apimon
11:54:41 │ DB       │ ✔  connected  apimon

  ⚡ ApiMon · API Health Monitor  v1.0.0
  ──────────────────────────────────────────────────────────────
  api         http://localhost:4000
  database    mongodb://localhost:27017/apimon  →  apimon
  engine      running · 1s tick · 10 workers
  env         development
  ──────────────────────────────────────────────────────────────

11:54:41 │ HTTP     │ ●  200  GET    /api/monitors                   11ms
11:54:41 │ HTTP     │ ✖  500  GET    /api/status                     18ms
11:54:41 │ CHECK    │ ✔  Google DNS               200     142ms
11:54:41 │ CHECK    │ ✖  Payments API             503      84ms  status 503 not in [200]
11:54:41 │ INCIDENT │ ✖  opened    Payments API  3 consecutive failures  ·  HTTP 503
11:54:41 │ ALERT    │ ✔  recovered  Payments API  · Ops webhook
11:54:41 │ INCIDENT │ ✔  resolved  Payments API  after 3 failure(s)
```

The test suite prints a grouped report instead of a stream of `console.log`:

```
  ⚡ ApiMon · end-to-end suite  v1.0.0
  ──────────────────────────────────────────────────────────────
  target      http://localhost:4000/api
  started     11:54:22
  ──────────────────────────────────────────────────────────────

  AUTH
    ✔   3  Register a new user                                   201      79ms
    ✔   4  Reject duplicate email                                409       5ms
    ✖   5  Reject short password                                 400       5ms
           status: expected 400, received 201

  ──────────────────────────────────────────────────────────────
  ✔ 18 passed   ✖ 1 failed                           total 870ms
```

Colours switch off automatically when output is piped or `NO_COLOR` is set, so logs stay
clean in CI and log files.

| Variable | Default | Effect |
|---|---|---|
| `LOG_HTTP` | `true` | Set to `false` to silence the per-request access log |
| `NO_COLOR` | unset | Set to any value to disable colours |
| `FORCE_COLOR` | unset | Set to `1` to force colours in a pipe or CI |
| `LOG_SILENT` | unset | Set to `true` to silence all logger output |

---

## 🔑 Environment Variables

Copy `server/.env.example` to `server/.env` and fill in your own values. `server/.env` is git-ignored and must never be committed.

```ini
MONGO_URI=mongodb://localhost:27017/apimon
JWT_SECRET=replace-with-a-long-random-secret
PORT=4000
ALLOW_PRIVATE_TARGETS=false
ENGINE_ENABLED=true
```

- `ALLOW_PRIVATE_TARGETS`: Set to `false` in production to prevent SSRF against loopback and internal subnet addresses.
- `ENGINE_ENABLED`: Set to `false` if running API web nodes separately from background probe workers.
