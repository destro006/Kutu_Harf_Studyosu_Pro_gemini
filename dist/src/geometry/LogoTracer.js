import THREE, { ShapePath, ShapeHelpers, normalizeParts } from '../vendor/three.js';

/**
 * Logo Tracing & SVG Vector Import Engine
 * Preserves and upgrades the reference marching-squares + Douglas-Peucker tracer
 * with adjustable threshold/tolerance, background removal, smoothing, and multi-component support.
 */

const restoredShapes=new WeakMap();
// JSON/IndexedDB store a Three.js Shape's serialized curves, not its methods.
// Resolve those curves consistently in 2D, 3D and CAD conversions.
export function restoreLogoShape(value){
  if(value?.getPoints)return value;
  if(!value||typeof value!=='object')throw Error('Geçersiz logo konturu.');
  let shape=restoredShapes.get(value);
  if(!shape){shape=new THREE.Shape().fromJSON(value);restoredShapes.set(value,shape);}
  return shape;
}
export function parseSvgLogo(svgText) {
  return ShapeHelpers.parseSvgLogo(svgText);
}

/**
 * Extracts explicit physical height (mm) from an SVG root element if specified in mm/cm/m/in/pt/pc.
 */
export function extractSvgPhysicalHeightMm(svgText) {
  if (typeof svgText !== 'string') return null;
  const openTag = svgText.match(/<(?:\w+:)?svg\b[^>]*>/i)?.[0];
  if (!openTag) return null;
  const hMatch = openTag.match(/\bheight\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const raw = (hMatch?.[1] ?? hMatch?.[2] ?? '').trim();
  const m = raw.match(/^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(mm|cm|m|in|pt|pc)$/i);
  if (!m) return null;
  const k = { mm: 1, cm: 10, m: 1000, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
  const val = Number(m[1]) * k[m[2].toLowerCase()];
  return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
}

/**
 * Converts parsed CAD/Vector import items (CDR, AI, EPS, PDF, DXF, DWG, SVG, etc.)
 * into normalized 3D LogoData, preserving relative spacing, holes, layer hierarchy,
 * colors, Y-axis orientation, and true millimeter dimensions.
 */
export function importedVectorToLogoData(imported) {
  const items = Array.isArray(imported?.items) ? imported.items.filter(it => it?.outer?.length >= 3) : [];
  if (!items.length) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const absItems = items.map(item => {
    const ox = Number(item.sourceOriginMm?.x) || 0;
    const oy = Number(item.sourceOriginMm?.y) || 0;
    const outer = item.outer.map(p => {
      const x = p.x + ox, y = p.y + oy;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return { x, y };
    });
    const holes = (item.holes || []).filter(h => h?.length >= 3).map(h =>
      h.map(p => ({ x: p.x + ox, y: p.y + oy }))
    );
    return { item, outer, holes };
  });

  const rawW = maxX - minX;
  const rawH = maxY - minY;
  if (!(rawW > 1e-4 && rawH > 1e-4)) return null;

  const fmt = String(imported.format || '').toLowerCase();
  // SVG/CDR/WMF/EMF coordinates are Y-down; AI/EPS/PDF/DXF/DWG/HPGL are Y-up.
  const flipY = ['svg', 'svgz', 'cdr', 'wmf', 'emf'].includes(fmt);

  const mapPt = p => new THREE.Vector2(
    (p.x - minX) / rawH,
    flipY ? (maxY - p.y) / rawH : (p.y - minY) / rawH
  );

  const parts = absItems.map(({ item, outer, holes }, idx) => {
    const shape = new THREE.Shape(outer.map(mapPt));
    shape.holes = holes.map(h => new THREE.Path(h.map(mapPt)));
    return {
      shapes: [shape],
      color: item.color || '#888888',
      partName: item.layerName ? `${item.layerName} · Parça ${idx + 1}` : (item.label || `Parça ${idx + 1}`),
      layerName: item.layerName || null,
    };
  });

  return {
    parts,
    aspect: rawW / rawH,
    physicalWidthMm: Math.round(rawW * 100) / 100,
    physicalHeightMm: Math.round(rawH * 100) / 100,
    sourceFormat: fmt || 'vector',
    warnings: Array.isArray(imported.warnings) ? imported.warnings : [],
  };
}

/**
 * Quantitative raster image quality check for auto-routing low-quality uploads to Trace Studio.
 * Pure & DOM-free so both browser and Node regression tests can call it directly.
 */
export function analyzeRasterLogoQuality(rgba, width, height, meta = {}) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const total = w * h;
  const natW = Math.max(w, Number(meta.naturalWidth) || w);
  const natH = Math.max(h, Number(meta.naturalHeight) || h);
  const minSide = Math.min(natW, natH);
  const maxSide = Math.max(natW, natH);
  const isJpeg = /jpe?g/i.test(meta.mimeType || '') || /\.jpe?g$/i.test(meta.fileName || '');

  let transparentCount = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 128) transparentCount++;
  }
  const hasNativeAlpha = transparentCount > total * 0.02;

  // Border homogeneity check
  const bins = new Map();
  let borderSamples = 0;
  const sampleBorder = (x, y) => {
    const idx = (y * w + x) * 4;
    if (hasNativeAlpha && rgba[idx + 3] < 128) return;
    borderSamples++;
    const key = ((rgba[idx] >> 4) << 8) | ((rgba[idx + 1] >> 4) << 4) | (rgba[idx + 2] >> 4);
    const e = bins.get(key) || { c: 0, r: 0, g: 0, b: 0 };
    e.c++; e.r += rgba[idx]; e.g += rgba[idx + 1]; e.b += rgba[idx + 2];
    bins.set(key, e);
  };
  for (let x = 0; x < w; x++) { sampleBorder(x, 0); sampleBorder(x, h - 1); }
  for (let y = 0; y < h; y++) { sampleBorder(0, y); sampleBorder(w - 1, y); }

  let best = null;
  for (const e of bins.values()) { if (!best || e.c > best.c) best = e; }
  let borderStd = 0;
  if (best && borderSamples > 0) {
    const br = best.r / best.c, bg = best.g / best.c, bb = best.b / best.c;
    let sumSq = 0;
    const addSq = (x, y) => {
      const idx = (y * w + x) * 4;
      if (hasNativeAlpha && rgba[idx + 3] < 128) return;
      const dr = rgba[idx] - br, dg = rgba[idx + 1] - bg, db = rgba[idx + 2] - bb;
      sumSq += dr * dr + dg * dg + db * db;
    };
    for (let x = 0; x < w; x++) { addSq(x, 0); addSq(x, h - 1); }
    for (let y = 0; y < h; y++) { addSq(0, y); addSq(w - 1, y); }
    borderStd = Math.sqrt(sumSq / (borderSamples * 3));
  }

  // Distinct quantized color bins + luminance field
  const colorBins = new Int32Array(4096);
  const lum = new Float32Array(total);
  let opaqueCount = 0;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const a = rgba[idx + 3];
    if (a >= 128) {
      opaqueCount++;
      const k = ((rgba[idx] >> 4) << 8) | ((rgba[idx + 1] >> 4) << 4) | (rgba[idx + 2] >> 4);
      colorBins[k]++;
    }
    lum[i] = hasNativeAlpha
      ? a
      : (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]);
  }
  const minBinCount = Math.max(4, opaqueCount * 0.0015);
  let colorCount = 0;
  for (let i = 0; i < 4096; i++) if (colorBins[i] >= minBinCount) colorCount++;

  // Sobel edge sharpness & flat-region high-frequency noise
  let edgeCount = 0, strongEdgeCount = 0;
  let lowGradCount = 0, lowGradLapSum = 0;
  if (w >= 4 && h >= 4) {
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const gx = -lum[i - w - 1] + lum[i - w + 1] - 2 * lum[i - 1] + 2 * lum[i + 1] - lum[i + w - 1] + lum[i + w + 1];
        const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
        const g = Math.hypot(gx, gy) * 0.25;
        if (g > 18) {
          edgeCount++;
          if (g > 88) strongEdgeCount++;
        } else {
          lowGradCount++;
          const avg4 = (lum[i - 1] + lum[i + 1] + lum[i - w] + lum[i + w]) * 0.25;
          lowGradLapSum += Math.abs(lum[i] - avg4);
        }
      }
    }
  }
  const edgeSharpness = edgeCount > 12 ? strongEdgeCount / edgeCount : 1;
  const bgNoise = lowGradCount > 0 ? lowGradLapSum / lowGradCount : 0;

  // 8x8 JPEG blockiness in low-contrast regions (ignoring strong vector edges)
  let bSum = 0, bCnt = 0, iSum = 0, iCnt = 0;
  if (w >= 32 && h >= 32) {
    for (let y = 1; y < h; y++) {
      const isBndY = (y & 7) === 0;
      const row = y * w;
      for (let x = 1; x < w; x++) {
        const dx = Math.abs(lum[row + x] - lum[row + x - 1]);
        if (dx < 28) {
          if ((x & 7) === 0) { bSum += dx; bCnt++; } else { iSum += dx; iCnt++; }
        }
        const dy = Math.abs(lum[row + x] - lum[row - w + x]);
        if (dy < 28) {
          if (isBndY) { bSum += dy; bCnt++; } else { iSum += dy; iCnt++; }
        }
      }
    }
  }
  const blockiness = (bCnt > 20 && iCnt > 20) ? ((bSum / bCnt) / Math.max(0.05, iSum / iCnt)) : 1.0;

  let score = 100;
  const reasons = [];
  if (minSide < 220 || maxSide < 420) {
    score -= 35;
    reasons.push(`Düşük çözünürlük (${natW}×${natH} px)`);
  }
  if (!hasNativeAlpha && borderStd > 24) {
    score -= 30;
    reasons.push('Karmaşık veya dokulu arka plan');
  }
  if (colorCount > 18) {
    score -= 25;
    reasons.push(`Çok renkli / fotoğraf benzeri görsel (${colorCount} baskın ton)`);
  }
  if (edgeSharpness < 0.30) {
    score -= 28;
    reasons.push('Bulanık veya yumuşak kenarlar');
  }
  const hasJpegNoise = isJpeg && (blockiness > 1.22 || bgNoise > 3.2);
  if (hasJpegNoise) {
    score -= 25;
    reasons.push('JPEG sıkıştırma gürültüsü');
  }
  if (isJpeg && maxSide < 700) {
    score -= hasJpegNoise ? 12 : 18;
    if (!hasJpegNoise) reasons.push('Düşük kaliteli JPEG formatı');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const isLowQuality = score < 70 || reasons.length >= 2 || minSide < 200 || maxSide < 380;

  let recommendedPreset = 'art_vector';
  if ((minSide < 220 || maxSide < 380) && colorCount <= 8 && borderStd <= 20) {
    recommendedPreset = 'pixel_line';
  } else if (borderStd > 24 || colorCount > 18) {
    recommendedPreset = 'photo_text';
  } else if (hasJpegNoise || bgNoise > 4.5) {
    recommendedPreset = 'photo_3d_nr';
  }

  return {
    score,
    isLowQuality,
    reasons,
    recommendedPreset,
    metrics: {
      naturalWidth: natW,
      naturalHeight: natH,
      borderStd: Math.round(borderStd * 10) / 10,
      colorCount,
      edgeSharpness: Math.round(edgeSharpness * 100) / 100,
      bgNoise: Math.round(bgNoise * 100) / 100,
      blockiness: Math.round(blockiness * 100) / 100,
    },
  };
}

