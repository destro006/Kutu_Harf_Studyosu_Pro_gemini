/**
 * Zero-dependency pure-JS WMF (Windows Metafile) & EMF (Enhanced Metafile)
 * closed vector contour importer. All returned coordinates are millimeters.
 */
import { groupRings } from './VectorFileImport.js';

const UNIT_FACTORS = { mm: 1, cm: 10, m: 1000, in: 25.4, px: 25.4 / 96 };

function ellipseRing(left, top, right, bottom, steps = 48) {
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const rx = Math.abs(right - left) / 2, ry = Math.abs(bottom - top) / 2;
  if (rx < 1e-6 || ry < 1e-6) return null;
  const count = Math.min(256, Math.max(steps, Math.ceil(2 * Math.PI * Math.max(rx, ry) / 1.5)));
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

function roundRectRing(left, top, right, bottom, rw, rh) {
  const x0 = Math.min(left, right), x1 = Math.max(left, right);
  const y0 = Math.min(top, bottom), y1 = Math.max(top, bottom);
  const w = x1 - x0, h = y1 - y0;
  if (w < 1e-6 || h < 1e-6) return null;
  const rx = Math.min(w / 2, Math.max(0, Math.abs(rw) / 2));
  const ry = Math.min(h / 2, Math.max(0, Math.abs(rh) / 2));
  if (rx < 1e-4 || ry < 1e-4) {
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  const segs = 10, pts = [];
  const corners = [
    { cx: x1 - rx, cy: y0 + ry, a0: -Math.PI / 2, a1: 0 },
    { cx: x1 - rx, cy: y1 - ry, a0: 0, a1: Math.PI / 2 },
    { cx: x0 + rx, cy: y1 - ry, a0: Math.PI / 2, a1: Math.PI },
    { cx: x0 + rx, cy: y0 + ry, a0: Math.PI, a1: 1.5 * Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = c.a0 + (c.a1 - c.a0) * (i / segs);
      pts.push({ x: c.cx + rx * Math.cos(a), y: c.cy + ry * Math.sin(a) });
    }
  }
  return pts;
}

function sampleCubic(a, c1, c2, b, tol = 1) {
  const len = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
  const steps = Math.min(128, Math.max(8, Math.ceil(len / Math.max(0.5, tol))));
  const out = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, q = 1 - t;
    out.push({
      x: q * q * q * a.x + 3 * q * q * t * c1.x + 3 * q * t * t * c2.x + t * t * t * b.x,
      y: q * q * q * a.y + 3 * q * q * t * c1.y + 3 * q * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

function parseWmf(bytes, options = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 18) throw Error('WMF dosyası çok kısa veya bozuk.');
  let pos = 0;
  let unitsPerInch = 96;
  const warnings = [];
  if (bytes.length >= 22 && view.getUint32(0, true) === 0x9ac6cdd7) {
    const inch = view.getUint16(14, true);
    if (inch > 0) unitsPerInch = inch;
    pos = 22;
  } else {
    warnings.push('WMF dosyasında Aldus fiziksel ölçek başlığı yok; 96 DPI kabul edildi. Ölçüleri doğrulayın.');
  }
  const headerSizeWords = view.getUint16(pos + 2, true);
  if (headerSizeWords < 9) throw Error('WMF başlığı geçersiz.');
  pos += headerSizeWords * 2;

  let winOrgX = 0, winOrgY = 0;
  const rings = [];
  const pt = (x, y) => ({ x: x - winOrgX, y: -(y - winOrgY) });
  let guard = 0;

  while (pos + 6 <= bytes.length && guard++ < 500000) {
    const sizeWords = view.getUint32(pos, true);
    const func = view.getUint16(pos + 4, true);
    if (func === 0 || sizeWords < 3) break;
    const nextPos = pos + sizeWords * 2;
    if (nextPos > bytes.length) break;
    const p = pos + 6;

    if (func === 0x020b && p + 4 <= nextPos) { // META_SETWINDOWORG (y, x)
      winOrgY = view.getInt16(p, true);
      winOrgX = view.getInt16(p + 2, true);
    } else if ((func === 0x0324 || func === 0x0325) && p + 2 <= nextPos) { // META_POLYGON / META_POLYLINE
      const count = view.getInt16(p, true);
      if (count >= 3 && p + 2 + count * 4 <= nextPos) {
        const ring = [];
        for (let i = 0; i < count; i++) {
          ring.push(pt(view.getInt16(p + 2 + i * 4, true), view.getInt16(p + 4 + i * 4, true)));
        }
        const closed = func === 0x0324 || Math.hypot(ring[0].x - ring.at(-1).x, ring[0].y - ring.at(-1).y) < 1;
        if (closed) rings.push(ring);
      }
    } else if (func === 0x0538 && p + 2 <= nextPos) { // META_POLYPOLYGON
      const polyCount = view.getUint16(p, true);
      const counts = [];
      let off = p + 2;
      for (let k = 0; k < polyCount && off + 2 <= nextPos; k++, off += 2) counts.push(view.getUint16(off, true));
      for (const count of counts) {
        if (count >= 3 && off + count * 4 <= nextPos) {
          const ring = [];
          for (let i = 0; i < count; i++) {
            ring.push(pt(view.getInt16(off + i * 4, true), view.getInt16(off + i * 4 + 2, true)));
          }
          rings.push(ring);
        }
        off += count * 4;
      }
    } else if (func === 0x041b && p + 8 <= nextPos) { // META_RECTANGLE (bottom, right, top, left)
      const bottom = view.getInt16(p, true), right = view.getInt16(p + 2, true);
      const top = view.getInt16(p + 4, true), left = view.getInt16(p + 6, true);
      rings.push([pt(left, top), pt(right, top), pt(right, bottom), pt(left, bottom)]);
    } else if (func === 0x061c && p + 12 <= nextPos) { // META_ROUNDRECT (rh, rw, bottom, right, top, left)
      const rh = view.getInt16(p, true), rw = view.getInt16(p + 2, true);
      const bottom = view.getInt16(p + 4, true), right = view.getInt16(p + 6, true);
      const top = view.getInt16(p + 8, true), left = view.getInt16(p + 10, true);
      const r = roundRectRing(left, top, right, bottom, rw, rh);
      if (r) rings.push(r.map(q => pt(q.x, q.y)));
    } else if (func === 0x0418 && p + 8 <= nextPos) { // META_ELLIPSE (bottom, right, top, left)
      const bottom = view.getInt16(p, true), right = view.getInt16(p + 2, true);
      const top = view.getInt16(p + 4, true), left = view.getInt16(p + 6, true);
      const r = ellipseRing(left, top, right, bottom);
      if (r) rings.push(r.map(q => pt(q.x, q.y)));
    }
    pos = nextPos;
  }

  const unit = options.unit || 'auto';
  const baseFactor = unit !== 'auto' && UNIT_FACTORS[unit] ? UNIT_FACTORS[unit] : 25.4 / unitsPerInch;
  return { rings, factor: baseFactor, warnings };
}

function mulMat(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function parseEmf(bytes, options = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 88) throw Error('EMF dosyası çok kısa veya bozuk.');
  const recType0 = view.getUint32(0, true);
  if (recType0 !== 1) throw Error('Geçerli EMF başlığı (EMR_HEADER) bulunamadı.');

  const bL = view.getInt32(8, true), bT = view.getInt32(12, true), bR = view.getInt32(16, true), bB = view.getInt32(20, true);
  const fL = view.getInt32(24, true), fT = view.getInt32(28, true), fR = view.getInt32(32, true), fB = view.getInt32(36, true);
  const bw = Math.abs(bR - bL), bh = Math.abs(bB - bT);
  const fwMm = Math.abs(fR - fL) / 100, fhMm = Math.abs(fB - fT) / 100;
  let mmPerUnit = 25.4 / 96;
  const warnings = [];
  if (bw > 0 && fwMm > 0) mmPerUnit = fwMm / bw;
  else if (bh > 0 && fhMm > 0) mmPerUnit = fhMm / bh;
  else warnings.push('EMF fiziksel çerçeve ölçüsü eksik; 96 DPI ölçeği kullanıldı.');

  const ID = [1, 0, 0, 1, 0, 0];
  let mat = ID.slice();
  const matStack = [];
  const xform = (x, y) => ({ x: mat[0] * x + mat[2] * y + mat[4], y: -(mat[1] * x + mat[3] * y + mat[5]) });
  const tol = Math.max(0.2, Number(options.tolerance) || 1);

  const rings = [];
  let inPath = false;
  let pathSubs = [];
  let curPts = [];
  let curPos = { x: 0, y: 0 };

  const flushSub = (closed) => {
    if (curPts.length >= 3) pathSubs.push({ pts: curPts, closed });
    curPts = [];
  };
  const emitPath = (fill) => {
    flushSub(false);
    for (const s of pathSubs) {
      if (s.pts.length < 3) continue;
      const autoClosed = Math.hypot(s.pts[0].x - s.pts.at(-1).x, s.pts[0].y - s.pts.at(-1).y) < 1;
      if (fill || s.closed || autoClosed) rings.push(s.pts);
    }
    pathSubs = [];
  };

  let pos = 0, guard = 0;
  while (pos + 8 <= bytes.length && guard++ < 500000) {
    const type = view.getUint32(pos, true);
    const size = view.getUint32(pos + 4, true);
    if (size < 8 || pos + size > bytes.length) break;
    const p = pos + 8;
    const end = pos + size;

    if (type === 14) break; // EMR_EOF
    else if (type === 33) matStack.push(mat.slice()); // EMR_SAVEDC
    else if (type === 34) mat = matStack.pop() || ID.slice(); // EMR_RESTOREDC
    else if (type === 35 && p + 24 <= end) { // EMR_SETWORLDTRANSFORM
      mat = [
        view.getFloat32(p, true), view.getFloat32(p + 4, true),
        view.getFloat32(p + 8, true), view.getFloat32(p + 12, true),
        view.getFloat32(p + 16, true), view.getFloat32(p + 20, true),
      ];
    } else if (type === 36 && p + 28 <= end) { // EMR_MODIFYWORLDTRANSFORM
      const m = [
        view.getFloat32(p, true), view.getFloat32(p + 4, true),
        view.getFloat32(p + 8, true), view.getFloat32(p + 12, true),
        view.getFloat32(p + 16, true), view.getFloat32(p + 20, true),
      ];
      const mode = view.getUint32(p + 24, true);
      if (mode === 1) mat = ID.slice();
      else if (mode === 2) mat = mulMat(m, mat);
      else if (mode === 3) mat = mulMat(mat, m);
      else if (mode === 4) mat = m;
    } else if (type === 59) { inPath = true; pathSubs = []; curPts = []; } // EMR_BEGINPATH
    else if (type === 60) { flushSub(false); inPath = false; } // EMR_ENDPATH
    else if (type === 61) { flushSub(true); } // EMR_CLOSEFIGURE
    else if (type === 62 || type === 63) { emitPath(true); } // EMR_FILLPATH / EMR_STROKEANDFILLPATH
    else if (type === 64) { emitPath(false); } // EMR_STROKEPATH
    else if (type === 27 && p + 8 <= end) { // EMR_MOVETOEX
      const pt = xform(view.getInt32(p, true), view.getInt32(p + 4, true));
      if (inPath) { flushSub(false); curPts = [pt]; }
      curPos = pt;
    } else if (type === 54 && p + 8 <= end) { // EMR_LINETO
      const pt = xform(view.getInt32(p, true), view.getInt32(p + 4, true));
      if (inPath) { if (!curPts.length) curPts.push(curPos); curPts.push(pt); }
      curPos = pt;
    } else if ((type === 3 || type === 4 || type === 86 || type === 87) && p + 20 <= end) { // POLYGON / POLYLINE (32 & 16)
      const is16 = type === 86 || type === 87;
      const isPoly = type === 3 || type === 86;
      const count = view.getUint32(p + 16, true);
      const stride = is16 ? 4 : 8;
      if (count >= 3 && p + 20 + count * stride <= end) {
        const ring = [];
        for (let i = 0; i < count; i++) {
          const x = is16 ? view.getInt16(p + 20 + i * 4, true) : view.getInt32(p + 20 + i * 8, true);
          const y = is16 ? view.getInt16(p + 22 + i * 4, true) : view.getInt32(p + 24 + i * 8, true);
          ring.push(xform(x, y));
        }
        if (inPath) pathSubs.push({ pts: ring, closed: isPoly });
        else if (isPoly || Math.hypot(ring[0].x - ring.at(-1).x, ring[0].y - ring.at(-1).y) < 1) rings.push(ring);
      }
    } else if ((type === 8 || type === 91) && p + 24 <= end) { // POLYPOLYGON (32 & 16)
      const is16 = type === 91;
      const polyCount = view.getUint32(p + 16, true);
      const stride = is16 ? 4 : 8;
      let off = p + 24;
      const counts = [];
      for (let k = 0; k < polyCount && off + 4 <= end; k++, off += 4) counts.push(view.getUint32(off, true));
      for (const count of counts) {
        if (count >= 3 && off + count * stride <= end) {
          const ring = [];
          for (let i = 0; i < count; i++) {
            const x = is16 ? view.getInt16(off + i * 4, true) : view.getInt32(off + i * 8, true);
            const y = is16 ? view.getInt16(off + i * 4 + 2, true) : view.getInt32(off + i * 8 + 4, true);
            ring.push(xform(x, y));
          }
          if (inPath) pathSubs.push({ pts: ring, closed: true });
          else rings.push(ring);
        }
        off += count * stride;
      }
    } else if ((type === 6 || type === 89) && p + 20 <= end) { // POLYLINETO (32 & 16)
      const is16 = type === 89;
      const count = view.getUint32(p + 16, true);
      const stride = is16 ? 4 : 8;
      if (count > 0 && p + 20 + count * stride <= end) {
        if (inPath && !curPts.length) curPts.push(curPos);
        for (let i = 0; i < count; i++) {
          const x = is16 ? view.getInt16(p + 20 + i * 4, true) : view.getInt32(p + 20 + i * 8, true);
          const y = is16 ? view.getInt16(p + 22 + i * 4, true) : view.getInt32(p + 24 + i * 8, true);
          curPos = xform(x, y);
          if (inPath) curPts.push(curPos);
        }
      }
    } else if ((type === 2 || type === 5 || type === 85 || type === 88) && p + 20 <= end) { // POLYBEZIER / POLYBEZIERTO
      const is16 = type === 85 || type === 88;
      const isTo = type === 5 || type === 88;
      const count = view.getUint32(p + 16, true);
      const stride = is16 ? 4 : 8;
      if (count >= 3 && p + 20 + count * stride <= end) {
        const pts = [];
        for (let i = 0; i < count; i++) {
          const x = is16 ? view.getInt16(p + 20 + i * 4, true) : view.getInt32(p + 20 + i * 8, true);
          const y = is16 ? view.getInt16(p + 22 + i * 4, true) : view.getInt32(p + 24 + i * 8, true);
          pts.push(xform(x, y));
        }
        let idx = 0;
        if (!isTo) {
          if (inPath) { flushSub(false); curPts = [pts[0]]; }
          curPos = pts[0];
          idx = 1;
        } else if (inPath && !curPts.length) {
          curPts.push(curPos);
        }
        while (idx + 2 < pts.length) {
          const sampled = sampleCubic(curPos, pts[idx], pts[idx + 1], pts[idx + 2], tol / Math.max(mmPerUnit, 1e-6));
          if (inPath) curPts.push(...sampled);
          curPos = pts[idx + 2];
          idx += 3;
        }
      }
    } else if (type === 43 && p + 16 <= end) { // EMR_RECTANGLE
      const l = view.getInt32(p, true), t = view.getInt32(p + 4, true), r = view.getInt32(p + 8, true), b = view.getInt32(p + 12, true);
      const ring = [xform(l, t), xform(r, t), xform(r, b), xform(l, b)];
      if (inPath) pathSubs.push({ pts: ring, closed: true });
      else rings.push(ring);
    } else if (type === 44 && p + 24 <= end) { // EMR_ROUNDRECT
      const l = view.getInt32(p, true), t = view.getInt32(p + 4, true), r = view.getInt32(p + 8, true), b = view.getInt32(p + 12, true);
      const rw = view.getInt32(p + 16, true), rh = view.getInt32(p + 20, true);
      const rr = roundRectRing(l, t, r, b, rw, rh);
      if (rr) {
        const ring = rr.map(q => xform(q.x, q.y));
        if (inPath) pathSubs.push({ pts: ring, closed: true });
        else rings.push(ring);
      }
    } else if (type === 42 && p + 16 <= end) { // EMR_ELLIPSE
      const l = view.getInt32(p, true), t = view.getInt32(p + 4, true), r = view.getInt32(p + 8, true), b = view.getInt32(p + 12, true);
      const el = ellipseRing(l, t, r, b);
      if (el) {
        const ring = el.map(q => xform(q.x, q.y));
        if (inPath) pathSubs.push({ pts: ring, closed: true });
        else rings.push(ring);
      }
    }
    pos += size;
  }

  if (pathSubs.length || curPts.length) emitPath(false);

  const unit = options.unit || 'auto';
  const baseFactor = unit !== 'auto' && UNIT_FACTORS[unit] ? UNIT_FACTORS[unit] : mmPerUnit;
  return { rings, factor: baseFactor, warnings };
}

export function importWmfEmf(bytes, filename = 'vektor.emf', kind = 'emf', options = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const scale = Number(options.scale ?? 1);
  if (!(scale > 0 && scale <= 1000)) throw Error('Ölçek geçersiz.');
  const parsed = kind === 'wmf' ? parseWmf(data, options) : parseEmf(data, options);
  if (!parsed.rings.length) {
    throw Error(kind.toUpperCase() + ' dosyasında kapalı vektör kesim konturu bulunamadı.');
  }
  const result = groupRings(parsed.rings, filename, kind, parsed.factor * scale, parsed.warnings);
  result.warnings.push(kind.toUpperCase() + ': kapalı vektör konturları yerel olarak okundu; CNC öncesi ölçüleri kontrol edin.');
  return result;
}
