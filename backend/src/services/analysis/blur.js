import sharp from 'sharp';
import { env } from '../../config/env.js';

/**
 * Estimates blur using a Laplacian-style edge-variance measurement.
 *
 * Method: convert to grayscale, apply a 3x3 Laplacian convolution kernel
 * (a standard edge-detection operator), then compute the variance of the
 * resulting pixel values. Sharp, in-focus images have strong edges and
 * therefore high variance in the Laplacian response. Blurry images have
 * weak edges and low variance.
 *
 * This is a well-known, cheap heuristic (not a trained model) - it is
 * documented as such throughout the README and API responses.
 */
export async function detectBlur(buffer) {
  const laplacianKernel = {
    width: 3,
    height: 3,
    kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  };

  const { data, info } = await sharp(buffer)
    .grayscale()
    .convolve(laplacianKernel)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = info.width * info.height;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += data[i];
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = data[i] - mean;
    variance += diff * diff;
  }
  variance /= n;

  const threshold = env.thresholds.blurVariance;
  const detected = variance < threshold;

  // Confidence scales with how far the measurement is from the threshold,
  // capped to a sane range - this is an engineering confidence heuristic,
  // not a statistically calibrated probability.
  const distanceRatio = Math.min(Math.abs(variance - threshold) / threshold, 1);
  const confidence = Number((0.55 + 0.4 * distanceRatio).toFixed(2));

  return {
    detected,
    score: Number(variance.toFixed(2)),
    threshold,
    confidence,
  };
}

export default detectBlur;
