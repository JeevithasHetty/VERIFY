import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { extractPlateCandidates } from './plateValidator.js';
import { detectPlateRegions } from './plateRegions.js';

let workerPromise;

async function getWorker() {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
}

async function makeVariants(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 900;
  const variants = [];

  // Keep OCR deliberately bounded. Tesseract is the expensive stage; the old
  // implementation could generate 80-100 OCR passes for one photo. A field
  // verification request should normally finish in seconds, not minutes.
  const addCropVariants = async (name, left, top, cropWidth, cropHeight, focus = false, includeContrast = false, plateRegion = false) => {
    const safeLeft = Math.max(0, Math.min(Math.floor(left), width - 1));
    const safeTop = Math.max(0, Math.min(Math.floor(top), height - 1));
    const safeWidth = Math.max(1, Math.min(Math.floor(cropWidth), width - safeLeft));
    const safeHeight = Math.max(1, Math.min(Math.floor(cropHeight), height - safeTop));
    // Never send pathological micro-crops to Tesseract. They produce errors
    // such as `Image too small to scale!! (2x36)` and waste OCR time.
    if (safeWidth < 20 || safeHeight < 10 || safeWidth * safeHeight < 1000) return;
    const resizeWidth = Math.min(1600, Math.max(800, Math.round(safeWidth * (focus ? 3 : 1.35))));

    const base = sharp(buffer)
      .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
      .resize({ width: resizeWidth, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: focus ? 1.2 : 0.8 })
      .png();

    variants.push({ name: `${name}_base`, focus, plateRegion, buffer: await base.toBuffer() });

    if (focus && includeContrast) {
      variants.push({
        name: `${name}_contrast`,
        focus: true,
        plateRegion,
        buffer: await sharp(buffer)
          .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
          .resize({ width: resizeWidth, withoutEnlargement: false })
          .grayscale()
          .linear(1.35, -30)
          .sharpen({ sigma: 1.3 })
          .png()
          .toBuffer(),
      });
    }
  };

  // Only a few context passes are needed to catch text when the plate detector
  // misses. These are also useful for detecting phone numbers/task IDs without
  // allowing them to dominate plate candidates.
  await addCropVariants('full', 0, 0, width, height, false);
  await addCropVariants('lower', 0, height * 0.42, width, height * 0.58, false);
  await addCropVariants('lower_right_context', width * 0.35, height * 0.48, width * 0.65, height * 0.48, true, false);
  await addCropVariants('center_lower_context', width * 0.15, height * 0.42, width * 0.70, height * 0.48, true, false);

  // Content-based plate proposals. OCR only the strongest four proposals,
  // with two preprocessing variants each. This replaces the previous
  // combinatorial ratio/offset expansion that caused very long processing.
  const plateRegions = await detectPlateRegions(buffer);
  const selectedRegions = plateRegions.slice(0, 4);
  for (let i = 0; i < selectedRegions.length; i += 1) {
    const r = selectedRegions[i];
    const px = r.x * width;
    const py = r.y * height;
    const pw = r.width * width;
    const ph = r.height * height;

    // Add modest padding so characters touching the plate edge are retained.
    const padX = pw * 0.12;
    const padY = ph * 0.20;
    await addCropVariants(
      `plate_region_${i}`,
      Math.max(0, px - padX),
      Math.max(0, py - padY),
      Math.min(width - Math.max(0, px - padX), pw + padX * 2),
      Math.min(height - Math.max(0, py - padY), ph + padY * 2),
      true,
      true,
      true,
    );
  }

  return { variants, plateRegions };
}

function normalizeOcrText(text) {
  return (text || '').toUpperCase().replace(/\r/g, '').trim();
}

function candidateRank(candidate) {
  const status = candidate.formatStatus === 'VALID' ? 3 : candidate.formatStatus === 'UNCERTAIN' ? 2 : 1;
  const plateRegionBonus = candidate.plateRegion ? 700 : 0;
  const focusBonus = candidate.crossPass ? 260 : (candidate.plateFocused ? 180 : 0);
  const broadPenalty = (!candidate.plateFocused && !candidate.crossPass) ? 35 : 0;
  const consensusBonus = Math.min(60, Math.max(0, candidate.passCount - 1) * 15);
  return plateRegionBonus + focusBonus + status * 100 - broadPenalty + consensusBonus + Math.round((candidate.canonicality || 0) * 40) + Math.round((candidate.ocrConfidence || 0) * 30) - (candidate.correctionCount || 0) * 5;
}


