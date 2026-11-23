import THREE from '../vendor/three.js';

/**
 * Architectural Wall & Scene Background Library
 * Preserves all 4 procedural diffuse + bump maps from the reference application
 * (Tuğla, Brüt beton, Ahşap çıta, Antrasit sıva) and extends with 4 new scenes
 * plus custom storefront photograph import.
 */

export const BACKGROUND_SCENES = [
  { id: 'tugla', label: 'Tuğla', category: 'wall', roughness: 0.92, bump: 1.4, tileM: 2.0 },
  { id: 'beton', label: 'Brüt Beton', category: 'wall', roughness: 0.88, bump: 0.8, tileM: 2.4 },
  { id: 'ahsap', label: 'Ahşap Çıta', category: 'wall', roughness: 0.62, bump: 1.6, tileM: 1.2 },
  { id: 'siva', label: 'Antrasit Sıva', category: 'wall', roughness: 0.8, bump: 0.6, tileM: 2.0 },
  { id: 'mermer', label: 'Mermer Duvar', category: 'luxury', roughness: 0.22, bump: 0.3, tileM: 2.2 },
  { id: 'vitrin', label: 'Modern Mağaza Cephesi', category: 'storefront', roughness: 0.45, bump: 0.4, tileM: 2.6 },
  { id: 'resepsiyon', label: 'Ofis Resepsiyon', category: 'interior', roughness: 0.55, bump: 0.5, tileM: 2.2 },
  { id: 'karanlikCephe', label: 'Koyu Dış Cephe', category: 'luxury', roughness: 0.68, bump: 0.7, tileM: 2.4 },
  { id: 'studioNotr', label: 'Nötr Stüdyo Fonu', category: 'studio', roughness: 0.85, bump: 0.1, tileM: 3.0 },
];

function hash2d(x, y, seed) {
  let s = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967295;
}

function vNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (
    hash2d(xi, yi, seed) * (1 - u) * (1 - v) +
    hash2d(xi + 1, yi, seed) * u * (1 - v) +
    hash2d(xi, yi + 1, seed) * (1 - u) * v +
    hash2d(xi + 1, yi + 1, seed) * u * v
  );
}

function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vNoise(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function hslToRgb(h, s, l) {
  const c = new THREE.Color().setHSL(h, s, l);
  return [c.r * 255, c.g * 255, c.b * 255];
}

function makeTexturePair(size, painter) {
  const cCan = document.createElement('canvas');
  const bCan = document.createElement('canvas');
  cCan.width = cCan.height = size;
  bCan.width = bCan.height = size;
  const cCtx = cCan.getContext('2d', { willReadFrequently: true });
  const bCtx = bCan.getContext('2d', { willReadFrequently: true });
  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const out = [0, 0, 0, 0];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      painter(x, y, out);
      const idx = (y * size + x) * 4;
      cImg.data[idx] = out[0];
      cImg.data[idx + 1] = out[1];
      cImg.data[idx + 2] = out[2];
      cImg.data[idx + 3] = 255;
      const bv = Math.max(0, Math.min(255, out[3] * 255));
      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  return [cCan, bCan];
}

const SIZE = 512; // Fast & crisp 512x512 procedural maps

function genTugla() {
  const half = SIZE / 2;
  const bw = 0.215 * half, bh = 0.065 * half, mortar = 0.011 * half;
  const rows = Math.round(SIZE / (bh + mortar));
  const rowH = SIZE / rows;
  const cols = Math.round(SIZE / (bw + mortar));
  const colW = SIZE / cols;
  const rng = lcg(7);
  const bricks = Array.from({ length: rows * cols }, () => [0.02 + rng() * 0.035, 0.42 + rng() * 0.2, 0.27 + rng() * 0.16, rng()]);

  return makeTexturePair(SIZE, (x, y, o) => {
    const r = Math.floor(y / rowH);
    const shift = r % 2 ? colW / 2 : 0;
    const ux = (x + shift) % SIZE;
    const c = Math.floor(ux / colW);
    const dx = ux - c * colW;
    const dy = y - r * rowH;
    const isMortar = dx < mortar || dy < mortar;
    const n1 = fbm(x / 5, y / 5, 3, 3);
    const n2 = hash2d(x, y, 9);
    if (isMortar) {
      const l = (0.55 + n1 * 0.12 + n2 * 0.05) * 0.72;
      const rgb = hslToRgb(0.09, 0.12, l);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2]; o[3] = 0.15 + n1 * 0.12;
    } else {
      const b = bricks[(r % rows) * cols + (c % cols)];
      const edge = Math.min(dx - mortar, colW - dx, dy - mortar, rowH - dy) / 2;
      const n3 = fbm(x / 20 + b[3] * 9, y / 20, 5, 3);
      const l = b[2] * (0.82 + n1 * 0.32) * (0.9 + n2 * 0.14) * (n3 < 0.35 ? 0.78 : 1);
      const rgb = hslToRgb(b[0], b[1], l);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = 0.55 + Math.min(1, edge) * 0.35 + n1 * 0.12 - (n2 > 0.97 ? 0.25 : 0);
    }
  });
}

