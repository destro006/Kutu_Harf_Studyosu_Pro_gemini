import { ShapePath, ShapeHelpers, normalizeParts } from '../vendor/three.js';

/**
 * Logo Tracing & SVG Vector Import Engine
 * Preserves and upgrades the reference marching-squares + Douglas-Peucker tracer
 * with adjustable threshold/tolerance, background removal, smoothing, and multi-component support.
 */

export function parseSvgLogo(svgText) {
  return ShapeHelpers.parseSvgLogo(svgText);
}

/**
 * Traces a raster logo (PNG, JPG, WEBP, etc.) into normalized vector shapes with holes and components.
 */
export async function traceRasterLogo(srcUrl, options = {}) {
  const {
    maxSide = 900,
    threshold = 0.5,
    bgTolerance = 45,
    simplifyTol = 0.45,
    smoothPasses = 1,
    removeBackground = true,
  } = options;

  const img = await loadImage(srcUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const mask = buildForegroundMask(data, w, h, bgTolerance, removeBackground);
  const contours = marchingSquares(mask, w, h, threshold);

  const minArea = w * h * 0.00015;
  let cleaned = contours
    .map(c => simplifyClosed(c, simplifyTol))
    .filter(c => c.length >= 3 && Math.abs(ringSignedArea(c)) >= minArea);

  if (smoothPasses > 0) {
    cleaned = cleaned.map(c => chaikinSmooth(c, smoothPasses));
  }

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

function chaikinSmooth(ring, passes = 1) {
  let pts = ring;
  for (let p = 0; p < passes; p++) {
    if (pts.length < 4) break;
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}