function extractCrossPassCandidates(passResults) {
  const tokens = [];
  for (const pass of passResults) {
    const rawTokens = String(pass.text || '').toUpperCase().match(/[A-Z0-9]{1,12}/g) || [];
    for (const raw of rawTokens) tokens.push({ value: raw, pass: pass.source, focus: Boolean(pass.focus), plateRegion: Boolean(pass.plateRegion) });
  }

  const stateCodes = new Set(['AN','AP','AR','AS','BR','CH','CG','DD','DN','DH','DL','GA','GJ','HR','HP','JK','JH','KA','KL','LA','LD','MP','MH','MN','ML','MZ','NL','OD','OR','PY','PB','RJ','SK','TN','TS','TR','UP','UK','UA','WB']);
  const states = [...new Set(tokens.filter((t) => t.plateRegion).map((t) => t.value).filter((v) => stateCodes.has(v)))];
  const out = new Map();

  for (const state of states) {
    const related = tokens
      .filter((t) => t.value !== state && (t.plateRegion || t.focus) && /^[A-Z0-9]{1,6}$/.test(t.value))
      .slice(0, 24);

    // Candidate assembly is intentionally bounded. We only need to combine
    // the small fragments Tesseract commonly emits for a plate, e.g.
    // MH + 12K + R11Z5.
    const strings = new Set();
    for (const a of related) strings.add(`${state} ${a.value}`);
    for (const a of related) for (const b of related) {
      if (a === b) continue;
      const joined = `${state} ${a.value} ${b.value}`;
      if (joined.replace(/[^A-Z0-9]/g, '').length <= 11) strings.add(joined);
    }
    for (const source of [...strings].slice(0, 500)) {
      const candidates = extractPlateCandidates(source);
      for (const c of candidates) {
        if (!c.formatValid) continue;
        const focused = related.some((t) => t.focus && source.includes(t.value));
        const region = related.some((t) => t.plateRegion && source.includes(t.value));
        const candidate = { ...c, crossPass: true, plateFocused: focused, plateRegion: region, sourceText: source };
        const old = out.get(candidate.normalizedCandidate);
        if (!old || (candidate.correctionCount || 0) < (old.correctionCount || 0) || (candidate.canonicality || 0) > (old.canonicality || 0)) {
          out.set(candidate.normalizedCandidate, candidate);
        }
      }
    }
  }
  return [...out.values()];
}

