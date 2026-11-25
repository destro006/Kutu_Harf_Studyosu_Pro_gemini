// Clipper integer geometry using convex-decomposed Minkowski sums (exact NFP
// including concave pockets such as U/E/crescent arcs) + LRU shape caching.
// Candidate geometry is only a placement search proxy; every accepted pose
// is independently validated against the exact unsimplified production contours.
import Clipper from '../../public/vendor/cad/clipper-runtime.js';

const S = 1000;
const NFP_CACHE_LIMIT = 1600;
const nfpCache = new Map();

const xy = (p) => ({ X: Math.round(p.x * S), Y: Math.round(p.y * S) });
const ring = (pts) => {
  const p = pts.map(xy);
  if (!Clipper.Clipper.Orientation(p)) p.reverse();
  return p;
};
const rect = (l, b, r, t) => [{ X: l, Y: b }, { X: r, Y: b }, { X: r, Y: t }, { X: l, Y: t }];

function polySignedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function ensureCCW(pts) {
  const out = pts.map(p => ({ x: p.x, y: p.y }));
  if (polySignedArea(out) < 0) out.reverse();
  return out;
}

function boundsOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function rdpClosed(pts, tol) {
  if (pts.length <= 12) return pts;
  let farIdx = 0, maxD2 = -1;
  for (let i = 1; i < pts.length; i++) {
    const d2 = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d2 > maxD2) { maxD2 = d2; farIdx = i; }
  }
  const rdpOpen = (arr) => {
    if (arr.length < 3) return arr;
    const keep = new Uint8Array(arr.length);
    keep[0] = keep[arr.length - 1] = 1;
    const stack = [[0, arr.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const a = arr[s], b = arr[e];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      let bestIdx = -1, bestD = tol;
      for (let i = s + 1; i < e; i++) {
        const d = Math.abs(dy * arr[i].x - dx * arr[i].y + b.x * a.y - b.y * a.x) / len;
        if (d > bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx > 0) { keep[bestIdx] = 1; stack.push([s, bestIdx], [bestIdx, e]); }
    }
    return arr.filter((_, i) => keep[i]);
  };
  const p1 = rdpOpen(pts.slice(0, farIdx + 1));
  const p2 = rdpOpen(pts.slice(farIdx).concat([pts[0]]));
  const res = p1.slice(0, -1).concat(p2.slice(0, -1));
  return res.length >= 3 ? res : pts;
}

function simplifyProxy(pts, tol = 0.65) {
  let clean = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (!prev || (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 > 1e-4) clean.push({ x: p.x, y: p.y });
  }
  if (clean.length > 2) {
    const f = clean[0], l = clean[clean.length - 1];
    if ((f.x - l.x) ** 2 + (f.y - l.y) ** 2 <= 1e-4) clean.pop();
  }
  // Drop strictly collinear intermediate vertices
  if (clean.length > 3) {
    const filtered = [];
    const n = clean.length;
    for (let i = 0; i < n; i++) {
      const a = clean[(i - 1 + n) % n], b = clean[i], c = clean[(i + 1) % n];
      const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const scale = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      if (Math.abs(cr) / scale > 1e-3) filtered.push(b);
    }
    if (filtered.length >= 3) clean = filtered;
  }
  if (clean.length > 44) {
    let t = tol;
    for (let k = 0; k < 5 && clean.length > 44; k++) {
      clean = rdpClosed(clean, t);
      t *= 1.65;
    }
    if (clean.length > 48) {
      const step = Math.ceil(clean.length / 44);
      clean = clean.filter((_, i) => i % step === 0);
    }
  }
  return ensureCCW(clean);
}

const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function pointInTri(p, a, b, c) {
  const c1 = cross2(a, b, p);
  const c2 = cross2(b, c, p);
  const c3 = cross2(c, a, p);
  return c1 >= -1e-7 && c2 >= -1e-7 && c3 >= -1e-7;
}

function earClipTriangulate(ccwPoly) {
  const n0 = ccwPoly.length;
  if (n0 < 3) return null;
  if (n0 === 3) return [ccwPoly.slice()];
  const verts = ccwPoly.slice();
  const tris = [];
  let guard = n0 * n0 * 2;
  let i = 0;
  while (verts.length > 3 && guard-- > 0) {
    const n = verts.length;
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i % n];
    const next = verts[(i + 1) % n];
    if (cross2(prev, curr, next) > 1e-6) {
      let hasInside = false;
      for (let k = 0; k < n; k++) {
        const vk = verts[k];
        if (vk === prev || vk === curr || vk === next) continue;
        if (pointInTri(vk, prev, curr, next)) { hasInside = true; break; }
      }
      if (!hasInside) {
        tris.push([prev, curr, next]);
        verts.splice(i % n, 1);
        i = 0;
        continue;
      }
    }
    i++;
    if (i >= n * 2) return null;
  }
  if (verts.length === 3 && Math.abs(cross2(verts[0], verts[1], verts[2])) > 1e-6) {
    tris.push(verts);
  }
  return tris.length ? tris : null;
}