/**
 * Browser helper: decodes a raster file/object-URL and evaluates its vectorization quality.
 */
export async function evaluateRasterFileQuality(file, srcUrl) {
  const img = await loadImage(srcUrl);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(1, img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return analyzeRasterLogoQuality(data, w, h, {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    fileName: file?.name || '',
    mimeType: file?.type || '',
  });
}

/**
 * Traces a raster logo (PNG, JPG, WEBP, etc.) into normalized vector shapes with holes and components.
 */
export async function traceRasterLogo(srcUrl, options = {}) {
  const {
    traceSide = 2000,
    maxUpscale = 4,
    threshold = 0.5,
    bgTolerance = 45,
    removeBackground = true,
  } = options;

  const img = await loadImage(srcUrl);
  // Trace on a high-resolution, bilinear-resampled grid: small logos are upscaled so the
  // iso-contour follows the anti-aliased edge with sub-pixel accuracy instead of pixel steps.
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(maxUpscale, traceSide / longSide);
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const mask = buildForegroundMask(data, w, h, bgTolerance, removeBackground);
  const cleaned = traceMaskToRings(mask, w, h, { ...options, threshold, pixelScale: scale });

  if (!cleaned.length) return null;

  const sp = new ShapePath();
  for (const ring of cleaned) {
    sp.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) sp.lineTo(ring[i][0], ring[i][1]);
    sp.lineTo(ring[0][0], ring[0][1]);
  }
  sp.userData = { style: { fillRule: 'evenodd' } };
  const shapes = sp.toShapes();
  if (!shapes.length) return null;

  // Group into independent shape parts so individual components can be inspected/selected
  const parts = shapes.map((s, idx) => ({
    shapes: [s],
    color: '#888888',
    partName: `Parça ${idx + 1}`,
  }));
  return normalizeParts(parts);
}

