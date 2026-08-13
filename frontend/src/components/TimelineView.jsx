const STAGE_LABELS = {
  worker_started: 'Worker started',
  quality_analysis_started: 'Image quality analysis started',
  quality_analysis_completed: 'Image quality checked',
  ocr_started: 'Text extraction started',
  ocr_completed: 'OCR completed',
  duplicate_check_started: 'Duplicate check started',
  duplicate_check_completed: 'Duplicate check completed',
  integrity_analysis_started: 'Integrity analysis started',
  integrity_analysis_completed: 'Integrity analysis completed',
  ai_review_started: 'AI review started',
  ai_review_completed: 'AI review completed',
  result_generated: 'Result generated',
  completed: 'Verification completed',
};

export default function TimelineView({ timeline }) {
  if (!timeline?.length) return null;

  return (
    <div>
      <h3 className="mb-4 font-display text-lg font-semibold">Verification timeline</h3>
      <ol className="space-y-4 border-l border-fv-border pl-5">
        {timeline.map((event, i) => (
          <li key={`${event.stage}-${i}`} className="relative animate-slideUp" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-fv-orange" />
            <p className="font-mono text-xs text-fv-muted">
              {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
            </p>
            <p className="text-sm font-medium">{STAGE_LABELS[event.stage] || event.stage}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
