import { env } from '../../config/env.js';
import { INDIAN_STATE_UT_CODES } from '../../config/indianStateCodes.js';

/**
 * Registration validation is STRUCTURAL ONLY. It does not query Parivahan/RTO
 * records and cannot prove ownership or legal registration.
 */
const legacyPlateRegex = new RegExp(env.plateRegex);
const STANDARD_REGEX = /^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{1,4})$/;
const BH_REGEX = /^(\d{2})BH(\d{4})([A-HJ-NP-Z]{1,2})$/;

// Common OCR confusions. They are only used in positions where a digit/letter
// is expected; we never globally replace characters in arbitrary text.
const TO_DIGIT = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', J: '1', T: '1',
  Z: '2', S: '5', G: '6', B: '8',
};
const TO_LETTER = {
  0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B',
};

export function normalizePlateText(raw = '') {
  const compact = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.startsWith('IND') && compact.length > 3 ? compact.slice(3) : compact;
}

function makeBase(rawCandidate, normalizedCandidate) {
  return {
    rawOcrText: rawCandidate,
    normalizedCandidate,
    candidate: normalizedCandidate,
    stateCode: null,
    authorityCode: null,
    series: null,
    registrationNumber: null,
    correctionApplied: false,
    correctionCount: 0,
  };
}

export function validateStructural(rawCandidate) {
  const normalizedCandidate = normalizePlateText(rawCandidate);
  const base = makeBase(rawCandidate, normalizedCandidate);

  const bh = normalizedCandidate.match(BH_REGEX);
  if (bh) {
    return {
      ...base,
      formatStatus: 'VALID',
      formatValid: true,
      confidence: 0.95,
      canonicality: 1,
      registrationType: 'BH',
      year: bh[1],
      stateCode: 'BH',
      authorityCode: null,
      series: bh[3],
      registrationNumber: bh[2],
      validationReason: 'Matches the Bharat Series structural format (YY BH #### XX).',
    };
  }

  const stateCode = normalizedCandidate.slice(0, 2);
  if (!INDIAN_STATE_UT_CODES.has(stateCode)) {
    return {
      ...base,
      formatStatus: 'INVALID',
      formatValid: false,
      confidence: 0.2,
      validationReason: `"${stateCode}" is not a recognized Indian State/UT registration prefix.`,
    };
  }

  const match = normalizedCandidate.match(STANDARD_REGEX);
  if (!match) {
    return {
      ...base,
      stateCode,
      formatStatus: legacyPlateRegex.test(normalizedCandidate) ? 'UNCERTAIN' : 'INVALID',
      formatValid: false,
      confidence: legacyPlateRegex.test(normalizedCandidate) ? 0.45 : 0.25,
      validationReason: 'A recognized State/UT prefix was found, but the remaining text does not cleanly match the standard authority/series/number structure.',
    };
  }

  const [, sc, authorityCode, series, registrationNumber] = match;
  let confidence = 0.55;
  if (registrationNumber.length === 4) confidence += 0.15;
  if (series.length >= 1) confidence += 0.15;
  if (authorityCode.length === 2) confidence += 0.05;
  confidence = Math.min(0.95, confidence);
  // Prefer the common contemporary shape 2-digit authority + 1-2 letter
  // series + 4-digit number when multiple OCR parses are possible. This is
  // a ranking preference, not a validity rule.
  const canonicality = (authorityCode.length === 2 ? 0.4 : 0) +
    (series.length >= 1 && series.length <= 2 ? 0.25 : 0) +
    (registrationNumber.length === 4 ? 0.35 : 0);

  return {
    ...base,
    stateCode: sc,
    authorityCode,
    series: series || null,
    registrationNumber,
    registrationType: 'STANDARD',
    formatStatus: confidence >= 0.75 ? 'VALID' : 'UNCERTAIN',
    formatValid: confidence >= 0.75,
    confidence,
    canonicality,
    validationReason: confidence >= 0.75
      ? 'Matches a structurally plausible Indian State/UT registration format.'
      : 'Structurally plausible, but the OCR candidate is too atypical for automatic confirmation.',
  };
}

