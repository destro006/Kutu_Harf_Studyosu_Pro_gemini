/**
 * NestingEngine v3 Pro + Exact Minkowski NFP + Multi-Directional Concavity Compaction.
 * Exact manufacturing contours preserved untouched, cooperative time budget,
 * strict 0-degree grain lock, per-material batches, and safe locked placement preservation.
 */
import { polygonBounds, pointInPolygon, segmentsIntersect } from '../geometry/PolygonOffset.js';
import {
  rotatePolygon,
  translatePolygon,
  validateSheetLayout,
  ringLength,
  refreshNestingSheet,
  resolveNestingAngles,
} from './NestingEngine.js';

const check = (deadline) => { if (performance.now() >= deadline) throw new Error('PRO_BUDGET'); };

const edgeDataCache = new WeakMap();
function getEdgeData(pts) {
  let entry = edgeDataCache.get(pts);
  if (entry) return entry;
  const n = pts.length;
  const raw = [];
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const minX = a.x < b.x ? a.x : b.x, maxX = a.x > b.x ? a.x : b.x;
    const minY = a.y < b.y ? a.y : b.y, maxY = a.y > b.y ? a.y : b.y;
    const dx = b.x - a.x, dy = b.y - a.y;
    raw.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, minX, maxX, minY, maxY, len2: dx * dx + dy * dy || 1e-9 });
    if (minX < gMinX) gMinX = minX;
    if (minY < gMinY) gMinY = minY;
    if (maxX > gMaxX) gMaxX = maxX;
    if (maxY > gMaxY) gMaxY = maxY;
  }
  raw.sort((u, v) => u.minX - v.minX);
  const arr = new Float64Array(n * 9);
  for (let i = 0; i < n; i++) {
    const r = raw[i], o = i * 9;
    arr[o] = r.x1; arr[o + 1] = r.y1; arr[o + 2] = r.x2; arr[o + 3] = r.y2;
    arr[o + 4] = r.minX; arr[o + 5] = r.maxX; arr[o + 6] = r.minY; arr[o + 7] = r.maxY; arr[o + 8] = r.len2;
  }
  entry = { arr, n, gMinX, gMinY, gMaxX, gMaxY };
  if (n > 24) edgeDataCache.set(pts, entry);
  return entry;
}

// Allocation-free segment clearance with sorted edge bounds & early X-exit.
function fastPolygonsClear(ptsA, dx, dy, ptsB, minSep, deadline) {
  const sep2 = minSep * minSep, nA = ptsA.length;
  const edB = getEdgeData(ptsB), bArr = edB.arr, bCount = edB.n * 9;
  const gMinX = edB.gMinX, gMaxX = edB.gMaxX, gMinY = edB.gMinY, gMaxY = edB.gMaxY;
  const clamp = (t) => Math.max(0, Math.min(1, t));
  for (let i = 0; i < nA; i++) {
    if ((i & 31) === 0) check(deadline);
    const a1x = ptsA[i].x + dx, a1y = ptsA[i].y + dy;
    const a2x = ptsA[(i + 1) % nA].x + dx, a2y = ptsA[(i + 1) % nA].y + dy;
    const minX = (a1x < a2x ? a1x : a2x) - minSep, maxX = (a1x > a2x ? a1x : a2x) + minSep;
    if (maxX < gMinX || minX > gMaxX) continue;
    const minY = (a1y < a2y ? a1y : a2y) - minSep, maxY = (a1y > a2y ? a1y : a2y) + minSep;
    if (maxY < gMinY || minY > gMaxY) continue;
    const adx = a2x - a1x, ady = a2y - a1y, aLen2 = adx * adx + ady * ady || 1e-9;
    for (let o = 0; o < bCount; o += 9) {
      if (bArr[o + 4] > maxX) break;
      if (bArr[o + 5] < minX || bArr[o + 7] < minY || bArr[o + 6] > maxY) continue;
      const b1x = bArr[o], b1y = bArr[o + 1], b2x = bArr[o + 2], b2y = bArr[o + 3];
      const bdx = b2x - b1x, bdy = b2y - b1y, denom = adx * bdy - ady * bdx;
      if (denom > 1e-9 || denom < -1e-9) {
        const cx = b1x - a1x, cy = b1y - a1y;
        const t = (cx * bdy - cy * bdx) / denom, u = (cx * ady - cy * adx) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return false;
      }
      const t1 = clamp(((b1x - a1x) * adx + (b1y - a1y) * ady) / aLen2);
      const d1x = b1x - (a1x + t1 * adx), d1y = b1y - (a1y + t1 * ady);
      if (d1x * d1x + d1y * d1y < sep2 - 1e-8) return false;
      const t2 = clamp(((b2x - a1x) * adx + (b2y - a1y) * ady) / aLen2);
      const d2x = b2x - (a1x + t2 * adx), d2y = b2y - (a1y + t2 * ady);
      if (d2x * d2x + d2y * d2y < sep2 - 1e-8) return false;
      const bl2 = bArr[o + 8];
      const s1 = clamp(((a1x - b1x) * bdx + (a1y - b1y) * bdy) / bl2);
      const d3x = a1x - (b1x + s1 * bdx), d3y = a1y - (b1y + s1 * bdy);
      if (d3x * d3x + d3y * d3y < sep2 - 1e-8) return false;
      const s2 = clamp(((a2x - b1x) * bdx + (a2y - b1y) * bdy) / bl2);
      const d4x = a2x - (b1x + s2 * bdx), d4y = a2y - (b1y + s2 * bdy);
      if (d4x * d4x + d4y * d4y < sep2 - 1e-8) return false;
    }
  }
  return !pointInPolygon({ x: ptsA[0].x + dx, y: ptsA[0].y + dy }, ptsB) &&
         !pointInPolygon({ x: ptsB[0].x - dx, y: ptsB[0].y - dy }, ptsA);
}

