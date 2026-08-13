/**
 * Conservative local vehicle-evidence baseline.
 *
 * This project intentionally does not pretend that OCR is an object detector.
 * A vehicle can be clearly visible even when the plate is unreadable. When
 * there is no plate/OCR signal, the correct state is UNKNOWN, not "no vehicle".
 */
export function detectVehicleEvidence({ plateCandidates, plateDetected = false, quality }) {
  const candidates = plateCandidates || [];
  const hasValid = candidates.some((c) => c.formatValid);
  const hasUncertain = candidates.some((c) => c.formatStatus === 'UNCERTAIN');

  if (hasValid) {
    return {
      possibleVehicle: true,
      status: 'SUPPORTED',
      confidence: 0.82,
      method: 'plate_structure_heuristic',
      reasons: ['valid_registration_structure_candidate'],
    };
  }

  if (plateDetected) {
    return {
      possibleVehicle: true,
      status: 'SUPPORTED',
      confidence: 0.66,
      method: 'plate_region_heuristic',
      reasons: ['plate_like_region_detected_but_registration_not_confident'],
    };
  }

  if (hasUncertain) {
    return {
      possibleVehicle: true,
      status: 'SUPPORTED',
      confidence: 0.62,
      method: 'uncertain_plate_structure_heuristic',
      reasons: ['uncertain_registration_structure_candidate'],
    };
  }

  const usableScene = Boolean(quality?.resolution?.valid) && !quality?.resolution?.blank;
  return {
    possibleVehicle: null,
    status: 'UNKNOWN',
    confidence: usableScene ? 0.55 : 0.35,
    method: 'conservative_baseline',
    reasons: usableScene
      ? ['no_independent_object_detector_available', 'ocr_did_not_provide_plate_signal']
      : ['image_quality_prevents_reliable_scene_assessment'],
  };
}

export default detectVehicleEvidence;
