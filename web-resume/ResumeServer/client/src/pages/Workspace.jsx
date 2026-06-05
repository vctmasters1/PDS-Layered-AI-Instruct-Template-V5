import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api-client.js';
import WorkflowPanel from '../components/WorkflowPanel.jsx';

export default function Workspace() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [error, setError] = useState('');

  const loadListing = useCallback(async () => {
    try {
      const data = await api.listings.get(listingId);
      setListing(data);
    } catch (err) {
      setError(err.message);
    }
  }, [listingId]);

  const loadPipeline = useCallback(async () => {
    try {
      const data = await api.workflow.status(listingId);
      setPipeline(data);
    } catch (err) {
      setError(err.message);
    }
  }, [listingId]);

  useEffect(() => {
    loadListing();
    loadPipeline();
  }, [loadListing, loadPipeline]);

  // Auto-refresh pipeline every 5s to pick up running jobs
  useEffect(() => {
    const id = setInterval(loadPipeline, 5000);
    return () => clearInterval(id);
  }, [loadPipeline]);

  if (error) return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="error-box">{error}</div>
      <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
    </div>
  );

  if (!listing) return (
    <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
      <span className="spinner" />
    </div>
  );

  return (
    <div className="container" style={{ padding: '32px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Dashboard</button>
      </div>

      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h1 className="page-title">{listing.title}</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{listing.folder_name}</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Workflow Pipeline</h2>
        <WorkflowPanel
          listingId={Number(listingId)}
          pipeline={pipeline}
          onRefresh={loadPipeline}
        />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Job Description</h2>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontSize: 13, color: 'var(--text-muted)',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {listing.content}
        </pre>
      </div>
    </div>
  );
}
