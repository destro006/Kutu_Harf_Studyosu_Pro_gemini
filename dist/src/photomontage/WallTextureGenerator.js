const SIZE = 512;

function hash2d(x, y, seed) {
  let s = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967295;
}

function modPos(a, n) {
  return ((a % n) + n) % n;
}

/**
 * Strictly periodic value noise over integer period (px, py) so every texture
 * tiles seamlessly across large storefront walls without visible borders.
 */
function vNoiseP(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = modPos(xi, px);
  const x1 = modPos(xi + 1, px);
  const y0 = modPos(yi, py);
  const y1 = modPos(yi + 1, py);
  return (
    hash2d(x0, y0, seed) * (1 - u) * (1 - v) +
    hash2d(x1, y0, seed) * u * (1 - v) +
    hash2d(x0, y1, seed) * (1 - u) * v +
    hash2d(x1, y1, seed) * u * v
  );
}

/**
 * Periodic fractal Brownian motion: frequency doubles per octave so every
 * octave remains strictly periodic over (basePx, basePy).
 */
function fbmP(u, v, basePx, basePy, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const px = Math.max(1, basePx * freq);
    const py = Math.max(1, basePy * freq);
    sum += amp * vNoiseP(u * px, v * py, px, py, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = clamp01(s);
  l = clamp01(l);
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = t => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

let reportProgress = () => {};

function makeTexturePair(size, painter) {
  const color = new Uint8ClampedArray(size * size * 4);
  const bump = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const out = [0, 0, 0, 0.5, 0.65];
  let previous = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[4] = 0.65;
      painter(x, y, out);
      const i = (y * size + x) * 4;
      color[i] = out[0];
      color[i + 1] = out[1];
      color[i + 2] = out[2];
      color[i + 3] = 255;
      const bv = Math.max(0, Math.min(255, Math.round(out[3] * 255)));
      bump[i] = bump[i + 1] = bump[i + 2] = bv;
      bump[i + 3] = 255;
      const rv = Math.max(8, Math.min(255, Math.round(out[4] * 255)));
      roughness[i] = roughness[i + 1] = roughness[i + 2] = rv;
      roughness[i + 3] = 255;
    }
    const pct = Math.floor(((y + 1) * 100) / size);
    if (pct !== previous) {
      previous = pct;
      reportProgress(pct);
    }
  }
  return { size, color, bump, roughness };
}

// 1. Premium Graphite Architectural Studio
function genStudioPremium() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const broad = fbmP(u, v, 4, 4, 183, 3) - 0.5;
    const weaveX = Math.sin(u * Math.PI * 2 * 128) * 0.5 + 0.5;
    const weaveY = Math.sin(v * Math.PI * 2 * 128) * 0.5 + 0.5;
    const micro = hash2d(x, y, 187) - 0.5;

    // Wide architectural acoustic shadow joints (256px grid)
    const gx = x % 256;
    const gy = y % 256;
    const reveal = Math.min(smoothstep(0, 3, gx), smoothstep(0, 3, 256 - gx), smoothstep(0, 3, gy), smoothstep(0, 3, 256 - gy));
    const l = (0.195 + broad * 0.032 + (weaveX * weaveY - 0.25) * 0.012 + micro * 0.008) * (0.68 + 0.32 * reveal);
    const rgb = hslToRgb(0.09, 0.05, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.22 + 0.3 * reveal + broad * 0.06 + micro * 0.03;
    o[4] = reveal < 0.8 ? 0.92 : 0.78 + broad * 0.08;
  });
}