/**
 * Generates a transparent-background preview PNG data URL for raster logos after background removal.
 */
export async function generateCutoutPreview(srcUrl, bgTolerance = 45) {
  const img = await loadImage(srcUrl);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const mask = buildForegroundMask(imgData.data, w, h, bgTolerance, true);
  for (let i = 0; i < w * h; i++) {
    imgData.data[i * 4 + 3] = Math.round(mask[i] * imgData.data[i * 4 + 3]);
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function buildForegroundMask(data, w, h, bgTolerance = 45, removeBg = true) {
  const total = w * h;
  const mask = new Float32Array(total);
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) transparentCount++;
  }
  if (transparentCount > total * 0.02) {
    for (let i = 0; i < total; i++) mask[i] = data[i * 4 + 3] / 255;
    return mask;
  }
  if (!removeBg) {
    mask.fill(1);
    return mask;
  }

  // Sample border pixels to detect dominant background color
  const bins = new Map();
  const sample = (x, y) => {
    const idx = (y * w + x) * 4;
    const key = ((data[idx] >> 4) << 8) | ((data[idx + 1] >> 4) << 4) | (data[idx + 2] >> 4);
    const entry = bins.get(key) || { c: 0, r: 0, g: 0, b: 0 };
    entry.c++;
    entry.r += data[idx];
    entry.g += data[idx + 1];
    entry.b += data[idx + 2];
    bins.set(key, entry);
  };
  for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }

  let best = null;
  for (const e of bins.values()) {
    if (!best || e.c > best.c) best = e;
  }
  const br = best.r / best.c;
  const bg = best.g / best.c;
  const bb = best.b / best.c;

  const low = Math.max(8, bgTolerance * 0.6);
  const high = Math.max(low + 10, bgTolerance * 1.6);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const dist = Math.hypot(data[idx] - br, data[idx + 1] - bg, data[idx + 2] - bb);
    mask[i] = Math.min(1, Math.max(0, (dist - low) / (high - low)));
  }
  return mask;
}

