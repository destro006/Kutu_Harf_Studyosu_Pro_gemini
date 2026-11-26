/**
 * True 4-Point Projective Homography & Customer Photomontage Engine
 * Computes an exact 3x3 projective homography H (Direct Linear Transform)
 * mapping a normalized rectangle [0,0]..[W,H] onto 4 user-positioned corner handles
 * on a customer storefront / wall photograph.
 */

/**
 * Solves an 8x8 linear system using Gaussian elimination with partial pivoting
 * to find the exact 3x3 projective homography matrix H (h33 = 1).
 * @param {Array<{x:number,y:number}>} src 4 source points (TL, TR, BR, BL)
 * @param {Array<{x:number,y:number}>} dst 4 destination points (TL, TR, BR, BL)
 * @returns {number[]} 9-element row-major 3x3 matrix [h0..h8]
 */
export function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[maxRow][col])) maxRow = r;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [b[col], b[maxRow]] = [b[maxRow], b[col]];

    const pivot = A[col][col] || 1e-12;
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / pivot;
      b[r] -= f * b[col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
    }
  }

  const h = new Array(9).fill(1);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * h[c];
    h[r] = sum / (A[r][r] || 1e-12);
  }
  return h;
}

/**
 * Converts a 3x3 2D homography matrix into a CSS 4x4 matrix3d(...) string
 * for real-time GPU-accelerated perspective preview over the uploaded photo.
 */
export function homographyToCssMatrix3d(H) {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;
  // Column-major CSS matrix3d
  const vals = [
    h0, h3, 0, h6,
    h1, h4, 0, h7,
    0,  0,  1, 0,
    h2, h5, 0, h8,
  ];
  return `matrix3d(${vals.map(v => v.toFixed(6)).join(',')})`;
}

/**
 * Fits a uniform-aspect rectangle (signW x signH) centered inside a 4-point perspective quad
 * [TL, TR, BR, BL] using bilinear UV coordinates, strictly preventing any stretching/squashing.
 */
export function fitAspectLockedQuad(dstQuad, signW, signH) {
  if (!Array.isArray(dstQuad) || dstQuad.length !== 4) return dstQuad;
  const [tl, tr, br, bl] = dstQuad;
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const quadW = Math.max(4, (wTop + wBot) * 0.5);
  const quadH = Math.max(4, (hLeft + hRight) * 0.5);
  const quadRatio = quadW / quadH;
  const signRatio = Math.max(1, Number(signW) || 1) / Math.max(1, Number(signH) || 1);

  let uSpan = 1;
  let vSpan = 1;
  if (signRatio > quadRatio) {
    vSpan = Math.max(0.08, Math.min(1, quadRatio / signRatio));
  } else {
    uSpan = Math.max(0.08, Math.min(1, signRatio / quadRatio));
  }
  const u0 = 0.5 - uSpan * 0.5;
  const u1 = 0.5 + uSpan * 0.5;
  const v0 = 0.5 - vSpan * 0.5;
  const v1 = 0.5 + vSpan * 0.5;

  const bilerp = (u, v) => ({
    x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x,
    y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y,
  });
  return [bilerp(u0, v0), bilerp(u1, v0), bilerp(u1, v1), bilerp(u0, v1)];
}

/**
 * Composites the customer storefront photograph + aspect-locked perspective-warped 3D sign
 * (using inverse homography bilinear sampling for pixel-accurate perspective)
 * and returns a high-resolution PNG data URL.
 */