function isConvexCCW(poly) {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (cross2(poly[i], poly[(i + 1) % n], poly[(i + 2) % n]) < -1e-5) return false;
  }
  return true;
}

function hertelMehlhornMerge(tris) {
  if (!tris || tris.length <= 1) return tris;
  const pieces = tris.map(t => t.slice());
  let merged = true;
  while (merged && pieces.length > 1) {
    merged = false;
    outer:
    for (let i = 0; i < pieces.length; i++) {
      const A = pieces[i];
      for (let j = i + 1; j < pieces.length; j++) {
        const B = pieces[j];
        for (let ai = 0; ai < A.length; ai++) {
          const a1 = A[ai], a2 = A[(ai + 1) % A.length];
          for (let bi = 0; bi < B.length; bi++) {
            const b1 = B[bi], b2 = B[(bi + 1) % B.length];
            if (Math.abs(a1.x - b2.x) < 1e-5 && Math.abs(a1.y - b2.y) < 1e-5 &&
                Math.abs(a2.x - b1.x) < 1e-5 && Math.abs(a2.y - b1.y) < 1e-5) {
              const cand = [];
              for (let k = 0; k < A.length; k++) cand.push(A[(ai + 1 + k) % A.length]);
              for (let k = 1; k < B.length - 1; k++) cand.push(B[(bi + 1 + k) % B.length]);
              if (isConvexCCW(cand)) {
                pieces[i] = cand;
                pieces.splice(j, 1);
                merged = true;
                break outer;
              }
            }
          }
        }
      }
    }
  }
  return pieces;
}

function convexDecompose(ccwPoly) {
  if (isConvexCCW(ccwPoly)) return [ccwPoly];
  const tris = earClipTriangulate(ccwPoly);
  if (!tris) return null;
  return hertelMehlhornMerge(tris);
}

function convexMinkowskiSum(P, Q) {
  const rotLowest = (arr) => {
    let idx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].y < arr[idx].y - 1e-9 || (Math.abs(arr[i].y - arr[idx].y) <= 1e-9 && arr[i].x < arr[idx].x)) idx = i;
    }
    return arr.slice(idx).concat(arr.slice(0, idx));
  };
  const A = rotLowest(P), B = rotLowest(Q);
  const m = A.length, n = B.length;
  const out = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    const pi = A[i % m], qj = B[j % n];
    out.push({ x: pi.x + qj.x, y: pi.y + qj.y });
    const aNext = A[(i + 1) % m], bNext = B[(j + 1) % n];
    const ax = aNext.x - pi.x, ay = aNext.y - pi.y;
    const bx = bNext.x - qj.x, by = bNext.y - qj.y;
    const cr = ax * by - ay * bx;
    if (i < m && (j >= n || cr > 1e-7)) i++;
    else if (j < n && (i >= m || cr < -1e-7)) j++;
    else { i++; j++; }
  }
  return out;
}

function shapeHash(pts) {
  let h = pts.length + ':';
  for (let i = 0; i < pts.length; i++) {
    h += Math.round(pts[i].x * 20) + ',' + Math.round(pts[i].y * 20) + ';';
  }
  return h;
}

