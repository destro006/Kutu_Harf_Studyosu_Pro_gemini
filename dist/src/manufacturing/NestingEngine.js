import {
  ensureWinding,
  minDistanceBetweenPolygons,
  polygonArea,
  polygonBounds,
  polygonsIntersect,
} from '../geometry/PolygonOffset.js';

/**
 * True-Shape Irregular Polygon Sheet Nesting Engine
 * Inspired by SVGNest / DeepNest principles:
 *  - Uses actual polygon contours (NEVER rectangular-only bounding-box packing)
 *  - Simplifies dense Bezier-sampled contours (e.g. 200+ pts -> ~28 pts) for fast interactive nesting
 *  - Allows overlapping bounding boxes when actual material contours are separated by >= (clearance + kerf)
 *  - Exploits concave pockets (e.g., interlocking E-shapes) via candidate pocket points + local slide compaction
 */

export function rotatePolygon(pts, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rotated = pts.map(p => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  }));
  const b = polygonBounds(rotated);
  return rotated.map(p => ({ x: p.x - b.minX, y: p.y - b.minY }));
}

export function translatePolygon(pts, dx, dy) {
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function simplifyClosedPolygon(pts, tol = 1.5) {
  if (!pts || pts.length <= 12) return pts;
  let farIdx = 0;
  let maxD2 = -1;
  for (let i = 1; i < pts.length; i++) {
    const d2 = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d2 > maxD2) { maxD2 = d2; farIdx = i; }
  }
  const rdp = (arr) => {
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
      if (bestIdx > 0) {
        keep[bestIdx] = 1;
        stack.push([s, bestIdx], [bestIdx, e]);
      }
    }
    return arr.filter((_, i) => keep[i]);
  };
  const p1 = rdp(pts.slice(0, farIdx + 1));
  const p2 = rdp(pts.slice(farIdx).concat([pts[0]]));
  const res = p1.slice(0, -1).concat(p2.slice(0, -1));
  return res.length >= 3 ? res : pts;
}

/**
 * Extracts nestable polygon items from current scene metricsList,
 * grouped by material + thickness.
 */
export function extractNestingItems(metricsList, state) {
  const copies = Math.max(1, Number(state.nesting?.copies || 1));
  const targetPart = state.nesting?.targetPart || 'all';
  const items = [];

  for (let c = 0; c < copies; c++) {
    for (const m of metricsList) {
      if (!m.polygonsMm?.length) continue;

      const addRing = (outer, holes, partType, materialName, thicknessMm) => {
        const normOuter = simplifyClosedPolygon(ensureWinding(outer, true), 1.8);
        if (normOuter.length < 3) return;
        const b = polygonBounds(normOuter);
        const shift = p => ({ x: p.x - b.minX, y: p.y - b.minY });
        const areaMm2 = Math.max(
          0,
          polygonArea(normOuter) - (holes || []).reduce((acc, h) => acc + polygonArea(h), 0)
        );
        items.push({
          id: `${m.objectId}_${m.label}_${partType}_c${c}_${items.length}`,
          label: `${m.label} (${partType})`,
          partType,
          materialGroup: `${materialName} · ${thicknessMm} mm`,
          outer: normOuter.map(shift),
          holes: (holes || []).map(h => simplifyClosedPolygon(ensureWinding(h, false), 1.8).map(shift)),
          areaMm2,
        });
      };

      if (targetPart === 'all' || targetPart === 'outer') {
        for (const poly of m.polygonsMm) {
          addRing(poly.outer, poly.holes, 'Gövde', state.materials?.faceId || 'metal', m.depthMm || 80);
        }
      }
      if ((targetPart === 'all' || targetPart === 'acrylic') && m.exportContours?.acrylic?.length) {
        for (const poly of m.exportContours.acrylic) {
          addRing(poly.outer, poly.holes, 'Pleksi', 'Pleksi', state.fileli?.acrylicThicknessMm || 3);
        }
      }
      if ((targetPart === 'all' || targetPart === 'file') && m.exportContours?.file?.length) {
        for (const poly of m.exportContours.file) {
          addRing(poly.outer, poly.holes, 'File', state.fileli?.fileMaterial || 'metal', state.fileli?.fileThicknessMm || 2);
        }
      }
    }
  }
  return items;
}

/**
 * Runs true-shape nesting on a set of polygon items.
 * Returns sheets with placed polygons, exact utilization %, scrap %, and interlock statistics.
 */