export async function renderPhotomontageComposite(photoUrl, signCanvas, cornersNorm, options = {}) {
  const {
    haloCanvas = null,
    ambientTint = '#ffffff',
    ambientMatch = 0.15,
    width = 1920,
  } = options;

  const photo = await new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = photoUrl;
  });

  const aspect = photo.naturalHeight / Math.max(1, photo.naturalWidth);
  const outW = Math.min(2400, Math.max(800, width));
  const outH = Math.round(outW * aspect);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  ctx.drawImage(photo, 0, 0, outW, outH);

  // Destination quad in output pixels — aspect-locked to eliminate vertical/horizontal stretching
  const rawDst = cornersNorm.map(c => ({ x: c.x * outW, y: c.y * outH }));
  const sw = signCanvas.width;
  const sh = signCanvas.height;
  const dst = fitAspectLockedQuad(rawDst, sw, sh);
  const src = [
    { x: 0, y: 0 },
    { x: sw, y: 0 },
    { x: sw, y: sh },
    { x: 0, y: sh },
  ];

  // Inverse homography: dst -> src
  const Hinv = computeHomography(dst, src);

  // Compute bounding box of dst quad
  const minX = Math.max(0, Math.floor(Math.min(...dst.map(p => p.x))));
  const maxX = Math.min(outW - 1, Math.ceil(Math.max(...dst.map(p => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...dst.map(p => p.y))));
  const maxY = Math.min(outH - 1, Math.ceil(Math.max(...dst.map(p => p.y))));

  const sCtx = signCanvas.getContext('2d', { willReadFrequently: true });
  const sData = sCtx.getImageData(0, 0, sw, sh).data;
  const hData = haloCanvas && haloCanvas.width === sw && haloCanvas.height === sh
    ? haloCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data
    : null;

  const outImg = ctx.getImageData(0, 0, outW, outH);
  const oData = outImg.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const denom = Hinv[6] * x + Hinv[7] * y + Hinv[8];
      if (Math.abs(denom) < 1e-8) continue;
      const sx = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / denom;
      const sy = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / denom;
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) continue;

      const ix = Math.floor(sx), iy = Math.floor(sy);
      const fx = sx - ix, fy = sy - iy;
      const i00 = (iy * sw + ix) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const oIdx = (y * outW + x) * 4;

      if (hData) {
        const hr = hData[i00] * w00 + hData[i10] * w10 + hData[i01] * w01 + hData[i11] * w11;
        const hg = hData[i00 + 1] * w00 + hData[i10 + 1] * w10 + hData[i01 + 1] * w01 + hData[i11 + 1] * w11;
        const hb = hData[i00 + 2] * w00 + hData[i10 + 2] * w10 + hData[i01 + 2] * w01 + hData[i11 + 2] * w11;
        if (hr > 1.5 || hg > 1.5 || hb > 1.5) {
          const gr = Math.min(255, hr * 1.18);
          const gg = Math.min(255, hg * 1.18);
          const gb = Math.min(255, hb * 1.18);
          oData[oIdx] = Math.min(255, Math.round(255 - ((255 - oData[oIdx]) * (255 - gr)) / 255 + gr * 0.24));
          oData[oIdx + 1] = Math.min(255, Math.round(255 - ((255 - oData[oIdx + 1]) * (255 - gg)) / 255 + gg * 0.24));
          oData[oIdx + 2] = Math.min(255, Math.round(255 - ((255 - oData[oIdx + 2]) * (255 - gb)) / 255 + gb * 0.24));
        }
      }

      const alpha = (sData[i00 + 3] * w00 + sData[i10 + 3] * w10 + sData[i01 + 3] * w01 + sData[i11 + 3] * w11) / 255;
      if (alpha < 0.01) continue;

      const sr = sData[i00] * w00 + sData[i10] * w10 + sData[i01] * w01 + sData[i11] * w11;
      const sg = sData[i00 + 1] * w00 + sData[i10 + 1] * w10 + sData[i01 + 1] * w01 + sData[i11 + 1] * w11;
      const sb = sData[i00 + 2] * w00 + sData[i10 + 2] * w10 + sData[i01 + 2] * w01 + sData[i11 + 2] * w11;

      const invA = 1 - alpha;
      oData[oIdx] = Math.round(sr * alpha + oData[oIdx] * invA);
      oData[oIdx + 1] = Math.round(sg * alpha + oData[oIdx + 1] * invA);
      oData[oIdx + 2] = Math.round(sb * alpha + oData[oIdx + 2] * invA);
    }
  }
  ctx.putImageData(outImg, 0, 0);

  if (ambientMatch > 0.01 && ambientTint) {
    ctx.save();
    ctx.globalAlpha = ambientMatch * 0.12;
    ctx.fillStyle = ambientTint;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  return out.toDataURL('image/png');
}

/**
 * Generates a 4-point normalized corner quad [TL, TR, BR, BL] from intuitive
 * Yaw (horizontal perspective), Pitch (vertical tilt), Roll, Scale, and Center X/Y sliders.
 */