function fitsInsideHole(outer, dx, dy, hole, hb, w, h, sep, deadline) {
  if (dx < hb.minX + sep - 1e-7 || dx + w > hb.maxX - sep + 1e-7 || dy < hb.minY + sep - 1e-7 || dy + h > hb.maxY - sep + 1e-7) return false;
  check(deadline);
  const ring = translatePolygon(outer, dx, dy);
  if (!ring.every(p => pointInPolygon(p, hole))) return false;
  for (let i = 0; i < ring.length; i++) {
    check(deadline);
    for (let j = 0; j < hole.length; j++) {
      if (segmentsIntersect(ring[i], ring[(i + 1) % ring.length], hole[j], hole[(j + 1) % hole.length], false)) return false;
    }
  }
  const edgeDistance2 = (p, a, b) => {
    const x = b.x - a.x, y = b.y - a.y, len = x * x + y * y || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / len));
    return (p.x - a.x - t * x) ** 2 + (p.y - a.y - t * y) ** 2;
  };
  for (const [a, b] of [[ring, hole], [hole, ring]]) {
    for (const p of a) {
      check(deadline);
      for (let j = 0; j < b.length; j++) {
        if (edgeDistance2(p, b[j], b[(j + 1) % b.length]) < sep * sep - 1e-7) return false;
      }
    }
  }
  return true;
}

const SLIDE_DIRS_COMPACT = [[-1, 0], [0, -1], [-0.707, -0.707], [-0.866, -0.5], [-0.5, -0.866], [-0.924, -0.383], [-0.383, -0.924], [-0.92, 0.38], [0.38, -0.92]];
const SLIDE_DIRS_VERTICAL = [[-1, 0], [-0.707, -0.707], [0, -1], [-0.866, 0.5], [-0.866, -0.5]];

function buildPoseScorer(sheet, minX, minY, maxX, maxY, strategy) {
  let usedX = minX, usedY = minY;
  for (const p of sheet.placements) {
    if (p.bounds.maxX > usedX) usedX = p.bounds.maxX;
    if (p.bounds.maxY > usedY) usedY = p.bounds.maxY;
  }
  const usableW = Math.max(1, maxX - minX);
  const usableH = Math.max(1, maxY - minY);
  const effectiveStrategy = strategy === 'auto'
    ? (usableW >= usableH ? 'compact' : 'bottomLeft')
    : strategy;

  return (x, y, w, h) => {
    const nw = Math.max(usedX, x + w) - minX;
    const nh = Math.max(usedY, y + h) - minY;
    let overlapArea = 0;
    const x2 = x + w, y2 = y + h;
    for (const p of sheet.placements) {
      const b = p.bounds;
      const ox = Math.min(x2, b.maxX) - Math.max(x, b.minX);
      const oy = Math.min(y2, b.maxY) - Math.max(y, b.minY);
      if (ox > 0 && oy > 0) overlapArea += ox * oy;
    }
    const overlapBonus = overlapArea * 0.36;

    if (effectiveStrategy === 'vertical') {
      const strip = nw * usableH;
      return strip * 2.2 + nw * nh * 0.45 + (x - minX) * 2.8 + (y - minY) * 0.18 - overlapBonus;
    }
    if (effectiveStrategy === 'bottomLeft') {
      return (x - minX) * 1.15 + (y - minY) * 1.35 + nw * nh * 0.08 - overlapBonus * 0.15;
    }
    const minStrip = Math.min(nw * usableH, nh * usableW);
    return nw * nh + minStrip * 0.03 + (x - minX) * 0.25 + (y - minY) * 0.22 - overlapBonus;
  };
}

