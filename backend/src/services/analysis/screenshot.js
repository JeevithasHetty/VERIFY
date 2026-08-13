/**
 * Heuristic (non-ML) screenshot detector.
 *
 * Signals considered:
 *  - unusual aspect ratio (screenshots often match common device/monitor
 *    ratios like 16:9, 19.5:9, or are perfectly square-ish crops)
 *  - OCR text containing UI-like words (status bar, buttons, app chrome)
 *  - absence of any camera EXIF data combined with presence of software
 *    tags typical of screen-capture/editing tools
 *  - no camera Make/Model at all, which is common for screenshots but
 *    also common for stripped/re-saved photos, so this is weak on its own
 *
 * This function NEVER claims certainty - output is always framed as
 * "possible screenshot", with a confidence score and a signal list.
 */
const UI_TEXT_HINTS = [
  'settings',
  'wifi',
  'battery',
  'notification',
  'back',
  'cancel',
  'home',
  'menu',
  'search',
  'http://',
  'https://',
  'www.',
  '%',
  'am',
  'pm',
];

export function detectScreenshot({ aspectRatio, ocrText, metadata }) {
  const signals = [];
  const overlaySignals = [];
  let score = 0;

  const commonScreenRatios = [16 / 9, 9 / 16, 19.5 / 9, 9 / 19.5, 4 / 3, 3 / 4, 1];
  const isCommonScreenRatio = commonScreenRatios.some((r) => Math.abs(aspectRatio - r) < 0.03);
  if (isCommonScreenRatio) {
    signals.push('unusual_aspect_ratio');
    score += 0.25;
  }

  const lowerText = (ocrText || '').toLowerCase();

  if (/task\s*id\s*[:#]/i.test(ocrText || '')) overlaySignals.push('task_id_overlay');
  if (/\blat\s*[:=]/i.test(ocrText || '') && /\blong\s*[:=]/i.test(ocrText || '')) overlaySignals.push('gps_overlay');
  if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(ocrText || '') && /\b(?:am|pm)\b/i.test(ocrText || '')) overlaySignals.push('timestamp_overlay');
  if (/\b(?:road|street|highway|ward|zone|corporation)\b/i.test(ocrText || '') && overlaySignals.length > 0) overlaySignals.push('location_overlay');
  const uiHits = UI_TEXT_HINTS.filter((hint) => lowerText.includes(hint));
  if (uiHits.length >= 2) {
    signals.push('ui_like_text_detected');
    score += 0.35;
  }

  if (metadata && metadata.available === false) {
    signals.push('no_camera_metadata');
    score += 0.15;
  }

  if (metadata && metadata.software && /screenshot|capture/i.test(metadata.software)) {
    signals.push('capture_software_metadata');
    score += 0.3;
  }

  const confidence = Number(Math.min(score, 0.95).toFixed(2));
  const suspicious = confidence >= 0.5;
  const captureOverlayDetected = overlaySignals.length > 0;

  return { suspicious, confidence, signals, captureOverlayDetected, overlaySignals };
}

export default detectScreenshot;
