import sharp from 'sharp';

// Fast, dependency-free plate proposal stage. This is deliberately a proposal
// detector, not a claim of ML object detection. It combines yellow-plate color,
// dark-character density, edge density and plate-like geometry. It also supports
// two-line/compact rear plates commonly seen on autos and motorcycles.
export async function detectPlateRegions(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: 480, withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    if (w < 80 || h < 60) return [];

    const yellow = new Uint8Array(w * h);
    const dark = new Uint8Array(w * h);
    const edge = new Uint8Array(w * h);

    const gray = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 3;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const p = y * w + x;
        gray[p] = lum;
        yellow[p] = (r > 105 && g > 80 && b < 155 && r > b * 1.15 && g > b * 1.06) ? 1 : 0;
        dark[p] = lum < 95 ? 1 : 0;
      }
    }

    // Local luminance transitions approximate character/plate edges without
    // requiring OpenCV. This is intentionally cheap because it runs per upload.
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const gx = Math.abs(gray[p + 1] - gray[p - 1]);
        const gy = Math.abs(gray[p + w] - gray[p - w]);
        edge[p] = (gx + gy) > 80 ? 1 : 0;
      }
    }

    function integral(mask) {
      const out = new Float64Array((w + 1) * (h + 1));
      for (let y = 1; y <= h; y += 1) {
        let row = 0;
        for (let x = 1; x <= w; x += 1) {
          row += mask[(y - 1) * w + (x - 1)];
          out[y * (w + 1) + x] = out[(y - 1) * (w + 1) + x] + row;
        }
      }
      return out;
    }

    const yi = integral(yellow);
    const di = integral(dark);
    const ei = integral(edge);
    const sum = (ii, x, y, ww, hh) => {
      const stride = w + 1;
      const x2 = x + ww;
      const y2 = y + hh;
      return ii[y2 * stride + x2] - ii[y * stride + x2] - ii[y2 * stride + x] + ii[y * stride + x];
    };

    const candidates = [];
    const heights = [28, 36, 45, 55, 70, 85];
    const ratios = [1.4, 1.7, 2.0, 2.4, 2.8, 3.4, 4.2, 5.0];
    const stride = 10;

    for (const hh of heights) {
      if (hh >= h) continue;
      for (const ratio of ratios) {
        const ww = Math.round(hh * ratio);
        if (ww < 50 || ww >= w) continue;
        for (let y = 0; y + hh <= h; y += stride) {
          for (let x = 0; x + ww <= w; x += stride) {
            const area = ww * hh;
            const yp = sum(yi, x, y, ww, hh) / area;
            if (yp < 0.30) continue;

            const dp = sum(di, x, y, ww, hh) / area;
            const ep = sum(ei, x, y, ww, hh) / area;
            const aspectScore = ratio >= 1.4 && ratio <= 5.0 ? 1 : 0;
            const sizeScore = Math.min(1, Math.max(0, ((ww / 80) + (hh / 45)) / 2));
            const lowerPrior = y / h > 0.45 ? 0.12 : 0;

            // A real plate tends to have a bright/yellow field plus concentrated
            // dark characters and edges. Large yellow body panels tend to have
            // high yellow but much less character/edge density.
            const score =
              yp * 0.42 +
              Math.min(dp, 0.45) * 0.34 +
              Math.min(ep, 0.30) * 0.18 +
              aspectScore * 0.04 +
              lowerPrior;

            if (score < 0.34) continue;
            candidates.push({ x, y, width: ww, height: hh, aspectRatio: ratio, score, yellowDensity: yp, darkDensity: dp, edgeDensity: ep });
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Non-max suppression: overlapping windows on the SAME plate are one
    // plate region. Spatially separated candidates can still represent two
    // visible plates and are retained.
    const selected = [];
    for (const c of candidates) {
      const duplicate = selected.some((s) => {
        const ax1 = Math.max(c.x, s.x);
        const ay1 = Math.max(c.y, s.y);
        const ax2 = Math.min(c.x + c.width, s.x + s.width);
        const ay2 = Math.min(c.y + c.height, s.y + s.height);
        const inter = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
        const union = c.width * c.height + s.width * s.height - inter;
        const iou = union > 0 ? inter / union : 0;
        const cx1 = c.x + c.width / 2;
        const cy1 = c.y + c.height / 2;
        const cx2 = s.x + s.width / 2;
        const cy2 = s.y + s.height / 2;
        const centerClose = Math.hypot(cx1 - cx2, cy1 - cy2) < Math.max(c.width, c.height, s.width, s.height) * 0.65;
        return iou > 0.28 || (centerClose && iou > 0.08);
      });
      if (duplicate) continue;

      selected.push({
        x: c.x / w,
        y: c.y / h,
        width: c.width / w,
        height: c.height / h,
        aspectRatio: Number(c.aspectRatio.toFixed(2)),
        color: 'yellow',
        likelihood: Number(Math.min(0.98, c.score).toFixed(2)),
        evidence: {
          yellowDensity: Number(c.yellowDensity.toFixed(2)),
          darkCharacterDensity: Number(c.darkDensity.toFixed(2)),
          edgeDensity: Number(c.edgeDensity.toFixed(2)),
        },
      });
      if (selected.length >= 5) break;
    }

    return selected;
  } catch {
    return [];
  }
}

export default detectPlateRegions;
