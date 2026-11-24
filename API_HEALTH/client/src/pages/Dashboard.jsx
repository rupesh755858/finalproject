import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const EMPTY = {
  name: '',
  url: '',
  method: 'GET',
  intervalSeconds: 60,
  consecutiveFailuresThreshold: 3,
  expectedStatus: '200',
  bodyContains: '',
  maxResponseMs: '',
};

export default function Dashboard() {
  const [monitors, setMonitors] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningCheckId, setRunningCheckId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const load = () =>
    api('/monitors')
      .then((d) => setMonitors(d.monitors || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const statusList = form.expectedStatus
      ? form.expectedStatus.split(',').map((s) => Number(s.trim())).filter(Boolean)
      : [200];

    try {
      await api('/monitors', {
        method: 'POST',
        body: {
          name: form.name,
          url: form.url,
          method: form.method,
          intervalSeconds: Number(form.intervalSeconds) || 60,
          consecutiveFailuresThreshold: Number(form.consecutiveFailuresThreshold) || 3,
          assertions: {
            statusIn: statusList.length ? statusList : [200],
            bodyContains: form.bodyContains,
            maxResponseMs: Number(form.maxResponseMs) || 0,
          },
        },
      });
      setForm(EMPTY);
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerCheck = async (id, e) => {
    e.stopPropagation();
    e.preventDefault();
    setRunningCheckId(id);
    try {
      await api(`/monitors/${id}/check`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningCheckId(null);
    }
  };

  const toggleMonitor = async (id, e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await api(`/monitors/${id}/toggle`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMonitor = async (id, name, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(`Delete monitor "${name}" and all historical data?`)) return;
    try {
      await api(`/monitors/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyUrl = (id, url, e) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Metric computations
  const total = monitors.length;
  const activeMonitors = monitors.filter((m) => m.isActive);
  const up = activeMonitors.filter((m) => m.lastStatus === 'up').length;
  const degraded = activeMonitors.filter((m) => m.lastStatus === 'degraded').length;
  const down = activeMonitors.filter((m) => m.lastStatus === 'down').length;
  const paused = monitors.filter((m) => !m.isActive).length;

  // Filtered monitors list
  const filtered = monitors.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.url.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'paused') return !m.isActive;
    if (statusFilter === 'up') return m.isActive && m.lastStatus === 'up';
    if (statusFilter === 'degraded') return m.isActive && m.lastStatus === 'degraded';
    if (statusFilter === 'down') return m.isActive && m.lastStatus === 'down';
    return true;
  });

  return (
    <>
      {error && <div className="toast err">{error}</div>}

      {/* KPI Overview Grid */}
      <div className="metrics-overview-grid">
        <div className="kpi-card kpi-primary">
          <div className="kpi-header">
            <span className="kpi-label">Total Services</span>
            <span className="kpi-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
            </span>
          </div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-subtext">
            <span>{paused > 0 ? `${paused} paused` : 'All monitors active'}</span>
          </div>
        </div>

        <div className="kpi-card kpi-up">
          <div className="kpi-header">
            <span className="kpi-label">Operational</span>
            <span className="kpi-icon" style={{ color: 'var(--status-up)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--status-up)' }}>{up}</div>
          <div className="kpi-subtext">
            <span>Passing assertions</span>
          </div>
        </div>

        <div className="kpi-card kpi-warn">
          <div className="kpi-header">
            <span className="kpi-label">Degraded</span>
            <span className="kpi-icon" style={{ color: 'var(--status-warn)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </span>
          </div>
          <div className="kpi-value" style={{ color: degraded > 0 ? 'var(--status-warn)' : 'var(--text-main)' }}>{degraded}</div>
          <div className="kpi-subtext">
            <span>Intermittent issues</span>
          </div>
        </div>

        <div className="kpi-card kpi-down">
          <div className="kpi-header">
            <span className="kpi-label">Failing / Down</span>
            <span className="kpi-icon" style={{ color: 'var(--status-down)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </span>
          </div>
          <div className="kpi-value" style={{ color: down > 0 ? 'var(--status-down)' : 'var(--text-main)' }}>{down}</div>
          <div className="kpi-subtext">
            <span>Failing thresholds</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Action Button */}
      <div className="dashboard-toolbar">
        <div className="search-box-wrapper">
          <span className="search-icon-inside">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search monitors by name or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-pills-group">
          <button
            className={`filter-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({total})
          </button>
          <button
            className={`filter-pill-btn ${statusFilter === 'up' ? 'active' : ''}`}
            onClick={() => setStatusFilter('up')}
          >
            Operational ({up})
          </button>
          <button
            className={`filter-pill-btn ${statusFilter === 'degraded' ? 'active' : ''}`}
            onClick={() => setStatusFilter('degraded')}
          >
            Degraded ({degraded})
          </button>
          <button
            className={`filter-pill-btn ${statusFilter === 'down' ? 'active' : ''}`}
            onClick={() => setStatusFilter('down')}
          >
            Down ({down})
          </button>
          {paused > 0 && (
            <button
              className={`filter-pill-btn ${statusFilter === 'paused' ? 'active' : ''}`}
              onClick={() => setStatusFilter('paused')}
            >
              Paused ({paused})
            </button>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="btn primary"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Create Monitor</span>
        </button>
      </div>

      {/* Monitors Table */}
      <div className="table-panel">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
              {searchQuery ? `No monitors matching "${searchQuery}"` : 'No monitors configured'}
            </p>
            <p style={{ fontSize: '0.825rem', marginBottom: '1.25rem' }}>
              {searchQuery ? 'Try clearing your search query or adjusting your filters.' : 'Add your first HTTP endpoint to begin tracking uptime and latency.'}
            </p>
            <button onClick={() => setShowModal(true)} className="btn primary">
              + Add First Monitor
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Service & Endpoint</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>24h Uptime</th>
                  <th>Timeline (10 checks)</th>
                  <th>Last Check</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const lastCheck = m.recentChecks && m.recentChecks.length > 0 ? m.recentChecks[m.recentChecks.length - 1] : null;
                  const latency = lastCheck?.latencyMs ? Math.round(lastCheck.latencyMs) : null;
                  const latencyColor = !latency ? 'inherit' : latency < 250 ? 'var(--status-up)' : latency < 600 ? 'var(--status-warn)' : 'var(--status-down)';

                  return (
                    <tr key={m._id} className="table-row-hover">
                      <td>
                        <div className="monitor-name-cell">
                          <Link to={`/m/${m._id}`} className="monitor-link-title">
                            {m.name}
                          </Link>
                          <div className="monitor-url-sub" title={m.url}>
                            <span className={`badge-method ${m.method}`}>{m.method}</span>
                            <span style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.url}
                            </span>
                            <button
                              className="btn-icon"
                              style={{ width: '18px', height: '18px', fontSize: '0.7rem' }}
                              title="Copy URL"
                              onClick={(e) => copyUrl(m._id, m.url, e)}
                            >
                              {copiedId === m._id ? '✓' : '📋'}
                            </button>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`pill small ${m.isActive ? m.lastStatus : 'paused'}`}>
                          <span className="live-dot" style={{ width: '5px', height: '5px', backgroundColor: 'currentColor' }} />
                          {m.isActive ? m.lastStatus.toUpperCase() : 'PAUSED'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: latencyColor }}>
                          {latency ? `${latency} ms` : '—'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontWeight: 600, color: m.uptime24h && m.uptime24h > 98 ? 'var(--status-up)' : 'inherit' }}>
                          {m.uptime24h !== null ? `${m.uptime24h}%` : '—'}
                        </span>
                      </td>

                      <td>
                        <div className="pips-bar">
                          {Array.from({ length: 10 }).map((_, idx) => {
                            const checkIndex = m.recentChecks?.length - 10 + idx;
                            const check = checkIndex >= 0 ? m.recentChecks[checkIndex] : null;
                            let pipClass = 'empty';
                            let title = 'No data';

                            if (check) {
                              pipClass = check.ok ? 'ok' : 'fail';
                              title = `${new Date(check.checkedAt).toLocaleTimeString()}: ${check.ok ? 'OK' : 'FAIL'} (${check.latencyMs ? Math.round(check.latencyMs) + 'ms' : ''})`;
                            }

                            return (
                              <div
                                key={idx}
                                className={`pip ${pipClass}`}
                                title={title}
                              />
                            );
                          })}
                        </div>
                      </td>

                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleTimeString() : 'Pending'}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            className="btn-icon"
                            title="Run check immediately"
                            disabled={runningCheckId === m._id}
                            onClick={(e) => triggerCheck(m._id, e)}
                          >
                            {runningCheckId === m._id ? (
                              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                              </svg>
                            )}
                          </button>

                          <button
                            className="btn-icon"
                            title={m.isActive ? 'Pause probe' : 'Resume probe'}
                            onClick={(e) => toggleMonitor(m._id, e)}
                          >
                            {m.isActive ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                              </svg>
                            )}
                          </button>

                          <button
                            className="btn-icon danger-icon"
                            title="Delete monitor"
                            onClick={(e) => deleteMonitor(m._id, m.name, e)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Monitor Modal Dialog */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Configure New API Monitor</h2>
              <button
                className="btn-icon"
                onClick={() => setShowModal(false)}
                title="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={create}>
                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>Monitor Name</label>
                    <input
                      placeholder="e.g. Production Auth Service"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group flex-2">
                    <label>Target URL</label>
                    <input
                      placeholder="https://api.example.com/health"
                      required
                      type="url"
                      value={form.url}
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>HTTP Method</label>
                    <select
                      value={form.method}
                      onChange={(e) => setForm({ ...form, method: e.target.value })}
                    >
                      <option value="GET">GET</option>
                      <option value="HEAD">HEAD</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label>Probe Frequency (seconds)</label>
                    <input
                      type="number"
                      min="10"
                      value={form.intervalSeconds}
                      onChange={(e) => setForm({ ...form, intervalSeconds: e.target.value })}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label>Expected HTTP Status</label>
                    <input
                      placeholder="200, 204"
                      value={form.expectedStatus}
                      onChange={(e) => setForm({ ...form, expectedStatus: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ margin: '1rem 0' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0' }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? '▲ Less assertion options' : '▼ + Advanced assertions (Body substring, Max latency, Fail threshold)'}
                  </button>
                </div>

                {showAdvanced && (
                  <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
                    <div className="form-row">
                      <div className="form-group flex-1">
                        <label>Body Must Contain Substring</label>
                        <input
                          placeholder='e.g. "ok":true'
                          value={form.bodyContains}
                          onChange={(e) => setForm({ ...form, bodyContains: e.target.value })}
                        />
                      </div>
                      <div className="form-group flex-1">
                        <label>Max Response Time (ms)</label>
                        <input
                          placeholder="e.g. 2000"
                          type="number"
                          value={form.maxResponseMs}
                          onChange={(e) => setForm({ ...form, maxResponseMs: e.target.value })}
                        />
                      </div>
                      <div className="form-group flex-1">
                        <label>Failure Threshold</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={form.consecutiveFailuresThreshold}
                          onChange={(e) => setForm({ ...form, consecutiveFailuresThreshold: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn primary"
                  >
                    {submitting ? 'Creating...' : 'Create Monitor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