export async function runOcr(buffer) {
  try {
    const worker = await getWorker();
    const variantBundle = await makeVariants(buffer);
    const variants = variantBundle.variants;
    const plateRegions = variantBundle.plateRegions;
    const passResults = [];
    const candidateMap = new Map();
    let earlyStop = false;

    for (const variant of variants) {
      // Plate crops are a single text line; context crops may contain sparse
      // text. Using the appropriate Tesseract page segmentation mode improves
      // both speed and precision compared with treating every image as a
      // generic document.
      const params = variant.focus
        ? { tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' }
        : { tessedit_pageseg_mode: '11' };
      await worker.setParameters(params);
      const { data } = await worker.recognize(variant.buffer);
      const text = normalizeOcrText(data.text);
      const confidence = Number(((data.confidence || 0) / 100).toFixed(2));
      const candidates = extractPlateCandidates(text).map((candidate) => ({
        ...candidate,
        ocrConfidence: confidence,
        ocrSource: variant.name,
        plateFocused: Boolean(variant.focus),
        plateRegion: Boolean(variant.plateRegion),
      }));

      passResults.push({
        source: variant.name,
        focus: Boolean(variant.focus),
        plateRegion: Boolean(variant.plateRegion),
        confidence,
        textLength: text.length,
        candidateCount: candidates.length,
        text,
      });

      for (const candidate of candidates) {
        const key = candidate.normalizedCandidate;
        const existing = candidateMap.get(key);
        if (!existing) {
          candidateMap.set(key, {
            ...candidate,
            passCount: 1,
            sourcePasses: [variant.name],
          });
        } else {
          existing.passCount += 1;
          existing.sourcePasses.push(variant.name);
          if (candidateRank(candidate) > candidateRank(existing)) {
            candidateMap.set(key, {
              ...candidate,
              passCount: existing.passCount,
              sourcePasses: existing.sourcePasses,
            });
          }
        }
      }

      // Fast path: once two focused OCR passes independently agree on the
      // same structurally valid registration with reasonable confidence,
      // there is little value in spending another several seconds on OCR.
      // We still run all deterministic non-OCR checks in the worker.
      if (variant.plateRegion) {
        const stable = [...candidateMap.values()].some((c) =>
          c.formatValid && c.passCount >= 2 && (c.ocrConfidence || 0) >= 0.72
        );
        if (stable) {
          earlyStop = true;
          break;
        }
      }
    }

    // Reconstruct a plate from complementary OCR fragments across passes.
    // This handles cases such as: one pass reads `MH`, another reads `12K`,
    // and another reads `R1145` -> MH12KR1145. It also prevents a single noisy
    // advertisement token such as PY200580 from automatically winning.
    for (const candidate of extractCrossPassCandidates(passResults)) {
      const key = candidate.normalizedCandidate;
      const existing = candidateMap.get(key);
      if (!existing || candidateRank(candidate) > candidateRank(existing)) {
        candidateMap.set(key, { ...candidate, passCount: existing?.passCount || 2, sourcePasses: existing?.sourcePasses || ['cross-pass'] });
      }
    }

    const candidates = [...candidateMap.values()].map((candidate) => {
      // Structural validity + OCR confidence + repeated agreement. This is
      // deliberately a confidence heuristic, not a calibrated probability.
      const structural = candidate.confidence || 0;
      const ocr = candidate.ocrConfidence || 0;
      const consensusBonus = Math.min(0.15, Math.max(0, candidate.passCount - 1) * 0.04);
      const correctionPenalty = Math.min(0.12, (candidate.correctionCount || 0) * 0.04);
      const focusBonus = candidate.plateFocused ? 0.12 : 0;
      const registrationConfidence = Math.max(
        0,
        Math.min(0.98, structural * 0.58 + ocr * 0.30 + consensusBonus + focusBonus - correctionPenalty)
      );
      return {
        ...candidate,
        registrationConfidence: Number(registrationConfidence.toFixed(2)),
      };
    }).sort((a, b) => {
      const rankDiff = candidateRank(b) - candidateRank(a);
      return rankDiff || (b.registrationConfidence || 0) - (a.registrationConfidence || 0);
    });

    const regionCandidates = candidates.filter((c) => c.plateRegion && c.formatValid);
    const focusedCandidates = candidates.filter((c) => c.plateFocused && c.formatValid);
    // If a plate-region proposal exists, never promote a registration found
    // only in advertisement/context OCR. A phone number, road name, task ID,
    // or unrelated state-code-like token must not become the registration.
    // If the actual plate OCR is uncertain, return REVIEW rather than a
    // confidently wrong registration number.
    const best = plateRegions.length > 0
      ? (regionCandidates[0] || null)
      : (focusedCandidates[0] || candidates[0] || null);
    const rawText = passResults
      .map((p) => p.text || '')
      .filter(Boolean)
      .join('\n--- OCR PASS ---\n');

    const documentConfidence = Math.max(0, ...passResults.map((p) => p.confidence));
    const registrationConfidence = best?.registrationConfidence || 0;

    return {
      rawText,
      normalizedText: candidates.map((c) => c.normalizedCandidate).join(' '),
      confidence: Number(documentConfidence.toFixed(2)),
      registrationConfidence,
      candidates,
      plateDetected: Boolean(best || plateRegions.length > 0),
      plateRegionCount: plateRegions.length,
      plateRegions,
      bestCandidate: best || null,
      passes: passResults,
      passCount: passResults.length,
      earlyStopped: earlyStop,
      failed: false,
    };
  } catch (err) {
    return {
      rawText: '',
      normalizedText: '',
      confidence: 0,
      registrationConfidence: 0,
      candidates: [],
      plateDetected: false,
      plateRegionCount: 0,
      plateRegions: [],
      bestCandidate: null,
      passes: [],
      passCount: 0,
      earlyStopped: false,
      failed: true,
      error: err.message,
    };
  }
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = undefined;
  }
}

export default { runOcr, terminateOcrWorker };