function buildInterlockOrder(batch, bounds) {
  // Place concave / diagonal letters (e.g. two 'A's, 'V', 'M', 'W', 'L', 'K', 'Z')
  // adjacent in matching pairs so 0/180 interlocking meets directly.
  const baseKey = (item) => String(item.label || '').replace(/\s*\([^)]*\)\s*/g, '').replace(/-copy\d+$/i, '').trim().toUpperCase();
  const concavity = (item) => {
    const b = bounds.get(item.id);
    return (b.width * b.height) / Math.max(1, item.areaMm2);
  };
  const byShape = new Map();
  for (const item of batch) {
    const k = `${item.partGroup || 'body'}|${baseKey(item)}`;
    if (!byShape.has(k)) byShape.set(k, []);
    byShape.get(k).push(item);
  }
  const ranked = batch.slice().sort((a, b) => concavity(b) - concavity(a) || b.areaMm2 - a.areaMm2);
  const used = new Set();
  const order = [];
  for (const item of ranked) {
    if (used.has(item.id)) continue;
    used.add(item.id);
    order.push(item);
    const k = `${item.partGroup || 'body'}|${baseKey(item)}`;
    for (const mate of byShape.get(k) || []) {
      if (!used.has(mate.id)) {
        used.add(mate.id);
        order.push(mate);
        break;
      }
    }
  }
  return order;
}

