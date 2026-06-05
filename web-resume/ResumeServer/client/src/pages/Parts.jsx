import { useState, useEffect } from 'react';
import { api } from '../api-client.js';
import UploadZone from '../components/UploadZone.jsx';
import FileEditor from '../components/FileEditor.jsx';

export default function Parts() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingFile, setEditingFile] = useState(null);

  const load = async () => {
    try {
      const data = await api.parts.list();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (file) => {
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2 MB.'); return; }
    setUploading(true);
    try {
      await api.parts.upload(file);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await api.parts.delete(filename);
      setFiles((prev) => prev.filter((f) => f !== filename));
      if (editingFile === filename) setEditingFile(null);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="container" style={{ padding: '32px 20px' }}>
      <div className="page-header">
        <h1 className="page-title">Resume Parts</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Parts are the building blocks used by the AI to generate your resume. Upload <code>.md</code> files
        for each section, or generate them automatically from your source documents on the{' '}
        <a href="/sources" style={{ color: 'var(--primary, #2563eb)' }}>Sources page</a>.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div style={{ marginBottom: 24 }}>
        <UploadZone onFile={handleFile} accept=".md,.txt" multiple />
        {uploading && <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 13 }}>Uploading…</div>}
      </div>

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : files.length === 0 ? (
        <div className="empty-state">No Parts uploaded yet.</div>
      ) : (
        <div className="card">
          {files.map((f, i) => (
            <div key={f}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: editingFile !== f && i < files.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>{f}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingFile(editingFile === f ? null : f)}
                  >
                    {editingFile === f ? 'Close' : 'Edit'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(f)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editingFile === f && (
                <FileEditor
                  filename={f}
                  onFetch={() => api.parts.getContent(f)}
                  onSave={(content) => api.parts.updateContent(f, content)}
                  onClose={() => setEditingFile(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