function marchingSquares(mask, w, h, level) {
  const gw = w + 2, gh = h + 2;
  const sample = (x, y) => (x < 1 || y < 1 || x > w || y > h ? 0 : mask[(y - 1) * w + (x - 1)]);
  const verts = new Map();
  const adj = new Map();
  const keyOf = (x, y) => x * 131072 + y;

  const getVert = (gx, gy) => {
    const k = keyOf(gx, gy);
    if (!verts.has(k)) {
      let x0, y0, x1, y1;
      if (gx % 2) { x0 = (gx - 1) / 2; y0 = gy / 2; x1 = x0 + 1; y1 = y0; }
      else { x0 = gx / 2; y0 = (gy - 1) / 2; x1 = x0; y1 = y0 + 1; }
      const v0 = sample(x0, y0);
      const v1 = sample(x1, y1);
      const t = v0 === v1 ? 0.5 : Math.min(1, Math.max(0, (level - v0) / (v1 - v0)));
      verts.set(k, [x0 + (x1 - x0) * t - 1, y0 + (y1 - y0) * t - 1]);
    }
    return k;
  };

  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };

  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const a = sample(x, y) >= level;
      const b = sample(x + 1, y) >= level;
      const c = sample(x + 1, y + 1) >= level;
      const d = sample(x, y + 1) >= level;
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
      if (code === 0 || code === 15) continue;

      const top = () => getVert(2 * x + 1, 2 * y);
      const right = () => getVert(2 * x + 2, 2 * y + 1);
      const bottom = () => getVert(2 * x + 1, 2 * y + 2);
      const left = () => getVert(2 * x, 2 * y + 1);

      switch (code) {
        case 1: case 14: addEdge(left(), bottom()); break;
        case 2: case 13: addEdge(bottom(), right()); break;
        case 3: case 12: addEdge(left(), right()); break;
        case 4: case 11: addEdge(top(), right()); break;
        case 6: case 9: addEdge(top(), bottom()); break;
        case 7: case 8: addEdge(left(), top()); break;
        case 5: addEdge(left(), top()); addEdge(bottom(), right()); break;
        case 10: addEdge(left(), bottom()); addEdge(top(), right()); break;
      }
    }
  }

  const visited = new Set();
  const rings = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const ring = [];
    let prev = null;
    let curr = start;
    while (curr != null && !visited.has(curr)) {
      visited.add(curr);
      ring.push(verts.get(curr));
      const nexts = adj.get(curr);
      const nxt = nexts[0] !== prev ? nexts[0] : nexts[1];
      prev = curr;
      curr = nxt;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function ringSignedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a * 0.5;
}