function findBestNfpPlacement(sheet, variants, minX, minY, maxX, maxY, sep, allowHoleNesting, fits, config, deadline) {
  let best = null, bestScore = Infinity;
  const strategy = config.placementStrategy || 'compact';
  const score = buildPoseScorer(sheet, minX, minY, maxX, maxY, strategy);
  const dirs = strategy === 'vertical' ? SLIDE_DIRS_VERTICAL : SLIDE_DIRS_COMPACT;

  for (const v of variants) {
    check(deadline);
    const w = v.bounds.width, h = v.bounds.height;
    const cands = new Map(), xs = new Set([minX]), ys = new Set([minY]);
    const add = (x, y, forceKeep = false) => {
      if (x < minX - 1e-5 || y < minY - 1e-5 || x + w > maxX + 1e-5 || y + h > maxY + 1e-5) return;
      x = Math.max(minX, Math.min(maxX - w, x));
      y = Math.max(minY, Math.min(maxY - h, y));
      const key = forceKeep
        ? Math.round(x * 100) + ',' + Math.round(y * 100)
        : Math.round(x / 4) + ',' + Math.round(y / 4);
      const s = score(x, y, w, h);
      const prev = cands.get(key);
      if (!prev || s < prev.score) cands.set(key, { x, y, score: s });
    };

    if (config.nfpSearch && sheet.placements.length) {
      for (const pt of config.nfpSearch(sheet, v, minX, minY, maxX, maxY, sep, deadline)) {
        add(pt.x, pt.y, true);
      }
    }

    add(minX, minY, true);
    const stepX = Math.max(70, Math.round((maxX - minX) / 8));
    const stepY = Math.max(70, Math.round((maxY - minY) / 6));
    for (let x = minX; x < maxX; x += stepX) add(x, minY);
    for (let y = minY; y < maxY; y += stepY) add(minX, y);

    for (const p of sheet.placements) {
      check(deadline);
      const b = p.bounds;
      add(b.maxX + sep + 0.05, b.minY, true);
      add(b.minX, b.maxY + sep + 0.05, true);
      for (const x of [b.minX, b.maxX + sep + 0.001, b.minX - w - sep - 0.001, b.maxX - w]) xs.add(x);
      for (const y of [b.minY, b.maxY + sep + 0.001, b.minY - h - sep - 0.001, b.maxY - h]) ys.add(y);
      const step = Math.max(1, Math.floor(p.outer.length / 8));
      for (let k = 0; k < p.outer.length; k += step) {
        const pt = p.outer[k];
        add(pt.x + sep, pt.y + sep);
      }
      if (allowHoleNesting) {
        for (const hb of p.holeBounds || []) {
          add(hb.minX + sep + 0.001, hb.minY + sep + 0.001, true);
          add((hb.minX + hb.maxX - w) / 2, (hb.minY + hb.maxY - h) / 2, true);
        }
      }
    }
    for (const x of xs) {
      check(deadline);
      for (const y of ys) add(x, y);
    }

    const candidates = [...cands.values()].sort((a, b) => a.score - b.score);
    let feasibleTried = 0;
    const maxFeasiblePerVariant = sheet.placements.length > 0 ? 5 : 1;

    for (const { x, y } of candidates) {
      check(deadline);
      if (!fits(sheet, v, x, y)) continue;

      let cx = x, cy = y;
      let curS = score(cx, cy, w, h);
      for (const delta of [40, 12, 3, 0.5]) {
        let moved = true, guard = 0;
        while (moved && guard++ < 18) {
          check(deadline);
          moved = false;
          for (let d = 0; d < dirs.length; d++) {
            const nx = cx + dirs[d][0] * delta;
            const ny = cy + dirs[d][1] * delta;
            if (nx < minX - 1e-6 || ny < minY - 1e-6 || nx + w > maxX + 1e-6 || ny + h > maxY + 1e-6) continue;
            const ns = score(nx, ny, w, h);
            if (ns < curS - 1e-6 && fits(sheet, v, nx, ny)) {
              cx = nx; cy = ny; curS = ns; moved = true;
            }
          }
        }
      }

      if (curS < bestScore) {
        bestScore = curS;
        const holes = v.holes.map(r => translatePolygon(r, cx, cy));
        best = {
          angleDeg: v.ang,
          xMm: cx,
          yMm: cy,
          outer: translatePolygon(v.outer, cx, cy),
          holes,
          holeBounds: holes.map(polygonBounds),
          bounds: { minX: cx, minY: cy, maxX: cx + w, maxY: cy + h, width: w, height: h },
        };
      }
      if (++feasibleTried >= maxFeasiblePerVariant) break;
    }
  }
  return best;
}

