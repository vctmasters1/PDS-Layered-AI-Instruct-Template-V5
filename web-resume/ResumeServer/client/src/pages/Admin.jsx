import { useState, useEffect } from 'react';
import { api } from '../api-client.js';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({ username: '', password: '', fullName: '', role: 'user' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // AI settings state
  const [llm, setLlm] = useState({ apiUrl: '', apiKey: '', model: '' });
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmError, setLlmError] = useState('');
  const [llmSaved, setLlmSaved] = useState(false);

  const load = async () => {
    try {
      const data = await api.admin.users();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLlm = async () => {
    try {
      const data = await api.admin.getLlmSettings();
      setLlm(data);
    } catch (err) {
      setLlmError(err.message);
    } finally {
      setLlmLoading(false);
    }
  };

  useEffect(() => { load(); loadLlm(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.admin.createUser(createForm.username, createForm.password, createForm.fullName, createForm.role);
      setCreateForm({ username: '', password: '', fullName: '', role: 'user' });
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleRole = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${user.username} to ${newRole}?`)) return;
    try {
      await api.admin.setRole(user.id, newRole);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleResumeAccess = async (user) => {
    const newAccess = !user.resume_access;
    const label = newAccess ? 'grant' : 'revoke';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} resume access for ${user.username}?`)) return;
    try {
      await api.admin.setResumeAccess(user.id, newAccess);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, resume_access: newAccess } : u));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveLlm = async (e) => {
    e.preventDefault();
    setLlmError('');
    setLlmSaved(false);
    setLlmSaving(true);
    try {
      await api.admin.saveLlmSettings(llm);
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 3000);
    } catch (err) {
      setLlmError(err.message);
    } finally {
      setLlmSaving(false);
    }
  };

  return (
    <div className="container" style={{ padding: '32px 20px' }}>
      <div className="page-header">
        <h1 className="page-title">Admin — Users</h1>
        <a
          href={api.extension.downloadUrl()}
          className="btn btn-ghost"
          download="resume-suite-extension.zip"
        >
          ↓ Download Extension
        </a>
      </div>

      {/* ── Create User ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Create Account</h2>
        {createError && <div className="error-box" style={{ marginBottom: 12 }}>{createError}</div>}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: '1 1 140px' }}>
            <label className="form-label">Full Name</label>
            <input className="form-input" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} required />
          </div>
          <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
            <label className="form-label">Username</label>
            <input className="form-input" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required pattern="[a-zA-Z0-9_\-]{3,30}" title="3-30 alphanumeric characters" />
          </div>
          <div className="form-group" style={{ margin: 0, flex: '1 1 130px' }}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={8} />
          </div>
          <div className="form-group" style={{ margin: 0, flex: '0 0 90px' }}>
            <label className="form-label">Role</label>
            <select className="form-input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={creating} style={{ marginBottom: 1 }}>
            {creating ? <span className="spinner" /> : 'Create'}
          </button>
        </form>
      </div>

      {/* ── User List ───────────────────────────────────────────────────── */}
      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : (
        <div className="card" style={{ marginBottom: 32 }}>
          {users.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{u.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{u.full_name} · joined {new Date(u.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge badge-${u.resume_access || u.role === 'admin' ? 'ready' : 'locked'}`}>
                  {u.resume_access || u.role === 'admin' ? 'access granted' : 'no access'}
                </span>
                {u.role !== 'admin' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleResumeAccess(u)}>
                    {u.resume_access ? 'Revoke Access' : 'Grant Access'}
                  </button>
                )}
                <span className={`badge badge-${u.role === 'admin' ? 'ready' : 'locked'}`}>{u.role}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleRole(u)}>
                  {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Settings ─────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>AI Settings</h2>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          Override the AI endpoint at runtime — no server restart required. Leave fields blank to use the server's environment defaults.
          The API key is write-only — if a key is already saved, it will show as <code>***</code>.
        </p>
        {llmError && <div className="error-box" style={{ marginBottom: 12 }}>{llmError}</div>}
        {llmSaved && <div className="success-box" style={{ marginBottom: 12 }}>Settings saved.</div>}
        {llmLoading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : (
          <form onSubmit={handleSaveLlm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">API Base URL</label>
              <input
                className="form-input"
                placeholder="e.g. http://localhost:1234 or https://api.openai.com"
                value={llm.apiUrl}
                onChange={(e) => setLlm({ ...llm, apiUrl: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">API Key <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(leave blank to keep existing)</span></label>
              <input
                className="form-input"
                type="password"
                placeholder={llm.apiKey === '***' ? '(key saved — enter a new one to replace)' : 'sk-...'}
                value={llm.apiKey === '***' ? '' : llm.apiKey}
                onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Model</label>
              <input
                className="form-input"
                placeholder="e.g. gpt-4o or qwen/qwen3-35b"
                value={llm.model}
                onChange={(e) => setLlm({ ...llm, model: e.target.value })}
              />
            </div>
            <div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={llmSaving}>
                {llmSaving ? <span className="spinner" /> : 'Save AI Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
