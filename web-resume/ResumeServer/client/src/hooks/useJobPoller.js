import { useState, useEffect, useRef } from 'react';
import { api } from '../api-client.js';

const POLL_MS = 3000;

/**
 * Poll a job until it reaches a terminal state (done / error).
 * Returns the latest job status object.
 */
export function useJobPoller(listingId, jobId) {
  const [status, setStatus] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!jobId || !listingId) return;

    let cancelled = false;

    async function poll() {
      try {
        const data = await api.workflow.jobStatus(listingId, jobId);
        if (cancelled) return;
        setStatus(data);
        if (data.status !== 'done' && data.status !== 'error') {
          timer.current = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [listingId, jobId]);

  return status;
}
