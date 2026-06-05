import { useState, useEffect } from 'react';

/**
 * Inline file editor — expands below a file row to show an editable textarea.
 *
 * Props:
 *   filename  — display name shown in the editor header
 *   onFetch   — async () => string  — called once on mount to load content
 *   onSave    — async (content: string) => void  — called when user clicks Save
 *   onClose   — () => void  — called when editor is dismissed
 */
export default function FileEditor({ filename, onFetch, onSave, onClose }) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    onFetch()
      .then((text) => {
        if (cancelled) return;
        setContent(text ?? '');
        setOriginal(text ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []); // intentionally runs only on mount

  const dirty = content !== original;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(content);
      setOriginal(content);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  };

  return (
    <div style={{
      border: '1px solid var(--primary, #2563eb)',
      borderRadius: 6,
      background: 'var(--surface)',
      padding: '14px 16px',
      marginTop: 4,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
          {filename}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ fontSize: 12 }}>
          ✕ Close
        </button>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 10, fontSize: 13 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <span className="spinner" />
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 280,
              fontFamily: '"Fira Mono", "Consolas", "Menlo", monospace',
              fontSize: 13,
              lineHeight: 1.6,
              resize: 'vertical',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '10px 12px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
            {dirty && (
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Unsaved changes</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
