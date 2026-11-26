/**
 * Pure-JS Zero-Dependency QR Code Generator (ISO/IEC 18004, Byte mode, ECC-L, versions 1-10)
 * Produces genuinely scannable QR matrices and crisp vector SVGs / Data URLs.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}
const gfMul = (a, b) => (a && b) ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0;

function rsGenPoly(ecLen) {
  let poly = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (!coef) continue;
    for (let j = 1; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

// Version 1..10 ECC-L tables: [totalDataCodewords, ecPerBlock, blocksG1, dataG1, blocksG2, dataG2, alignmentCenters]
const VERSIONS = [
  null,
  [19, 7, 1, 19, 0, 0, []],
  [34, 10, 1, 34, 0, 0, [6, 18]],
  [55, 15, 1, 55, 0, 0, [6, 22]],
  [80, 20, 1, 80, 0, 0, [6, 26]],
  [108, 26, 1, 108, 0, 0, [6, 30]],
  [136, 18, 2, 68, 0, 0, [6, 34]],
  [156, 20, 2, 78, 0, 0, [6, 22, 38]],
  [194, 24, 2, 97, 0, 0, [6, 24, 42]],
  [232, 30, 2, 116, 0, 0, [6, 26, 46]],
  [274, 18, 2, 68, 2, 69, [6, 28, 50]],
];

function encodeCodewords(bytes) {
  let ver = 1;
  while (ver <= 10) {
    const cap = VERSIONS[ver][0] - (ver <= 9 ? 2 : 3);
    if (bytes.length <= cap) break;
    ver++;
  }
  if (ver > 10) bytes = bytes.slice(0, VERSIONS[10][0] - 3);
  ver = Math.min(10, ver);
  const [totalData, ecLen, b1, d1, b2, d2, align] = VERSIONS[ver];

  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  let padIdx = 0;
  while (data.length < totalData) { data.push(padIdx++ % 2 === 0 ? 0xec : 0x11); }

  const blocks = [], ecs = [];
  let off = 0;
  for (let i = 0; i < b1; i++) { const blk = data.slice(off, off + d1); off += d1; blocks.push(blk); ecs.push(rsRemainder(blk, ecLen)); }
  for (let i = 0; i < b2; i++) { const blk = data.slice(off, off + d2); off += d2; blocks.push(blk); ecs.push(rsRemainder(blk, ecLen)); }

  const interleaved = [];
  const maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const blk of blocks) if (i < blk.length) interleaved.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const ec of ecs) interleaved.push(ec[i]);
  return { ver, align, codewords: interleaved };
}

function buildMatrix(ver, align, codewords) {
  const n = ver * 4 + 17;
  const grid = Array.from({ length: n }, () => new Int8Array(n).fill(-1));
  const func = Array.from({ length: n }, () => new Uint8Array(n));
  const setFunc = (r, c, v) => {
    if (r >= 0 && r < n && c >= 0 && c < n) { grid[r][c] = v ? 1 : 0; func[r][c] = 1; }
  };

  const drawFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      if (r < 0 || r > 6 || c < 0 || c > 6) setFunc(r0 + r, c0 + c, 0);
      else setFunc(r0 + r, c0 + c, (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0);
    }
  };
  drawFinder(0, 0); drawFinder(0, n - 7); drawFinder(n - 7, 0);

  for (let i = 8; i < n - 8; i++) { setFunc(6, i, i % 2 === 0 ? 1 : 0); setFunc(i, 6, i % 2 === 0 ? 1 : 0); }
  setFunc(n - 8, 8, 1);

  for (const ar of align) for (const ac of align) {
    if (func[ar][ac]) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      setFunc(ar + dr, ac + dc, (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0);
    }
  }

  // Reserve format & version info slots
  for (let i = 0; i < 9; i++) { if (!func[8][i]) setFunc(8, i, 0); if (!func[i][8]) setFunc(i, 8, 0); }
  for (let i = n - 8; i < n; i++) { setFunc(8, i, 0); setFunc(i, 8, 0); }
  if (ver >= 7) {
    const vbits = [0, 0, 0, 0, 0, 0, 0, 0x07c94, 0x085bc, 0x09a99, 0x0a4d3][ver];
    for (let i = 0; i < 18; i++) {
      const bit = (vbits >> i) & 1;
      const a = Math.floor(i / 3), b = (i % 3) + n - 11;
      setFunc(a, b, bit); setFunc(b, a, bit);
    }
  }

  // Place data bits zigzag
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((n - 1 - right) >> 1) % 2 === 0;
    for (let step = 0; step < n; step++) {
      const r = up ? n - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (func[r][c]) continue;
        const bit = bitIdx < totalBits ? ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0;
        grid[r][c] = bit;
        bitIdx++;
      }
    }
  }

  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
    (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0,
  ];
  const fmtTable = [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976]; // ECC-L masks 0..7

  let bestScore = Infinity, bestGrid = null;
  for (let m = 0; m < 8; m++) {
    const g = grid.map((row, r) => row.map((v, c) => (func[r][c] ? v : (v ^ (maskFns[m](r, c) ? 1 : 0)))));
    const fmt = fmtTable[m];
    for (let i = 0; i < 6; i++) { g[8][i] = (fmt >> (14 - i)) & 1; g[i][8] = (fmt >> i) & 1; }
    g[8][7] = (fmt >> 8) & 1; g[8][8] = (fmt >> 7) & 1; g[7][8] = (fmt >> 6) & 1;
    for (let i = 0; i < 7; i++) g[n - 1 - i][8] = (fmt >> (14 - i)) & 1;
    for (let i = 0; i < 8; i++) g[8][n - 8 + i] = (fmt >> (7 - i)) & 1;

    let penalty = 0;
    for (let r = 0; r < n; r++) {
      let run = 1;
      for (let c = 1; c < n; c++) {
        if (g[r][c] === g[r][c - 1]) { run++; if (run === 5) penalty += 3; else if (run > 5) penalty++; }
        else run = 1;
      }
    }
    for (let c = 0; c < n; c++) {
      let run = 1;
      for (let r = 1; r < n; r++) {
        if (g[r][c] === g[r - 1][c]) { run++; if (run === 5) penalty += 3; else if (run > 5) penalty++; }
        else run = 1;
      }
    }
    if (penalty < bestScore) { bestScore = penalty; bestGrid = g; }
  }
  return bestGrid;
}

export function generateQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || 'https://kutuharf.local'));
  const { ver, align, codewords } = encodeCodewords(bytes);
  return buildMatrix(ver, align, codewords);
}

export function generateQrSvg(text, sizePx = 140) {
  const m = generateQrMatrix(text);
  const n = m.length;
  const quiet = 2;
  const total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Kod"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#0f172a"/></svg>`;
}

export function generateQrDataUrl(text, sizePx = 140) {
  const svg = generateQrSvg(text, sizePx);
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
