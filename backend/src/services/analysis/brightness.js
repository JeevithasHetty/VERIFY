import sharp from 'sharp';
import { env } from '../../config/env.js';

/**
 * Computes mean luminance (0-255) and classifies exposure.
 */
export async function analyzeBrightness(buffer) {
  const { data, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;

  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += data[i];
  const mean = sum / n;

  const { lowLightBrightness, overexposedBrightness } = env.thresholds;

  let classification = 'NORMAL';
  if (mean < lowLightBrightness) classification = 'LOW_LIGHT';
  else if (mean > overexposedBrightness) classification = 'OVEREXPOSED';

  return {
    meanBrightness: Number(mean.toFixed(2)),
    classification,
    lowLightThreshold: lowLightBrightness,
    overexposedThreshold: overexposedBrightness,
    confidence: 0.9,
  };
}

/**
 * Computes contrast as the standard deviation of pixel intensities.
 * Low standard deviation indicates a flat, low-contrast image - which
 * can also be a weak signal for screen photographs or photo-of-photo.
 */
export async function analyzeContrast(buffer) {
  const { data, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
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
  const stdDev = Math.sqrt(variance);

  const threshold = env.thresholds.lowContrast;

  return {
    stdDev: Number(stdDev.toFixed(2)),
    threshold,
    low: stdDev < threshold,
    confidence: 0.85,
  };
}

/**
 * Estimates noise by comparing the image to a slightly blurred version
 * of itself. High-frequency energy that disappears after blurring is
 * treated as an approximation of sensor/compression noise.
 */
export async function estimateNoise(buffer) {
  const [{ data: rawData, info }, { data: blurredData }] = await Promise.all([
    sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(buffer).grayscale().blur(2).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const n = info.width * info.height;
  let diffSum = 0;
  for (let i = 0; i < n; i += 1) {
    diffSum += Math.abs(rawData[i] - blurredData[i]);
  }
  const noiseScore = diffSum / n;

  return {
    noiseScore: Number(noiseScore.toFixed(2)),
    // Purely descriptive banding; not used as a hard pass/fail gate on its own.
    level: noiseScore < 3 ? 'LOW' : noiseScore < 8 ? 'MODERATE' : 'HIGH',
    confidence: 0.7,
  };
}

export default { analyzeBrightness, analyzeContrast, estimateNoise };
