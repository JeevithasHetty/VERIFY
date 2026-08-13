const METRICS = [
  { key: 'imageQuality', label: 'IMAGE QUALITY' },
  { key: 'ocr', label: 'OCR CONFIDENCE' },
  { key: 'uniqueness', label: 'UNIQUENESS' },
  { key: 'authenticity', label: 'AUTHENTICITY' },
  { key: 'vehicleEvidence', label: 'VEHICLE EVIDENCE' },
];

export default function MetricCards({ scores }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {METRICS.map((m, i) => (
        <div
          key={m.key}
          className="animate-slideUp rounded-xl border border-fv-border bg-fv-white p-4 text-center shadow-sm"
          style={{ animationDelay: `${150 + i * 90}ms` }}
        >
          <p className="font-display text-2xl font-semibold text-fv-text">{scores[m.key] ?? '—'}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-fv-muted">{m.label}</p>
        </div>
      ))}
    </div>
  );
}