function compactSheetPlacements(sheet, minX, minY, maxX, maxY, minSep, allowHoleNesting, strategy, deadline) {
  const n = sheet.placements.length;
  if (n < 2) return;
  const dirs = strategy === 'vertical' ? SLIDE_DIRS_VERTICAL : SLIDE_DIRS_COMPACT;

  const isInsideOtherHole = (idx) => {
    if (!allowHoleNesting) return false;
    const b = sheet.placements[idx].bounds;
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      for (const hb of sheet.placements[j].holeBounds || []) {
        if (b.minX >= hb.minX && b.maxX <= hb.maxX && b.minY >= hb.minY && b.maxY <= hb.maxY) return true;
      }
    }
    return false;
  };

  for (let pass = 0; pass < 2; pass++) {
    const order = sheet.placements
      .map((p, idx) => ({ idx, key: p.bounds.minX + p.bounds.minY }))
      .sort((a, b) => a.key - b.key);

    for (const { idx } of order) {
      check(deadline);
      const p = sheet.placements[idx];
      if (p.locked || isInsideOtherHole(idx)) continue;

      const origB = p.bounds;
      const localOuter = p.outer.map(pt => ({ x: pt.x - origB.minX, y: pt.y - origB.minY }));
      const w = origB.width, h = origB.height;

      const othersFits = (cx, cy) => {
        if (cx < minX - 1e-4 || cy < minY - 1e-4 || cx + w > maxX + 1e-4 || cy + h > maxY + 1e-4) return false;
        for (let j = 0; j < n; j++) {
          if (j === idx) continue;
          const o = sheet.placements[j];
          const ob = o.bounds;
          if (cx + w + minSep <= ob.minX || ob.maxX + minSep <= cx || cy + h + minSep <= ob.minY || ob.maxY + minSep <= cy) continue;
          if (allowHoleNesting && o.holes?.some((hr, hi) => fitsInsideHole(localOuter, cx, cy, hr, o.holeBounds[hi], w, h, minSep, deadline))) continue;
          if (!fastPolygonsClear(localOuter, cx, cy, o.outer, minSep, deadline)) return false;
        }
        return true;
      };

      let cx = origB.minX, cy = origB.minY;
      for (const delta of [24, 6, 1.5, 0.3]) {
        let moved = true, guard = 0;
        while (moved && guard++ < 16) {
          check(deadline);
          moved = false;
          for (let d = 0; d < dirs.length; d++) {
            const nx = cx + dirs[d][0] * delta;
            const ny = cy + dirs[d][1] * delta;
            if (nx < minX - 1e-6 || ny < minY - 1e-6 || nx + w > maxX + 1e-6 || ny + h > maxY + 1e-6) continue;
            if (dirs[d][0] + dirs[d][1] >= -0.05 && nx >= cx && ny >= cy) continue;
            if (othersFits(nx, ny)) {
              cx = nx; cy = ny; moved = true;
            }
          }
        }
      }

      if (Math.hypot(cx - origB.minX, cy - origB.minY) > 0.05) {
        const dx = cx - origB.minX, dy = cy - origB.minY;
        const nextOuter = translatePolygon(p.outer, dx, dy);
        const nextHoles = (p.holes || []).map(hr => translatePolygon(hr, dx, dy));
        p.outer = nextOuter;
        p.holes = nextHoles;
        p.holeBounds = nextHoles.map(polygonBounds);
        p.bounds = { minX: cx, minY: cy, maxX: cx + w, maxY: cy + h, width: w, height: h };
        p.xMm = cx;
        p.yMm = cy;
      }
    }
  }
}

function packBatchWithOrder(orderedItems, variantMap, params) {
  const { sheetWidthMm: w, sheetHeightMm: h, mL, mR, mT, mB, marginMm, minSep, allowHoleNesting, existingSheets, materialGroup, config, deadline } = params;
  const sheets = existingSheets.map(s => ({ ...s, placements: s.placements.map(p => ({ ...p })) }));
  const lockedIds = new Set(sheets.flatMap(s => s.placements.map(p => p.id))), unplaced = [];

  const fits = (sheet, v, x, y) => {
    check(deadline);
    const vw = v.bounds.width, vh = v.bounds.height;
    if (x < mL - 1e-4 || y < mB - 1e-4 || x + vw > w - mR + 1e-4 || y + vh > h - mT + 1e-4) return false;
    for (const p of sheet.placements) {
      const b = p.bounds;
      if (x + vw + minSep <= b.minX || b.maxX + minSep <= x || y + vh + minSep <= b.minY || b.maxY + minSep <= y) continue;
      if (allowHoleNesting && p.holes?.some((r, i) => fitsInsideHole(v.outer, x, y, r, p.holeBounds[i], vw, vh, minSep, deadline))) continue;
      if (!fastPolygonsClear(v.outer, x, y, p.outer, minSep, deadline)) return false;
    }
    return true;
  };

  for (const item of orderedItems) {
    check(deadline);
    if (lockedIds.has(item.id)) continue;
    const variants = variantMap.get(item.id);
    if (!variants?.length) { unplaced.push({ item, reason: 'Parça plaka ölçüsünden büyük.' }); continue; }
    const choose = (sheet) => findBestNfpPlacement(sheet, variants, mL, mB, w - mR, h - mT, minSep, allowHoleNesting, fits, config, deadline);
    let placed = false;
    for (const sheet of sheets) {
      const best = choose(sheet);
      if (best) { sheet.placements.push({ ...item, ...best, hasCollision: false }); sheet.usedAreaMm2 += item.areaMm2; placed = true; break; }
    }
    if (!placed) {
      const sheet = { index: sheets.length + 1, materialGroup, widthMm: w, heightMm: h, marginMm, marginLeftMm: mL, marginRightMm: mR, marginTopMm: mT, marginBottomMm: mB, allowHoleNesting, placements: [], usedAreaMm2: 0 };
      const best = choose(sheet);
      if (best) { sheet.placements.push({ ...item, ...best, hasCollision: false }); sheet.usedAreaMm2 = item.areaMm2; sheets.push(sheet); }
      else unplaced.push({ item, reason: 'Plakaya sığmadı.' });
    }
  }

  for (const sheet of sheets) {
    compactSheetPlacements(sheet, mL, mB, w - mR, h - mT, minSep, allowHoleNesting, config.placementStrategy || 'compact', deadline);
  }

  let envelope = 0, strip = 0;
  for (const sheet of sheets) {
    const x = Math.max(0, ...sheet.placements.map(p => p.bounds.maxX));
    const y = Math.max(0, ...sheet.placements.map(p => p.bounds.maxY));
    envelope += x * y;
    strip += config.placementStrategy === 'vertical' ? x * sheet.heightMm : Math.min(x * sheet.heightMm, y * sheet.widthMm);
  }
  return { sheets, unplaced, score: [unplaced.length, sheets.length, config.placementStrategy === 'compact' ? envelope : strip, config.placementStrategy === 'compact' ? strip : envelope] };
}

