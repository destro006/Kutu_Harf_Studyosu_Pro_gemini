import Clipper from '../../public/vendor/cad/clipper-runtime.js';

/**
 * Computational Geometry & Robust Polygon Offsetting / Boolean Engine (in millimeters)
 * Used for:
 *  - Authentic Turkish "Fileli Kutu Harf" inward border offsetting (outer dimensions preserved)
 *  - Universal node & winding auto-healing for fonts, SVGs, DXFs and logos
 *  - Narrow-stroke & self-intersection detection with Turkish warnings
 *  - 2D CAD Boolean operations (Union, Difference, Intersection)
 *  - Polygon collision/containment tests for True-Shape Nesting
 */

const EPS = 1e-6;
const CLIPPER_SCALE = 1000;

function toClipperPath(pts, ccw = null) {
  const path = (pts || [])
    .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));
  if (path.length >= 3 && ccw !== null && Clipper.Clipper.Orientation(path) !== ccw) {
    path.reverse();
  }
  return path;
}

function fromClipperPath(path) {
  return (path || []).map(p => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }));
}

function clipperPolyAreaMm2(path) {
  return Math.abs(Clipper.Clipper.Area(path)) / (CLIPPER_SCALE * CLIPPER_SCALE);
}

function cleanClipperPath(path, cleanTolMm = 0.04) {
  if (!path || path.length < 3) return [];
  const tol = Math.max(5, Math.round(cleanTolMm * CLIPPER_SCALE));
  const cleaned = Clipper.Clipper.CleanPolygon(path, tol);
  if (cleaned && cleaned.length >= 3) return cleaned;
  return path;
}

function extractPolyTreeRings(tree, cleanTolMm = 0.03, minAreaMm2 = 0.25) {
  const out = [];
  const visit = (node) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const cPath = cleanClipperPath(child.Contour(), cleanTolMm);
        if (cPath.length >= 3 && clipperPolyAreaMm2(cPath) >= minAreaMm2) {
          const outer = ensureWinding(fromClipperPath(cPath), true);
          const holes = [];
          for (const hNode of child.Childs()) {
            if (!hNode.IsHole()) continue;
            const hPath = cleanClipperPath(hNode.Contour(), cleanTolMm);
            if (hPath.length >= 3 && clipperPolyAreaMm2(hPath) >= minAreaMm2) {
              holes.push(ensureWinding(fromClipperPath(hPath), false));
            }
          }
          if (outer.length >= 3) out.push({ outer, holes });
        }
      }
      visit(child);
    }
  };
  visit(tree);
  return out;
}

/**
 * Auto-heals open gaps, zero-length/collinear segments, self-intersections and winding.
 */
export function healContourRing(ring, ccw = true, cleanTolMm = 0.04) {
  const valid = (ring || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const pre = ensureWinding(deduplicateRing(valid, 1e-4), ccw);
  if (pre.length < 3) return pre;
  try {
    const path = toClipperPath(pre, ccw);
    if (path.length < 3) return pre;
    const cleaned = cleanClipperPath(path, cleanTolMm);
    const simplified = Clipper.Clipper.SimplifyPolygon(cleaned, Clipper.PolyFillType.pftNonZero);
    if (!simplified || !simplified.length) return pre;
    let best = simplified[0];
    let bestArea = clipperPolyAreaMm2(best);
    for (let i = 1; i < simplified.length; i++) {
      const a = clipperPolyAreaMm2(simplified[i]);
      if (a > bestArea) { bestArea = a; best = simplified[i]; }
    }
    if (!best || best.length < 3) return pre;
    const healed = ensureWinding(fromClipperPath(best), ccw);
    return healed.length >= 3 ? healed : pre;
  } catch {
    return pre;
  }
}

/**
 * Heals outer ring (CCW) and holes (CW) and guarantees holes stay inside outer via Clipper.
 */
export function healPolygonWithHoles(outerCCW, holesCW = [], cleanTolMm = 0.03) {
  const outer = healContourRing(outerCCW, true, cleanTolMm);
  if (outer.length < 3) return { outer: [], holes: [] };
  const rawHoles = (holesCW || [])
    .map(h => healContourRing(h, false, cleanTolMm))
    .filter(h => h.length >= 3 && polygonArea(h) >= 0.25);
  if (!rawHoles.length) return { outer, holes: [] };
  try {
    const cl = new Clipper.Clipper();
    cl.AddPath(toClipperPath(outer, true), Clipper.PolyType.ptSubject, true);
    for (const h of rawHoles) {
      cl.AddPath(toClipperPath(h, true), Clipper.PolyType.ptClip, true);
    }
    const tree = new Clipper.PolyTree();
    if (!cl.Execute(Clipper.ClipType.ctDifference, tree, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero)) {
      return { outer, holes: rawHoles };
    }
    const rings = extractPolyTreeRings(tree, cleanTolMm, 0.25);
    if (!rings.length) return { outer, holes: rawHoles };
    rings.sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer));
    return { outer: rings[0].outer, holes: rings[0].holes };
  } catch {
    return { outer, holes: rawHoles };
  }
}

