/**
 * Lightweight, heuristic editing-signal detector.
 *
 * IMPORTANT: this is NOT forensic proof of tampering. It surfaces
 * circumstantial signals only - editing software in EXIF, metadata
 * inconsistencies, or unusual compression artifacts - and always uses
 * "possible editing signal" language rather than asserting fraud.
 */
export function detectTampering({ metadata, quality }) {
  const signals = [];
  let score = 0;

  if (metadata && metadata.editingSoftwareDetected) {
    signals.push('editing_software_in_exif');
    score += 0.45;
  }

  // A timestamp that is missing entirely alongside other missing camera
  // fields is a weak signal of metadata stripping, which sometimes
  // accompanies re-saving/editing (though also happens with normal
  // sharing pipelines like WhatsApp).
  if (metadata && metadata.available && !metadata.timestamp && !metadata.cameraMake) {
    signals.push('metadata_stripped');
    score += 0.2;
  }

  // Extremely low noise combined with high resolution can indicate
  // heavy denoising/smoothing often applied during editing.
  if (quality && quality.noise && quality.noise.level === 'LOW' && quality.resolution?.valid) {
    signals.push('unusually_smooth_image');
    score += 0.1;
  }

  const confidence = Number(Math.min(score, 0.85).toFixed(2));
  const suspicious = confidence >= 0.5;

  return { suspicious, confidence, signals };
}

export default detectTampering;
