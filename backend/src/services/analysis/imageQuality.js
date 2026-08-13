import { env } from '../../config/env.js';
import { detectBlur } from './blur.js';
import { analyzeBrightness, analyzeContrast, estimateNoise } from './brightness.js';

function checkResolution(width, height) {
  const { minWidth, minHeight } = env.thresholds;
  const valid = width >= minWidth && height >= minHeight;
  return {
    valid,
    width,
    height,
    minWidth,
    minHeight,
    confidence: 0.99,
  };
}

function checkAspectRatio(width, height) {
  const ratio = Number((width / height).toFixed(3));
  const { unusualAspectRatioMin, unusualAspectRatioMax } = env.thresholds;
  const unusual = ratio < unusualAspectRatioMin || ratio > unusualAspectRatioMax;
  return {
    ratio,
    unusual,
    normalRange: [unusualAspectRatioMin, unusualAspectRatioMax],
    confidence: 0.95,
  };
}

/**
 * Runs all local, deterministic image-quality checks and returns a single
 * structured object. This is the mandatory, no-external-AI-required path.
 */
export async function analyzeImageQuality(buffer, width, height) {
  const [blur, brightness, contrast, noise] = await Promise.all([
    detectBlur(buffer),
    analyzeBrightness(buffer),
    analyzeContrast(buffer),
    estimateNoise(buffer),
  ]);

  return {
    resolution: checkResolution(width, height),
    aspectRatio: checkAspectRatio(width, height),
    blur,
    brightness,
    contrast,
    noise,
  };
}

export default analyzeImageQuality;