// 2. Bej Traverten (Stratified Roman Travertine Ashlar)
function genTraverten() {
  const rows = 4;
  const rowH = SIZE / rows;
  const colW = SIZE / 2;
  const rng = lcg(127);
  const slabs = Array.from({ length: rows * 2 }, () => (rng() - 0.5) * 0.06);

  return makeTexturePair(SIZE, (x, y, o) => {
    const r = Math.floor(y / rowH);
    const shift = (r % 2) * (colW * 0.5);
    const ux = (x + shift) % SIZE;
    const c = Math.floor(ux / colW);
    const dx = ux - c * colW;
    const dy = y - r * rowH;
    const seam = dx < 2.5 || dy < 2.5;

    const u = x / SIZE;
    const v = y / SIZE;
    const strata = fbmP(u, v, 3, 28, 129, 4);
    const cloud = fbmP(u, v, 6, 6, 131, 3) - 0.5;
    const pore = fbmP(u + 0.13, v + 0.27, 24, 64, 137, 2);
    const isPore = pore > 0.71;
    const fine = hash2d(x, y, 139) - 0.5;
    const slabBias = slabs[(r % rows) * 2 + (c % 2)];

    let l = 0.67 + slabBias + (strata - 0.5) * 0.16 + cloud * 0.08 + fine * 0.025;
    if (isPore) l -= (pore - 0.71) * 0.45;
    if (seam) l *= 0.62;
    const rgb = hslToRgb(0.105, 0.20, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = seam ? 0.12 : clamp01(0.58 + (strata - 0.5) * 0.18 - (isPore ? 0.28 : 0) + fine * 0.05);
    o[4] = seam ? 0.94 : (isPore ? 0.92 : 0.68 + (strata - 0.5) * 0.12);
  });
}

// 3. Antrasit Kompozit Panel (Sleek Alucobond Brushed Cladding)
function genKompozit() {
  const panelW = SIZE / 2;
  const panelH = SIZE / 2;
  const rng = lcg(211);
  const tints = [0, 0.015, -0.012, 0.008];

  return makeTexturePair(SIZE, (x, y, o) => {
    const px = Math.floor(x / panelW);
    const py = Math.floor(y / panelH);
    const mx = x % panelW;
    const my = y % panelH;
    const gap = mx < 3 || my < 3;
    const bevel = !gap && (mx < 6 || mx > panelW - 4 || my < 6 || my > panelH - 4);

    const u = x / SIZE;
    const v = y / SIZE;
    const brush = fbmP(u, v, 6, 96, 223, 3) - 0.5;
    const sheen = fbmP(u, v, 4, 4, 227, 2) - 0.5;
    const tint = tints[(py % 2) * 2 + (px % 2)];

    let l = gap ? 0.065 : 0.235 + tint + brush * 0.028 + sheen * 0.025;
    if (bevel) l += 0.035;
    const rgb = hslToRgb(0.60, 0.06, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = gap ? 0.08 : bevel ? 0.65 : 0.5 + brush * 0.06;
    o[4] = gap ? 0.92 : 0.34 + brush * 0.08;
  });
}

// 4. Nero Mermer (Luxury Nero Marquina Black Marble with Organic Calcite & Gold Veins)
function genSiyahMermer() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const wx = fbmP(u, v, 3, 3, 301, 4);
    const wy = fbmP(u + 0.37, v + 0.61, 3, 3, 307, 4);
    const warp = fbmP(u + wx * 0.32, v + wy * 0.32, 4, 4, 311, 5);
    const primary = Math.pow(1 - Math.abs(Math.sin((u * 1.0 + v * 1.0 + warp * 2.4) * Math.PI * 2)), 18);
    const secondary = Math.pow(1 - Math.abs(Math.sin((u * 2.0 - v * 1.0 + wx * 3.1) * Math.PI * 2)), 26) * 0.65;
    const goldTrace = Math.pow(1 - Math.abs(Math.sin((u * 1.0 + v * 2.0 + wy * 2.6) * Math.PI * 2)), 28) * 0.7;

    const stoneTone = 0.075 + (warp - 0.5) * 0.035;
    const whiteVein = clamp01(primary + secondary);
    const l = clamp01(stoneTone + whiteVein * 0.68 + goldTrace * 0.32);
    const h = goldTrace > whiteVein * 0.6 ? 0.105 : 0.09;
    const s = goldTrace > whiteVein * 0.6 ? 0.48 : 0.06;

    const rgb = hslToRgb(h, s, l);
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.5 + whiteVein * 0.08 + goldTrace * 0.05;
    o[4] = clamp01(0.14 + whiteVein * 0.24 + (warp - 0.5) * 0.04);
  });
}

