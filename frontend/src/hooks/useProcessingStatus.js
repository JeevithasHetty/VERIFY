import { useEffect, useRef, useState } from 'react';
import { getStatus } from '../services/api.js';

/**
 * Polls the status endpoint every `intervalMs` until the job reaches
 * a terminal state (completed/failed), or polling is stopped.
 */
export function useProcessingStatus(processingId, { intervalMs = 1200 } = {}) {
  const [status, setStatus] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    if (!processingId) return undefined;
    startRef.current = Date.now();

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getStatus(processingId);
        if (cancelled) return;
        setStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          return;
        }
        timerRef.current = setTimeout(tick, intervalMs);
      } catch (err) {
        if (!cancelled) {
          setStatus({ status: 'failed', error: { message: err.message } });
        }
      }
    };

    tick();

    const elapsedTimer = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      clearInterval(elapsedTimer);
    };
  }, [processingId, intervalMs]);

  return { status, elapsedMs };
}

export default useProcessingStatus;