export function validatePlateFormat(candidate) {
  return validateStructural(candidate);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

/** Generate conservative OCR corrections for a candidate window. */
function generateCorrectionVariants(window) {
  const variants = new Set([window]);
  const stateIndex = Math.min(...['AN','AP','AR','AS','BR','CH','CG','DD','DN','DH','DL','GA','GJ','HR','HP','JK','JH','KA','KL','LA','LD','MP','MH','MN','ML','MZ','NL','OD','OR','PY','PB','RJ','SK','TN','TS','TR','UP','UK','UA','WB']
    .map((s) => window.indexOf(s)).filter((i) => i >= 0));

  if (!Number.isFinite(stateIndex)) return [...variants];
  const s = window.slice(stateIndex);
  const state = s.slice(0, 2);
  if (!INDIAN_STATE_UT_CODES.has(state)) return [...variants];

  // Try one-character deletion. This fixes OCR artifacts such as:
  // "KA4JECS4911" -> "KA4JEC4911" when S is a stray OCR character.
  for (let i = 2; i < s.length; i += 1) {
    const ch = s[i];
    if ('OQDI LJTZSGB'.replace(/\s/g, '').includes(ch)) {
      variants.add(s.slice(0, i) + s.slice(i + 1));
    }
  }

  // A frequent OCR artifact on narrow plates is a digit becoming a punctuation
  // mark (for example the '1' in KA41... being read as ']'). After the state
  // prefix, if we have exactly one digit followed by a letter, try inserting
  // a single '1'. This is intentionally conservative; we do not invent an
  // arbitrary digit.
  for (const base of [...variants]) {
    if (/^[A-Z]{2}\d[A-Z]/.test(base)) {
      variants.add(`${base.slice(0, 3)}1${base.slice(3)}`);
    }
  }

  // Position-aware substitutions for authority/series/number candidates.
  const bases = [...variants];
  for (const base of bases) {
    for (let authLen = 1; authLen <= 2; authLen += 1) {
      for (let seriesLen = 0; seriesLen <= 3; seriesLen += 1) {
        const numberStart = 2 + authLen + seriesLen;
        if (numberStart >= base.length) continue;
        let out = base.slice(0, 2);
        let valid = true;
        for (let i = 2; i < base.length; i += 1) {
          const c = base[i];
          const inAuthority = i >= 2 && i < 2 + authLen;
          const inSeries = i >= 2 + authLen && i < numberStart;
          const inNumber = i >= numberStart;
          if (inAuthority || inNumber) {
            if (/\d/.test(c)) out += c;
            else if (TO_DIGIT[c]) out += TO_DIGIT[c];
            else { valid = false; break; }
          } else if (inSeries) {
            if (/[A-Z]/.test(c)) out += c;
            else if (TO_LETTER[c]) out += TO_LETTER[c];
            else { valid = false; break; }
          }
        }
        if (valid) variants.add(out);
      }
    }
  }
  return [...variants];
}

function candidateWindowsFromLine(line) {
  const normalized = normalizePlateText(line);
  const windows = new Set();
  const knownCodes = [...INDIAN_STATE_UT_CODES];

  for (const state of knownCodes) {
    let from = 0;
    while (from < normalized.length) {
      const idx = normalized.indexOf(state, from);
      if (idx < 0) break;
      for (let len = 8; len <= Math.min(11, normalized.length - idx); len += 1) {
        windows.add(normalized.slice(idx, idx + len));
      }
      from = idx + 1;
    }
  }

  // BH-series is not a State/UT prefix, so search for YYBH...
  const bhMatches = normalized.match(/\d{2}BH[A-Z0-9]{4,6}/g) || [];
  bhMatches.forEach((m) => windows.add(m.slice(0, 10)));
  return [...windows];
}

/**
 * Extract registration candidates from noisy OCR. Unlike the old version,
 * this never validates an entire OCR line as one token. It searches inside
 * noisy lines, so "IND KA 41 EC 4911" can still yield KA41EC4911 and phone
 * numbers/task IDs do not become registrations.
 */
export function extractPlateCandidates(ocrText) {
  const lines = String(ocrText || '').split(/\r?\n/);
  const results = new Map();

  for (const line of lines) {
    for (const window of candidateWindowsFromLine(line)) {
      for (const variant of generateCorrectionVariants(window)) {
        const result = validateStructural(variant);
        if (!result.formatValid && result.formatStatus !== 'UNCERTAIN') continue;
        const editCount = [...window].filter((c, i) => c !== variant[i]).length + Math.abs(window.length - variant.length);
        result.sourceText = line;
        result.correctionApplied = variant !== window;
        result.correctionCount = editCount;
        result.ocrCandidateScore = Math.max(0.1, result.confidence - editCount * 0.05);

        const key = result.normalizedCandidate;
        const old = results.get(key);
        if (!old || result.ocrCandidateScore > old.ocrCandidateScore) results.set(key, result);
      }
    }
  }

  return [...results.values()].sort((a, b) =>
    (b.formatValid - a.formatValid) ||
    ((b.canonicality || 0) - (a.canonicality || 0)) ||
    (b.ocrCandidateScore - a.ocrCandidateScore) ||
    (b.confidence - a.confidence)
  );
}

export default { normalizePlateText, validatePlateFormat, validateStructural, extractPlateCandidates };
