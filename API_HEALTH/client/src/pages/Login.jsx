import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };

      const data = await api(`/auth/${mode}`, { method: 'POST', body: payload });
      setToken(data.token);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 200px)', padding: '2rem 1rem' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-xl)',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--primary-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.35rem' }}>
            {mode === 'login' ? 'Sign in to ApiMon' : 'Create an Account'}
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {mode === 'login'
              ? 'Access real-time API uptime, latency & health telemetry'
              : 'Sign up to monitor APIs and collaborate with your team'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            padding: '0.2rem',
            marginBottom: '1.5rem',
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            className="btn ghost"
            style={{
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem',
              fontWeight: 600,
              padding: '0.4rem',
              background: mode === 'login' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: mode === 'login' ? 'var(--text-main)' : 'var(--text-muted)',
              border: mode === 'login' ? '1px solid var(--border)' : '1px solid transparent',
            }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem',
              fontWeight: 600,
              padding: '0.4rem',
              background: mode === 'register' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: mode === 'register' ? 'var(--text-main)' : 'var(--text-muted)',
              border: mode === 'register' ? '1px solid var(--border)' : '1px solid transparent',
            }}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Register
          </button>
        </div>

        {error && <div className="toast err">{error}</div>}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                placeholder="Nilesh Patil"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label>Work Email</label>
            <input
              type="email"
              placeholder="admin@example.com"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input-wrapper">
              <input
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                minLength={6}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn primary"
            style={{ width: '100%', padding: '0.65rem', marginTop: '0.5rem', fontSize: '0.9rem' }}
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Enterprise Session • JWT Authentication
          </p>
        </div>
      </div>
    </div>
  );
}