function simplifyClosed(ring, tol) {
  if (ring.length < 8) return ring;
  let farIdx = 0;
  let maxD2 = -1;
  for (let i = 1; i < ring.length; i++) {
    const d2 = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d2 > maxD2) { maxD2 = d2; farIdx = i; }
  }
  const p1 = rdp(ring.slice(0, farIdx + 1), tol);
  const p2 = rdp(ring.slice(farIdx).concat([ring[0]]), tol);
  return p1.slice(0, -1).concat(p2.slice(0, -1));
}

function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let bestIdx = -1, bestD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > bestD) { bestD = d; bestIdx = i; }
    }
    if (bestIdx > 0) {
      keep[bestIdx] = 1;
      stack.push([s, bestIdx], [bestIdx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Pure (DOM-free) tracing core: soft foreground mask -> clean closed rings.
 * pixelScale = trace pixels per source-image pixel (used to size the smoothing to the
 * original pixel grid so stair-steps are removed regardless of upscaling).
 */
export function traceMaskToRings(mask, w, h, options = {}) {
  const {
    threshold = 0.5,
    smoothPasses = 1,
    pixelScale = 1,
    simplifyTol = 0.08 * Math.max(1, pixelScale),
  } = options;
  const s = Math.max(1, pixelScale);
  const field = gaussianBlur(mask, w, h, Math.max(0.6, 0.55 * s));
  const contours = marchingSquares(field, w, h, threshold);
  const minArea = w * h * 0.00015;
  const passes = Math.max(0, Math.min(4, Number(smoothPasses) || 0));
  const out = [];
  for (const c of contours) {
    if (c.length < 3 || Math.abs(ringSignedArea(c)) < minArea) continue;
    const ring = refineContour(c, { pixelScale: s, smoothPasses: passes, simplifyTol });
    if (ring.length >= 3 && Math.abs(ringSignedArea(ring)) >= minArea) out.push(ring);
  }
  return out;
}

function gaussianBlur(src, w, h, sigma) {
  if (!(sigma > 0.3)) return src;
  const r = Math.ceil(sigma * 2.5);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  // Zero padding outside the image (background) so edges touching the border still close.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) { const xx = x + j; if (xx >= 0 && xx < w) acc += src[row + xx] * k[j + r]; }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) { const yy = y + j; if (yy >= 0 && yy < h) acc += tmp[yy * w + x] * k[j + r]; }
      dst[y * w + x] = acc;
    }
  }
  return dst;
}

function resampleClosed(ring, step) {
  const n = ring.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = cum[n];
  const count = Math.max(12, Math.round(L / step));
  const ds = L / count;
  const out = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const t = i * ds;
    while (seg < n - 1 && cum[seg + 1] < t) seg++;
    const a = ring[seg], b = ring[(seg + 1) % n];
    const len = cum[seg + 1] - cum[seg] || 1;
    const u = (t - cum[seg]) / len;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return { pts: out, ds };
}

function turnAngle(p, i, k) {
  const n = p.length;
  const a = p[(i - k + n) % n], b = p[i], c = p[(i + k) % n];
  const v1x = b[0] - a[0], v1y = b[1] - a[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
  const l = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / l)));
}

