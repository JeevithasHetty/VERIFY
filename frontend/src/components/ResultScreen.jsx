import ScoreRing from './ScoreRing.jsx';
import MetricCards from './MetricCards.jsx';
import FindingsList from './FindingsList.jsx';
import TimelineView from './TimelineView.jsx';
import TechnicalDetails from './TechnicalDetails.jsx';
import IssuesFound from './IssuesFound.jsx';
import RegistrationDetails from './RegistrationDetails.jsx';

export default function ResultScreen({ processingId, preview, result, status }) {
  const isReview = result.recommendation === 'REVIEW';

  return (
    <div className="mx-auto max-w-5xl animate-fadeIn space-y-10">
      {/* 1. Verification Summary / 2. Score / 3. Recommendation */}
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-fv-orange">{processingId}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Verification complete</h2>
      </div>

      <ScoreRing score={result.scores.overall} riskLevel={result.riskLevel} recommendation={result.recommendation} />

      <MetricCards scores={result.scores} />

      {result.duplicate?.duplicateDetected && (
        <div className="animate-fadeIn rounded-xl border border-fv-orange/40 bg-orange-50 px-5 py-4 text-sm">
          <p className="font-semibold text-fv-orange">
            {result.duplicate.duplicateType === 'exact' ? 'Exact' : 'Possible near'} duplicate detected —{' '}
            {result.duplicate.duplicateScope === 'same_batch' ? 'within this batch' : 'matches a previous submission'}.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-fv-text">
            <span>
              Similarity <strong>{Math.round((result.duplicate.similarityScore || 0) * 100)}%</strong>
            </span>
            <span>
              Matched evidence <strong className="font-mono">{result.duplicate.matchedProcessingId}</strong>
            </span>
            <span>
              Scope <strong>{result.duplicate.duplicateScope === 'same_batch' ? 'Same batch' : 'Previous submission'}</strong>
            </span>
          </div>
          <p className="mt-2 text-xs text-fv-muted">
            Duplicate detection is a data-quality signal, not automatic rejection — this is why the
            recommendation is {result.recommendation}, not an automatic reject.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-4 font-display text-lg font-semibold">Uploaded evidence</h3>
          <div className="overflow-hidden rounded-xl border border-fv-border bg-fv-white">
            {preview && <img src={preview} alt="Uploaded evidence" className="w-full object-cover" />}
          </div>
        </div>
        <div>
          {/* 5. Vehicle Details */}
          <h3 className="mb-4 font-display text-lg font-semibold">Vehicle &amp; evidence findings</h3>
          <FindingsList result={result} />
        </div>
      </div>

      {/* 6. Registration/OCR */}
      <RegistrationDetails ocr={result.ocr} />

      {/* 4. Why this decision? */}
      <div className="rounded-2xl border border-fv-border bg-fv-white p-6">
        <h3 className="font-display text-lg font-semibold">Why FieldVerify recommends {result.recommendation}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fv-muted">{result.explanation}</p>
      </div>

      {/* 10. Issues Found / 11. Recommended Action (per-issue) */}
      <div>
        <h3 className="mb-4 font-display text-lg font-semibold">Issues found</h3>
        <IssuesFound issues={result.issues} />
      </div>

      {/* 12. Processing Timeline */}
      <TimelineView timeline={result.timeline} />

      {/* 13. Technical Details */}
      <TechnicalDetails processingId={processingId} status={status} metrics={result.metrics} />
    </div>
  );
}
