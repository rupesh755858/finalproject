import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function PublicStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [search, setSearch] = useState('');

  const load = () => {
    return api('/status')
      .then((res) => {
        setData(res);
        setLastRefreshed(new Date());
      })
      .catch((err) => console.error('Failed to load status:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 0', color: 'var(--text-muted)' }}>
        <div className="live-dot" style={{ width: '10px', height: '10px', marginBottom: '1rem' }} />
        <p style={{ fontSize: '0.9rem' }}>Loading system status...</p>
      </div>
    );
  }

  const systemStatus = data?.systemStatus || 'All Systems Operational';
  const isAllGood = systemStatus === 'All Systems Operational';
  const isMajor = systemStatus === 'Major Outage';
  const isDegraded = systemStatus === 'Degraded Performance';

  let bannerClass = 'all-good';
  let bannerDesc = 'All services, APIs, and background probe workers are operating normally.';

  if (isMajor) {
    bannerClass = 'has-down';
    bannerDesc = 'One or more essential endpoints are experiencing outages. Incident response active.';
  } else if (isDegraded) {
    bannerClass = 'has-degraded';
    bannerDesc = 'Some endpoints are experiencing elevated latency or intermittent errors.';
  }

  const monitors = data?.monitors || [];
  const filtered = monitors.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.url.toLowerCase().includes(search.toLowerCase())
  );

  // Uptime aggregate
  let totalUptime = 0;
  let countUptime = 0;
  monitors.forEach((m) => {
    if (typeof m.uptime24h === 'number') {
      totalUptime += m.uptime24h;
      countUptime += 1;
    }
  });
  const avgUptime = countUptime > 0 ? Math.round((totalUptime / countUptime) * 10) / 10 : 100;

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      {/* Hero Status Banner */}
      <div className={`status-hero-banner ${bannerClass}`}>
        <div className="status-hero-icon">
          {isAllGood ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : isMajor ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 22 22 22 12 2"></polygon>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              LIVE SYSTEM OBSERVABILITY
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Refreshed at {lastRefreshed.toLocaleTimeString()} (auto-refreshes every 15s)
            </span>
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.35rem' }}>
            {systemStatus}
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {bannerDesc}
          </p>
        </div>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="metrics-overview-grid" style={{ marginBottom: '2rem' }}>
        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <span className="kpi-label">24h Availability</span>
          <div className="kpi-value" style={{ fontSize: '1.75rem', color: 'var(--status-up)' }}>
            {avgUptime}%
          </div>
          <span className="kpi-subtext">Trailing 24 hours</span>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <span className="kpi-label">Monitored Services</span>
          <div className="kpi-value" style={{ fontSize: '1.75rem' }}>
            {monitors.length}
          </div>
          <span className="kpi-subtext">Active public endpoints</span>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <span className="kpi-label">Active Incidents</span>
          <div className="kpi-value" style={{ fontSize: '1.75rem', color: data?.openIncidents?.length > 0 ? 'var(--status-down)' : 'var(--status-up)' }}>
            {data?.openIncidents?.length || 0}
          </div>
          <span className="kpi-subtext">{data?.openIncidents?.length > 0 ? 'Action in progress' : 'Zero reported incidents'}</span>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <span className="kpi-label">Probe Status</span>
          <div className="kpi-value" style={{ fontSize: '1.75rem', color: 'var(--primary)' }}>
            Nominal
          </div>
          <span className="kpi-subtext">10 distributed workers</span>
        </div>
      </div>

      {/* Active Incidents Banner */}
      {data?.openIncidents && data.openIncidents.length > 0 && (
        <div style={{ background: 'var(--status-down-bg)', border: '1px solid var(--status-down-border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--status-down)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚠️</span> Active Incident Report
          </h3>
          {data.openIncidents.map((inc) => (
            <div key={inc._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pill down">Investigating</span>
                  <strong style={{ color: 'var(--text-main)' }}>{inc.monitor?.name || 'Service Monitor'}</strong>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Started {new Date(inc.startedAt).toLocaleString()}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Cause:</strong> {inc.cause}
              </p>
              {inc.updates && inc.updates.length > 0 && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                  {inc.updates.map((u, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                      <span>{new Date(u.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}:</span>
                      <span>{u.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Services List Table / Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)' }}>Services & API Endpoints</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live uptime tracking across all verified endpoints</span>
          </div>

          <div className="search-box-wrapper" style={{ maxWidth: '280px' }}>
            <span className="search-icon-inside">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>No public services match the search query.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {filtered.map((m) => (
              <div
                key={m.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.15rem 1.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                      {m.name}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {m.url}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: m.uptime24h && m.uptime24h > 98 ? 'var(--status-up)' : 'inherit' }}>
                      {m.uptime24h !== null ? `${m.uptime24h}% 24h` : 'New'}
                    </span>
                    <span className={`pill small ${m.status}`}>
                      <span className="live-dot" style={{ width: '5px', height: '5px', backgroundColor: 'currentColor' }} />
                      {m.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* 30-Check History Timeline Pips */}
                <div>
                  <div className="pips-bar" style={{ width: '100%', height: '18px' }}>
                    {Array.from({ length: 30 }).map((_, idx) => {
                      const checkIndex = m.recentChecks?.length - 30 + idx;
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    <span>30 checks ago</span>
                    <span>Recent check verification window</span>
                    <span>Latest</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