export function runTrueShapeNesting(items, config = {}) {
  const {
    sheetWidthMm = 3000,
    sheetHeightMm = 1500,
    marginMm = 15,
    clearanceMm = 5,
    kerfMm = 0.4,
    allowedAngles = [0, 90, 180, 270],
    fineAngleStep = 0,
    grainDirection = 'none',
  } = config;

  const minSep = Math.max(0.5, clearanceMm + kerfMm);
  const usableW = sheetWidthMm - marginMm * 2;
  const usableH = sheetHeightMm - marginMm * 2;

  let angles = allowedAngles.length ? allowedAngles : [0, 90, 180, 270];
  if (fineAngleStep > 0) {
    angles = [];
    for (let a = 0; a < 360; a += fineAngleStep) angles.push(a);
  }
  if (grainDirection === 'horizontal' || grainDirection === 'vertical') {
    angles = angles.filter(a => a % 180 === 0);
    if (!angles.length) angles = [0, 180];
  }

  const sorted = items.slice().sort((a, b) => b.areaMm2 - a.areaMm2);
  const sheets = [];
  const unplaced = [];

  const createSheet = (index) => ({
    index,
    widthMm: sheetWidthMm,
    heightMm: sheetHeightMm,
    marginMm,
    placements: [],
    usedAreaMm2: 0,
  });

  const fitsOnSheet = (sheet, candPoly, candBounds) => {
    if (
      candBounds.minX < marginMm - 1e-4 ||
      candBounds.minY < marginMm - 1e-4 ||
      candBounds.maxX > sheetWidthMm - marginMm + 1e-4 ||
      candBounds.maxY > sheetHeightMm - marginMm + 1e-4
    ) {
      return false;
    }
    for (const placed of sheet.placements) {
      const pb = placed.bounds;
      if (
        candBounds.maxX + minSep <= pb.minX ||
        pb.maxX + minSep <= candBounds.minX ||
        candBounds.maxY + minSep <= pb.minY ||
        pb.maxY + minSep <= candBounds.minY
      ) {
        continue;
      }
      const dist = minDistanceBetweenPolygons(candPoly, placed.outer);
      if (dist < minSep) return false;
      if (polygonsIntersect(candPoly, placed.outer)) return false;
    }
    return true;
  };

  for (const item of sorted) {
    const simpleOuter = simplifyClosedPolygon(item.outer, 1.8);
    const variants = angles.map(ang => {
      const rOuter = rotatePolygon(simpleOuter, ang);
      const rHoles = (item.holes || []).map(h => rotatePolygon(h, ang));
      const b = polygonBounds(rOuter);
      return { ang, outer: rOuter, holes: rHoles, bounds: b };
    }).filter(v => v.bounds.width <= usableW && v.bounds.height <= usableH);

    if (!variants.length) {
      unplaced.push({ item, reason: 'Parça plaka ölçüsünden büyük.' });
      continue;
    }

    let placedOk = false;
    for (const sheet of sheets) {
      const best = findBestPlacementOnSheet(sheet, variants, marginMm, sheetWidthMm, sheetHeightMm, fitsOnSheet);
      if (best) {
        sheet.placements.push({
          id: item.id,
          label: item.label,
          partType: item.partType,
          materialGroup: item.materialGroup,
          angleDeg: best.angleDeg,
          xMm: best.xMm,
          yMm: best.yMm,
          outer: best.outer,
          holes: best.holes,
          bounds: best.bounds,
          areaMm2: item.areaMm2,
        });
        sheet.usedAreaMm2 += item.areaMm2;
        placedOk = true;
        break;
      }
    }

    if (!placedOk) {
      const newSheet = createSheet(sheets.length + 1);
      const best = findBestPlacementOnSheet(newSheet, variants, marginMm, sheetWidthMm, sheetHeightMm, fitsOnSheet);
      if (best) {
        newSheet.placements.push({
          id: item.id,
          label: item.label,
          partType: item.partType,
          materialGroup: item.materialGroup,
          angleDeg: best.angleDeg,
          xMm: best.xMm,
          yMm: best.yMm,
          outer: best.outer,
          holes: best.holes,
          bounds: best.bounds,
          areaMm2: item.areaMm2,
        });
        newSheet.usedAreaMm2 += item.areaMm2;
        sheets.push(newSheet);
      } else {
        unplaced.push({ item, reason: 'Plakaya sığmadı.' });
      }
    }
  }

  let interlockedPairs = 0;
  for (const sh of sheets) {
    for (let i = 0; i < sh.placements.length; i++) {
      for (let j = i + 1; j < sh.placements.length; j++) {
        const a = sh.placements[i].bounds;
        const b = sh.placements[j].bounds;
        const aabbOverlap = !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
        if (aabbOverlap) interlockedPairs++;
      }
    }
    const sheetArea = sh.widthMm * sh.heightMm;
    sh.utilizationPct = Math.min(100, (sh.usedAreaMm2 / sheetArea) * 100);
    sh.scrapAreaM2 = Math.max(0, (sheetArea - sh.usedAreaMm2) / 1_000_000);
  }

  const totalSheetArea = sheets.reduce((s, sh) => s + sh.widthMm * sh.heightMm, 0);
  const totalUsedArea = sheets.reduce((s, sh) => s + sh.usedAreaMm2, 0);

  return {
    sheets,
    unplaced,
    sheetCount: sheets.length,
    interlockedPairs,
    overallUtilizationPct: totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0,
    totalScrapM2: Math.max(0, (totalSheetArea - totalUsedArea) / 1_000_000),
  };
}

