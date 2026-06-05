import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_ORDER = ['analyze', 'draft-000', 'score-000', 'draft-001', 'score-001', 'build'];
const STEP_LABELS = {
  'analyze':   'Analyze',
  'draft-000': 'Draft v0',
  'score-000': 'Score v0',
  'draft-001': 'Draft v1',
  'score-001': 'Score v1',
  'build':     'Build',
};

function fitColor(score) {
  if (score >= 80) return { bg: '#14532d', color: '#86efac' };
  if (score >= 65) return { bg: '#164e63', color: '#67e8f9' };
  if (score >= 50) return { bg: '#713f12', color: '#fde68a' };
  return { bg: '#450a0a', color: '#fca5a5' };
}

function FitBadge({ score }) {
  if (score == null) return null;
  const { bg, color } = fitColor(score);
  return (
    <span style={{
      background: bg, color, borderRadius: 6, padding: '2px 9px',
      fontSize: 12, fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em',
    }} title="ATS fit score (v2026 Final from score-001)">
      {score}% fit
    </span>
  );
}

function overallStatus(pipeline) {
  if (!pipeline) return null;
  const statuses = STEP_ORDER.map((s) => pipeline[s]?.status ?? 'locked');
  if (statuses.some((s) => s === 'running')) return 'running';
  if (statuses.some((s) => s === 'pending')) return 'pending';
  if (statuses.some((s) => s === 'error'))   return 'error';
  if (statuses.every((s) => s === 'done'))   return 'done';
  if (statuses.some((s) => s === 'done'))    return 'in-progress';
  return 'ready';
}

async function fetchAuthed(url, asText = true) {
  const token = localStorage.getItem('rs_token');
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asText ? res.text() : res.blob();
}

// ─── File Modal ───────────────────────────────────────────────────────────────

function FileModal({ listingId, filename, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const fileUrl = api.files.url(listingId, filename);
  const isText = /\.(md|txt|json)$/i.test(filename);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAuthed(fileUrl, isText)
      .then((result) => { if (!cancelled) setContent(result); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fileUrl, isText]);

  const handleDownload = async () => {
    try {
      const blob = await fetchAuthed(fileUrl, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert('Download failed: ' + e.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box file-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 15 }}>{filename}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="file-modal-body">
          {loading && <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>}
          {err && <div style={{ color: 'var(--danger)', padding: 16 }}>Error: {err}</div>}
          {!loading && !err && isText && <pre className="file-modal-pre">{content}</pre>}
          {!loading && !err && !isText && (
            <p style={{ color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
              Binary file — click Download to save.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          <button className="btn btn-primary btn-sm" onClick={handleDownload}>↓ Download</button>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Section ─────────────────────────────────────────────────────────

function PipelineSection({ listingId, pipeline, onRefresh }) {
  const [running, setRunning] = useState(false);
  const [fileModal, setFileModal] = useState(null);
  const status = overallStatus(pipeline);
  const isActive = status === 'running' || status === 'pending';

  const handleRunAll = async () => {
    setRunning(true);
    try {
      await api.workflow.runAll(listingId);
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="expand-section">
      <div className="expand-section-header">
        <span>Pipeline</span>
        <button className="btn btn-primary btn-sm" onClick={handleRunAll} disabled={running || isActive}>
          {(running || isActive)
            ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Running…</>
            : '▶ Run Workflow'}
        </button>
      </div>
      <div className="pipeline-steps">
        {STEP_ORDER.map((step) => {
          const info = pipeline?.[step];
          const st = info?.status ?? 'locked';
          return (
            <div key={step} className="pipeline-step-row">
              <div className="pipeline-step-left">
                <span className="pipeline-step-label">{STEP_LABELS[step]}</span>
                <span className={`badge badge-${st}`}>{st}</span>
                {(st === 'running' || st === 'pending') && (
                  <span className="spinner" style={{ width: 12, height: 12, marginLeft: 4 }} />
                )}
                {info?.error && (
                  <span className="pipeline-step-error" title={info.error}>
                    ⚠ {info.error.slice(0, 80)}
                  </span>
                )}
              </div>
              {(info?.artifacts ?? []).length > 0 && (
                <div className="pipeline-step-files">
                  {info.artifacts.map((f) => (
                    <button
                      key={f}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => setFileModal({ filename: f })}
                    >
                      📄 {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {fileModal && (
        <FileModal listingId={listingId} filename={fileModal.filename} onClose={() => setFileModal(null)} />
      )}
    </div>
  );
}

// ─── Job Description Section ──────────────────────────────────────────────────

function JobDescSection({ listingId }) {
  const [content, setContent] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.listings.get(listingId).then((d) => setContent(d.content)).catch(() => {});
  }, [listingId]);

  return (
    <div className="expand-section">
      <div className="expand-section-header">
        <span>Job Description</span>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {content === null
        ? <div style={{ padding: '12px 0', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        : <pre className="jd-pre" style={{ maxHeight: expanded ? 'none' : 160 }}>{content}</pre>
      }
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export default function ListingCard({ listing, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [pipeline, setPipeline] = useState(null);
  const pollRef = useRef(null);

  const loadPipeline = useCallback(async () => {
    try {
      const data = await api.workflow.status(listing.id);
      setPipeline(data);
    } catch { /* ignore */ }
  }, [listing.id]);

  useEffect(() => {
    if (!expanded) { clearInterval(pollRef.current); return; }
    loadPipeline();
    return () => clearInterval(pollRef.current);
  }, [expanded, loadPipeline]);

  // Keep polling while active steps exist
  useEffect(() => {
    if (!expanded) return;
    clearInterval(pollRef.current);
    const status = overallStatus(pipeline);
    if (status === 'running' || status === 'pending' || pipeline === null) {
      pollRef.current = setInterval(loadPipeline, 4000);
    }
    return () => clearInterval(pollRef.current);
  }, [pipeline, expanded, loadPipeline]);

  const status = overallStatus(pipeline);

  return (
    <div className={`listing-card${expanded ? ' listing-card-open' : ''}`}>
      <div className="listing-card-header" onClick={() => setExpanded((x) => !x)}>
        <span className="listing-card-chevron">{expanded ? '▾' : '▸'}</span>
        <div className="listing-card-title-group">
          <span className="listing-card-title">{listing.title}</span>
          <span className="listing-card-folder">
            {listing.folder_name}
            {listing.source_url && (
              <a
                href={listing.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="listing-source-link"
                onClick={(e) => e.stopPropagation()}
                title="Open original listing"
              > ↗ source</a>
            )}
          </span>
        </div>
        <FitBadge score={listing.fit_score} />
        {status && (
          <span className={`badge badge-${status}`} style={{ flexShrink: 0 }}>
            {status === 'in-progress' ? 'in progress' : status}
          </span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--danger)', flexShrink: 0, marginLeft: 4 }}
          onClick={(e) => { e.stopPropagation(); onDelete(listing); }}
          title="Delete listing"
        >✕</button>
      </div>
      {expanded && (
        <div className="listing-card-body">
          <PipelineSection listingId={listing.id} pipeline={pipeline} onRefresh={loadPipeline} />
          <JobDescSection listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

