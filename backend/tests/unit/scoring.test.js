import { computeEvidenceScore } from '../../src/services/analysis/scoring.js';

function baseGoodInputs() {
  return {
    quality: {
      blur: { detected: false, score: 200, threshold: 55, confidence: 0.9 },
      brightness: { classification: 'NORMAL', meanBrightness: 130, lowLightThreshold: 45, overexposedThreshold: 225, confidence: 0.9 },
      contrast: { stdDev: 60, threshold: 25, low: false, confidence: 0.85 },
      resolution: { valid: true, width: 1920, height: 1080, minWidth: 480, minHeight: 360, confidence: 0.99 },
      aspectRatio: { ratio: 1.77, unusual: false, confidence: 0.95 },
      noise: { noiseScore: 2, level: 'LOW', confidence: 0.7 },
    },
    ocr: { rawText: 'KA01AB1234', normalizedText: 'KA01AB1234', confidence: 0.9, candidates: [{ candidate: 'KA01AB1234', formatValid: true, confidence: 0.88 }], failed: false },
    duplicate: { detected: false, type: null, confidence: 0.9 },
    screenshot: { suspicious: false, confidence: 0.1, signals: [] },
    photoOfPhoto: { suspicious: false, confidence: 0.1, signals: [] },
    tampering: { suspicious: false, confidence: 0.1, signals: [] },
    vehicle: { possibleVehicle: true, confidence: 0.85, method: 'heuristic_baseline', reasons: ['plate_format_candidate_found'] },
  };
}

