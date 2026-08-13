import { CheckCircle2, AlertTriangle } from 'lucide-react';

function buildFindings(result) {
  const findings = [];

  findings.push({
    ok: result.vehicle?.status === 'SUPPORTED',
    title: 'Vehicle evidence',
    detail: result.vehicle?.status === 'SUPPORTED'
      ? `Vehicle evidence is supported by local signals (${Math.round((result.vehicle.confidence || 0) * 100)}% heuristic confidence).`
      : 'Vehicle presence is not independently verified by the lightweight detector; this is uncertainty, not evidence that no vehicle is present.',
  });

  findings.push({
    ok: !result.quality.blur.detected,
    title: 'Image quality',
    detail: result.quality.blur.detected
      ? 'Possible blur detected in the image.'
      : 'No significant blur detected.',
  });

  findings.push({
    ok: result.quality.brightness.classification === 'NORMAL',
    title: 'Brightness',
    detail:
      result.quality.brightness.classification === 'NORMAL'
        ? 'Suitable lighting.'
        : `Lighting flagged as ${result.quality.brightness.classification.replace('_', ' ').toLowerCase()}.`,
  });

  const bestCandidate = (result.ocr.candidates || []).find((c) => c.formatValid);
  const bestUncertain = (result.ocr.candidates || []).find((c) => c.formatStatus === 'UNCERTAIN');
  findings.push({
    ok: Boolean(bestCandidate),
    title: 'Registration number',
    detail: bestCandidate
      ? bestCandidate.candidate
      : bestUncertain
      ? `Uncertain candidate: ${bestUncertain.candidate} (${bestUncertain.validationReason})`
      : 'No confident registration number was read.',
  });

  findings.push({
    ok: Boolean(bestCandidate),
    title: 'Number format',
    detail: bestCandidate
      ? 'Structurally valid format.'
      : bestUncertain
      ? 'Structurally uncertain — needs manual review, not necessarily invalid.'
      : result.ocr?.plateDetected
      ? 'A plate signal was found, but OCR did not produce a sufficiently reliable registration candidate.'
      : 'Registration plate could not be confidently detected; format validation was not performed.',
  });

  const dup = result.duplicate || {};
  const isDuplicate = dup.duplicateDetected ?? dup.detected;
  const dupType = dup.duplicateType ?? dup.type;
  findings.push({
    ok: !isDuplicate,
    title: 'Duplicate check',
    detail: isDuplicate
      ? `Possible ${dupType} duplicate of ${dup.matchedProcessingId}${
          dup.duplicateScope ? ` (${dup.duplicateScope.replace('_', ' ')})` : ''
        }.`
      : 'No matching evidence found.',
  });

  findings.push({
    ok: !result.screenshot.suspicious,
    title: result.screenshot.captureOverlayDetected ? 'Capture overlay' : 'Screenshot check',
    detail: result.screenshot.captureOverlayDetected
      ? `Timestamp/location/task overlay detected (${(result.screenshot.overlaySignals || []).join(', ')}). This does not prove manipulation.`
      : result.screenshot.suspicious ? 'Possible screenshot signals detected.' : 'No strong screenshot signals.',
  });

  findings.push({
    ok: !result.photoOfPhoto?.suspicious,
    title: 'Photo-of-photo check',
    detail: result.photoOfPhoto?.suspicious
      ? 'Possible photo-of-photo or photo-of-screen signals detected.'
      : 'No strong photo-of-photo signals.',
  });

  findings.push({
    ok: !result.tampering.suspicious,
    title: 'Editing signals',
    detail: result.tampering.suspicious ? 'Possible manipulation signals detected.' : 'No strong manipulation signals.',
  });

  return findings;
}

export default function FindingsList({ result }) {
  const findings = buildFindings(result);

  return (
    <div className="space-y-3">
      {findings.map((f, i) => (
        <div
          key={f.title}
          className="flex animate-slideUp items-start gap-3 rounded-lg border border-fv-border bg-fv-white px-4 py-3"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {f.ok ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-fv-orange" />
          )}
          <div>
            <p className="text-sm font-semibold">{f.title}</p>
            <p className="text-sm text-fv-muted">{f.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
