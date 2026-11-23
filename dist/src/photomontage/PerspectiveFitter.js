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
 * Composites the customer storefront photograph + perspective-warped 3D sign
 * (using inverse homography bilinear sampling for pixel-accurate perspective)
 * and returns a high-resolution PNG data URL.
 */
export async function renderPhotomontageComposite(photoUrl, signCanvas, cornersNorm, options = {}) {
  const {
    wallShadow = 0.45,
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

  // Destination quad in output pixels
  const dst = cornersNorm.map(c => ({ x: c.x * outW, y: c.y * outH }));
  const sw = signCanvas.width;
  const sh = signCanvas.height;
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

  // Optional soft wall drop shadow under the sign quad
  if (wallShadow > 0.01) {
    ctx.save();
    ctx.globalAlpha = wallShadow * 0.45;
    ctx.filter = 'blur(12px)';
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    dst.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + 6, p.y + 10) : ctx.lineTo(p.x + 6, p.y + 10)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

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

      const alpha = (sData[i00 + 3] * w00 + sData[i10 + 3] * w10 + sData[i01 + 3] * w01 + sData[i11 + 3] * w11) / 255;
      if (alpha < 0.01) continue;

      const sr = sData[i00] * w00 + sData[i10] * w10 + sData[i01] * w01 + sData[i11] * w11;
      const sg = sData[i00 + 1] * w00 + sData[i10 + 1] * w10 + sData[i01 + 1] * w01 + sData[i11 + 1] * w11;
      const sb = sData[i00 + 2] * w00 + sData[i10 + 2] * w10 + sData[i01 + 2] * w01 + sData[i11 + 2] * w11;

      const oIdx = (y * outW + x) * 4;
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