describe('scoring engine', () => {
  test('a clean, high-quality image scores highly and is recommended ACCEPT', () => {
    const result = computeEvidenceScore(baseGoodInputs());
    expect(result.scores.overall).toBeGreaterThanOrEqual(85);
    expect(result.recommendation).toBe('ACCEPT');
    expect(result.riskLevel).toBe('LOW');
    expect(result.issues.length).toBe(0);
  });

  test('an exact duplicate crushes the uniqueness score and lowers overall score', () => {
    const inputs = baseGoodInputs();
    inputs.duplicate = { detected: true, type: 'exact', matchedProcessingId: 'fv_ABC123', confidence: 0.99 };
    const result = computeEvidenceScore(inputs);
    expect(result.scores.uniqueness).toBe(70);
    expect(result.scores.overall).toBeLessThan(baseline().scores.overall);
    expect(result.issues.some((i) => i.type === 'DUPLICATE')).toBe(true);
  });

  function baseline() {
    return computeEvidenceScore(baseGoodInputs());
  }

  test('a blurry, low-light, low-resolution image is recommended REJECT or REVIEW', () => {
    const inputs = baseGoodInputs();
    inputs.quality.blur = { detected: true, score: 20, threshold: 55, confidence: 0.9 };
    inputs.quality.brightness = { classification: 'LOW_LIGHT', meanBrightness: 15, lowLightThreshold: 45, overexposedThreshold: 225, confidence: 0.9 };
    inputs.quality.resolution = { valid: false, width: 200, height: 150, minWidth: 480, minHeight: 360, confidence: 0.99 };
    inputs.ocr = { rawText: '', normalizedText: '', confidence: 0.1, candidates: [], failed: false };
    inputs.vehicle = { possibleVehicle: false, confidence: 0.2, method: 'heuristic_baseline', reasons: [] };

    const result = computeEvidenceScore(inputs);
    expect(['REVIEW', 'REJECT']).toContain(result.recommendation);
    expect(result.scores.overall).toBeLessThan(85);
    expect(result.issues.some((i) => i.type === 'BLUR')).toBe(true);
    expect(result.issues.some((i) => i.type === 'LOW_LIGHT')).toBe(true);
    expect(result.issues.some((i) => i.type === 'LOW_RESOLUTION')).toBe(true);
  });

  test('every issue includes required explainability fields', () => {
    const inputs = baseGoodInputs();
    inputs.quality.blur = { detected: true, score: 20, threshold: 55, confidence: 0.9 };
    const result = computeEvidenceScore(inputs);
    for (const issue of result.issues) {
      expect(issue).toHaveProperty('type');
      expect(issue).toHaveProperty('severity');
      expect(issue).toHaveProperty('confidence');
      expect(issue).toHaveProperty('evidence');
      expect(issue).toHaveProperty('message');
    }
  });

  test('explanation text mentions the final recommendation', () => {
    const result = computeEvidenceScore(baseGoodInputs());
    expect(result.explanation).toContain(result.recommendation);
  });

  test('REJECT is never returned from soft/uncertain signals alone (duplicate + low OCR + one uncertain heuristic)', () => {
    const inputs = baseGoodInputs();
    inputs.duplicate = { detected: true, type: 'exact', matchedProcessingId: 'fv_PREV001', similarityScore: 1, duplicateScope: 'previous_submission', confidence: 0.99 };
    inputs.ocr = { rawText: '', normalizedText: '', confidence: 0.15, candidates: [], failed: false };
    inputs.tampering = { suspicious: true, confidence: 0.55, signals: ['metadata_stripped'] };
    // Quality itself stays good - no severe blur/resolution/quality failure.
    const result = computeEvidenceScore(inputs);
    expect(result.recommendation).not.toBe('REJECT');
    expect(['ACCEPT', 'REVIEW']).toContain(result.recommendation);
  });

  test('REJECT is allowed when there is genuine severe image-quality failure (blur + low light + low resolution together)', () => {
    const inputs = baseGoodInputs();
    inputs.quality.blur = { detected: true, score: 10, threshold: 55, confidence: 0.9 };
    inputs.quality.brightness = { classification: 'LOW_LIGHT', meanBrightness: 12, lowLightThreshold: 45, overexposedThreshold: 225, confidence: 0.9 };
    inputs.quality.resolution = { valid: false, width: 100, height: 80, minWidth: 480, minHeight: 360, confidence: 0.99 };
    inputs.quality.contrast = { stdDev: 5, threshold: 25, low: true, confidence: 0.85 };
    inputs.ocr = { rawText: '', normalizedText: '', confidence: 0.1, candidates: [], failed: false };
    inputs.vehicle = { possibleVehicle: false, confidence: 0.15, method: 'heuristic_baseline', reasons: [] };

    const result = computeEvidenceScore(inputs);
    expect(result.recommendation).toBe('REJECT');
  });

  test('REJECT is allowed when a strong (>=0.75 confidence) integrity signal is present, even without severe quality failure', () => {
    const inputs = baseGoodInputs();
    inputs.tampering = { suspicious: true, confidence: 0.8, signals: ['editing_software_in_exif', 'metadata_stripped'] };
    inputs.screenshot = { suspicious: true, confidence: 0.8, signals: ['unusual_aspect_ratio', 'ui_like_text_detected'] };
    inputs.ocr = { rawText: '', normalizedText: '', confidence: 0.1, candidates: [], failed: false };
    inputs.vehicle = { possibleVehicle: false, confidence: 0.1, method: 'heuristic_baseline', reasons: [] };

    const result = computeEvidenceScore(inputs);
    // Strong integrity concern present, so REJECT is a legitimate outcome
    // here if the score also lands below the review threshold.
    if (result.scores.overall < 60) {
      expect(result.recommendation).toBe('REJECT');
    } else {
      expect(['REVIEW', 'ACCEPT']).toContain(result.recommendation);
    }
  });

  test('exact duplicate of an otherwise-good image resolves to REVIEW, not REJECT', () => {
    const inputs = baseGoodInputs();
    inputs.duplicate = { detected: true, type: 'exact', matchedProcessingId: 'fv_ORIGINAL1', similarityScore: 1, duplicateScope: 'same_batch', confidence: 0.99 };
    const result = computeEvidenceScore(inputs);
    expect(result.recommendation).toBe('REVIEW');
    const dupIssue = result.issues.find((i) => i.type === 'DUPLICATE');
    expect(dupIssue).toBeTruthy();
    expect(dupIssue.evidence.duplicateScope).toBe('same_batch');
    expect(dupIssue.message).toMatch(/within this batch/);
    expect(dupIssue.recommendedAction).toBeTruthy();
  });

  test('every issue includes a recommendedAction', () => {
    const inputs = baseGoodInputs();
    inputs.quality.blur = { detected: true, score: 20, threshold: 55, confidence: 0.9 };
    inputs.duplicate = { detected: true, type: 'near', matchedProcessingId: 'fv_X', similarityScore: 0.92, duplicateScope: 'previous_submission', confidence: 0.85 };
    const result = computeEvidenceScore(inputs);
    for (const issue of result.issues) {
      expect(issue.recommendedAction).toBeTruthy();
    }
  });
});

test('a clear structurally valid registration can be ACCEPTED even when whole-image OCR confidence is low', () => {
  const inputs = baseGoodInputs();
  inputs.ocr = {
    rawText: 'IND KA 4] ECs 4 9 1 1',
    normalizedText: 'KA41EC4911',
    confidence: 0.42,
    registrationConfidence: 0.69,
    candidates: [{
      candidate: 'KA41EC4911',
      formatValid: true,
      formatStatus: 'VALID',
      confidence: 0.9,
      registrationConfidence: 0.69,
    }],
    failed: false,
  };
  inputs.vehicle = { possibleVehicle: true, status: 'SUPPORTED', confidence: 0.82, method: 'plate_structure_heuristic', reasons: ['valid_registration_structure_candidate'] };

  const result = computeEvidenceScore(inputs);
  expect(result.recommendation).toBe('ACCEPT');
  expect(result.issues.some((i) => i.type === 'REGISTRATION_NOT_CONFIDENT')).toBe(false);
});
