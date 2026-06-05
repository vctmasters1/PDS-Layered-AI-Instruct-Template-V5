import { useState } from 'react';
import { api } from '../api-client.js';
import { useJobPoller } from '../hooks/useJobPoller.js';

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

/**
 * A single pipeline step row: label, status badge, artifact downloads, and a run/re-run button.
 */
export default function WorkflowStep({ listingId, step, label, info, onTriggered }) {
  const [triggering, setTriggering] = useState(false);
  const poller = useJobPoller(
    listingId,
    info?.status === 'running' || info?.status === 'pending' ? info.jobId : null
  );

  const effectiveStatus = poller
    ? (poller.status === 'done' || poller.status === 'error' ? poller.status : info?.status)
    : info?.status;

  const canTrigger = effectiveStatus === 'ready' || effectiveStatus === 'done' || effectiveStatus === 'error';

  const trigger = async () => {
    setTriggering(true);
    try {
      await api.workflow.trigger(listingId, step);
      onTriggered();
    } catch (err) {
      alert(err.message);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, minWidth: 90 }}>{label}</span>
        <StatusBadge status={effectiveStatus ?? 'locked'} />
        {effectiveStatus === 'running' && <span className="spinner" style={{ marginLeft: 4 }} />}
        {info?.error && (
          <span style={{ fontSize: 12, color: 'var(--danger)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {info.error}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {info?.artifacts?.map((f) => (
          <a key={f}
             href={api.files.url(listingId, f)}
             className="btn btn-ghost btn-sm"
             download
             onClick={(e) => e.stopPropagation()}
          >
            ↓ {f}
          </a>
        ))}
        {canTrigger && (
          <button className="btn btn-primary btn-sm" onClick={trigger} disabled={triggering}>
            {triggering ? '…' : effectiveStatus === 'done' ? 'Re-run' : 'Run'}
          </button>
        )}
      </div>
    </div>
  );
}