// 5. Ceviz Ahşap Panel (Luxury Acoustic Walnut Wood Slat Wall)
function genCevizPanel() {
  const slats = 8;
  const step = SIZE / slats;
  const slatW = step * 0.72;
  const rng = lcg(59);
  const tones = Array.from({ length: slats }, () => [0.068 + rng() * 0.014, 0.42 + rng() * 0.12, 0.22 + rng() * 0.07, rng() * 10]);

  return makeTexturePair(SIZE, (x, y, o) => {
    const idx = Math.floor(x / step) % slats;
    const dx = x - Math.floor(x / step) * step;
    const u = x / SIZE;
    const v = y / SIZE;

    if (dx > slatW) {
      // Deep acoustic felt backing channel
      const felt = hash2d(x, y, 61) * 0.015;
      const rgb = hslToRgb(0.08, 0.08, 0.04 + felt);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = 0.05;
      o[4] = 0.96;
      return;
    }

    const t = tones[idx];
    const distEdge = Math.min(dx, slatW - dx);
    const bevel = smoothstep(0, 4.5, distEdge);
    const warp = fbmP(u, v, 8, 2, 67 + idx * 7, 3);
    const rings = Math.sin((dx / slatW * 5.0 + warp * 4.5 + t[3]) * Math.PI) * 0.5 + 0.5;
    const pore = fbmP(u, v, 64, 6, 73, 2) - 0.5;
    const l = t[2] * (0.72 + rings * 0.34 + pore * 0.16) * (0.76 + 0.24 * bevel);

    const rgb = hslToRgb(t[0], t[1], clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.45 + bevel * 0.42 + pore * 0.08;
    o[4] = clamp01(0.38 + (1 - rings) * 0.12 + (1 - bevel) * 0.25);
  });
}

// 6. Kırık Beyaz Mikrobeton / Venetian Stucco
function genBeyazSiva() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const trowel = fbmP(u, v, 3, 3, 191, 4);
    const sweep = fbmP(u + trowel * 0.15, v + trowel * 0.1, 8, 6, 193, 3) - 0.5;
    const fine = hash2d(x, y, 197) - 0.5;
    const l = 0.81 + (trowel - 0.5) * 0.09 + sweep * 0.05 + fine * 0.015;
    const rgb = hslToRgb(0.10, 0.075, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = clamp01(0.5 + sweep * 0.16 + fine * 0.06);
    o[4] = clamp01(0.76 + sweep * 0.14);
  });
}

// 7. Tuğla (Architectural Heritage Loft Brick)
function genTugla() {
  const rows = 8;
  const cols = 4;
  const rowH = SIZE / rows;
  const colW = SIZE / cols;
  const mortar = 5;
  const rng = lcg(7);
  const bricks = Array.from({ length: rows * cols }, () => [0.024 + rng() * 0.028, 0.44 + rng() * 0.16, 0.25 + rng() * 0.14, rng()]);

  return makeTexturePair(SIZE, (x, y, o) => {
    const r = Math.floor(y / rowH) % rows;
    const shift = (r % 2) * (colW * 0.5);
    const ux = (x + shift) % SIZE;
    const c = Math.floor(ux / colW) % cols;
    const dx = ux - c * colW;
    const dy = y - r * rowH;
    const isMortar = dx < mortar || dy < mortar;

    const u = x / SIZE;
    const v = y / SIZE;
    const tex = fbmP(u, v, 16, 16, 3, 3);
    const grain = hash2d(x, y, 9);

    if (isMortar) {
      const l = 0.42 + (tex - 0.5) * 0.1 + (grain - 0.5) * 0.05;
      const rgb = hslToRgb(0.09, 0.10, clamp01(l));
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = 0.14 + tex * 0.14;
      o[4] = 0.96;
    } else {
      const b = bricks[r * cols + c];
      const edgeDist = Math.min(dx - mortar, colW - dx, dy - mortar, rowH - dy);
      const edge = smoothstep(0, 4.5, edgeDist);
      const charNoise = fbmP(u + b[3] * 0.3, v + b[3] * 0.7, 6, 6, 5, 3);
      const l = b[2] * (0.82 + tex * 0.30) * (0.9 + grain * 0.12) * (charNoise < 0.34 ? 0.76 : 1.0) * (0.84 + 0.16 * edge);
      const rgb = hslToRgb(b[0], b[1], clamp01(l));
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = clamp01(0.45 + edge * 0.42 + tex * 0.12 - (grain > 0.96 ? 0.22 : 0));
      o[4] = 0.90;
    }
  });
}