function better(a, b) {
  if (!b) return true;
  for (let i = 0; i < a.score.length; i++) if (Math.abs(a.score[i] - b.score[i]) > 1e-5) return a.score[i] < b.score[i];
  return false;
}

export function runProNesting(items, config = {}, existingLockedSheets = []) {
  const {
    sheetWidthMm = 3000, sheetHeightMm = 1500, marginMm = 15,
    marginLeftMm, marginRightMm, marginTopMm, marginBottomMm,
    clearanceMm = 5, kerfMm = 0.4,
    allowedAngles = [0, 90, 180, 270], fineAngleStep = 0, rotationStepDeg,
    enforceGrainDirection = false, grainDirection = 'none',
    allowHoleNesting = true, groupByMaterial = true, timeBudgetMs = 220,
    placementStrategy = 'compact',
  } = config;

  const deadline = Math.min(config.deadline ?? Infinity, performance.now() + Math.max(40, timeBudgetMs));
  const mL = marginLeftMm ?? marginMm, mR = marginRightMm ?? marginMm, mT = marginTopMm ?? marginMm, mB = marginBottomMm ?? marginMm;
  const minSep = Math.max(0.5, clearanceMm + kerfMm);
  const uw = sheetWidthMm - mL - mR, uh = sheetHeightMm - mB - mT;
  const effectiveStrategy = placementStrategy === 'auto'
    ? (sheetWidthMm >= sheetHeightMm ? 'compact' : 'bottomLeft')
    : placementStrategy;

  const angles = resolveNestingAngles({ allowedAngles, fineAngleStep, rotationStepDeg, enforceGrainDirection, grainDirection }, items.length);

  const batches = new Map();
  for (const item of items) {
    const key = groupByMaterial ? (item.materialGroup || 'Genel') : 'Genel';
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  }

  const allSheets = [], allUnplaced = [];
  for (const [materialGroup, batch] of batches) {
    check(deadline);
    const variantMap = new Map(), bounds = new Map(batch.map(i => [i.id, polygonBounds(i.outer)])), ids = new Set(batch.map(i => i.id));
    for (const item of batch) {
      check(deadline);
      variantMap.set(item.id, angles.map(ang => {
        const r = rotatePolygon(item.outer, ang), rad = ang * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
        return {
          ang,
          outer: r.points,
          holes: (item.holes || []).map(h => h.map(p => ({ x: p.x * c - p.y * s + r.dx, y: p.x * s + p.y * c + r.dy }))),
          bounds: polygonBounds(r.points),
        };
      }).filter(v => v.bounds.width <= uw + 1e-7 && v.bounds.height <= uh + 1e-7));
    }

    const existingSheets = [];
    for (const ex of existingLockedSheets) if (ex.materialGroup === materialGroup) {
      const placements = ex.placements
        .filter(p => p.locked)
        .map(p => ids.has(p.id) ? p : { ...p, id: String(p.id).replace(/_copy0$/, '') })
        .filter(p => ids.has(p.id))
        .map(p => ({ ...p, holeBounds: (p.holes || []).map(polygonBounds) }));
      if (placements.length) {
        existingSheets.push({
          index: existingSheets.length + 1,
          materialGroup,
          widthMm: sheetWidthMm,
          heightMm: sheetHeightMm,
          marginMm, marginLeftMm: mL, marginRightMm: mR, marginTopMm: mT, marginBottomMm: mB,
          allowHoleNesting,
          placements,
          usedAreaMm2: placements.reduce((s, p) => s + p.areaMm2, 0),
        });
      }
    }

    const params = {
      sheetWidthMm, sheetHeightMm, mL, mR, mT, mB, marginMm, minSep, allowHoleNesting,
      existingSheets, materialGroup,
      config: { ...config, placementStrategy: effectiveStrategy },
      deadline,
    };

    const concavityScore = (item) => {
      const b = bounds.get(item.id);
      return (b.width * b.height) / Math.max(1, item.areaMm2);
    };

    const orthoAngles = angles.filter(a => a % 90 === 0);
    const orthoVariantMap = new Map();
    if (orthoAngles.length && orthoAngles.length < angles.length) {
      for (const item of batch) {
        orthoVariantMap.set(item.id, (variantMap.get(item.id) || []).filter(v => orthoAngles.includes(v.ang)));
      }
    }

    const strategies = [
      { order: buildInterlockOrder(batch, bounds), vmap: orthoVariantMap.size ? orthoVariantMap : variantMap },
      { order: batch.slice().sort((a, b) => concavityScore(b) - concavityScore(a) || b.areaMm2 - a.areaMm2), vmap: variantMap },
      { order: batch.slice().sort((a, b) => b.areaMm2 - a.areaMm2), vmap: variantMap },
      { order: batch.slice().sort((a, b) => bounds.get(b.id).height - bounds.get(a.id).height), vmap: orthoVariantMap.size ? orthoVariantMap : variantMap },
      { order: batch.slice().sort((a, b) => bounds.get(b.id).width - bounds.get(a.id).width), vmap: orthoVariantMap.size ? orthoVariantMap : variantMap },
      { order: batch.slice().sort((a, b) => bounds.get(b.id).width * bounds.get(b.id).height - bounds.get(a.id).width * bounds.get(a.id).height), vmap: orthoVariantMap.size ? orthoVariantMap : variantMap },
    ];

    let best = null, bestOrder = null;
    for (const st of strategies) {
      try {
        const r = packBatchWithOrder(st.order, st.vmap, params);
        if (better(r, best)) { best = r; bestOrder = st.order; }
      } catch (e) { if (e.message !== 'PRO_BUDGET') throw e; break; }
    }
    if (!best) throw Error('PRO_BUDGET');

    for (let iter = 1; bestOrder.length > 2 && iter <= 14 && performance.now() < deadline; iter++) {
      const order = bestOrder.slice(), i = iter % order.length, j = (i + 1 + iter % Math.max(1, order.length - 1)) % order.length;
      [order[i], order[j]] = [order[j], order[i]];
      try {
        const r = packBatchWithOrder(order, variantMap, params);
        if (better(r, best)) { best = r; bestOrder = order; }
      } catch (e) { if (e.message !== 'PRO_BUDGET') throw e; break; }
    }

    for (const sh of best.sheets) { sh.index = allSheets.length + 1; allSheets.push(sh); }
    allUnplaced.push(...best.unplaced);
  }

  let interlockedPairs = 0, totalCutLengthM = 0;
  for (const sh of allSheets) {
    if (!refreshNestingSheet(sh, minSep).valid || !validateSheetLayout(sh, minSep, allowHoleNesting).valid) {
      throw Error('PRO_INVALID_LAYOUT');
    }
    for (let i = 0; i < sh.placements.length; i++) {
      const p = sh.placements[i];
      totalCutLengthM += (ringLength(p.outer) + (p.holes || []).reduce((s, h) => s + ringLength(h), 0)) / 1000;
      for (let j = i + 1; j < sh.placements.length; j++) {
        const a = p.bounds, b = sh.placements[j].bounds;
        if (!(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)) interlockedPairs++;
      }
    }
  }

  const usable = allSheets.reduce((s, sh) => s + sh.usableAreaMm2, 0);
  const used = allSheets.reduce((s, sh) => s + sh.usedAreaMm2, 0);
  return {
    sheets: allSheets,
    unplaced: allUnplaced,
    sheetCount: allSheets.length,
    interlockedPairs,
    overallUtilizationPct: usable > 0 ? used / usable * 100 : 0,
    totalScrapM2: allSheets.reduce((s, sh) => s + sh.scrapAreaM2, 0),
    totalCutLengthM,
    minSep,
  };
}