function isPointInsideOrOnRing(pt, ring, eps = 0.02) {
  if (pointInPolygon(pt, ring)) return true;
  for (let i = 0; i < ring.length; i++) {
    if (distPointToSegment(pt, ring[i], ring[(i + 1) % ring.length]) <= eps) return true;
  }
  return false;
}

/**
 * Audits a closed contour ring and automatically heals needle foldbacks (<5 deg)
 * and ultra-acute serif tip spikes (<minAngleDeg) into clean micro-bevel bridges.
 */
export function auditAndRepairContourNodes(ring, opts = {}) {
  const {
    ccw = true,
    minAngleDeg = 18,
    maxBevelMm = 1.6,
    targetFlatWidthMm = 0.45,
  } = opts;
  const pre = ensureWinding(deduplicateRing(ring || [], 0.015), ccw);
  if (pre.length < 4) return pre;
  const origArea = polygonArea(pre);
  if (origArea < 0.05) return pre;

  let pts = pre.map(p => ({ x: p.x, y: p.y }));

  // Pass 1: Eliminate near-180 deg foldbacks / hairpin reversals
  for (let pass = 0; pass < 4 && pts.length >= 4; pass++) {
    let changed = false;
    const nextPts = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
      const e2x = next.x - curr.x, e2y = next.y - curr.y;
      const l1 = Math.hypot(e1x, e1y);
      const l2 = Math.hypot(e2x, e2y);
      if (l1 < 0.01 || l2 < 0.01) { changed = true; continue; }
      const dot = (e1x * e2x + e1y * e2y) / (l1 * l2);
      if (dot <= -0.9962) {
        changed = true;
        continue;
      }
      nextPts.push(curr);
    }
    if (!changed || nextPts.length < 3) break;
    pts = deduplicateRing(nextPts, 0.015);
  }

  // Pass 2: Micro-bevel remaining ultra-acute needle tips (< minAngleDeg)
  const safeMinDeg = Math.max(5, Math.min(45, Number(minAngleDeg) || 18));
  const minDot = Math.cos(Math.PI - (safeMinDeg * Math.PI) / 180);
  if (pts.length >= 4) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
      const e2x = next.x - curr.x, e2y = next.y - curr.y;
      const l1 = Math.hypot(e1x, e1y);
      const l2 = Math.hypot(e2x, e2y);
      if (l1 < 0.01 || l2 < 0.01) continue;
      const u1x = e1x / l1, u1y = e1y / l1;
      const u2x = e2x / l2, u2y = e2y / l2;
      const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
      if (dot < minDot) {
        const interiorRad = Math.acos(Math.max(-1, Math.min(1, -dot)));
        const sinHalf = Math.max(0.04, Math.sin(interiorRad * 0.5));
        const d = Math.min(maxBevelMm, l1 * 0.4, l2 * 0.4, (targetFlatWidthMm * 0.5) / sinHalf);
        if (d > 0.04) {
          const p1 = { x: curr.x - u1x * d, y: curr.y - u1y * d };
          const p2 = { x: curr.x + u2x * d, y: curr.y + u2y * d };
          if (Math.hypot(p2.x - p1.x, p2.y - p1.y) >= 0.04) {
            out.push(p1, p2);
          } else {
            out.push({ x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 });
          }
          continue;
        }
      }
      out.push(curr);
    }
    pts = deduplicateRing(out, 0.015);
  }

  const repaired = ensureWinding(pts, ccw);
  if (repaired.length >= 3 && !hasSelfIntersection(repaired) && polygonArea(repaired) >= origArea * 0.90) {
    return repaired;
  }
  return pre;
}