// 8. Brüt Beton (Architectural Cast-in-Place Formwork Concrete)
function genBeton() {
  const cw = SIZE / 2;
  const ch = SIZE / 4;
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const n1 = fbmP(u, v, 4, 4, 11, 5);
    const n2 = fbmP(u, v, 16, 16, 13, 3);
    const n3 = hash2d(x, y, 21);
    const mx = x % cw;
    const my = y % ch;
    const seam = mx < 2 || my < 2;

    let cone = 1;
    for (const px of [cw * 0.2, cw * 0.8]) {
      for (const py of [ch * 0.5]) {
        const d = Math.hypot(mx - px, my - py);
        if (d < 5.5) cone = Math.min(cone, d / 5.5);
      }
    }

    let l = 0.54 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.06 + (n3 - 0.5) * 0.04;
    if (n3 > 0.992) l -= 0.15;
    if (seam) l *= 0.70;
    l *= 0.52 + 0.48 * cone;
    const rgb = hslToRgb(0.08, 0.04, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = clamp01((seam ? 0.22 : 0.62) * (0.4 + 0.6 * cone) + (n2 - 0.5) * 0.1);
    o[4] = 0.88;
  });
}

// 9. Ahşap Çıta (Warm Scandinavian Natural Oak Slats)
function genAhsap() {
  const slats = 16;
  const step = SIZE / slats;
  const plankW = step * 0.74;
  const rng = lcg(41);
  const planks = Array.from({ length: slats }, () => [0.072 + rng() * 0.018, 0.40 + rng() * 0.12, 0.30 + rng() * 0.08, rng() * 10]);

  return makeTexturePair(SIZE, (x, y, o) => {
    const idx = Math.floor(x / step) % slats;
    const dx = x - Math.floor(x / step) * step;
    if (dx > plankW) {
      const rgb = hslToRgb(0.07, 0.18, 0.045);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = 0.04;
      o[4] = 0.95;
      return;
    }
    const u = x / SIZE;
    const v = y / SIZE;
    const p = planks[idx];
    const edge = smoothstep(0, 3.0, Math.min(dx, plankW - dx));
    const n1 = fbmP(u, v, 16, 3, 31 + idx * 5, 4);
    const grain = Math.sin((dx / plankW * 4.5 + n1 * 3.8 + p[3]) * Math.PI) * 0.5 + 0.5;
    const l = p[2] * (0.80 + n1 * 0.28 + grain * 0.12) * (0.76 + 0.24 * edge);
    const rgb = hslToRgb(p[0], p[1], clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = 0.52 + edge * 0.38 + grain * 0.06;
    o[4] = 0.52 + (1 - edge) * 0.22;
  });
}

// 10. Antrasit Sıva (Deep Architectural Microcement)
function genSiva() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const n1 = fbmP(u, v, 4, 4, 51, 5);
    const n2 = fbmP(u + n1 * 0.08, v, 16, 12, 53, 3);
    const n3 = hash2d(x, y, 57);
    const l = 0.17 + (n1 - 0.5) * 0.065 + (n2 - 0.5) * 0.045 + (n3 - 0.5) * 0.02;
    const rgb = hslToRgb(0.60, 0.04, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = clamp01(0.5 + (n2 - 0.5) * 0.35 + (n3 - 0.5) * 0.1);
    o[4] = clamp01(0.76 + (n2 - 0.5) * 0.14);
  });
}

// 11. Mermer Duvar (Luxury White Calacatta Gold Marble)
function genMermer() {
  const slabW = SIZE / 2;
  const slabH = SIZE / 2;
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const seam = (x % slabW) < 1.5 || (y % slabH) < 1.5;
    const wx = fbmP(u, v, 3, 3, 91, 4);
    const wy = fbmP(u + 0.43, v + 0.19, 3, 3, 97, 4);
    const warp = fbmP(u + wx * 0.28, v + wy * 0.28, 4, 4, 101, 5);
    const veinGrey = Math.pow(1 - Math.abs(Math.sin((u * 1.0 + v * 1.0 + warp * 2.2) * Math.PI * 2)), 14);
    const veinGold = Math.pow(1 - Math.abs(Math.sin((u * 1.0 - v * 1.0 + wx * 2.5) * Math.PI * 2)), 24) * 0.55;

    let l = 0.90 + (warp - 0.5) * 0.04 - veinGrey * 0.30 - veinGold * 0.14;
    if (seam) l *= 0.84;
    const h = veinGold > veinGrey * 0.45 ? 0.105 : 0.09;
    const s = veinGold > veinGrey * 0.45 ? 0.36 : 0.05;
    const rgb = hslToRgb(h, s, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = seam ? 0.24 : 0.62 - veinGrey * 0.12;
    o[4] = seam ? 0.72 : clamp01(0.16 + veinGrey * 0.18);
  });
}

