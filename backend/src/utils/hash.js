import crypto from 'crypto';
import sharp from 'sharp';

/**
 * Computes the SHA-256 hex digest of a file buffer.
 * Used for EXACT duplicate detection - any byte-for-byte identical
 * upload will produce the same hash.
 */
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes a perceptual difference hash (dHash) for NEAR duplicate detection.
 *
 * Approach: shrink the image to a small grayscale grid (default 9x8),
 * then compare each pixel to its right-hand neighbour. Each comparison
 * yields one bit (1 if the pixel is brighter than its neighbour).
 * The resulting 64-bit string is resilient to resizing, recompression
 * and minor colour/quality changes because it captures gradient structure
 * rather than exact pixel values.
 */
export async function computeDHash(buffer) {
  const width = 9;
  const height = 8;

  const { data } = await sharp(buffer)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width - 1; col += 1) {
      const left = data[row * width + col];
      const right = data[row * width + col + 1];
      hash += left > right ? '1' : '0';
    }
  }
  return hash; // 64-character binary string
}

/**
 * Hamming distance between two equal-length binary strings.
 * Lower distance = more visually similar images.
 */
export function hammingDistance(hashA, hashB) {
  if (hashA.length !== hashB.length) {
    throw new Error('Hash length mismatch');
  }
  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] !== hashB[i]) distance += 1;
  }
  return distance;
}

/**
 * Converts a Hamming distance into a 0-1 similarity score for display.
 */
export function similarityFromHamming(distance, hashLength = 64) {
  return Number((1 - distance / hashLength).toFixed(4));
}

export default { sha256, computeDHash, hammingDistance, similarityFromHamming };