function clampPolysInsideOuter(polys, outer, cleanTolMm = 0.03) {
  if (!polys?.length || !outer?.length) return polys || [];
  let needsClamp = false;
  for (const poly of polys) {
    if (!poly?.outer || hasSelfIntersection(poly.outer)) { needsClamp = true; break; }
    for (const pt of poly.outer) {
      if (!isPointInsideOrOnRing(pt, outer, 0.02)) { needsClamp = true; break; }
    }
    if (needsClamp) break;
    for (const h of poly.holes || []) {
      if (hasSelfIntersection(h)) { needsClamp = true; break; }
      for (const pt of h) {
        if (!isPointInsideOrOnRing(pt, outer, 0.02)) { needsClamp = true; break; }
      }
      if (needsClamp) break;
    }
    if (needsClamp) break;
  }
  if (!needsClamp) return polys;

  try {
    const cl = new Clipper.Clipper();
    for (const poly of polys) {
      if (!poly?.outer || poly.outer.length < 3) continue;
      cl.AddPath(toClipperPath(poly.outer, true), Clipper.PolyType.ptSubject, true);
      for (const h of poly.holes || []) {
        if (h?.length >= 3) cl.AddPath(toClipperPath(h, false), Clipper.PolyType.ptSubject, true);
      }
    }
    cl.AddPath(toClipperPath(outer, true), Clipper.PolyType.ptClip, true);
    const tree = new Clipper.PolyTree();
    if (cl.Execute(Clipper.ClipType.ctIntersection, tree, Clipper.PolyFillType.pftEvenOdd, Clipper.PolyFillType.pftEvenOdd)) {
      const clamped = extractPolyTreeRings(tree, cleanTolMm, 0.05);
      if (clamped.length) return clamped;
    }
  } catch {
    // ignore and return original
  }
  return polys;
}

/**
 * Signed area of a 2D polygon ring (positive = CCW, negative = CW).
 * @param {Array<{x:number,y:number}>} pts
 * @returns {number}
 */
export function signedArea(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return a * 0.5;
}

export function polygonArea(pts) {
  return Math.abs(signedArea(pts));
}

export function polygonPerimeter(pts) {
  let p = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

export function polygonBounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Ensure polygon has desired winding: ccw=true for outer, ccw=false for hole.
 */
export function ensureWinding(pts, ccw = true) {
  const clean = deduplicateRing(pts);
  if (clean.length < 3) return clean;
  const sa = signedArea(clean);
  if ((ccw && sa < 0) || (!ccw && sa > 0)) {
    return clean.slice().reverse();
  }
  return clean;
}

export function deduplicateRing(pts, minDist = 1e-4) {
  if (!pts || pts.length === 0) return [];
  const out = [];
  for (const p of pts) {
    if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > minDist) {
      out.push({ x: p.x, y: p.y });
    }
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= minDist) {
    out.pop();
  }
  return out;
}

/**
 * Point-in-polygon ray casting test.
 */
export function pointInPolygon(pt, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Segment-segment intersection (excluding shared endpoints if strict=true).
 */
export function segmentsIntersect(a, b, c, d, strict = false) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-10) return null;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const margin = strict ? 1e-4 : -1e-6;
  if (t > margin && t < 1 - margin && u > margin && u < 1 - margin) {
    return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
  }
  return null;
}

export function hasSelfIntersection(ring) {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d, true)) return true;
    }
  }
  return false;
}

export function polygonsIntersect(polyA, polyB) {
  if (!polyA.length || !polyB.length) return false;
  const bA = polygonBounds(polyA);
  const bB = polygonBounds(polyB);
  if (bA.maxX < bB.minX || bB.maxX < bA.minX || bA.maxY < bB.minY || bB.maxY < bA.minY) {
    return false;
  }
  for (let i = 0; i < polyA.length; i++) {
    const a = polyA[i];
    const b = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const c = polyB[j];
      const d = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a, b, c, d, false)) return true;
    }
  }
  if (pointInPolygon(polyA[0], polyB)) return true;
  if (pointInPolygon(polyB[0], polyA)) return true;
  return false;
}

/**
 * Minimum distance from point p to segment ab.
 */
export function distPointToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Minimum distance between two polygons (0 if intersecting/containing).
 */