function lineIntersect(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(d) < 1e-9) return null;
  const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
  return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
}

// Gaussian smoothing of an open polyline with fixed ends (point-reflection padding keeps
// lines that run straight into a corner perfectly straight).
function smoothOpen(pts, sigmaN) {
  const n = pts.length;
  if (n < 5 || sigmaN < 0.3) return pts;
  const r = Math.min(n - 2, Math.ceil(sigmaN * 2.5));
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigmaN * sigmaN)); k.push(v); sum += v; }
  const p0 = pts[0], pn = pts[n - 1];
  const at = j => {
    if (j < 0) { const q = pts[Math.min(n - 1, -j)]; return [2 * p0[0] - q[0], 2 * p0[1] - q[1]]; }
    if (j >= n) { const q = pts[Math.max(0, 2 * (n - 1) - j)]; return [2 * pn[0] - q[0], 2 * pn[1] - q[1]]; }
    return pts[j];
  };
  const out = [p0];
  for (let i = 1; i < n - 1; i++) {
    let x = 0, y = 0;
    for (let j = -r; j <= r; j++) { const q = at(i + j); x += q[0] * k[j + r]; y += q[1] * k[j + r]; }
    out.push([x / sum, y / sum]);
  }
  out.push(pn);
  return out;
}

function smoothClosed(pts, sigmaN) {
  const n = pts.length;
  if (n < 5 || sigmaN < 0.3) return pts;
  const r = Math.min(Math.floor((n - 1) / 2), Math.ceil(sigmaN * 2.5));
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigmaN * sigmaN)); k.push(v); sum += v; }
  const out = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let j = -r; j <= r; j++) { const q = pts[(i + j + n) % n]; x += q[0] * k[j + r]; y += q[1] * k[j + r]; }
    out.push([x / sum, y / sum]);
  }
  return out;
}

/**
 * Corner-aware contour refinement: uniform resampling, corner detection, sharp corner
 * reconstruction, Gaussian smoothing of the spans between corners and final RDP.
 * Straight edges become exact straight lines, curves become smooth, corners stay crisp.
 */
