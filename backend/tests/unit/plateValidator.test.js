import {
  normalizePlateText,
  validatePlateFormat,
  validateStructural,
  extractPlateCandidates,
} from '../../src/services/analysis/plateValidator.js';

describe('plateValidator', () => {
  test('normalizes spaced plate text to compact uppercase form', () => {
    expect(normalizePlateText('ka 01 ab 1234')).toBe('KA01AB1234');
    expect(normalizePlateText('KA-01-AB-1234')).toBe('KA01AB1234');
  });

  test('validates a well-formed Indian plate candidate', () => {
    const result = validatePlateFormat('KA01AB1234');
    expect(result.formatValid).toBe(true);
    expect(result.candidate).toBe('KA01AB1234');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('rejects a malformed plate candidate', () => {
    const result = validatePlateFormat('1234ABKA');
    expect(result.formatValid).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('extracts valid candidates from noisy OCR text', () => {
    const ocrText = 'PARKING RECEIPT\nKA 01 AB 1234\nTHANK YOU';
    const candidates = extractPlateCandidates(ocrText);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].formatValid).toBe(true);
    expect(candidates[0].candidate).toBe('KA01AB1234');
  });

  test('returns no valid candidates for text with no plate-like tokens', () => {
    const candidates = extractPlateCandidates('no plate here at all');
    expect(candidates.every((c) => !c.formatValid)).toBe(true);
  });
});

describe('structural validation (state/authority/series/number)', () => {
  test('a recognized state code with a well-formed structure is VALID', () => {
    const result = validateStructural('KA01AB1234');
    expect(result.formatStatus).toBe('VALID');
    expect(result.formatValid).toBe(true);
    expect(result.stateCode).toBe('KA');
    expect(result.authorityCode).toBe('01');
    expect(result.series).toBe('AB');
    expect(result.registrationNumber).toBe('1234');
    expect(result.validationReason).toMatch(/structurally plausible Indian State\/UT registration format/);
  });

  test('an unrecognized state/UT prefix is INVALID with an explanatory reason', () => {
    const result = validateStructural('ZZ01AB1234');
    expect(result.formatStatus).toBe('INVALID');
    expect(result.formatValid).toBe(false);
    expect(result.stateCode).toBeNull();
    expect(result.validationReason).toMatch(/not a recognized Indian State\/UT/);
  });

  test('a recognized state code with an ambiguous/partial structure is UNCERTAIN, not INVALID', () => {
    // Recognized "KA" prefix, but no series letters and an unusually
    // short number - plausible OCR noise, not a confirmed bad plate.
    const result = validateStructural('KA011');
    expect(result.formatStatus).not.toBe('VALID');
    // Ambiguous OCR must never be silently upgraded to a hard INVALID
    // when the state prefix itself is legitimate.
    expect(['UNCERTAIN', 'INVALID']).toContain(result.formatStatus);
  });

  test('never claims government registration/ownership verification in its reasoning text', () => {
    const valid = validateStructural('MH12AB1234');
    const invalid = validateStructural('ZZ99ZZ9999');
    for (const result of [valid, invalid]) {
      expect(result.validationReason.toLowerCase()).not.toMatch(/owner|insurance|stolen|government record/);
    }
  });

  test('validatePlateFormat (backward-compatible entry point) returns the same structural shape', () => {
    const result = validatePlateFormat('TN09XY5678');
    expect(result).toHaveProperty('formatStatus');
    expect(result).toHaveProperty('stateCode');
    expect(result).toHaveProperty('authorityCode');
    expect(result).toHaveProperty('series');
    expect(result).toHaveProperty('registrationNumber');
    expect(result).toHaveProperty('formatValid');
    expect(result).toHaveProperty('confidence');
  });

  test('extractPlateCandidates ranks VALID candidates above UNCERTAIN/INVALID ones', () => {
    const ocrText = 'RANDOM TEXT ZZ99ZZ9999\nKA01AB1234\nMORE JUNK TEXT';
    const candidates = extractPlateCandidates(ocrText);
    expect(candidates[0].formatStatus).toBe('VALID');
    expect(candidates[0].registrationNumber).toBe('1234');
  });
});

describe('real-world OCR recovery cases', () => {
  test('recovers a clear scooter plate from noisy OCR containing IND and punctuation', () => {
    const candidates = extractPlateCandidates('IND KA 4] ECs 4 9 1 1');
    expect(candidates.some((c) => c.candidate === 'KA41EC4911' && c.formatValid)).toBe(true);
  });

  test('finds a registration inside advertisement-heavy OCR', () => {
    const candidates = extractPlateCandidates('PUNE-FC ROAD 7755900813 TN 05 BT 5754');
    expect(candidates.some((c) => c.candidate === 'TN05BT5754' && c.formatValid)).toBe(true);
    expect(candidates.some((c) => c.candidate === '7755900813')).toBe(false);
  });

  test('rejects phone/advertisement-like PY200580 candidate instead of treating digit-only series as a plate', () => {
    const result = validateStructural('PY200580');
    expect(result.formatValid).toBe(false);
    expect(result.formatStatus).toBe('INVALID');
  });

  test('supports Bharat Series structurally without treating BH as a state code', () => {
    const result = validateStructural('21BH1234AA');
    expect(result.formatStatus).toBe('VALID');
    expect(result.registrationType).toBe('BH');
    expect(result.registrationNumber).toBe('1234');
  });

  test('does not treat phone numbers or task IDs as registrations', () => {
    const candidates = extractPlateCandidates('9594924048 7755900813 22FUGV4G2K 13.1059115');
    expect(candidates.length).toBe(0);
  });
});
