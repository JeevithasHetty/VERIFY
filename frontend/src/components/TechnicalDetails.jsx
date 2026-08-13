import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-fv-border py-2 text-sm last:border-0">
      <span className="text-fv-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function TechnicalDetails({ processingId, status, metrics }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-fv-border bg-fv-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-base font-semibold">Technical details</span>
        <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-slideUp border-t border-fv-border px-5 py-4">
          <Row label="Processing ID" value={processingId} />
          <Row label="Status" value={status?.status} />
          <Row label="Attempts" value={status?.attempts} />
          <Row label="Queue wait" value={metrics?.queueWaitMs != null ? `${metrics.queueWaitMs} ms` : '—'} />
          <Row
            label="Processing duration"
            value={metrics?.totalProcessingMs != null ? `${metrics.totalProcessingMs} ms` : '—'}
          />
          <Row label="OCR duration" value={metrics?.ocrDurationMs != null ? `${metrics.ocrDurationMs} ms` : '—'} />
        </div>
      )}
    </div>
  );
}