export function refineContour(ring, { pixelScale = 1, smoothPasses = 1, simplifyTol = 0.18 } = {}) {
  const s = Math.max(1, pixelScale);
  const { pts, ds } = resampleClosed(ring, 0.5 * s);
  const n = pts.length;
  const kWin = Math.max(2, Math.round((3 * s) / ds));
  if (n < kWin * 4) return simplifyClosed(pts, simplifyTol);

  // 1. corner candidates: large turning angle over a ~3 source-pixel window, non-max suppressed
  const ang = new Float32Array(n);
  for (let i = 0; i < n; i++) ang[i] = turnAngle(pts, i, kWin);
  const CORNER = 0.8; // ~46 degrees
  const corners = [];
  for (let i = 0; i < n; i++) {
    if (ang[i] < CORNER) continue;
    let isMax = true;
    for (let j = -kWin; j <= kWin && isMax; j++) {
      if (!j) continue;
      const v = ang[(i + j + n) % n];
      if (v > ang[i] || (v === ang[i] && j < 0)) isMax = false;
    }
    if (isMax) corners.push(i);
  }

  const sigmaN = ((1.7 + 0.6 * smoothPasses) * s) / ds;
  if (!corners.length) return simplifyClosed(smoothClosed(pts, sigmaN), simplifyTol);

  // 2. smooth spans between consecutive corners (corner points fixed)
  const spans = [];
  for (let c = 0; c < corners.length; c++) {
    const a = corners[c], b = corners[(c + 1) % corners.length];
    const len = ((b - a + n) % n) || n;
    const span = [];
    for (let j = 0; j <= len; j++) span.push(pts[(a + j) % n]);
    spans.push(smoothOpen(span, sigmaN));
  }

  // 3. rebuild sharp corners: intersect least-squares tangent lines of adjacent spans,
  //    fitted away from the corner (blur/marching squares chamfer the true corner).
  const m = kWin;
  const cornerPts = corners.map((ci, c) => {
    const prev = spans[(c - 1 + spans.length) % spans.length];
    const next = spans[c];
    if (prev.length < 4 * m + 2 || next.length < 4 * m + 2) return pts[ci];
    const lp = fitLine(prev.slice(prev.length - 1 - 3 * m, prev.length - m));
    const ln = fitLine(next.slice(m, 3 * m + 1));
    if (!lp || !ln) return pts[ci];
    const hit = lineIntersect(lp[0], lp[1], ln[0], ln[1]);
    if (!hit) return pts[ci];
    const d = Math.hypot(hit[0] - pts[ci][0], hit[1] - pts[ci][1]);
    return d <= 2.5 * s ? hit : pts[ci];
  });

  // 4. simplify each span independently so corners are always kept; the chamfered points
  //    next to a rebuilt corner are dropped so edges run straight into it.
  const out = [];
  for (let c = 0; c < spans.length; c++) {
    const span = spans[c];
    const tail = (c + 1) % spans.length;
    const cut = span.length > 4 * m + 2 ? m : 0;
    const body = span.slice(cut, span.length - cut);
    const trimmed = [cornerPts[c], ...(cut ? body : body.slice(1, -1)), cornerPts[tail]];
    // A span that never strays more than ~0.6 source px from its chord is a straight edge
    // in the original artwork: emit it as one exact line (removes residual JPEG/pixel wobble).
    if (isNearlyStraight(trimmed, 0.6 * s)) { out.push(cornerPts[c]); continue; }
    const simp = rdp(trimmed, simplifyTol);
    for (let j = 0; j < simp.length - 1; j++) out.push(simp[j]);
  }
  return out;
}

function isNearlyStraight(pts, tol) {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < tol * 4) return false;
  for (let i = 1; i < pts.length - 1; i++) {
    if (Math.abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / len > tol) return false;
  }
  return true;
}

function fitLine(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(th), uy = Math.sin(th);
  return [[mx, my], [mx + ux, my + uy]];
}
