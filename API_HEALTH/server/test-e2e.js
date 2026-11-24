/**
 * ApiMon end-to-end suite.
 *
 *   npm test            # from the repo root
 *   node test-e2e.js    # from server/
 *
 * Point it somewhere else with API_BASE=https://staging.example.com/api
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { color, formatMs } from './src/lib/logger.js';
import { createSuite, expect, expectTruthy } from './tester.js';

const BASE = (process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}/api`).replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 15000);

const suite = createSuite({
  title: '⚡ ApiMon · end-to-end suite',
  subtitle: 'v1.0.0',
  meta: [
    ['target', color.cyan(BASE)],
    ['started', color.gray(new Date().toTimeString().slice(0, 8))],
  ],
});

/** Small fetch wrapper: always resolves with { status, data, ms }. */
async function request(path, { method = 'GET', token, body } = {}) {
  const startedAt = process.hrtime.bigint();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }

  return { status: res.status, data, ms: Number(process.hrtime.bigint() - startedAt) / 1e6 };
}

const stamp = Date.now();
const state = { email: `tester_${stamp}@example.com`, password: 'password123', token: '', monitorId: '' };

async function main() {
  // ── Preflight ────────────────────────────────────────────────────────────
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    suite.abort(
      `No ApiMon server answering at ${BASE}`,
      'Start the API first (npm run dev:server), then re-run the suite.'
    );
  }

  // ── System ───────────────────────────────────────────────────────────────
  suite.group('System');

  await suite.test('Health endpoint responds', async () => {
    const res = await request('/health');
    expect(res.status, 200, 'status');
    expectTruthy(res.data.ok === true, 'health payload missing "ok: true"');
    return `200 · ${formatMs(res.ms)}`;
  });

  await suite.test('Unknown route returns 404', async () => {
    const res = await request('/definitely-not-a-route');
    expect(res.status, 404, 'status');
    return '404';
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  suite.group('Auth');

  await suite.test('Register a new user', async () => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: { email: state.email, password: state.password, name: 'Integration Tester' },
    });
    expect(res.status, 201, 'status');
    expectTruthy(res.data.token, 'no token returned');
    expect(res.data.user?.role, 'user', 'role');
    state.token = res.data.token;
    return '201';
  });

  await suite.test('Reject duplicate email', async () => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: { email: state.email, password: state.password },
    });
    expect(res.status, 409, 'status');
    return '409';
  });

  await suite.test('Reject short password', async () => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: { email: `short_${stamp}@example.com`, password: '123' },
    });
    expect(res.status, 400, 'status');
    return '400';
  });

  await suite.test('Log in with valid credentials', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: state.email, password: state.password },
    });
    expect(res.status, 200, 'status');
    expectTruthy(res.data.token, 'no token returned');
    state.token = res.data.token;
    return '200';
  });

  await suite.test('Reject wrong password', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: state.email, password: 'not-the-password' },
    });
    expect(res.status, 401, 'status');
    return '401';
  });

  await suite.test('Reject unauthenticated request', async () => {
    const res = await request('/monitors');
    expect(res.status, 401, 'status');
    return '401';
  });

  // ── Monitors ─────────────────────────────────────────────────────────────
  suite.group('Monitors');

  await suite.test('Create a monitor', async () => {
    const res = await request('/monitors', {
      method: 'POST',
      token: state.token,
      body: {
        name: 'Google DNS',
        url: 'https://dns.google',
        method: 'GET',
        intervalSeconds: 30,
        assertions: { statusIn: [200], maxResponseMs: 5000 },
      },
    });
    expect(res.status, 201, 'status');
    expectTruthy(res.data.monitor?._id, 'no monitor id returned');
    state.monitorId = res.data.monitor._id;
    return '201';
  });

  await suite.test('Reject a malformed URL', async () => {
    const res = await request('/monitors', {
      method: 'POST',
      token: state.token,
      body: { name: 'Bad monitor', url: 'not-a-url' },
    });
    expect(res.status, 400, 'status');
    return '400';
  });

  await suite.test('List monitors', async () => {
    const res = await request('/monitors', { token: state.token });
    expect(res.status, 200, 'status');
    expectTruthy(Array.isArray(res.data.monitors), 'monitors is not an array');
    const found = res.data.monitors.some((m) => m._id === state.monitorId);
    expectTruthy(found, 'created monitor missing from the list');
    const n = res.data.monitors.length;
    return `${n} monitor${n === 1 ? '' : 's'}`;
  });

  await suite.test('Read monitor detail', async () => {
    const res = await request(`/monitors/${state.monitorId}`, { token: state.token });
    expect(res.status, 200, 'status');
    expect(res.data.monitor?.name, 'Google DNS', 'monitor name');
    return '200';
  });

  // ── Checks ───────────────────────────────────────────────────────────────
  suite.group('Checks');

  await suite.test('Run an on-demand check', async () => {
    const res = await request(`/monitors/${state.monitorId}/check`, {
      method: 'POST',
      token: state.token,
    });
    expect(res.status, 200, 'status');
    expectTruthy(res.data.result, 'no probe result returned');
    const { statusCode, latencyMs } = res.data.result;
    return statusCode ? `${statusCode} · ${formatMs(latencyMs)}` : 'no response';
  });

  await suite.test('Read check history', async () => {
    const res = await request(`/monitors/${state.monitorId}/checks?limit=10`, { token: state.token });
    expect(res.status, 200, 'status');
    expectTruthy(Array.isArray(res.data.checks), 'checks is not an array');
    expectTruthy(res.data.checks.length > 0, 'no checks recorded');
    const n = res.data.checks.length;
    return `${n} check${n === 1 ? '' : 's'}`;
  });

  // ── Public status ────────────────────────────────────────────────────────
  suite.group('Public status');

  await suite.test('Public status page', async () => {
    const res = await request('/status');
    expect(res.status, 200, 'status');
    expectTruthy(Array.isArray(res.data.monitors), 'monitors is not an array');
    return `${res.data.systemStatus ?? 'unknown'}`;
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────
  suite.group('Lifecycle');

  await suite.test('Pause a monitor', async () => {
    const res = await request(`/monitors/${state.monitorId}/toggle`, {
      method: 'PATCH',
      token: state.token,
    });
    expect(res.status, 200, 'status');
    expect(res.data.isActive, false, 'isActive');
    return 'paused';
  });

  await suite.test('Resume a monitor', async () => {
    const res = await request(`/monitors/${state.monitorId}/toggle`, {
      method: 'PATCH',
      token: state.token,
    });
    expect(res.status, 200, 'status');
    expect(res.data.isActive, true, 'isActive');
    return 'running';
  });

  await suite.test('Delete a monitor', async () => {
    const res = await request(`/monitors/${state.monitorId}`, {
      method: 'DELETE',
      token: state.token,
    });
    expect(res.status, 200, 'status');
    expectTruthy(res.data.ok, 'delete did not confirm');
    return 'deleted';
  });

  await suite.test('Deleted monitor is gone', async () => {
    const res = await request(`/monitors/${state.monitorId}`, { token: state.token });
    expect(res.status, 404, 'status');
    return '404';
  });


  // ── Team (admin) ─────────────────────────────────────────────────────────
  suite.group('Team');

  const controllerEmail = String(process.env.CONTROLLER_EMAIL || '').toLowerCase();
  const controllerPassword = process.env.CONTROLLER_PASSWORD || '';
  const team = {
    memberEmail: `member_${stamp}@example.com`,
    memberId: '',
    memberToken: '',
    controllerToken: '',
    controllerId: '',
  };

  await suite.test('Team endpoints require a token', async () => {
    const res = await request('/users');
    expect(res.status, 401, 'status');
    return '401';
  });

  if (!controllerEmail || !controllerPassword) {
    suite.skip('Admin tests', 'set CONTROLLER_EMAIL');
    suite.skip('Role tests', 'set CONTROLLER_PASSWORD');
  } else {
    const controllerLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: controllerEmail, password: controllerPassword },
    });

    if (controllerLogin.status !== 200) {
      suite.skip('Admin tests', `login failed (${controllerLogin.status})`);
    } else {
      team.controllerToken = controllerLogin.data.token;

      await suite.test('Controller lists the team', async () => {
        const res = await request('/users', { token: team.controllerToken });
        expect(res.status, 200, 'status');
        expectTruthy(Array.isArray(res.data.users), 'users is not an array');
        const me = res.data.users.find((u) => u.email === controllerEmail);
        expectTruthy(me, 'controller is missing from the roster');
        expect(me.role, 'controller', 'role');
        team.controllerId = me.id;
        return `${res.data.users.length} accounts`;
      });

      await suite.test('Admin adds a login', async () => {
        const res = await request('/users', {
          method: 'POST',
          token: team.controllerToken,
          body: { email: team.memberEmail, password: 'memberpass123', name: 'Test Member' },
        });
        expect(res.status, 201, 'status');
        expect(res.data.user?.role, 'user', 'role');
        team.memberId = res.data.user.id;
        return '201';
      });

      await suite.test('New login can sign in', async () => {
        const res = await request('/auth/login', {
          method: 'POST',
          body: { email: team.memberEmail, password: 'memberpass123' },
        });
        expect(res.status, 200, 'status');
        team.memberToken = res.data.token;
        return '200';
      });

      await suite.test('Member cannot see the team', async () => {
        const res = await request('/users', { token: team.memberToken });
        expect(res.status, 403, 'status');
        return '403';
      });

      await suite.test('Member cannot promote themselves', async () => {
        const res = await request(`/users/${team.memberId}/role`, {
          method: 'PATCH',
          token: team.memberToken,
          body: { role: 'admin' },
        });
        expect(res.status, 403, 'status');
        return '403';
      });

      await suite.test('Controller promotes the member', async () => {
        const res = await request(`/users/${team.memberId}/role`, {
          method: 'PATCH',
          token: team.controllerToken,
          body: { role: 'admin' },
        });
        expect(res.status, 200, 'status');
        expect(res.data.user?.role, 'admin', 'role');
        return 'admin';
      });

      await suite.test('Promoted admin sees the team', async () => {
        const res = await request('/users', { token: team.memberToken });
        expect(res.status, 200, 'status');
        return '200';
      });

      await suite.test('Admin cannot change roles', async () => {
        const res = await request(`/users/${team.controllerId}/role`, {
          method: 'PATCH',
          token: team.memberToken,
          body: { role: 'user' },
        });
        expect(res.status, 403, 'status');
        return '403';
      });

      await suite.test('Controller cannot be demoted', async () => {
        const res = await request(`/users/${team.controllerId}/role`, {
          method: 'PATCH',
          token: team.controllerToken,
          body: { role: 'user' },
        });
        expect(res.status, 403, 'status');
        return '403';
      });

      await suite.test('Disable a login', async () => {
        const res = await request(`/users/${team.memberId}/status`, {
          method: 'PATCH',
          token: team.controllerToken,
          body: { isActive: false },
        });
        expect(res.status, 200, 'status');
        expect(res.data.user?.isActive, false, 'isActive');
        return 'disabled';
      });

      await suite.test('Disabled login is refused', async () => {
        const res = await request('/auth/login', {
          method: 'POST',
          body: { email: team.memberEmail, password: 'memberpass123' },
        });
        expect(res.status, 403, 'status');
        return '403';
      });

      await suite.test('Re-enable a login', async () => {
        const res = await request(`/users/${team.memberId}/status`, {
          method: 'PATCH',
          token: team.controllerToken,
          body: { isActive: true },
        });
        expect(res.status, 200, 'status');
        return 'enabled';
      });

      await suite.test('Reset a password', async () => {
        const res = await request(`/users/${team.memberId}/password`, {
          method: 'PATCH',
          token: team.controllerToken,
          body: { password: 'newpass123' },
        });
        expect(res.status, 200, 'status');

        const login = await request('/auth/login', {
          method: 'POST',
          body: { email: team.memberEmail, password: 'newpass123' },
        });
        expect(login.status, 200, 'login status');
        return '200';
      });

      await suite.test('Delete the test login', async () => {
        const res = await request(`/users/${team.memberId}`, {
          method: 'DELETE',
          token: team.controllerToken,
        });
        expect(res.status, 200, 'status');
        return 'deleted';
      });
    }
  }

  const failed = suite.summary();
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(`\n  ${color.red('✖  Suite crashed:')} ${err?.message || err}\n`);
  process.exit(1);
});
