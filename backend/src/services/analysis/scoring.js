import { env } from '../../config/env.js';

/**
 * Dimension weights for the overall Evidence Integrity Score.
 * Configurable in one place - change these to re-balance the score
 * without touching any detection logic.
 */
export const SCORE_WEIGHTS = {
  imageQuality: 0.25,
  ocr: 0.2,
  uniqueness: 0.2,
  authenticity: 0.2,
  vehicleEvidence: 0.15,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreImageQuality(quality) {
  let score = 100;
  if (quality.blur.detected) score -= 35;
  if (quality.brightness.classification === 'LOW_LIGHT') score -= 20;
  if (quality.brightness.classification === 'OVEREXPOSED') score -= 20;
  if (quality.contrast.low) score -= 10;
  if (!quality.resolution.valid) score -= 20;
  if (quality.aspectRatio.unusual) score -= 5;
  if (quality.noise.level === 'HIGH') score -= 10;
  return clamp(score);
}

function scoreOcr(ocr) {
  // OCR is a supporting signal, not a hard validity gate. A missing or
  // low-confidence plate read should normally route to REVIEW, not REJECT.
  if (ocr.failed) return 55;
  const hasValidCandidate = (ocr.candidates || []).some((c) => c.formatValid);
  const hasUncertainCandidate = (ocr.candidates || []).some((c) => c.formatStatus === 'UNCERTAIN');
  const registrationConfidence = ocr.registrationConfidence || 0;
  let score = Math.round(Math.max(ocr.confidence || 0, registrationConfidence) * 100);
  if (hasValidCandidate) score = Math.min(100, score + 15);
  else if (hasUncertainCandidate) score = Math.max(45, score);
  else score = Math.max(45, score);
  return clamp(score);
}

function scoreUniqueness(duplicate) {
  // Duplicate evidence is a data-quality/reuse signal. It must lower the
  // score enough to make ACCEPT unlikely, but it must never by itself make
  // an otherwise usable image look like a catastrophic failure.
  if (!duplicate.detected) return 100;
  if (duplicate.type === 'exact') return 70;
  const similarity = duplicate.similarityScore || 0.9;
  return clamp(Math.round(100 - (similarity * 30)));
}

function scoreAuthenticity(screenshot, photoOfPhoto, tampering) {
  let score = 100;
  score -= screenshot.confidence * 40 * (screenshot.suspicious ? 1 : 0.3);
  score -= photoOfPhoto.confidence * 35 * (photoOfPhoto.suspicious ? 1 : 0.3);
  score -= tampering.confidence * 45 * (tampering.suspicious ? 1 : 0.3);
  return clamp(Math.round(score));
}

function scoreVehicleEvidence(vehicle) {
  return clamp(Math.round(vehicle.confidence * 100));
}

/**
 * Builds the structured issues array from all analysis outputs.
 * Every issue includes type, severity, confidence, evidence, and a
 * human-readable message, per the assignment's explainability requirement.
 */
function buildIssues({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle }) {
  const issues = [];

  if (quality.blur.detected) {
    issues.push({
      type: 'BLUR',
      severity: 'high',
      confidence: quality.blur.confidence,
      measurement: quality.blur.score,
      threshold: quality.blur.threshold,
      evidence: { score: quality.blur.score, threshold: quality.blur.threshold },
      message: 'Edge-variance analysis indicates the image is likely blurry.',
      recommendedAction: 'Ask for a re-shot with a steadier camera and better focus.',
    });
  }

  if (quality.brightness.classification === 'LOW_LIGHT') {
    issues.push({
      type: 'LOW_LIGHT',
      severity: 'medium',
      confidence: quality.brightness.confidence,
      measurement: quality.brightness.meanBrightness,
      threshold: quality.brightness.lowLightThreshold,
      evidence: {
        meanBrightness: quality.brightness.meanBrightness,
        threshold: quality.brightness.lowLightThreshold,
      },
      message: 'Mean brightness is below the configured low-light threshold.',
      recommendedAction: 'Ask for a re-shot in better lighting, or with flash enabled.',
    });
  }

  if (quality.brightness.classification === 'OVEREXPOSED') {
    issues.push({
      type: 'OVEREXPOSURE',
      severity: 'medium',
      confidence: quality.brightness.confidence,
      measurement: quality.brightness.meanBrightness,
      threshold: quality.brightness.overexposedThreshold,
      evidence: {
        meanBrightness: quality.brightness.meanBrightness,
        threshold: quality.brightness.overexposedThreshold,
      },
      message: 'Mean brightness exceeds the configured overexposure threshold.',
      recommendedAction: 'Ask for a re-shot out of direct glare or harsh light.',
    });
  }

  if (quality.contrast.low) {
    issues.push({
      type: 'LOW_CONTRAST',
      severity: 'low',
      confidence: quality.contrast.confidence,
      measurement: quality.contrast.stdDev,
      threshold: quality.contrast.threshold,
      evidence: { stdDev: quality.contrast.stdDev, threshold: quality.contrast.threshold },
      message: 'Image contrast is below the configured threshold.',
      recommendedAction: 'Usually acceptable alongside other passing checks; monitor only.',
    });
  }

  if (!quality.resolution.valid) {
    issues.push({
      type: 'LOW_RESOLUTION',
      severity: 'high',
      confidence: quality.resolution.confidence,
      measurement: `${quality.resolution.width}x${quality.resolution.height}`,
      threshold: `${quality.resolution.minWidth}x${quality.resolution.minHeight}`,
      evidence: {
        width: quality.resolution.width,
        height: quality.resolution.height,
        minWidth: quality.resolution.minWidth,
        minHeight: quality.resolution.minHeight,
      },
      message: 'Image resolution is below the configured minimum.',
      recommendedAction: 'Ask for a re-shot at a higher camera resolution.',
    });
  }

  if ((ocr.plateRegionCount || 0) >= 2) {
    issues.push({
      type: 'MULTIPLE_PLATE_REGIONS',
      severity: 'medium',
      confidence: Math.min(0.95, 0.55 + (ocr.plateRegionCount - 2) * 0.08),
      evidence: { plateRegionCount: ocr.plateRegionCount, regions: ocr.plateRegions || [] },
      message: `Multiple plate-like regions were detected (${ocr.plateRegionCount}). The image may contain an overlapping/old plate or another plate-like object.`,
      recommendedAction: 'Manually confirm which plate belongs to the vehicle before accepting the evidence.',
    });
  }

  if (duplicate.detected && duplicate.type === 'exact') {
    const scopeText = duplicate.duplicateScope === 'same_batch' ? 'within this batch' : 'in a previous submission';
    issues.push({
      type: 'DUPLICATE',
      severity: 'high',
      confidence: duplicate.confidence,
      measurement: duplicate.similarityScore,
      threshold: 1,
      evidence: {
        matchedProcessingId: duplicate.matchedProcessingId,
        similarityScore: duplicate.similarityScore,
        duplicateScope: duplicate.duplicateScope,
      },
      message: `An identical image was already submitted ${scopeText} (${duplicate.matchedProcessingId}). This is a data-quality signal, not proof of fraud.`,
      recommendedAction: 'Route to manual review to confirm this is an intentional re-submission.',
    });
  }

  if (duplicate.detected && duplicate.type === 'near') {
    const scopeText = duplicate.duplicateScope === 'same_batch' ? 'within this batch' : 'in a previous submission';
    issues.push({
      type: 'NEAR_DUPLICATE',
      severity: 'medium',
      confidence: duplicate.confidence,
      measurement: duplicate.similarityScore,
      threshold: 1 - env.thresholds.nearDuplicateHamming / 64,
      evidence: {
        matchedProcessingId: duplicate.matchedProcessingId,
        similarityScore: duplicate.similarityScore,
        duplicateScope: duplicate.duplicateScope,
      },
      message: `A visually similar image was already submitted ${scopeText} (possible near-duplicate of ${duplicate.matchedProcessingId}).`,
      recommendedAction: 'Route to manual review to confirm this is an intentional re-submission.',
    });
  }

  if (screenshot.suspicious) {
    issues.push({
      type: 'SCREENSHOT',
      severity: 'medium',
      confidence: screenshot.confidence,
      evidence: { signals: screenshot.signals },
      message: 'The image shows possible signals of being a screenshot rather than a camera photo.',
      recommendedAction: 'Route to manual review; ask for an original camera photo if possible.',
    });
  }

  if (photoOfPhoto.suspicious) {
    issues.push({
      type: 'PHOTO_OF_PHOTO',
      severity: 'medium',
      confidence: photoOfPhoto.confidence,
      evidence: { signals: photoOfPhoto.signals },
      message: 'The image shows possible signals of being a photo of another photo or screen.',
      recommendedAction: 'Route to manual review; ask for a direct photo of the vehicle.',
    });
  }

  if (tampering.suspicious) {
    issues.push({
      type: 'SUSPICIOUS_EDITING',
      severity: 'medium',
      confidence: tampering.confidence,
      evidence: { signals: tampering.signals },
      message: 'The image shows possible editing signals. This is not proof of tampering.',
      recommendedAction: 'Route to manual review before relying on this image as evidence.',
    });
  }

  if ((ocr.confidence || 0) < 0.5 && !(ocr.registrationConfidence >= 0.68 && (ocr.candidates || []).some((c) => c.formatValid))) {
    issues.push({
      type: 'LOW_OCR_CONFIDENCE',
      severity: 'low',
      confidence: 1 - ocr.confidence,
      measurement: ocr.confidence,
      threshold: 0.5,
      evidence: { ocrConfidence: ocr.confidence },
      message: 'Text extraction confidence was low; registration text may be unreliable.',
      recommendedAction: 'Route to manual review of the registration text rather than auto-rejecting.',
    });
  }

  const hasValidPlate = (ocr.candidates || []).some((c) => c.formatValid);
  const hasUncertainPlate = (ocr.candidates || []).some((c) => c.formatStatus === 'UNCERTAIN');
  if (!hasValidPlate) {
    issues.push({
      type: hasUncertainPlate ? 'UNCERTAIN_PLATE_FORMAT' : 'REGISTRATION_NOT_CONFIDENT',
      severity: 'low',
      confidence: hasUncertainPlate ? 0.55 : 0.7,
      evidence: { candidates: ocr.candidates || [], plateDetected: ocr.plateDetected ?? false },
      message: hasUncertainPlate
        ? 'A possible registration candidate was found, but its structure is uncertain and may contain OCR errors.'
        : (ocr.plateDetected
          ? 'A registration plate appears to be present, but OCR did not produce a sufficiently reliable candidate.'
          : 'A registration plate could not be confidently detected; format validation was not performed.'),
      recommendedAction: 'Route to manual review rather than treating OCR uncertainty as an invalid vehicle.',
    });
  }

  if (vehicle.status === 'UNKNOWN') {
    issues.push({
      type: 'VEHICLE_DETECTION_UNCERTAIN',
      severity: 'low',
      confidence: 1 - vehicle.confidence,
      evidence: { method: vehicle.method, reasons: vehicle.reasons },
      message: 'The lightweight local detector could not independently verify vehicle presence; this is an uncertainty signal, not a finding that no vehicle exists.',
      recommendedAction: 'Use the image itself for manual vehicle confirmation if other checks are inconclusive.',
    });
  }

  return issues;
}

/**
 * REJECT must be reserved for genuinely strong negative evidence, not
 * merely an unlucky accumulation of soft/uncertain signals (duplicate,
 * low OCR, one uncertain heuristic) that happen to drag the weighted
 * average below the REVIEW threshold. This explicitly checks for hard
 * evidence of a severe problem before ever allowing REJECT; everything
 * else that scores below the REVIEW threshold is downgraded to REVIEW
 * instead, per the "reserve REJECT for strong evidence" requirement.
 */
function hasStrongNegativeEvidence({ quality, screenshot, photoOfPhoto, tampering }) {
  const severeBlur = quality.blur.detected && quality.blur.score < quality.blur.threshold * 0.25;
  const veryLowResolution =
    !quality.resolution.valid &&
    (quality.resolution.width < quality.resolution.minWidth * 0.6 ||
      quality.resolution.height < quality.resolution.minHeight * 0.6);
  const severeQualityFailure =
    [quality.blur.detected, quality.brightness.classification !== 'NORMAL', quality.contrast.low, !quality.resolution.valid].filter(
      Boolean
    ).length >= 3;
  const strongIntegrityConcern =
    (screenshot.suspicious && screenshot.confidence >= 0.9) ||
    (photoOfPhoto.suspicious && photoOfPhoto.confidence >= 0.9) ||
    (tampering.suspicious && tampering.confidence >= 0.85);

  return severeBlur || veryLowResolution || severeQualityFailure || strongIntegrityConcern;
}

function hasReviewSignal({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle }) {
  const best = (ocr.candidates || []).find((c) => c.formatValid);
  const registrationConfidence = ocr.registrationConfidence || best?.registrationConfidence || best?.confidence || 0;
  const registrationIsStrongEnough = Boolean(best && registrationConfidence >= 0.68);

  // Whole-image Tesseract confidence is intentionally NOT a hard gate when
  // a structurally valid registration candidate has been independently
  // supported by multiple OCR passes. This fixes clear plates such as
  // KA41EC4911 where Tesseract may score the surrounding scene poorly.
  const ocrUncertain = ocr.failed || (!registrationIsStrongEnough && !(ocr.candidates || []).some((c) => c.formatValid));

  return Boolean(
    duplicate.detected ||
    (ocr.plateRegionCount || 0) >= 2 ||
    ocrUncertain ||
    quality.blur.detected ||
    quality.brightness.classification !== 'NORMAL' ||
    quality.contrast.low ||
    !quality.resolution.valid ||
    screenshot.suspicious ||
    photoOfPhoto.suspicious ||
    tampering.suspicious ||
    vehicle.status === 'UNKNOWN'
  );
}

function buildRecommendation(overall, evidenceContext) {
  const { acceptThreshold, reviewThreshold } = env.scoring;

  // Strong negative evidence is the only route to REJECT.
  if (hasStrongNegativeEvidence(evidenceContext)) {
    return { recommendation: 'REJECT', riskLevel: 'HIGH' };
  }

  // Any unresolved/soft signal routes to REVIEW even when the weighted
  // score happens to remain high. This prevents duplicate/OCR/blur signals
  // from being accidentally hidden by averaging.
  if (hasReviewSignal(evidenceContext)) {
    return { recommendation: 'REVIEW', riskLevel: 'MEDIUM' };
  }

  if (overall >= acceptThreshold) return { recommendation: 'ACCEPT', riskLevel: 'LOW' };
  if (overall >= reviewThreshold) return { recommendation: 'REVIEW', riskLevel: 'MEDIUM' };
  return { recommendation: 'REVIEW', riskLevel: 'MEDIUM' };
}

function buildExplanation({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle, recommendation }) {
  const parts = [];

  parts.push(
    quality.blur.detected || quality.brightness.classification !== 'NORMAL' || !quality.resolution.valid
      ? 'Image quality shows some concerns (blur, lighting, or resolution).'
      : 'Image quality is within the configured thresholds.'
  );

  parts.push(
    (ocr.registrationConfidence || 0) >= 0.68
      ? `Registration candidate confidence is sufficient (${Math.round((ocr.registrationConfidence || 0) * 100)}%).`
      : ocr.confidence >= 0.6
        ? 'OCR confidence is high, but registration extraction remains uncertain.'
        : 'Whole-image OCR confidence is lower than ideal; extracted text may be unreliable.'
  );

  parts.push(
    duplicate.detected
      ? `A ${duplicate.type} duplicate was found (${duplicate.matchedProcessingId}${
          duplicate.duplicateScope ? `, ${duplicate.duplicateScope.replace('_', ' ')}` : ''
        }). This is treated as a review signal, not automatic rejection.`
      : 'No duplicate was found.'
  );

  if ((ocr.plateRegionCount || 0) >= 2) {
    parts.push(`Multiple plate-like regions were detected (${ocr.plateRegionCount}), so the result is routed to manual review rather than declaring the vehicle invalid.`);
  }

  const authenticityFlags = [];
  if (screenshot.suspicious) authenticityFlags.push('possible screenshot signals');
  if (photoOfPhoto.suspicious) authenticityFlags.push('possible photo-of-photo signals');
  if (tampering.suspicious) authenticityFlags.push('possible editing signals');

  parts.push(
    authenticityFlags.length > 0
      ? `Authenticity checks raised: ${authenticityFlags.join(', ')}.`
      : 'No strong screenshot, photo-of-photo, or editing signals were detected.'
  );

  parts.push(
    vehicle.status === 'UNKNOWN'
      ? 'Vehicle presence could not be independently confirmed by the lightweight local detector, so this remains a manual-review signal rather than a negative vehicle finding.'
      : vehicle.possibleVehicle
        ? 'Vehicle evidence is supported by the available local signals.'
        : 'Vehicle evidence is inconclusive.'
  );

  parts.push(`Overall recommendation: ${recommendation}.`);

  return parts.join(' ');
}

/**
 * Runs the full scoring pipeline given all analysis outputs and returns
 * dimension scores, overall score, issues, recommendation, risk level,
 * and a human-readable explanation.
 */
export function computeEvidenceScore({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle }) {
  const dimensionScores = {
    imageQuality: scoreImageQuality(quality),
    ocr: scoreOcr(ocr),
    uniqueness: scoreUniqueness(duplicate),
    authenticity: scoreAuthenticity(screenshot, photoOfPhoto, tampering),
    vehicleEvidence: scoreVehicleEvidence(vehicle),
  };

  const overall = Math.round(
    Object.entries(dimensionScores).reduce(
      (sum, [key, value]) => sum + value * SCORE_WEIGHTS[key],
      0
    )
  );

  const { recommendation, riskLevel } = buildRecommendation(overall, { quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle });
  const issues = buildIssues({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle });
  const explanation = buildExplanation({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle, recommendation });

  return {
    scores: { ...dimensionScores, overall },
    recommendation,
    riskLevel,
    issues,
    explanation,
  };
}

export default computeEvidenceScore;
