import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

const round = (n) => (typeof n === 'number' && !isNaN(n) ? Math.round(n * 10) / 10 : null);

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === 'localhost' || ip === '::1' || ip.startsWith('fe80:')) return true;
  // IPv4 checks
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (metadata)
    if (parts[0] === 0) return true;
  }
  return false;
}

async function validateUrlSecurity(urlString) {
  const allowPrivate = String(process.env.ALLOW_PRIVATE_TARGETS || 'true') === 'true';
  const u = new URL(urlString);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('invalid_protocol');
  }

  if (!allowPrivate) {
    if (u.hostname === 'localhost' || isPrivateIp(u.hostname)) {
      throw new Error('private_target_prohibited');
    }
    try {
      const lookup = await dns.lookup(u.hostname);
      if (isPrivateIp(lookup.address)) {
        throw new Error('private_ip_prohibited');
      }
    } catch (err) {
      if (err.message.includes('prohibited')) throw err;
    }
  }
  return u;
}

function requestOnce(rawUrl, { method = 'GET', timeoutMs = 10000, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return reject(new Error('invalid_url'));
    }

    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const startedAt = process.hrtime.bigint();
    const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e6;
    const timings = { dns: null, tcp: null, tls: null, ttfb: null };

    const reqHeaders = {
      'user-agent': 'ApiMon/1.0 (+health-check)',
      accept: '*/*',
      connection: 'close',
      ...headers,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      if (!reqHeaders['content-type']) reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(body);
    }

    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: `${u.pathname || '/'}${u.search || ''}`,
      method: method.toUpperCase(),
      headers: reqHeaders,
    });

    let finished = false;
    const finish = (fn) => (arg) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      const err = new Error('timeout');
      err.code = 'ETIMEDOUT';
      req.destroy(err);
      finish(reject)(err);
    }, timeoutMs);

    req.on('socket', (socket) => {
      const mark = (name) => () => {
        if (timings[name] === null) timings[name] = elapsed();
      };

      for (const s of [socket, socket?.socket].filter(Boolean)) {
        s.once('lookup', mark('dns'));
        s.once('connect', mark('tcp'));
        s.once('secureConnect', mark('tls'));
      }
    });

    req.on('response', (res) => {
      timings.ttfb = elapsed();
      const chunks = [];
      let size = 0;

      res.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      });

      res.on('end', () => {
        finish(resolve)({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          timings,
          latencyMs: elapsed(),
        });
      });

      res.on('error', (err) => {
        finish(reject)(err);
      });
    });

    req.on('error', (err) => {
      finish(reject)(err);
    });

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      req.write(body);
    }
    req.end();
  });
}

export async function probe(monitor) {
  const checkedAt = new Date();
  const startedAt = Date.now();
  const timeoutMs = monitor.timeoutMs || 10000;
  const method = monitor.method || 'GET';
  const maxRedirects = monitor.followRedirects ? MAX_REDIRECTS : 0;
  const body = monitor.body || '';

  let currentUrl = monitor.url;

  try {
    let res;
    for (let hop = 0; ; hop += 1) {
      await validateUrlSecurity(currentUrl);
      res = await requestOnce(currentUrl, {
        method: hop === 0 ? method : 'GET',
        timeoutMs,
        body: hop === 0 ? body : '',
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode);
      if (!isRedirect || hop >= maxRedirects || !res.headers?.location) break;

      currentUrl = new URL(res.headers.location, currentUrl).toString();
    }

    const latencyMs = Date.now() - startedAt;
    const a = monitor.assertions || {};
    const statusIn = a.statusIn && a.statusIn.length ? a.statusIn : [200];

    const statusOk = statusIn.includes(res.statusCode);
    const bodyOk = !a.bodyContains || (res.body && res.body.includes(a.bodyContains));
    const latencyOk = !a.maxResponseMs || latencyMs <= a.maxResponseMs;
    const ok = statusOk && bodyOk && latencyOk;

    let error = null;
    if (!ok) {
      if (!statusOk) error = `status_${res.statusCode}`;
      else if (!bodyOk) error = 'body_assertion_failed';
      else error = 'too_slow';
    }

    return {
      ok,
      checkedAt,
      statusCode: res.statusCode,
      latencyMs,
      timings: {
        dns: round(res.timings.dns),
        tcp: round(
          res.timings.tcp !== null && res.timings.dns !== null
            ? Math.max(0, res.timings.tcp - res.timings.dns)
            : res.timings.tcp
        ),
        tls: round(
          res.timings.tls !== null && res.timings.tcp !== null
            ? Math.max(0, res.timings.tls - res.timings.tcp)
            : null
        ),
        ttfb: round(
          res.timings.ttfb !== null && res.timings.tcp !== null
            ? Math.max(0, res.timings.ttfb - res.timings.tcp)
            : res.timings.ttfb
        ),
      },
      error,
    };
  } catch (err) {
    return {
      ok: false,
      checkedAt,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      timings: { dns: null, tcp: null, tls: null, ttfb: null },
      error: err.code || err.message || 'probe_failed',
    };
  }
}
