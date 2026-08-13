import { Image } from '../../models/Image.js';
import { hammingDistance, similarityFromHamming } from '../../utils/hash.js';
import { env } from '../../config/env.js';

/**
 * Checks for an EXACT duplicate: another image record with the same
 * SHA-256 hash (byte-for-byte identical file), excluding itself.
 * Returns the EARLIEST matching record, so repeated re-uploads of the
 * same file all point back to the original submission.
 */
async function findExactDuplicate(sha256, excludeProcessingId) {
  const match = await Image.findOne({
    sha256,
    processingId: { $ne: excludeProcessingId },
  })
    .sort({ createdAt: 1 })
    .select('processingId batchId createdAt');

  return match;
}

/**
 * Checks for a NEAR duplicate: another image whose perceptual hash is
 * within the configured Hamming-distance threshold. This catches the
 * same photo after resizing, recompression, or minor edits.
 *
 * Note: this scans recent candidates rather than the entire collection.
 * At take-home scale this is fine; a production system would use a
 * dedicated similarity index (see README trade-offs / scalability).
 */
async function findNearDuplicate(perceptualHash, excludeProcessingId) {
  const candidates = await Image.find({
    processingId: { $ne: excludeProcessingId },
    perceptualHash: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .select('processingId perceptualHash batchId createdAt');

  let best = null;
  for (const candidate of candidates) {
    if (!candidate.perceptualHash || candidate.perceptualHash.length !== perceptualHash.length) {
      continue;
    }
    const distance = hammingDistance(perceptualHash, candidate.perceptualHash);
    if (distance <= env.thresholds.nearDuplicateHamming) {
      if (!best || distance < best.distance) {
        best = { distance, processingId: candidate.processingId, batchId: candidate.batchId };
      }
    }
  }
  return best;
}

/**
 * Determines whether the matched duplicate came from the SAME batch
 * upload as the current image, or from an earlier, separate submission.
 * This is purely a data-quality/context signal for the frontend and
 * explanation text - it does not change scoring on its own.
 */
function resolveScope(currentBatchId, matchedBatchId) {
  if (currentBatchId && matchedBatchId && currentBatchId === matchedBatchId) {
    return 'same_batch';
  }
  return 'previous_submission';
}

/**
 * Duplicate detection is an INTEGRITY / DATA-QUALITY signal, not an
 * automatic rejection. A duplicate of an otherwise good image should
 * typically land the recommendation in REVIEW (via the uniqueness
 * dimension of the scoring engine), never an automatic REJECT purely
 * because a duplicate exists - see services/analysis/scoring.js.
 */
export async function detectDuplicates({ processingId, sha256, perceptualHash, batchId }) {
  const exactMatch = await findExactDuplicate(sha256, processingId);
  if (exactMatch) {
    const duplicateScope = resolveScope(batchId, exactMatch.batchId);
    return {
      detected: true,
      duplicateDetected: true,
      type: 'exact',
      duplicateType: 'exact',
      matchedProcessingId: exactMatch.processingId,
      similarityScore: 1,
      duplicateScope,
      confidence: 0.99,
    };
  }

  const nearMatch = await findNearDuplicate(perceptualHash, processingId);
  if (nearMatch) {
    const duplicateScope = resolveScope(batchId, nearMatch.batchId);
    return {
      detected: true,
      duplicateDetected: true,
      type: 'near',
      duplicateType: 'near',
      matchedProcessingId: nearMatch.processingId,
      similarityScore: similarityFromHamming(nearMatch.distance),
      hammingDistance: nearMatch.distance,
      duplicateScope,
      confidence: 0.85,
    };
  }

  return {
    detected: false,
    duplicateDetected: false,
    type: null,
    duplicateType: null,
    similarityScore: null,
    duplicateScope: null,
    confidence: 0.9,
  };
}

export default detectDuplicates;