function genBeton() {
  const unit = SIZE / 2.4;
  const cw = 1.2 * unit, ch = 0.6 * unit;
  return makeTexturePair(SIZE, (x, y, o) => {
    const n1 = fbm(x / 70, y / 70, 11, 5);
    const n2 = fbm(x / 11, y / 11, 13, 3);
    const n3 = hash2d(x, y, 21);
    const mx = x % cw, my = y % ch;
    const seam = mx < 2 || my < 2;
    let hole = 1;
    for (const px of [cw * 0.2, cw * 0.8]) {
      for (const py of [ch * 0.25, ch * 0.75]) {
        const d = Math.hypot(mx - px, my - py);
        if (d < 5) hole = Math.min(hole, d / 5);
      }
    }
    let l = 0.56 + (n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.06 + (n3 - 0.5) * 0.05;
    if (n3 > 0.995) l -= 0.18;
    l *= seam ? 0.72 : 1;
    l *= 0.55 + hole * 0.45;
    const rgb = hslToRgb(0.08, 0.04, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = (seam ? 0.25 : 0.6) * (0.4 + hole * 0.6) + (n2 - 0.5) * 0.1;
  });
}

function genAhsap() {
  const unit = SIZE / 1.2;
  const plankW = 0.04 * unit, gap = 0.014 * unit, step = plankW + gap;
  const rng = lcg(41);
  const planks = Array.from({ length: Math.ceil(SIZE / step) + 1 }, () => [0.065 + rng() * 0.02, 0.38 + rng() * 0.15, 0.17 + rng() * 0.08, rng() * 100]);
  return makeTexturePair(SIZE, (x, y, o) => {
    const idx = Math.floor(x / step);
    const dx = x - idx * step;
    if (dx > plankW) {
      const rgb = hslToRgb(0.07, 0.25, 0.035);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2]; o[3] = 0;
      return;
    }
    const p = planks[idx];
    const n1 = fbm(x / 2 + p[3], y / 45, 31, 4);
    const grain = Math.sin((x / 1.2 + n1 * 14 + p[3]) * 1.3) * 0.5 + 0.5;
    const edge = Math.min(dx, plankW - dx) / 2;
    const l = p[2] * (0.78 + n1 * 0.35 + grain * 0.12) * (0.75 + Math.min(1, edge) * 0.25);
    const rgb = hslToRgb(p[0], p[1], l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.65 + Math.min(1, edge) * 0.3 + grain * 0.05;
  });
}

function genSiva() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const n1 = fbm(x / 30, y / 30, 51, 5);
    const n2 = fbm(x / 6 + n1 * 3, y / 13, 53, 3);
    const n3 = hash2d(x, y, 57);
    const l = 0.18 + (n1 - 0.5) * 0.06 + (n2 - 0.5) * 0.05 + (n3 - 0.5) * 0.025;
    const rgb = hslToRgb(0.6, 0.04, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.5 + (n2 - 0.5) * 0.5 + (n3 - 0.5) * 0.15;
  });
}

function genMermer() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const n = fbm(x / 45, y / 45, 91, 5);
    const vein = Math.abs(Math.sin((x / 55 + y / 75 + n * 4.2) * Math.PI));
    const vSharp = Math.pow(1 - vein, 5);
    const base = 0.86 - vSharp * 0.38 + (n - 0.5) * 0.06;
    const rgb = hslToRgb(0.1, 0.08, Math.max(0.25, Math.min(0.95, base)));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.7 - vSharp * 0.2;
  });
}

function genVitrin() {
  // Modern dark composite facade panels (Alucobond)
  const pw = SIZE / 2, ph = SIZE / 2;
  return makeTexturePair(SIZE, (x, y, o) => {
    const mx = x % pw, my = y % ph;
    const seam = mx < 3 || my < 3;
    const n = fbm(x / 40, y / 40, 105, 3);
    const l = seam ? 0.08 : 0.22 + (n - 0.5) * 0.04;
    const rgb = hslToRgb(0.6, 0.08, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = seam ? 0.1 : 0.6;
  });
}

function genResepsiyon() {
  // Warm architectural travertine/limestone wall
  return makeTexturePair(SIZE, (x, y, o) => {
    const n1 = fbm(x / 60, y / 18, 121, 4);
    const n2 = hash2d(x, y, 127);
    const l = 0.62 + (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.03;
    const rgb = hslToRgb(0.1, 0.18, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.55 + (n1 - 0.5) * 0.2;
  });
}

function genKaranlikCephe() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const n1 = fbm(x / 25, y / 25, 141, 4);
    const l = 0.1 + (n1 - 0.5) * 0.04;
    const rgb = hslToRgb(0.62, 0.1, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.5 + (n1 - 0.5) * 0.3;
  });
}

function genStudioNotr() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const rgb = hslToRgb(0, 0, 0.28);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.5;
  });
}

const GENERATORS = {
  tugla: genTugla,
  beton: genBeton,
  ahsap: genAhsap,
  siva: genSiva,
  mermer: genMermer,
  vitrin: genVitrin,
  resepsiyon: genResepsiyon,
  karanlikCephe: genKaranlikCephe,
  studioNotr: genStudioNotr,
};

const texCache = new Map();

export function getWallTextures(wallId, widthM, heightM) {
  const meta = BACKGROUND_SCENES.find(b => b.id === wallId) || BACKGROUND_SCENES[0];
  if (!texCache.has(wallId)) {
    const gen = GENERATORS[wallId] || genTugla;
    const [cCan, bCan] = gen();
    texCache.set(wallId, { cCan, bCan });
  }
  const { cCan, bCan } = texCache.get(wallId);
  const rx = Math.max(1, widthM / meta.tileM);
  const ry = Math.max(1, heightM / meta.tileM);

  const map = new THREE.CanvasTexture(cCan);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(rx, ry);
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bCan);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(rx, ry);
  bumpMap.anisotropy = 8;

  return {
    map,
    bumpMap,
    roughness: meta.roughness,
    bumpScale: meta.bump * 0.015,
  };
}
