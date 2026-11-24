import { useState, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MonitorDetail from './pages/MonitorDetail.jsx';
import PublicStatus from './pages/PublicStatus.jsx';
import Team from './pages/Team.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ padding: '6rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="live-dot" style={{ width: '10px', height: '10px', marginBottom: '1rem' }} />
        <p style={{ fontSize: '0.9rem' }}>Connecting to ApiMon engine...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading, canAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout, canAdmin } = useAuth();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('apimon_theme');
    if (saved) return saved;
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('apimon_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name, email) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'AP';
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Link to="/" className="brand-logo">
            <div className="brand-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
            <span>ApiMon</span>
          </Link>
          <span className="brand-tag">Observability</span>
        </div>

        <nav className="nav-links">
          <Link
            to="/status"
            className={`nav-link ${location.pathname === '/status' ? 'active' : ''}`}
          >
            <span className="live-dot" />
            <span>Public Status</span>
          </Link>

          {!loading && user ? (
            <>
              <Link
                to="/"
                className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span>Dashboard</span>
              </Link>

              {canAdmin && (
                <Link
                  to="/team"
                  className={`nav-link ${location.pathname === '/team' ? 'active' : ''}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span>Team</span>
                </Link>
              )}

              <div className="nav-divider" />

              <div className="user-chip" title={user.email}>
                <div className="user-avatar">
                  {getInitials(user.name, user.email)}
                </div>
                <span className="user-chip-name">{user.name || user.email.split('@')[0]}</span>
                <span className={`role-badge role-${user.role}`}>{ROLE_LABEL[user.role]}</span>
              </div>

              <button
                onClick={handleLogout}
                className="btn-icon"
                title="Sign out of ApiMon"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </>
          ) : (
            !loading && (
              <Link to="/login" className="btn primary">
                Sign in
              </Link>
            )
          )}

          <div className="nav-divider" />

          <button
            onClick={toggleTheme}
            className="btn-icon"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            )}
          </button>
        </nav>
      </header>

      <main className="wrap">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/status" element={<PublicStatus />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/m/:id" element={<RequireAuth><MonitorDetail /></RequireAuth>} />
          <Route path="/team" element={<RequireAdmin><Team /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span className="live-dot" />
            <span>ApiMon High-Precision Probe Engine • 10 Concurrent Workers • Real-Time Latency Telemetry</span>
          </div>
          <div>
            <span>Automated Incident & Health Lifecycle</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
