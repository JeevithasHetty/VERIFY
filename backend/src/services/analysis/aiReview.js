import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * AIProvider interface: any provider implementation must expose
 *   async review(imageBuffer, context) -> {
 *     vehiclePresent, plateVisible, plateTextCandidate,
 *     suspiciousSignals, confidence, recommendation, explanation
 *   }
 *
 * This keeps FieldVerify's business logic decoupled from any single
 * vision-AI vendor. Swapping providers means writing a new adapter
 * class, not touching the worker or scoring engine.
 *
 * NOTE: No provider is wired to a live external API in this build -
 * AI_REVIEW_ENABLED defaults to false and the deterministic pipeline
 * (image quality, OCR, duplicate, screenshot, tampering, vehicle
 * heuristics, scoring) is fully sufficient to produce a result on its
 * own, per the assignment's mandatory requirement that the core system
 * work without any external AI API.
 */
class NullAIProvider {
  async review() {
    throw new Error('No AI provider is configured');
  }
}

function getProvider() {
  // Future providers (e.g. a hosted vision model) would be selected here
  // based on env.aiReview config, all implementing the same interface.
  return new NullAIProvider();
}

/**
 * Decides whether the optional AI review step should run for this image,
 * based on deterministic-pipeline weak signals.
 */
export function shouldTriggerAiReview({ overallScoreSoFar, ocrConfidence, hasSuspiciousSignals }) {
  if (!env.aiReview.enabled) return false;
  if (overallScoreSoFar < env.aiReview.triggerScore) return true;
  if (ocrConfidence < 0.5) return true;
  if (hasSuspiciousSignals) return true;
  return false;
}

/**
 * Runs the optional AI review. Any failure here is caught and returns
 * null rather than throwing, so the deterministic pipeline result is
 * never blocked or invalidated by an AI provider outage.
 */
export async function runAiReview(buffer, context) {
  if (!env.aiReview.enabled) return null;

  try {
    const provider = getProvider();
    const result = await provider.review(buffer, context);
    return result;
  } catch (err) {
    logger.warn(
      { event: 'ai_review_failed', error: err.message },
      'Optional AI review failed - continuing with deterministic result only'
    );
    return null;
  }
}

export default { shouldTriggerAiReview, runAiReview };