function findBestPlacementOnSheet(sheet, variants, marginMm, sheetW, sheetH, fitsOnSheet) {
  let best = null;
  let bestScore = Infinity;

  const snap = (v) => Math.max(marginMm, Math.round(v / 10) * 10);
  const candX = new Set([marginMm]);
  const candY = new Set([marginMm]);
  const stepX = Math.max(40, Math.round((sheetW - marginMm * 2) / 14));
  const stepY = Math.max(40, Math.round((sheetH - marginMm * 2) / 10));

  for (let x = marginMm; x <= sheetW - marginMm; x += stepX) candX.add(snap(x));
  for (let y = marginMm; y <= sheetH - marginMm; y += stepY) candY.add(snap(y));

  for (const p of sheet.placements) {
    candX.add(snap(p.bounds.minX));
    candX.add(snap(p.bounds.maxX + 6));
    candY.add(snap(p.bounds.minY));
    candY.add(snap(p.bounds.maxY + 6));
    for (let k = 0; k < p.outer.length; k += Math.max(1, Math.floor(p.outer.length / 3))) {
      candX.add(snap(p.outer[k].x));
      candY.add(snap(p.outer[k].y));
    }
  }

  const xs = [...candX].sort((a, b) => a - b);
  const ys = [...candY].sort((a, b) => a - b);

  for (const v of variants) {
    for (const x of xs) {
      if (x + v.bounds.width > sheetW - marginMm) continue;
      if (x >= bestScore) break;
      for (const y of ys) {
        if (y + v.bounds.height > sheetH - marginMm) continue;
        const scoreApprox = x + y * 1.3;
        if (scoreApprox >= bestScore) break;

        const candPoly = translatePolygon(v.outer, x, y);
        const candBounds = {
          minX: x,
          minY: y,
          maxX: x + v.bounds.width,
          maxY: y + v.bounds.height,
        };
        if (fitsOnSheet(sheet, candPoly, candBounds)) {
          let cx = x, cy = y;
          for (const delta of [16, 4, 1]) {
            while (cx - delta >= marginMm) {
              const tp = translatePolygon(v.outer, cx - delta, cy);
              const tb = { minX: cx - delta, minY: cy, maxX: cx - delta + v.bounds.width, maxY: cy + v.bounds.height };
              if (fitsOnSheet(sheet, tp, tb)) cx -= delta;
              else break;
            }
            while (cy - delta >= marginMm) {
              const tp = translatePolygon(v.outer, cx, cy - delta);
              const tb = { minX: cx, minY: cy - delta, maxX: cx + v.bounds.width, maxY: cy - delta + v.bounds.height };
              if (fitsOnSheet(sheet, tp, tb)) cy -= delta;
              else break;
            }
          }
          const finalScore = cx + cy * 1.3;
          if (finalScore < bestScore) {
            bestScore = finalScore;
            best = {
              angleDeg: v.ang,
              xMm: cx,
              yMm: cy,
              outer: translatePolygon(v.outer, cx, cy),
              holes: v.holes.map(h => translatePolygon(h, cx, cy)),
              bounds: {
                minX: cx,
                minY: cy,
                maxX: cx + v.bounds.width,
                maxY: cy + v.bounds.height,
                width: v.bounds.width,
                height: v.bounds.height,
              },
            };
          }
          break;
        }
      }
    }
  }
  return best;
}