// 12. Modern Mağaza Cephesi (Boutique Smoked Bronze Composite + Gold Anodized Trim)
function genVitrin() {
  const pw = SIZE / 2;
  const ph = SIZE / 2;
  return makeTexturePair(SIZE, (x, y, o) => {
    const mx = x % pw;
    const my = y % ph;
    const trim = mx < 3;
    const hSeam = my < 2.5;
    const u = x / SIZE;
    const v = y / SIZE;
    const brush = fbmP(u, v, 8, 96, 105, 3) - 0.5;

    if (trim) {
      const rgb = hslToRgb(0.105, 0.52, 0.54 + brush * 0.06);
      o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
      o[3] = 0.72;
      o[4] = 0.22;
      return;
    }
    const l = hSeam ? 0.06 : 0.165 + brush * 0.025;
    const rgb = hslToRgb(0.085, 0.16, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = hSeam ? 0.12 : 0.52 + brush * 0.05;
    o[4] = hSeam ? 0.88 : 0.36;
  });
}

// 13. Ofis Resepsiyon (Fluted Ribbed Warm Limestone Lobby Wall)
function genResepsiyon() {
  const flutes = 24;
  const period = SIZE / flutes;
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const phase = (x % period) / period;
    const fluteProfile = Math.sin(phase * Math.PI);
    const groove = phase < 0.08 || phase > 0.92;
    const stone = fbmP(u, v, 8, 16, 121, 4) - 0.5;
    const fine = hash2d(x, y, 127) - 0.5;

    const shade = groove ? 0.70 : 0.86 + fluteProfile * 0.16;
    const l = (0.64 + stone * 0.09 + fine * 0.02) * shade;
    const rgb = hslToRgb(0.10, 0.16, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = clamp01((groove ? 0.15 : 0.40 + fluteProfile * 0.50) + stone * 0.08);
    o[4] = groove ? 0.85 : 0.60 + (1 - fluteProfile) * 0.12;
  });
}

// 14. Koyu Dış Cephe (Split-Face Volcanic Basalt Stone Cladding)
function genKaranlikCephe() {
  const rows = 8;
  const cols = 4;
  const rowH = SIZE / rows;
  const colW = SIZE / cols;
  const rng = lcg(141);
  const blocks = Array.from({ length: rows * cols }, () => 0.10 + rng() * 0.06);

  return makeTexturePair(SIZE, (x, y, o) => {
    const r = Math.floor(y / rowH) % rows;
    const shift = (r % 2) * (colW * 0.5);
    const ux = (x + shift) % SIZE;
    const c = Math.floor(ux / colW) % cols;
    const dx = ux - c * colW;
    const dy = y - r * rowH;
    const seam = dx < 2.5 || dy < 2.5;

    const u = x / SIZE;
    const v = y / SIZE;
    const rock = fbmP(u, v, 12, 16, 143, 4);
    const chisel = fbmP(u, v, 32, 32, 149, 2) - 0.5;
    const base = blocks[r * cols + c];
    const l = seam ? 0.045 : base + (rock - 0.5) * 0.06 + chisel * 0.025;

    const rgb = hslToRgb(0.61, 0.09, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = seam ? 0.08 : clamp01(0.42 + rock * 0.45 + chisel * 0.12);
    o[4] = seam ? 0.94 : clamp01(0.74 - rock * 0.12);
  });
}

// 15. Nötr Stüdyo Fonu (Warm Greige Gallery Plaster)
function genStudioNotr() {
  return makeTexturePair(SIZE, (x, y, o) => {
    const u = x / SIZE;
    const v = y / SIZE;
    const soft = fbmP(u, v, 4, 4, 163, 3) - 0.5;
    const micro = hash2d(x, y, 167) - 0.5;
    const l = 0.56 + soft * 0.045 + micro * 0.015;
    const rgb = hslToRgb(0.095, 0.065, clamp01(l));
    o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2];
    o[3] = clamp01(0.5 + soft * 0.08 + micro * 0.04);
    o[4] = 0.84;
  });
}

const GENERATORS = {
  studioPremium: genStudioPremium,
  traverten: genTraverten,
  kompozit: genKompozit,
  siyahMermer: genSiyahMermer,
  cevizPanel: genCevizPanel,
  beyazSiva: genBeyazSiva,
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

export function generateWallPixels(id, onProgress = () => {}) {
  if (!Object.hasOwn(GENERATORS, id)) throw Error('Bilinmeyen arka plan: ' + id);
  reportProgress = onProgress;
  try {
    onProgress(0);
    return GENERATORS[id]();
  } finally {
    reportProgress = () => {};
  }
}
