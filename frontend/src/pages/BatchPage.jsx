import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { uploadBatch, getStatus, getResults } from '../services/api.js';

const POLL_MS = 1500;

function RecommendationBadge({ recommendation }) {
  if (!recommendation) return <span className="text-fv-muted">—</span>;
  const styles = {
    ACCEPT: 'bg-green-100 text-green-700',
    REVIEW: 'bg-orange-100 text-fv-orange',
    REJECT: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[recommendation]}`}>
      {recommendation}
    </span>
  );
}

function BatchSummary({ items }) {
  const completed = items.filter((it) => it.status === 'completed');
  const counts = {
    total: items.length,
    accepted: completed.filter((it) => it.recommendation === 'ACCEPT').length,
    review: completed.filter((it) => it.recommendation === 'REVIEW').length,
    rejected: completed.filter((it) => it.recommendation === 'REJECT').length,
  };

  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      {[
        { label: 'Total', value: counts.total, color: 'text-fv-text' },
        { label: 'Accepted', value: counts.accepted, color: 'text-green-600' },
        { label: 'Review', value: counts.review, color: 'text-fv-orange' },
        { label: 'Rejected', value: counts.rejected, color: 'text-red-600' },
      ].map((s) => (
        <div key={s.label} className="rounded-xl border border-fv-border bg-fv-white p-4 text-center">
          <p className={`font-display text-2xl font-semibold ${s.color}`}>{s.value}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-fv-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function BatchPage() {
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]); // { processingId, fileName, status, score, recommendation }
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const pollingRef = useRef(new Set());

  const handleSelect = useCallback((selected) => {
    const list = Array.from(selected || []).slice(0, 10);
    setFiles(list);
  }, []);

  const pollItem = (processingId, fileName) => {
    if (pollingRef.current.has(processingId)) return;
    pollingRef.current.add(processingId);

    const tick = async () => {
      try {
        const s = await getStatus(processingId);
        setItems((prev) =>
          prev.map((it) => (it.processingId === processingId ? { ...it, status: s.status } : it))
        );

        if (s.status === 'completed') {
          const results = await getResults(processingId);
          setItems((prev) =>
            prev.map((it) =>
              it.processingId === processingId
                ? {
                    ...it,
                    score: results.scores.overall,
                    recommendation: results.recommendation,
                    duplicate: results.duplicate,
                  }
                : it
            )
          );
          return;
        }
        if (s.status === 'failed') return;
        setTimeout(tick, POLL_MS);
      } catch {
        setTimeout(tick, POLL_MS);
      }
    };
    tick();
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setSubmitting(true);
    try {
      const data = await uploadBatch(files);
      const newItems = data.images.map((img, i) => ({
        processingId: img.processingId,
        fileName: files[i]?.name || img.processingId,
        status: img.status,
        score: null,
        recommendation: null,
      }));
      setItems(newItems);
      newItems.forEach((it) => pollItem(it.processingId, it.fileName));
      setFiles([]);
    } catch (err) {
      // surfaced inline
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Verify multiple field images</h1>
        <p className="mt-2 text-fv-muted">Upload up to 10 images to verify them together.</p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        className="mt-8 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-fv-border bg-fv-white p-10 text-center transition-colors hover:border-fv-orange-2"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <UploadCloud size={26} className="mb-3 text-fv-orange" />
        <p className="font-medium">{files.length > 0 ? `${files.length} file(s) selected` : 'Select up to 10 images'}</p>
        <p className="mt-1 text-xs text-fv-muted">JPEG / PNG / WEBP · Up to 10 MB each</p>
      </div>

      {files.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-full bg-fv-orange py-3 text-sm font-semibold text-white shadow-sm shadow-orange-200 transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
        >
          {submitting ? 'Uploading…' : `Verify ${files.length} image(s)`}
        </button>
      )}

      {items.length > 0 && (
        <div className="mt-10">
          <BatchSummary items={items} />
          <div className="overflow-hidden rounded-xl border border-fv-border bg-fv-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-fv-bg text-xs uppercase tracking-wide text-fv-muted">
                <tr>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Integrity</th>
                  <th className="px-4 py-3">Recommendation</th>
                  <th className="px-4 py-3">Duplicate</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.processingId} className="border-t border-fv-border">
                    <td className="px-4 py-3 font-medium">{it.fileName}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        {it.status === 'completed' && <CheckCircle2 size={14} className="text-green-600" />}
                        {it.status === 'processing' && <Loader2 size={14} className="animate-spin text-fv-orange" />}
                        {it.status === 'failed' && <AlertTriangle size={14} className="text-red-600" />}
                        {it.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{it.score ?? '—'}</td>
                    <td className="px-4 py-3">
                      <RecommendationBadge recommendation={it.recommendation} />
                    </td>
                    <td className="px-4 py-3 text-xs text-fv-muted">
                      {it.duplicate?.duplicateDetected
                        ? `${it.duplicate.duplicateType} (${it.duplicate.duplicateScope === 'same_batch' ? 'this batch' : 'earlier upload'})`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
