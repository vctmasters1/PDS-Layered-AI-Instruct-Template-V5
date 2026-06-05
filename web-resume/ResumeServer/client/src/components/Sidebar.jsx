import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api-client.js';
import { useAuth } from '../hooks/useAuth.jsx';

const MIN_WIDTH = 150;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 220;

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [parts, setParts] = useState([]);
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved ? Number(saved) : DEFAULT_WIDTH;
  });
  const dragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!dragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setWidth(newWidth);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth((w) => { localStorage.setItem('sidebar-width', w); return w; });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // Re-fetch whenever the user navigates so data stays fresh
  useEffect(() => {
    if (!user) return;
    api.listings.list().then(setListings).catch(() => {});
    api.parts.list().then(setParts).catch(() => {});
  }, [user, location.pathname]);

  const handleDelete = async (e, listing) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${listing.title}"? This removes all artifacts.`)) return;
    try {
      await api.listings.delete(listing.id);
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      // If we're on this listing's workspace, go back to dashboard
      if (location.pathname === `/workspace/${listing.id}`) navigate('/');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleProcess = async (e, listing) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.workflow.runAll(listing.id);
    } catch (err) {
      alert(err.message);
    }
    navigate(`/workspace/${listing.id}`);
  };

  if (!user) return null;

  return (
    <aside className="sidebar" style={{ width }}>

      {/* ─── Job Listings ─────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Job Listings</span>
          <button className="sidebar-action-btn" title="New listing" onClick={() => navigate('/')}>+</button>
        </div>
        {listings.length === 0 ? (
          <div className="sidebar-empty">No listings yet</div>
        ) : (
          listings.map((l) => {
            const hasPdf      = l.artifacts?.some((f) => f.endsWith('.pdf'));
            const hasDocx     = l.artifacts?.some((f) => f.endsWith('.docx'));
            const hasAnalysis = l.artifacts?.includes('analysis.md');
            const pdfFile     = l.artifacts?.find((f) => f.endsWith('.pdf'));
            const docxFile    = l.artifacts?.find((f) => f.endsWith('.docx'));
            const hasAny      = hasPdf || hasDocx || hasAnalysis;

            return (
              <div key={l.id} className={`sidebar-listing-card${location.pathname === `/workspace/${l.id}` ? ' active' : ''}`}>

                {/* Title row */}
                <div className="slc-title-row">
                  <span
                    className="slc-title"
                    onClick={() => navigate(`/workspace/${l.id}`)}
                    title={l.title}
                  >{l.title}</span>
                  <div className="slc-actions">
                    <button
                      className="slc-btn slc-process"
                      title={hasAny ? 'Reprocess' : 'Process'}
                      onClick={(e) => handleProcess(e, l)}
                    >{hasAny ? '⟳' : '▶'}</button>
                    <button
                      className="slc-btn slc-delete"
                      title="Delete listing"
                      onClick={(e) => handleDelete(e, l)}
                    >✕</button>
                  </div>
                </div>

                {/* Source URL */}
                {l.source_url && (
                  <a
                    className="slc-source"
                    href={l.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.source_url}
                    onClick={(e) => e.stopPropagation()}
                  >⬡ Original posting</a>
                )}

                {/* Artifact links */}
                {(hasAnalysis || hasPdf || hasDocx) && (
                  <div className="slc-files">
                    {hasAnalysis && (
                      <a className="slc-file-link" href={api.files.url(l.id, 'analysis.md')} download title="Download analysis">
                        📋 analysis.md
                      </a>
                    )}
                    {hasDocx && (
                      <a className="slc-file-link" href={api.files.url(l.id, docxFile)} download title="Download DOCX resume">
                        📄 {docxFile}
                      </a>
                    )}
                    {hasPdf && (
                      <a className="slc-file-link" href={api.files.url(l.id, pdfFile)} download title="Download PDF resume">
                        📑 {pdfFile}
                      </a>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-divider" />

      {/* ─── Parts / Files ────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Parts</span>
          <NavLink to="/parts" className="sidebar-action-btn" title="Manage parts">↗</NavLink>
        </div>
        {parts.length === 0 ? (
          <div className="sidebar-empty">No parts uploaded</div>
        ) : (
          parts.map((f) => (
            <div key={f} className="sidebar-item sidebar-file" title={f}>
              <span className="sidebar-file-icon">📄</span>
              {f}
            </div>
          ))
        )}
      </div>

      <div className="sidebar-resize-handle" onMouseDown={onMouseDown} />
    </aside>
  );
}
