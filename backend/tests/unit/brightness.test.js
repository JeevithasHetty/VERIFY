import sharp from 'sharp';
import { analyzeBrightness, analyzeContrast } from '../../src/services/analysis/brightness.js';

async function solidImage(gray) {
  return sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: gray, g: gray, b: gray } },
  })
    .jpeg()
    .toBuffer();
}

describe('brightness classification', () => {
  test('a very dark image is classified LOW_LIGHT', async () => {
    const buf = await solidImage(10);
    const result = await analyzeBrightness(buf);
    expect(result.classification).toBe('LOW_LIGHT');
  });

  test('a mid-gray image is classified NORMAL', async () => {
    const buf = await solidImage(128);
    const result = await analyzeBrightness(buf);
    expect(result.classification).toBe('NORMAL');
  });

  test('a near-white image is classified OVEREXPOSED', async () => {
    const buf = await solidImage(250);
    const result = await analyzeBrightness(buf);
    expect(result.classification).toBe('OVEREXPOSED');
  });

  test('a solid-color image has near-zero contrast (flagged low)', async () => {
    const buf = await solidImage(128);
    const result = await analyzeContrast(buf);
    expect(result.low).toBe(true);
    expect(result.stdDev).toBeLessThan(result.threshold);
  });
});