export function buildPerspectiveQuadFromAngles({
  cx = 0.5,
  cy = 0.45,
  halfW = 0.28,
  halfH = 0.17,
  yawDeg = 0,
  pitchDeg = 0,
  rollDeg = 0,
  scale = 1,
} = {}) {
  const s = Math.max(0.3, Math.min(2.2, Number(scale) || 1));
  const hw = halfW * s;
  const hh = halfH * s;
  const yaw = Math.max(-0.55, Math.min(0.55, (Number(yawDeg) || 0) / 55));
  const pitch = Math.max(-0.45, Math.min(0.45, (Number(pitchDeg) || 0) / 55));
  const rollRad = ((Number(rollDeg) || 0) * Math.PI) / 180;
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);

  const localPts = [
    { x: -hw * (1 - pitch * 0.45), y: -hh * (1 + yaw * 0.5) },
    { x: hw * (1 - pitch * 0.45), y: -hh * (1 - yaw * 0.5) },
    { x: hw * (1 + pitch * 0.45), y: hh * (1 - yaw * 0.5) },
    { x: -hw * (1 + pitch * 0.45), y: hh * (1 + yaw * 0.5) },
  ];

  return localPts.map(p => ({
    x: Math.max(0.02, Math.min(0.98, cx + p.x * cosR - p.y * sinR)),
    y: Math.max(0.02, Math.min(0.98, cy + p.x * sinR + p.y * cosR)),
  }));
}

/**
 * Snaps a dragged corner point against adjacent corners along horizontal/vertical axes,
 * returning both the snapped coordinate and visual snap guide segments.
 */
export function snapCornerWithGuides(corners, idx, candidate, tol = 0.014) {
  let { x, y } = candidate;
  const guides = [];
  const adj = [(idx + 3) % 4, (idx + 1) % 4];
  for (const j of adj) {
    const ref = corners?.[j];
    if (!ref) continue;
    if (Math.abs(x - ref.x) <= tol) {
      x = ref.x;
      guides.push({ x1: ref.x, y1: ref.y, x2: x, y2: y });
    }
    if (Math.abs(y - ref.y) <= tol) {
      y = ref.y;
      guides.push({ x1: ref.x, y1: ref.y, x2: x, y2: y });
    }
  }
  return {
    point: { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(0.02, Math.min(0.98, y)) },
    guides,
  };
}

export function pointInQuadNorm(pt, quad) {
  if (!pt || !Array.isArray(quad) || quad.length !== 4) return false;
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = quad[i].x, yi = quad[i].y;
    const xj = quad[j].x, yj = quad[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Solves a physically consistent 3D architectural plane orientation { yawDeg, pitchDeg, rollDeg }
 * from 4 normalized corner points [TL, TR, BR, BL] so 3D channel letter depth aligns cleanly
 * with the facade's real vanishing point from the first letter to the last.
 */
export function solvePlanePoseFromQuad(cornersNorm, fovDeg = 28) {
  if (!Array.isArray(cornersNorm) || cornersNorm.length !== 4) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
  }
  const [tl, tr, br, bl] = cornersNorm;
  const wTop = Math.max(0.01, Math.hypot(tr.x - tl.x, tr.y - tl.y));
  const wBot = Math.max(0.01, Math.hypot(br.x - bl.x, br.y - bl.y));
  const hLeft = Math.max(0.01, Math.hypot(bl.x - tl.x, bl.y - tl.y));
  const hRight = Math.max(0.01, Math.hypot(br.x - tr.x, br.y - tr.y));

  // Right taller than left -> sign plane recedes left-to-right (positive camera yaw)
  const hDiffRatio = (hRight - hLeft) / Math.max(hRight, hLeft);
  // Bottom wider than top -> top edge tilted away (positive pitch)
  const wDiffRatio = (wBot - wTop) / Math.max(wTop, wBot);

  const scaleFactor = 46 * (28 / Math.max(20, Number(fovDeg) || 28));
  const yawDeg = Math.max(-35, Math.min(35, Math.round(hDiffRatio * scaleFactor * 10) / 10));
  const pitchDeg = Math.max(-22, Math.min(22, Math.round(wDiffRatio * scaleFactor * 0.75 * 10) / 10));
  const rollRad = Math.atan2(((tr.y - tl.y) + (br.y - bl.y)) * 0.5, ((tr.x - tl.x) + (br.x - bl.x)) * 0.5);
  const rollDeg = Math.max(-20, Math.min(20, Math.round((rollRad * 180 / Math.PI) * 10) / 10));

  return { yawDeg, pitchDeg, rollDeg };
}
