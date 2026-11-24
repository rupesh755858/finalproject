import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';

export default function MonitorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState(null);
  const [checks, setChecks] = useState([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const [m, c] = await Promise.all([
        api(`/monitors/${id}`),
        api(`/monitors/${id}/checks?limit=60`),
      ]);
      setMonitor(m.monitor);
      setChecks(c.checks || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const [m, c] = await Promise.all([
          api(`/monitors/${id}`),
          api(`/monitors/${id}/checks?limit=60`),
        ]);
        if (!ignore) {
          setMonitor(m.monitor);
          setChecks(c.checks || []);
        }
      } catch (err) {
        if (!ignore) setError(err.message);
      }
    };
    run();
    const t = setInterval(run, 8000);
    return () => {
      ignore = true;
      clearInterval(t);
    };
  }, [id]);

  const triggerCheck = async () => {
    setChecking(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api(`/monitors/${id}/check`, { method: 'POST' });
      setSuccessMsg(`Probe executed: ${res.result.ok ? 'PASS' : 'FAIL'} (HTTP ${res.result.statusCode || 'N/A'}, ${Math.round(res.result.latencyMs)}ms)`);
      await load();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const toggleActive = async () => {
    try {
      await api(`/monitors/${id}/toggle`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMonitor = async () => {
    if (!window.confirm(`Delete monitor "${monitor.name}" and all historical data?`)) return;
    try {
      await api(`/monitors/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const copyUrl = () => {
    if (!monitor?.url) return;
    navigator.clipboard.writeText(monitor.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error && !monitor) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p className="toast err" style={{ display: 'inline-block' }}>{error}</p>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/" className="btn secondary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-muted)' }}>
        <div className="live-dot" style={{ width: '10px', height: '10px', marginBottom: '1rem' }} />
        <p>Loading telemetry...</p>
      </div>
    );
  }

  const chartData = checks.map((c) => ({
    time: new Date(c.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: Math.round(c.latencyMs || 0),
    status: c.ok ? 'OK' : 'FAIL',
  }));

  const latestCheck = checks.length > 0 ? checks[checks.length - 1] : null;
  const currentLatency = latestCheck?.latencyMs ? Math.round(latestCheck.latencyMs) : null;
  const latencyColor = !currentLatency ? 'inherit' : currentLatency < 250 ? 'var(--status-up)' : currentLatency < 600 ? 'var(--status-warn)' : 'var(--status-down)';

  // Waterfall timing calculation
  const timings = latestCheck?.timings || {};
  const totalTiming = (timings.dns || 0) + (timings.tcp || 0) + (timings.tls || 0) + (timings.ttfb || 0) || 1;
  const dnsPct = Math.round(((timings.dns || 0) / totalTiming) * 100);
  const tcpPct = Math.round(((timings.tcp || 0) / totalTiming) * 100);
  const tlsPct = Math.round(((timings.tls || 0) / totalTiming) * 100);
  const ttfbPct = Math.round(((timings.ttfb || 0) / totalTiming) * 100);

  return (
    <>
      {/* Breadcrumb Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
        <Link to="/" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Dashboard
        </Link>
        <span style={{ color: 'var(--border-subtle)' }}>/</span>
        <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{monitor.name}</span>
      </div>

      {error && <div className="toast err">{error}</div>}
      {successMsg && <div className="toast success">{successMsg}</div>}

      {/* Hero Header Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                {monitor.name}
              </h1>
              <span className={`pill ${monitor.isActive ? monitor.lastStatus : 'paused'}`}>
                <span className="live-dot" style={{ backgroundColor: 'currentColor' }} />
                {monitor.isActive ? monitor.lastStatus.toUpperCase() : 'PAUSED'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span className={`badge-method ${monitor.method}`}>{monitor.method}</span>
              <a
                href={monitor.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
              >
                {monitor.url}
              </a>
              <button
                className="btn-icon"
                style={{ width: '22px', height: '22px', fontSize: '0.75rem' }}
                onClick={copyUrl}
                title="Copy URL"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              onClick={triggerCheck}
              disabled={checking}
              className="btn primary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>{checking ? 'Probing...' : 'Check Now'}</span>
            </button>
            <button onClick={toggleActive} className="btn secondary">
              {monitor.isActive ? 'Pause' : 'Resume'}
            </button>
            <button onClick={deleteMonitor} className="btn danger">
              Delete
            </button>
          </div>
        </div>

        {/* 4 KPI Metrics */}
        <div className="metrics-overview-grid" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          <div className="kpi-card" style={{ padding: '1.15rem' }}>
            <span className="kpi-label">24h Availability</span>
            <div className="kpi-value" style={{ fontSize: '1.75rem', color: monitor.uptime24h && monitor.uptime24h > 98 ? 'var(--status-up)' : 'inherit' }}>
              {monitor.uptime24h !== null ? `${monitor.uptime24h}%` : 'N/A'}
            </div>
            <span className="kpi-subtext">Last 24 hours</span>
          </div>

          <div className="kpi-card" style={{ padding: '1.15rem' }}>
            <span className="kpi-label">Latest Latency</span>
            <div className="kpi-value" style={{ fontSize: '1.75rem', color: latencyColor }}>
              {currentLatency ? `${currentLatency} ms` : '—'}
            </div>
            <span className="kpi-subtext">HTTP roundtrip</span>
          </div>

          <div className="kpi-card" style={{ padding: '1.15rem' }}>
            <span className="kpi-label">Interval</span>
            <div className="kpi-value" style={{ fontSize: '1.75rem' }}>
              {monitor.intervalSeconds}s
            </div>
            <span className="kpi-subtext">Threshold: {monitor.consecutiveFailuresThreshold} fails</span>
          </div>

          <div className="kpi-card" style={{ padding: '1.15rem' }}>
            <span className="kpi-label">Total Probes</span>
            <div className="kpi-value" style={{ fontSize: '1.75rem' }}>
              {monitor.totalChecks || checks.length}
            </div>
            <span className="kpi-subtext">Recorded checks</span>
          </div>
        </div>
      </div>

      {/* Latency History Chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>Response Time History</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Continuous probe telemetry</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            Last {checks.length} Checks
          </span>
        </div>

        <div style={{ width: '100%', height: 260 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-line)" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="var(--chart-axis)" fontSize={11} />
                <YAxis stroke="var(--chart-axis)" fontSize={11} unit="ms" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                  itemStyle={{ color: 'var(--text-main)' }}
                  labelStyle={{ color: 'var(--text-muted)' }}
                  formatter={(val) => [`${val} ms`, 'Latency']}
                />
                <Area
                  type="monotone"
                  dataKey="latency"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#latencyGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '4rem' }}>No check data collected yet.</p>
          )}
        </div>
      </div>

      {/* Network Timings Breakdown */}
      {latestCheck?.timings && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Socket Latency Breakdown
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Detailed breakdown of the socket handshake and data transfer stages
          </p>

          <div className="waterfall-container">
            <div className="waterfall-step">
              <span className="waterfall-label">DNS Lookup</span>
              <div className="waterfall-track">
                <div className="waterfall-bar bar-dns" style={{ width: `${Math.max(4, dnsPct)}%` }} />
              </div>
              <span className="waterfall-val">{timings.dns !== null ? `${timings.dns}ms` : '—'}</span>
            </div>

            <div className="waterfall-step">
              <span className="waterfall-label">TCP Connect</span>
              <div className="waterfall-track">
                <div className="waterfall-bar bar-tcp" style={{ width: `${Math.max(4, tcpPct)}%` }} />
              </div>
              <span className="waterfall-val">{timings.tcp !== null ? `${timings.tcp}ms` : '—'}</span>
            </div>

            <div className="waterfall-step">
              <span className="waterfall-label">TLS Handshake</span>
              <div className="waterfall-track">
                <div className="waterfall-bar bar-tls" style={{ width: `${Math.max(4, tlsPct)}%` }} />
              </div>
              <span className="waterfall-val">{timings.tls !== null ? `${timings.tls}ms` : '—'}</span>
            </div>

            <div className="waterfall-step">
              <span className="waterfall-label">Time to First Byte</span>
              <div className="waterfall-track">
                <div className="waterfall-bar bar-ttfb" style={{ width: `${Math.max(4, ttfbPct)}%` }} />
              </div>
              <span className="waterfall-val">{timings.ttfb !== null ? `${timings.ttfb}ms` : '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Check History Table */}
      <div className="table-panel">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>Probe Execution Log</h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Latest 20 health checks</span>
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Result</th>
                <th>HTTP Status</th>
                <th>Latency</th>
                <th>Diagnostics / Error</th>
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No checks recorded yet.
                  </td>
                </tr>
              ) : (
                checks.slice().reverse().slice(0, 20).map((c) => (
                  <tr key={c._id} className="table-row-hover">
                    <td style={{ color: 'var(--text-muted)' }}>{new Date(c.checkedAt).toLocaleTimeString()}</td>
                    <td>
                      <span className={`pill small ${c.ok ? 'up' : 'down'}`}>
                        {c.ok ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {c.statusCode || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: c.latencyMs && c.latencyMs < 300 ? 'var(--status-up)' : 'inherit' }}>
                        {Math.round(c.latencyMs || 0)} ms
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {c.error || (c.ok ? 'OK' : 'Unknown Error')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
