/**
 * Computational Geometry & Robust Polygon Offsetting / Boolean Engine (in millimeters)
 * Used for:
 *  - Authentic Turkish "Fileli Kutu Harf" inward border offsetting (outer dimensions preserved)
 *  - Narrow-stroke & self-intersection detection with Turkish warnings
 *  - 2D CAD Boolean operations (Union, Difference, Intersection)
 *  - Polygon collision/containment tests for True-Shape Nesting
 */

const EPS = 1e-6;

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
export function offsetRing(ring, delta, miterLimit = 2.6) {
  const pts = ensureWinding(ring, true);
  const n = pts.length;
  if (n < 3) return { ok: false, points: [], reason: 'Geçersiz kontur (3 noktadan az).' };
  if (Math.abs(delta) < 1e-5) return { ok: true, points: pts, reason: null };

  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const u1x = e1x / l1, u1y = e1y / l1;

    const e2x = next.x - curr.x, e2y = next.y - curr.y;
    const l2 = Math.hypot(e2x, e2y) || 1;
    const u2x = e2x / l2, u2y = e2y / l2;

    // Outward normals for CCW ring: (uy, -ux)
    const n1x = u1y, n1y = -u1x;
    const n2x = u2y, n2y = -u2x;

    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bl = Math.hypot(bx, by);

    if (bl < 1e-5) {
      out.push({ x: curr.x + n1x * delta, y: curr.y + n1y * delta });
      continue;
    }
    bx /= bl;
    by /= bl;

    const cosHalf = bx * n1x + by * n1y;
    const miterLen = Math.abs(cosHalf) > 0.1 ? 1 / cosHalf : miterLimit;

    if (miterLen > miterLimit) {
      // Bevel at sharp corners to prevent long spikes
      const p1 = { x: curr.x + n1x * delta, y: curr.y + n1y * delta };
      const p2 = { x: curr.x + n2x * delta, y: curr.y + n2y * delta };
      out.push(p1, p2);
    } else {
      out.push({ x: curr.x + bx * delta * miterLen, y: curr.y + by * delta * miterLen });
    }
  }

  let cleaned = deduplicateRing(out, 1e-3);
  if (cleaned.length < 3) {
    return { ok: false, points: [], reason: 'İçe ofset konturu tamamen kapandı.' };
  }

  // Remove small inverted/self-intersecting loops by resolving single crossings
  cleaned = resolveSimpleBowties(cleaned);

  const origArea = polygonArea(pts);
  const newArea = signedArea(cleaned);

  if (delta < 0) {
    if (newArea <= origArea * 0.015) {
      return {
        ok: false,
        points: [],
        reason: 'File genişliği bu harfin veya logonun dar kolları için çok büyük (iç alan kayboldu).',
      };
    }
    // Check that offset points remain inside original polygon
    let outsideCount = 0;
    const step = Math.max(1, Math.floor(cleaned.length / 16));
    for (let i = 0; i < cleaned.length; i += step) {
      if (!pointInPolygon(cleaned[i], pts)) outsideCount++;
    }
    if (outsideCount > Math.ceil(cleaned.length / step / 3)) {
      return {
        ok: false,
        points: [],
        reason: 'İçe ofset işlemi dış sınırın dışına taştı (dar kol çakışması).',
      };
    }
  }

  if (hasSelfIntersection(cleaned)) {
    return {
      ok: false,
      points: cleaned,
      reason: 'İçe ofset sırasında kendiliğinden kesişim oluştu. Daha küçük file genişliği deneyin.',
    };
  }

  return { ok: true, points: cleaned, reason: null };
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
  const outer = ensureWinding(outerCCW, true);
  if (fileWidthMm <= 0.05) {
    return {
      ok: true,
      warning: null,
      outer,
      holes: holesCW.map(h => ensureWinding(h, false)),
      acrylicOuter: outer,
      acrylicHoles: holesCW.map(h => ensureWinding(h, false)),
      fileRings: [],
    };
  }

  const innerRes = offsetRing(outer, -fileWidthMm);
  if (!innerRes.ok) {
    return {
      ok: false,
      warning: `File (${fileWidthMm} mm): ${innerRes.reason}`,
      outer,
      holes: holesCW.map(h => ensureWinding(h, false)),
      acrylicOuter: null,
      acrylicHoles: [],
      fileRings: [],
    };
  }

  const acrylicOuter = ensureWinding(innerRes.points, true);
  const acrylicHoles = [];
  const holeFileRings = [];

  for (const h of holesCW) {
    const hCCW = ensureWinding(h, true);
    // Expanding hole outward (into the letter stroke) by fileWidthMm
    const expRes = offsetRing(hCCW, +fileWidthMm);
    if (!expRes.ok) {
      return {
        ok: false,
        warning: `İç boşluk filesi (${fileWidthMm} mm): ${expRes.reason}`,
        outer,
        holes: holesCW.map(x => ensureWinding(x, false)),
        acrylicOuter: null,
        acrylicHoles: [],
        fileRings: [],
      };
    }
    const expandedHoleCCW = ensureWinding(expRes.points, true);
    // Verify expanded hole doesn't swallow the acrylicOuter
    let holeCrossesOuter = false;
    for (let i = 0; i < expandedHoleCCW.length && !holeCrossesOuter; i++) {
      const a = expandedHoleCCW[i], b = expandedHoleCCW[(i + 1) % expandedHoleCCW.length];
      for (let j = 0; j < acrylicOuter.length; j++) {
        if (segmentsIntersect(a, b, acrylicOuter[j], acrylicOuter[(j + 1) % acrylicOuter.length], false)) {
          holeCrossesOuter = true;
          break;
        }
      }
    }
    if (!pointInPolygon(expandedHoleCCW[0], acrylicOuter) || holeCrossesOuter) {
      return {
        ok: false,
        warning: `File genişliği (${fileWidthMm} mm) iç boşluk ile dış sınır arasındaki kol için çok büyük.`,
        outer,
        holes: holesCW.map(x => ensureWinding(x, false)),
        acrylicOuter: null,
        acrylicHoles: [],
        fileRings: [],
      };
    }
    acrylicHoles.push(ensureWinding(expandedHoleCCW, false));
    // File ring around the hole: outer = expandedHoleCCW, inner hole = original hole CW
    holeFileRings.push({
      outer: expandedHoleCCW,
      holes: [ensureWinding(hCCW, false)],
    });
  }

  // Main outer file ring: outer = original outer CCW, inner hole = acrylicOuter CW
  const outerFileRing = {
    outer,
    holes: [ensureWinding(acrylicOuter, false)],
  };

  return {
    ok: true,
    warning: null,
    outer,
    holes: holesCW.map(h => ensureWinding(h, false)),
    acrylicOuter,
    acrylicHoles,
    fileRings: [outerFileRing, ...holeFileRings],
  };
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
