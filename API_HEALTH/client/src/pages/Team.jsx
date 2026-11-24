import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ROLE_LABEL, useAuth } from '../auth.jsx';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'user' };

export default function Team() {
  const { user: me, isController } = useAuth();

  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);

  const load = () =>
    api('/users')
      .then((d) => setUsers(d.users || []))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 3500);
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        },
      });
      setForm(EMPTY_FORM);
      setShowAddPanel(false);
      flash(`Access credentials generated for ${form.email}`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (user, role) => {
    setError('');
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}/role`, { method: 'PATCH', body: { role } });
      flash(`${user.email} permissions updated to ${ROLE_LABEL[role]}`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user) => {
    setError('');
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}/status`, {
        method: 'PATCH',
        body: { isActive: !user.isActive },
      });
      flash(`${user.email} access ${user.isActive ? 'disabled' : 'enabled'}`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Permanently revoke access and remove account for ${user.email}?`)) return;
    setError('');
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' });
      flash(`Account removed: ${user.email}`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (user) => {
    setError('');
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}/password`, {
        method: 'PATCH',
        body: { password: newPassword },
      });
      flash(`Password reset successfully for ${user.email}`);
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const getInitials = (name, email) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'U';
  };

  const controllersCount = users.filter((u) => u.role === 'controller').length;
  const adminsCount = users.filter((u) => u.role === 'admin').length;
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <>
      {error && <div className="toast err">{error}</div>}
      {notice && <div className="toast success">{notice}</div>}

      {/* KPI Overview Strip */}
      <div className="metrics-overview-grid">
        <div className="kpi-card kpi-primary">
          <span className="kpi-label">Total Logins</span>
          <div className="kpi-value">{users.length}</div>
          <span className="kpi-subtext">{activeCount} active accounts</span>
        </div>

        <div className="kpi-card" style={{ borderLeft: '3px solid #6366f1' }}>
          <span className="kpi-label">Controller</span>
          <div className="kpi-value" style={{ color: '#6366f1' }}>{controllersCount}</div>
          <span className="kpi-subtext">Root account owner</span>
        </div>

        <div className="kpi-card" style={{ borderLeft: '3px solid #2563eb' }}>
          <span className="kpi-label">Administrators</span>
          <div className="kpi-value" style={{ color: '#2563eb' }}>{adminsCount}</div>
          <span className="kpi-subtext">Team managers</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Members</span>
          <div className="kpi-value">{users.length - adminsCount - controllersCount}</div>
          <span className="kpi-subtext">Standard monitoring access</span>
        </div>
      </div>

      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Team Members ({users.length})</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isController ? 'You can invite members and promote admins.' : 'Admins can invite new members and reset passwords.'}
          </span>
        </div>

        <button
          onClick={() => setShowAddPanel(!showAddPanel)}
          className="btn primary"
        >
          {showAddPanel ? 'Cancel' : '+ Add Member'}
        </button>
      </div>

      {/* Add Member Form */}
      {showAddPanel && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem', animation: 'fadeIn 0.15s ease' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Provision New Team Login
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Enter details to generate an access account for a colleague.
          </p>

          <form onSubmit={create}>
            <div className="form-row">
              <div className="form-group flex-1">
                <label>Full Name</label>
                <input
                  placeholder="e.g. Jane Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="form-group flex-1">
                <label>Work Email</label>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="form-group flex-1">
                <label>Temporary Password</label>
                <input
                  type="text"
                  placeholder="min 6 characters"
                  minLength={6}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="form-group flex-1">
                <label>Role</label>
                <select
                  value={form.role}
                  disabled={!isController}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="user">Member</option>
                  {isController && <option value="admin">Admin</option>}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowAddPanel(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn primary"
              >
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roster Table */}
      <div className="table-panel">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role Tier</th>
                <th>Account Status</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === me?.id;
                const isControllerRow = u.role === 'controller';

                return (
                  <tr key={u.id} className="table-row-hover">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isControllerRow
                              ? '#4f46e5'
                              : u.role === 'admin'
                              ? '#2563eb'
                              : 'var(--text-secondary)',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getInitials(u.name, u.email)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span>{u.name || u.email.split('@')[0]}</span>
                            {isMe && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--status-up)', fontWeight: 600 }}>
                                (you)
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      {isController && !isControllerRow ? (
                        <select
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) => changeRole(u, e.target.value)}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                        >
                          <option value="user">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`role-badge role-${u.role}`}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      )}
                    </td>

                    <td>
                      <span className={`pill small ${u.isActive ? 'up' : 'paused'}`}>
                        <span className="live-dot" style={{ width: '5px', height: '5px', backgroundColor: 'currentColor' }} />
                        {u.isActive ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>

                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {resetFor === u.id ? (
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="New password"
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            style={{ width: '130px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                          />
                          <button
                            className="btn primary"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                            disabled={busyId === u.id || newPassword.length < 6}
                            onClick={() => resetPassword(u)}
                          >
                            Save
                          </button>
                          <button
                            className="btn ghost"
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => { setResetFor(null); setNewPassword(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            className="btn ghost"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => { setResetFor(u.id); setNewPassword(''); }}
                          >
                            Reset Password
                          </button>

                          {!isControllerRow && !isMe && (
                            <>
                              <button
                                className={`btn ${u.isActive ? 'ghost' : 'secondary'}`}
                                style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                                disabled={busyId === u.id}
                                onClick={() => toggleActive(u)}
                              >
                                {u.isActive ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                className="btn-icon danger-icon"
                                title="Delete User"
                                disabled={busyId === u.id}
                                onClick={() => removeUser(u)}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