export function minDistanceBetweenPolygons(polyA, polyB) {
  if (polygonsIntersect(polyA, polyB)) return 0;
  let minD = Infinity;
  for (const p of polyA) {
    for (let j = 0; j < polyB.length; j++) {
      const d = distPointToSegment(p, polyB[j], polyB[(j + 1) % polyB.length]);
      if (d < minD) minD = d;
    }
  }
  for (const p of polyB) {
    for (let i = 0; i < polyA.length; i++) {
      const d = distPointToSegment(p, polyA[i], polyA[(i + 1) % polyA.length]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * Offset a closed CCW polygon ring.
 * delta < 0 => inward offset (shrinks outer contour, e.g. for Fileli inner acrylic)
 * delta > 0 => outward offset (expands outer contour, or expands a CCW hole into stroke)
 * Uses miter-limited vertex bisectors + local loop trimming + self-intersection validation.
 */
/**
 * Offset a closed CCW polygon ring via ClipperOffset with miter clamping & node auto-repair.
 * delta < 0 => inward offset (guaranteed strictly inside input ring, never overshoots)
 * delta > 0 => outward offset
 */
export function offsetRing(ring, delta, miterLimit = 1.8) {
  const healed = healContourRing(ring, true, 0.025);
  const pts = healed.length >= 3 ? healed : ensureWinding(ring, true);
  const n = pts.length;
  if (n < 3) return { ok: false, points: [], reason: 'Geçersiz kontur (3 noktadan az).' };
  if (Math.abs(delta) < 1e-5) {
    return { ok: true, points: auditAndRepairContourNodes(pts, { ccw: true }), reason: null };
  }

  try {
    const safeMiter = Math.min(2.0, Math.max(1.2, Number(miterLimit) || 1.8));
    const cleanTol = Math.min(0.05, Math.max(0.015, Math.abs(delta) * 0.1));
    const co = new Clipper.ClipperOffset(safeMiter, 0.2 * CLIPPER_SCALE);
    co.AddPath(toClipperPath(pts, true), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
    const tree = new Clipper.PolyTree();
    co.Execute(tree, delta * CLIPPER_SCALE);
    let polys = extractPolyTreeRings(tree, cleanTol, 0.05);

    if (!polys.length) {
      return {
        ok: false,
        points: [],
        reason: delta < 0
          ? 'File genişliği bu harfin veya logonun dar kolları için çok büyük (iç alan kayboldu).'
          : 'Ofset konturu oluşturulamadı.',
      };
    }

    if (delta < 0) {
      polys = clampPolysInsideOuter(polys, pts, cleanTol);
      if (!polys.length) {
        return {
          ok: false,
          points: [],
          reason: 'İçe ofset işlemi dış sınırın dışına taştı (dar kol çakışması).',
        };
      }
    }

    polys.sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer));
    const best = auditAndRepairContourNodes(polys[0].outer, { ccw: true });
    const origArea = polygonArea(pts);
    const newArea = polygonArea(best);

    if (delta < 0 && newArea <= origArea * 0.015) {
      return {
        ok: false,
        points: [],
        reason: 'File genişliği bu harfin veya logonun dar kolları için çok büyük (iç alan kayboldu).',
      };
    }

    if (hasSelfIntersection(best)) {
      return {
        ok: false,
        points: best,
        reason: 'İçe ofset sırasında kendiliğinden kesişim oluştu. Daha küçük file genişliği deneyin.',
      };
    }

    return { ok: true, points: best, reason: null };
  } catch (err) {
    return {
      ok: false,
      points: [],
      reason: err?.message || 'Ofset hesaplama hatası.',
    };
  }
}

function resolveSimpleBowties(pts) {
  let arr = pts.slice();
  let changed = true;
  let guard = 0;
  while (changed && guard < 12 && arr.length >= 4) {
    changed = false;
    guard++;
    const n = arr.length;
    outer: for (let i = 0; i < n; i++) {
      const a = arr[i];
      const b = arr[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = arr[j];
        const d = arr[(j + 1) % n];
        const hit = segmentsIntersect(a, b, c, d, true);
        if (hit) {
          // Keep the larger loop
          const loop1 = [hit, ...arr.slice(i + 1, j + 1)];
          const loop2 = [...arr.slice(0, i + 1), hit, ...arr.slice(j + 1)];
          arr = polygonArea(loop1) >= polygonArea(loop2) ? loop1 : loop2;
          arr = deduplicateRing(arr, 1e-3);
          changed = true;
          break outer;
        }
      }
    }
  }
  return arr;
}

/**
 * Compute Fileli Channel Letter inward border + inner acrylic contour for a single polygon with holes.
 * Outer contour stays 100% unchanged!
 * @param {Array<{x:number,y:number}>} outerCCW
 * @param {Array<Array<{x:number,y:number}>>} holesCW
 * @param {number} fileWidthMm
 */
export function computeFileliContours(outerCCW, holesCW, fileWidthMm) {
  const healed = healPolygonWithHoles(outerCCW, holesCW, 0.025);
  const outer = healed.outer.length >= 3 ? healed.outer : ensureWinding(outerCCW, true);
  const holes = healed.holes;

  if (outer.length < 3) {
    return {
      ok: false,
      warning: 'Geçersiz kontur (3 noktadan az).',
      outer,
      holes,
      acrylicOuter: null,
      acrylicHoles: [],
      acrylicPolys: [],
      fileRings: [],
    };
  }

  if (fileWidthMm <= 0.05) {
    return {
      ok: true,
      warning: null,
      outer,
      holes,
      acrylicOuter: outer,
      acrylicHoles: holes,
      acrylicPolys: [{ outer, holes }],
      fileRings: [],
    };
  }

  const holeArea = holes.reduce((acc, h) => acc + polygonArea(h), 0);
  const origNetArea = Math.max(0, polygonArea(outer) - holeArea);
  if (origNetArea <= 0.5) {
    return {
      ok: false,
      warning: 'Geçersiz kontur alanı.',
      outer,
      holes,
      acrylicOuter: null,
      acrylicHoles: [],
      acrylicPolys: [],
      fileRings: [],
    };
  }

  const cleanTol = Math.min(0.05, Math.max(0.015, fileWidthMm * 0.12));

  try {
    // 1. Robust ClipperOffset PolyTree inward offset simultaneously handles outer boundary,
    //    inner holes (CW orientation), sharp serif corners (Z, M, N, R), and multiple islands.
    const co = new Clipper.ClipperOffset(1.8, 0.2 * CLIPPER_SCALE);
    co.AddPath(toClipperPath(outer, true), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
    for (const h of holes) {
      co.AddPath(toClipperPath(h, false), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
    }

    const acTree = new Clipper.PolyTree();
    co.Execute(acTree, -fileWidthMm * CLIPPER_SCALE);
    let acrylicPolys = extractPolyTreeRings(acTree, cleanTol, 0.5);
    acrylicPolys = clampPolysInsideOuter(acrylicPolys, outer, cleanTol).map(ap => ({
      outer: auditAndRepairContourNodes(ap.outer, { ccw: true }),
      holes: (ap.holes || []).map(h => auditAndRepairContourNodes(h, { ccw: false })),
    }));

    const netAreaOf = (p) => Math.max(0, polygonArea(p.outer) - p.holes.reduce((s, h) => s + polygonArea(h), 0));
    acrylicPolys.sort((a, b) => netAreaOf(b) - netAreaOf(a));
    const totalAcrylicArea = acrylicPolys.reduce((s, p) => s + netAreaOf(p), 0);

    if (!acrylicPolys.length || totalAcrylicArea <= origNetArea * 0.015) {
      return {
        ok: false,
        warning: `File (${fileWidthMm} mm): File genişliği bu harfin veya logonun dar kolları için çok büyük (iç alan kayboldu).`,
        outer,
        holes,
        acrylicOuter: null,
        acrylicHoles: [],
        acrylicPolys: [],
        fileRings: [],
      };
    }

    // 2. Boolean Difference (EvenOdd): exact metal file frame = (outer \ holes) \ acrylicPolys
    const diffCl = new Clipper.Clipper();
    diffCl.AddPath(toClipperPath(outer, true), Clipper.PolyType.ptSubject, true);
    for (const h of holes) {
      diffCl.AddPath(toClipperPath(h, false), Clipper.PolyType.ptSubject, true);
    }
    for (const ap of acrylicPolys) {
      diffCl.AddPath(toClipperPath(ap.outer, true), Clipper.PolyType.ptClip, true);
      for (const ah of ap.holes) {
        diffCl.AddPath(toClipperPath(ah, false), Clipper.PolyType.ptClip, true);
      }
    }
    const frameTree = new Clipper.PolyTree();
    if (!diffCl.Execute(Clipper.ClipType.ctDifference, frameTree, Clipper.PolyFillType.pftEvenOdd, Clipper.PolyFillType.pftEvenOdd)) {
      return {
        ok: false,
        warning: `File (${fileWidthMm} mm): File çerçeve konturu hesaplanamadı.`,
        outer,
        holes,
        acrylicOuter: null,
        acrylicHoles: [],
        acrylicPolys: [],
        fileRings: [],
      };
    }

    const isRealHole = (h) => {
      const a = polygonArea(h);
      const p = polygonPerimeter(h);
      return a >= 0.5 && (2 * a) / Math.max(1e-3, p) >= 0.25;
    };
    const fileRings = clampPolysInsideOuter(extractPolyTreeRings(frameTree, cleanTol, 0.25), outer, cleanTol).map(fr => ({
      outer: fr.outer,
      holes: (fr.holes || []).filter(isRealHole).map(h => auditAndRepairContourNodes(h, { ccw: false })),
    }));
    if (!fileRings.length) {
      return {
        ok: false,
        warning: `File (${fileWidthMm} mm): File çerçevesi oluşturulamadı.`,
        outer,
        holes,
        acrylicOuter: null,
        acrylicHoles: [],
        acrylicPolys: [],
        fileRings: [],
      };
    }

    return {
      ok: true,
      warning: null,
      outer,
      holes,
      acrylicOuter: acrylicPolys[0].outer,
      acrylicHoles: acrylicPolys[0].holes,
      acrylicPolys,
      fileRings,
    };
  } catch (err) {
    return {
      ok: false,
      warning: `File (${fileWidthMm} mm): ${err?.message || 'Ofset hesaplama hatası.'}`,
      outer,
      holes,
      acrylicOuter: null,
      acrylicHoles: [],
      acrylicPolys: [],
      fileRings: [],
    };
  }
}

/**
 * Computes the enlarged Pleksi (acrylic) cutting contour for Fileli letters.
 * Offsetting inward from the outer boundary by `max(wallThicknessMm, fileWidthMm - overlapMm)`
 * ensures the acrylic extends behind the metal file rim by `overlapMm` per side
 * while remaining safely inside the metal sidewall return.
 */
export function computeFileliAcrylicCutContours(outerCCW, holesCW, fileWidthMm, overlapMm = 3, wallThicknessMm = 1) {
  const safeWall = Math.max(0.4, Number(wallThicknessMm) || 1);
  const safeOverlap = Math.max(0, Number(overlapMm) || 0);
  const fw = Math.max(0, Number(fileWidthMm) || 0);
  const cutInsetMm = fw <= 0.05 ? 0 : Math.max(safeWall, fw - safeOverlap);

  if (cutInsetMm <= 0.05) {
    const healed = healPolygonWithHoles(outerCCW, holesCW, 0.025);
    const outer = healed.outer.length >= 3 ? healed.outer : ensureWinding(outerCCW, true);
    return {
      ok: outer.length >= 3,
      acrylicPolys: outer.length >= 3 ? [{ outer, holes: healed.holes }] : [],
      cutInsetMm: 0,
      warning: null,
    };
  }

  let res = computeFileliContours(outerCCW, holesCW, cutInsetMm);
  if (!res.ok && cutInsetMm < fw) {
    res = computeFileliContours(outerCCW, holesCW, fw);
  }
  return {
    ok: res.ok,
    acrylicPolys: res.acrylicPolys || [],
    cutInsetMm,
    warning: res.warning || null,
  };
}

/**
 * Expands existing Fileli visible acrylic contours outward by `overlapMm` per side,
 * optionally clamped inside the letter's metal sidewall cavity (`outerPolysMm` inset by `wallThicknessMm`).
 */
export function expandAcrylicContoursWithOverlap(acrylicContours, overlapMm = 3, outerPolysMm = null, wallThicknessMm = 1) {
  const safeOverlap = Math.max(0, Number(overlapMm) || 0);
  if (safeOverlap <= 0.05 || !acrylicContours?.length) {
    return acrylicContours || [];
  }
  const cleanTol = Math.min(0.05, Math.max(0.015, safeOverlap * 0.08));
  try {
    const co = new Clipper.ClipperOffset(1.8, 0.2 * CLIPPER_SCALE);
    for (const poly of acrylicContours) {
      if (!poly?.outer || poly.outer.length < 3) continue;
      co.AddPath(toClipperPath(poly.outer, true), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
      for (const h of poly.holes || []) {
        if (h?.length >= 3) {
          co.AddPath(toClipperPath(h, false), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
        }
      }
    }
    const expandedTree = new Clipper.PolyTree();
    co.Execute(expandedTree, safeOverlap * CLIPPER_SCALE);
    let resultPolys = extractPolyTreeRings(expandedTree, cleanTol, 0.5);
    if (!resultPolys.length) return acrylicContours;

    if (outerPolysMm?.length) {
      const safeWall = Math.max(0.4, Number(wallThicknessMm) || 1);
      const clampCo = new Clipper.ClipperOffset(2.2, 0.2 * CLIPPER_SCALE);
      let addedOuter = false;
      for (const op of outerPolysMm) {
        if (!op?.outer || op.outer.length < 3) continue;
        clampCo.AddPath(toClipperPath(op.outer, true), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
        for (const h of op.holes || []) {
          if (h?.length >= 3) {
            clampCo.AddPath(toClipperPath(h, false), Clipper.JoinType.jtMiter, Clipper.EndType.etClosedPolygon);
          }
        }
        addedOuter = true;
      }
      if (addedOuter) {
        const cavityTree = new Clipper.PolyTree();
        clampCo.Execute(cavityTree, -safeWall * CLIPPER_SCALE);
        const cavityPolys = extractPolyTreeRings(cavityTree, cleanTol, 0.5);
        if (cavityPolys.length) {
          const interCl = new Clipper.Clipper();
          for (const ep of resultPolys) {
            interCl.AddPath(toClipperPath(ep.outer, true), Clipper.PolyType.ptSubject, true);
            for (const h of ep.holes) interCl.AddPath(toClipperPath(h, false), Clipper.PolyType.ptSubject, true);
          }
          for (const cp of cavityPolys) {
            interCl.AddPath(toClipperPath(cp.outer, true), Clipper.PolyType.ptClip, true);
            for (const h of cp.holes) interCl.AddPath(toClipperPath(h, false), Clipper.PolyType.ptClip, true);
          }
          const clampedTree = new Clipper.PolyTree();
          if (interCl.Execute(Clipper.ClipType.ctIntersection, clampedTree, Clipper.PolyFillType.pftEvenOdd, Clipper.PolyFillType.pftEvenOdd)) {
            const clampedPolys = extractPolyTreeRings(clampedTree, cleanTol, 0.5);
            if (clampedPolys.length) resultPolys = clampedPolys;
          }
        }
      }
    }
    return resultPolys;
  } catch {
    return acrylicContours;
  }
}

/**
 * Computes the inset Arka Dekota backing cutting contour for Fileli letters.
 * Offsets outer contours inward and internal hole contours outward by `dekotaInsetMm`
 * so the Dekota backing sits cleanly inside the metal return sidewalls.
 */
export function computeFileliDekotaCutContours(outerCCW, holesCW, dekotaInsetMm = 2) {
  const safeInset = Math.max(0, Number(dekotaInsetMm) || 0);
  const healed = healPolygonWithHoles(outerCCW, holesCW, 0.025);
  const outer = healed.outer.length >= 3 ? healed.outer : ensureWinding(outerCCW, true);
  const holes = healed.holes || [];

  if (outer.length < 3) {
    return { ok: false, dekotaPolys: [], insetMm: safeInset, warning: 'Geçersiz kontur.' };
  }
  if (safeInset <= 0.05) {
    return { ok: true, dekotaPolys: [{ outer, holes }], insetMm: 0, warning: null };
  }

  let res = computeFileliContours(outer, holes, safeInset);
  if ((!res.ok || !res.acrylicPolys?.length) && safeInset > 1) {
    res = computeFileliContours(outer, holes, Math.min(safeInset, 1));
  }
  if (res.ok && res.acrylicPolys?.length) {
    return { ok: true, dekotaPolys: res.acrylicPolys, insetMm: safeInset, warning: null };
  }
  return { ok: true, dekotaPolys: [{ outer, holes }], insetMm: 0, warning: res.warning || null };
}

/**
 * 2D Polygon Boolean Operations (Union, Difference, Intersection)
 * via Sutherland-Hodgman / Weiler-Atherton-style contour clipping for CAD tools.
 */
export function booleanPolygons(polyA, polyB, op = 'union') {
  const A = ensureWinding(polyA, true);
  const B = ensureWinding(polyB, true);
  if (A.length < 3 || B.length < 3) return [A];

  if (!polygonsIntersect(A, B)) {
    const aInB = pointInPolygon(A[0], B);
    const bInA = pointInPolygon(B[0], A);
    if (op === 'union') {
      if (aInB) return [B];
      if (bInA) return [A];
      return [A, B];
    }
    if (op === 'intersection') {
      if (aInB) return [A];
      if (bInA) return [B];
      return [];
    }
    if (op === 'difference') {
      if (aInB) return [];
      return [A];
    }
  }

  // Greiner-Hormann style clipping with perturbation for robustness
  return weilerClip(A, B, op);
}

function weilerClip(A, B, op) {
  const buildNodes = (poly) => poly.map((p, idx) => ({
    x: p.x,
    y: p.y,
    alpha: 0,
    intersect: false,
    entry: false,
    visited: false,
    neighbor: null,
    next: null,
    prev: null,
    idx,
  }));

  const linkList = (nodes) => {
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      nodes[i].next = nodes[(i + 1) % n];
      nodes[i].prev = nodes[(i - 1 + n) % n];
    }
    return nodes[0];
  };

  const listA = buildNodes(A);
  const listB = buildNodes(B);
  const headA = linkList(listA);
  const headB = linkList(listB);

  const insertSorted = (start, node) => {
    let curr = start.next;
    while (curr !== start && curr.intersect && curr.alpha < node.alpha) {
      curr = curr.next;
    }
    node.prev = curr.prev;
    node.next = curr;
    curr.prev.next = node;
    curr.prev = node;
  };

  let interCount = 0;
  for (let i = 0; i < listA.length; i++) {
    const a1 = listA[i];
    const a2 = listA[(i + 1) % listA.length];
    for (let j = 0; j < listB.length; j++) {
      const b1 = listB[j];
      const b2 = listB[(j + 1) % listB.length];
      const hit = segmentsIntersect(a1, a2, b1, b2, true);
      if (hit) {
        interCount++;
        const nA = { x: hit.x, y: hit.y, alpha: hit.t, intersect: true, entry: false, visited: false, neighbor: null };
        const nB = { x: hit.x, y: hit.y, alpha: hit.u, intersect: true, entry: false, visited: false, neighbor: nA };
        nA.neighbor = nB;
        insertSorted(a1, nA);
        insertSorted(b1, nB);
      }
    }
  }

  if (interCount === 0) {
    if (op === 'union') return [A, B];
    if (op === 'intersection') return [];
    return [A];
  }

  // Mark entry/exit
  const markEntries = (head, otherPoly, wantInside) => {
    let inside = pointInPolygon(head, otherPoly);
    let curr = head;
    do {
      if (curr.intersect) {
        curr.entry = wantInside ? !inside : inside;
        inside = !inside;
      }
      curr = curr.next;
    } while (curr !== head);
  };

  if (op === 'union') {
    markEntries(headA, B, false);
    markEntries(headB, A, false);
  } else if (op === 'intersection') {
    markEntries(headA, B, true);
    markEntries(headB, A, true);
  } else if (op === 'difference') {
    markEntries(headA, B, false);
    markEntries(headB, A, true);
  }

  const results = [];
  const collectIntersections = (head) => {
    const out = [];
    let c = head;
    do {
      if (c.intersect && !c.visited) out.push(c);
      c = c.next;
    } while (c !== head);
    return out;
  };

  let unvisited = collectIntersections(headA);
  let guard = 0;
  while (unvisited.length && guard < 32) {
    guard++;
    let curr = unvisited[0];
    const poly = [];
    let forward = curr.entry;
    let steps = 0;
    while (!curr.visited && steps < 2000) {
      steps++;
      curr.visited = true;
      if (curr.neighbor) curr.neighbor.visited = true;
      poly.push({ x: curr.x, y: curr.y });
      curr = forward ? curr.next : curr.prev;
      while (!curr.intersect && steps < 2000) {
        steps++;
        poly.push({ x: curr.x, y: curr.y });
        curr = forward ? curr.next : curr.prev;
      }
      if (curr.intersect) {
        curr = curr.neighbor;
        forward = (op === 'difference' && currInList(curr, headB)) ? !curr.entry : curr.entry;
      }
    }
    const clean = deduplicateRing(poly, 1e-4);
    if (clean.length >= 3 && polygonArea(clean) > 1e-3) {
      results.push(ensureWinding(clean, true));
    }
    unvisited = collectIntersections(headA);
  }

  return results.length ? results : [A];
}

function currInList(node, head) {
  let c = head;
  do {
    if (c === node) return true;
    c = c.next;
  } while (c !== head);
  return false;
}
