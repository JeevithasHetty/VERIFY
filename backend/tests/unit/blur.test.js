import sharp from 'sharp';
import { detectBlur } from '../../src/services/analysis/blur.js';

async function makeSharpImage() {
  // A checkerboard-like pattern has strong edges -> should NOT be flagged as blurry.
  const svg = `<svg width="300" height="300">
    ${Array.from({ length: 6 })
      .map((_, row) =>
        Array.from({ length: 6 })
          .map(
            (__, col) =>
              `<rect x="${col * 50}" y="${row * 50}" width="50" height="50" fill="${
                (row + col) % 2 === 0 ? '#000000' : '#ffffff'
              }"/>`
          )
          .join('')
      )
      .join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function makeBlurryImage() {
  const sharpBuf = await makeSharpImage();
  return sharp(sharpBuf).blur(15).jpeg().toBuffer();
}

describe('blur detection', () => {
  test('a high-contrast checkerboard image is not flagged as blurry', async () => {
    const buf = await makeSharpImage();
    const result = await detectBlur(buf);
    expect(result.detected).toBe(false);
    expect(result.score).toBeGreaterThan(result.threshold);
  });

  test('a heavily blurred version of the same image is flagged as blurry', async () => {
    const buf = await makeBlurryImage();
    const result = await detectBlur(buf);
    expect(result.detected).toBe(true);
    expect(result.score).toBeLessThan(result.threshold);
  });

  test('blurry image has strictly lower edge-variance score than sharp image', async () => {
    const sharpBuf = await makeSharpImage();
    const blurryBuf = await makeBlurryImage();
    const sharpResult = await detectBlur(sharpBuf);
    const blurryResult = await detectBlur(blurryBuf);
    expect(blurryResult.score).toBeLessThan(sharpResult.score);
  });
});
