/**
 * Heuristic (non-ML) "photo of a photo / photo of a screen" detector.
 *
 * A picture taken of a printed photo or of a screen displaying an image
 * often shows: flattened contrast (the recapture compresses dynamic
 * range), moire-like noise patterns, and no original-camera EXIF chain
 * (or EXIF from a *different* device than expected). None of these are
 * individually conclusive, so signals are combined into a bounded
 * confidence score and always described as "possible", never certain.
 */
export function detectPhotoOfPhoto({ contrast, noise, metadata }) {
  const signals = [];
  let score = 0;

  if (contrast && contrast.low) {
    signals.push('flat_contrast');
    score += 0.3;
  }

  if (noise && noise.level === 'HIGH') {
    signals.push('unusual_noise_pattern');
    score += 0.25;
  }

  if (metadata && metadata.available === false) {
    signals.push('missing_camera_metadata');
    score += 0.15;
  }

  if (metadata && metadata.editingSoftwareDetected) {
    signals.push('editing_software_metadata');
    score += 0.2;
  }

  const confidence = Number(Math.min(score, 0.9).toFixed(2));
  const suspicious = confidence >= 0.5;

  return { suspicious, confidence, signals };
}

export default detectPhotoOfPhoto;