function computeNormalizedForbiddenPaths(fixedNorm, movingNorm, clearance) {
  const negMoving = ensureCCW(movingNorm.map(p => ({ x: -p.x, y: -p.y })));
  const piecesA = convexDecompose(fixedNorm);
  const piecesB = convexDecompose(negMoving);

  let unioned = null;
  if (piecesA && piecesB && piecesA.length * piecesB.length <= 256) {
    const sums = [];
    for (const pa of piecesA) {
      for (const pb of piecesB) {
        const ms = convexMinkowskiSum(pa, pb);
        if (ms.length >= 3) sums.push(ring(ms));
      }
    }
    if (sums.length) {
      const cl = new Clipper.Clipper();
      const out = [];
      cl.AddPaths(sums, Clipper.PolyType.ptSubject, true);
      if (cl.Execute(Clipper.ClipType.ctUnion, out, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero) && out.length) {
        unioned = out;
      }
    }
  }

  if (!unioned) {
    const a = ring(fixedNorm);
    const b = ring(movingNorm).map(p => ({ X: -p.X, Y: -p.Y }));
    if (a.length < 3 || b.length < 3) return [];
    const raw = Clipper.Clipper.MinkowskiSum(b, a, true);
    if (!raw.length) return [];
    unioned = raw;
  }

  const offset = new Clipper.ClipperOffset(2, 0.25 * S);
  offset.AddPaths(unioned, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
  const out = [];
  offset.Execute(out, Math.ceil((clearance + 0.03) * S));
  return out;
}

export function forbiddenTranslations(fixed, moving, clearance) {
  const cleanFixed = simplifyProxy(fixed);
  const cleanMoving = simplifyProxy(moving);
  if (cleanFixed.length < 3 || cleanMoving.length < 3) return [];

  const fb = boundsOf(cleanFixed), mb = boundsOf(cleanMoving);
  const fixedNorm = cleanFixed.map(p => ({ x: p.x - fb.minX, y: p.y - fb.minY }));
  const movingNorm = cleanMoving.map(p => ({ x: p.x - mb.minX, y: p.y - mb.minY }));

  const key = `${shapeHash(fixedNorm)}|${shapeHash(movingNorm)}|${Math.round(clearance * 100)}`;
  let basePaths = nfpCache.get(key);
  if (basePaths) {
    nfpCache.delete(key);
    nfpCache.set(key, basePaths);
  } else {
    basePaths = computeNormalizedForbiddenPaths(fixedNorm, movingNorm, clearance);
    nfpCache.set(key, basePaths);
    while (nfpCache.size > NFP_CACHE_LIMIT) {
      nfpCache.delete(nfpCache.keys().next().value);
    }
  }

  const shiftX = Math.round((fb.minX - mb.minX) * S);
  const shiftY = Math.round((fb.minY - mb.minY) * S);
  if (!shiftX && !shiftY) return basePaths;
  return basePaths.map(path => path.map(p => ({ X: p.X + shiftX, Y: p.Y + shiftY })));
}

export function nfpCandidates(sheet, variant, minX, minY, maxX, maxY, sep, deadline = Infinity) {
  const l = Math.ceil(minX * S), b = Math.ceil(minY * S);
  const r = Math.floor((maxX - variant.bounds.width) * S), t = Math.floor((maxY - variant.bounds.height) * S);
  if (r < l || t < b || performance.now() > deadline) return [];
  const subject = rect(l, b, r, t), forbidden = [];
  for (const p of sheet.placements) {
    if (performance.now() > deadline) return [];
    const paths = forbiddenTranslations(p.outer, variant.outer, sep);
    for (let i = 0; i < paths.length; i++) forbidden.push(paths[i]);
  }
  if (!forbidden.length) {
    return [{ x: l / S, y: b / S }, { x: r / S, y: b / S }, { x: l / S, y: t / S }, { x: r / S, y: t / S }];
  }
  // Subtract forbidden translations (including inner concavity islands) from inner-fit region.
  const cl = new Clipper.Clipper(), out = [];
  cl.AddPath(subject, Clipper.PolyType.ptSubject, true);
  cl.AddPaths(forbidden, Clipper.PolyType.ptClip, true);
  cl.Execute(Clipper.ClipType.ctDifference, out, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);

  const points = [];
  for (const path of out) {
    const plen = path.length;
    for (let i = 0; i < plen; i++) {
      const a = path[i], c = path[(i + 1) % plen];
      const ax = a.X / S, ay = a.Y / S;
      points.push({ x: ax, y: ay });
      const segLen = Math.hypot(c.X / S - ax, c.Y / S - ay);
      if (segLen > 25) {
        points.push({ x: (ax + c.X / S) * 0.5, y: (ay + c.Y / S) * 0.5 });
      }
    }
  }
  return points;
}
