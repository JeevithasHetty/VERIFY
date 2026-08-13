import sharp from 'sharp';
import { sha256, computeDHash, hammingDistance, similarityFromHamming } from '../../src/utils/hash.js';

async function makeTestImage({ width = 200, height = 150, color = { r: 200, g: 100, b: 50 } } = {}) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

describe('hash utilities', () => {
  test('sha256 is deterministic for identical buffers', async () => {
    const buf = await makeTestImage();
    expect(sha256(buf)).toBe(sha256(buf));
  });

  test('sha256 differs for different buffers', async () => {
    const bufA = await makeTestImage({ color: { r: 200, g: 100, b: 50 } });
    const bufB = await makeTestImage({ color: { r: 10, g: 10, b: 10 } });
    expect(sha256(bufA)).not.toBe(sha256(bufB));
  });

  test('dHash of an image resized/recompressed stays visually similar (low Hamming distance)', async () => {
    const original = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 120, g: 180, b: 90 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const recompressed = await sharp(original).resize(200, 150).jpeg({ quality: 60 }).toBuffer();

    const hashA = await computeDHash(original);
    const hashB = await computeDHash(recompressed);

    expect(hashA).toHaveLength(64);
    expect(hashB).toHaveLength(64);

    const distance = hammingDistance(hashA, hashB);
    expect(distance).toBeLessThan(10);

    const similarity = similarityFromHamming(distance);
    expect(similarity).toBeGreaterThan(0.8);
  });

  test('dHash of visually distinct images has a larger Hamming distance', async () => {
    const imageA = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const imageB = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="200" height="150"><rect x="0" y="0" width="100" height="150" fill="yellow"/></svg>'
          ),
        },
      ])
      .jpeg()
      .toBuffer();

    const hashA = await computeDHash(imageA);
    const hashB = await computeDHash(imageB);
    const distance = hammingDistance(hashA, hashB);
    expect(distance).toBeGreaterThan(0);
  });

  test('hammingDistance throws on mismatched lengths', () => {
    expect(() => hammingDistance('1010', '101')).toThrow();
  });
});
