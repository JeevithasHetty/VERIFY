const STATUS_STYLES = {
  VALID: 'bg-green-100 text-green-700',
  UNCERTAIN: 'bg-orange-100 text-fv-orange',
  INVALID: 'bg-red-100 text-red-600',
};

export default function RegistrationDetails({ ocr }) {
  const best = (ocr.candidates || []).find((c) => c.formatValid) || (ocr.candidates || [])[0];

  return (
    <div className="rounded-xl border border-fv-border bg-fv-white p-5">
      <h3 className="font-display text-lg font-semibold">Registration &amp; OCR</h3>

      {((ocr.plateRegionCount || 0) >= 2) && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="font-semibold text-fv-orange">Multiple plate-like regions detected</p>
          <p className="mt-1 text-xs text-fv-muted">
            {ocr.plateRegionCount} plate-like regions were proposed. This is a review signal because an old,
            overlapping, or additional plate-like object may be visible. It does not by itself prove an illegal plate.
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-fv-muted">Plate detection</p>
          <p className="font-semibold">{ocr.plateDetected ? 'Detected / candidate found' : 'Not confidently detected'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fv-muted">Whole-image OCR</p>
          <p className="font-mono">{Math.round((ocr.confidence || 0) * 100)}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fv-muted">Registration confidence</p>
          <p className="font-mono">{Math.round(((ocr.registrationConfidence || best?.registrationConfidence || 0) * 100))}%</p>
        </div>
        {best && (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-fv-muted">Format status</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[best.formatStatus] || ''}`}>
                {best.formatStatus}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fv-muted">State code</p>
              <p className="font-mono">{best.stateCode || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fv-muted">Authority code</p>
              <p className="font-mono">{best.authorityCode || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fv-muted">Series</p>
              <p className="font-mono">{best.series || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-fv-muted">Registration number</p>
              <p className="font-mono">{best.registrationNumber || '—'}</p>
            </div>
          </>
        )}
      </div>

      {ocr.candidates?.length > 1 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer font-medium text-fv-text">Other registration candidates</summary>
          <div className="mt-2 space-y-2">
            {ocr.candidates.slice(0, 8).map((candidate, index) => (
              <div key={`${candidate.normalizedCandidate}-${index}`} className="rounded border border-fv-border p-2">
                <span className="font-mono">{candidate.normalizedCandidate}</span>
                <span className="ml-2 text-fv-muted">
                  {Math.round((candidate.registrationConfidence || candidate.confidence || 0) * 100)}% · {candidate.formatStatus}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {best ? (
        <p className="mt-3 text-xs text-fv-muted">{best.validationReason}</p>
      ) : (
        <p className="mt-3 text-xs text-fv-muted">No registration candidate was reliable enough for structural validation. This should be treated as uncertainty, not proof that the vehicle has an invalid registration.</p>
      )}

      <details className="mt-4 text-xs text-fv-muted">
        <summary className="cursor-pointer font-medium text-fv-text">Raw OCR text</summary>
        <p className="mt-2 whitespace-pre-wrap font-mono">{ocr.rawText || '(no text extracted)'}</p>
      </details>

      <p className="mt-4 text-[11px] text-fv-muted">
        This checks registration-number format structure only. It does not verify the plate
        against government or RTO records, ownership, insurance, or vehicle status.
      </p>
    </div>
  );
}
