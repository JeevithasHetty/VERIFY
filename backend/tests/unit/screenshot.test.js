import { detectScreenshot } from '../../src/services/analysis/screenshot.js';

describe('screenshot heuristic', () => {
  test('a 16:9 image with UI-like OCR text and no camera metadata is flagged suspicious', () => {
    const result = detectScreenshot({
      aspectRatio: 16 / 9,
      ocrText: 'Settings Wifi Battery 92% 10:41 AM',
      metadata: { available: false },
    });
    expect(result.suspicious).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.signals).toEqual(expect.arrayContaining(['unusual_aspect_ratio', 'ui_like_text_detected']));
  });

  test('a normal photo aspect ratio with plain OCR text is not flagged', () => {
    const result = detectScreenshot({
      aspectRatio: 1.33,
      ocrText: 'KA01AB1234',
      metadata: { available: true, software: null },
    });
    expect(result.suspicious).toBe(false);
  });

  test('output never claims certainty - confidence is capped below 1', () => {
    const result = detectScreenshot({
      aspectRatio: 16 / 9,
      ocrText: 'settings wifi battery back cancel home menu search http://',
      metadata: { available: false, software: 'Screenshot Capture Tool' },
    });
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });
});
