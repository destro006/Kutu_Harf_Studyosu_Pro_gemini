import {
  computeFileliContours,
  computeFileliAcrylicCutContours,
  computeFileliDekotaCutContours,
  ensureWinding,
  expandAcrylicContoursWithOverlap,
  minDistanceBetweenPolygons,
  distPointToSegment,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonPerimeter,
  polygonsIntersect,
  segmentsIntersect,
} from '../geometry/PolygonOffset.js';

/**
 * Industrial True-Shape Irregular Polygon Sheet Nesting Engine
 * - Material-aware batching (never mixes acrylic with stainless steel or different thicknesses)
 * - True-shape hole nesting (places smaller compatible parts inside large holes like 'O' when enabled)
 * - Grain-direction & rotation increment controls (0, 0/90, 0/90/180/270, 45, 30, 15, 5, 1 deg)
 * - Multi-sheet allocation + locked-part preservation during re-optimization
 * - Independent geometric validity & collision verification
 */

export const SHEET_PRESETS = [
  { id: '1000x2000', label: '1000 × 2000 mm', w: 1000, h: 2000 },
  { id: '1220x2440', label: '1220 × 2440 mm', w: 1220, h: 2440 },
  { id: '1250x2500', label: '1250 × 2500 mm', w: 1250, h: 2500 },
  { id: '3000x1500', label: '3000 × 1500 mm (Yatay)', w: 3000, h: 1500 },
  { id: '1500x3000', label: '1500 × 3000 mm (Dikey)', w: 1500, h: 3000 },
  { id: '2000x3000', label: '2000 × 3000 mm', w: 2000, h: 3000 },
  { id: '400x400', label: '400 × 400 mm (Test)', w: 400, h: 400 },
];

export function rotatePolygon(pts, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rotated = pts.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const b = polygonBounds(rotated);
  return {
    points: rotated.map(p => ({ x: p.x - b.minX, y: p.y - b.minY })),
    dx: -b.minX,
    dy: -b.minY,
  };
}

export function translatePolygon(pts, dx, dy) {
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function simplifyClosedPolygon(pts, tol = 1.5) {
  if (!pts || pts.length <= 12) return pts;
  let farIdx = 0, maxD2 = -1;
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
      if (bestIdx > 0) { keep[bestIdx] = 1; stack.push([s, bestIdx], [bestIdx, e]); }
    }
    return arr.filter((_, i) => keep[i]);
  };
  const p1 = rdp(pts.slice(0, farIdx + 1));
  const p2 = rdp(pts.slice(farIdx).concat([pts[0]]));
  const res = p1.slice(0, -1).concat(p2.slice(0, -1));
  return res.length >= 3 ? res : pts;
}

export const FILELI_NESTING_GROUPS = {
  file_frame: { id: 'file_frame', label: 'File Çerçeve (Metal)', color: '#d4a24c', layer: 'FILE_CERCEVE' },
  fileli_acrylic: { id: 'fileli_acrylic', label: 'Pleksi (Akrilik)', color: '#38bdf8', layer: 'PLEKSI_AKRILIK' },
  fileli_dekota: { id: 'fileli_dekota', label: 'Arka Dekota', color: '#34d399', layer: 'ARKA_DEKOTA' },
};

export const SIDEWALL_STRIP_GROUP = {
  id: 'sidewall_strip',
  label: 'Kenar Çıtaları (Yanak)',
  color: '#f59e0b',
  layer: 'KENAR_CITALARI',
};

/**
 * Extracts unfolded return sidewall strips (kenar dönüş çıtaları) for laser/router cutting.
 * Splits strips longer than the usable sheet span into clean butt-joint segments so 0 strips go unplaced.
 */
export function extractSidewallStripItems(metricsList, state) {
  const n = state.nesting || {};
  const copies = Math.max(1, Number(n.copies || 1));
  const wMm = Math.max(100, Number(n.sheetWidthMm) || 3000);
  const hMm = Math.max(100, Number(n.sheetHeightMm) || 1500);
  const mL = Number(n.marginLeftMm ?? n.marginMm ?? 15);
  const mR = Number(n.marginRightMm ?? n.marginMm ?? 15);
  const mT = Number(n.marginTopMm ?? n.marginMm ?? 15);
  const mB = Number(n.marginBottomMm ?? n.marginMm ?? 15);
  const usableW = Math.max(100, wMm - mL - mR);
  const usableH = Math.max(100, hMm - mT - mB);
  const maxSpan = Math.max(200, Math.max(usableW, usableH) - 2);
  const byObjId = new Map((state.objects || []).map(o => [o.id, o]));
  const items = [];

  for (let c = 0; c < copies; c++) {
    for (const m of metricsList || []) {
      const obj = byObjId.get(m.objectId) || {};
      const depthMm = Math.max(5, Number(m.depthMm ?? obj.depthMm ?? state.dimensions?.depthMm ?? 80));
      const cType = m.constructionType || obj.constructionType || state.constructionType || 'metal';
      const defaultThick = Number(state.fileli?.metalThicknessMm || 1);
      const rawStrips = (m.exportContours?.sidewallStrips || []).filter(s => s && Number(s.widthMm) > 1);
      const fallbackStrips = rawStrips.length
        ? rawStrips
        : (m.polygonsMm || []).flatMap(poly => [
            { kind: 'outer', holeIndex: 0, widthMm: polygonPerimeter(poly.outer), heightMm: depthMm, thicknessMm: defaultThick },
            ...(poly.holes || []).map((h, hi) => ({ kind: 'hole', holeIndex: hi + 1, widthMm: polygonPerimeter(h), heightMm: depthMm, thicknessMm: defaultThick })),
          ]).filter(s => s.widthMm > 1);

      const matName = cType === 'pleksi'
        ? (obj.acrylicMaterial || 'opalPleksi')
        : ((obj.sideFollowsFace ?? state.materials?.sideFollowsFace) !== false
          ? (cType === 'fileli' ? (obj.fileMaterial || state.fileli?.fileMaterial || 'aynaAltin') : (obj.faceMaterial || state.materials?.faceId || 'aynaAltin'))
          : (obj.sideMaterial || state.materials?.sideId || 'aynaAltin'));

      fallbackStrips.forEach((st, idx) => {
        const stripH = Math.max(5, Number(st.heightMm) || depthMm);
        const totalLen = Number(st.widthMm) || 0;
        if (totalLen <= 1) return;
        const segCount = Math.max(1, Math.ceil(totalLen / maxSpan));
        const segLen = totalLen / segCount;
        const kindLabel = st.kind === 'hole' ? 'İç Delik Çıtası' : 'Dış Kenar Çıtası';

        for (let si = 0; si < segCount; si++) {
          const outer = [
            { x: 0, y: 0 },
            { x: segLen, y: 0 },
            { x: segLen, y: stripH },
            { x: 0, y: stripH },
          ];
          const segSuffix = segCount > 1 ? ` (${si + 1}/${segCount})` : '';
          items.push({
            id: `${m.objectId}_${m.label}_strip_${idx}_${si}_c${c}_${items.length}`,
            projectId: state.projectId || 'proj_default',
            projectName: state.projectName || 'Proje',
            parentId: m.objectId,
            label: `${m.label} · ${kindLabel}${segSuffix} (${Math.round(segLen)}×${Math.round(stripH)})`,
            partType: 'Kenar Çıtası',
            partGroup: SIDEWALL_STRIP_GROUP.id,
            partGroupLabel: SIDEWALL_STRIP_GROUP.label,
            partColor: SIDEWALL_STRIP_GROUP.color,
            dxfLayer: SIDEWALL_STRIP_GROUP.layer,
            operation: 'CUT_OUTER',
            material: matName,
            thicknessMm: Number(st.thicknessMm) || defaultThick,
            materialGroup: `Kenar Çıtaları · ${Math.round(stripH)} mm Yanak`,
            outer,
            holes: [],
            areaMm2: segLen * stripH,
            locked: false,
            stripTotalLenMm: totalLen,
          });
        }
      });
    }
  }
  return items;
}

/**
 * Extracts nestable manufacturing components from current scene metricsList,
 * preserving projectId, parentId, partId, material, thickness, finish, and exact contours.
 * Fileli construction emits 3 color-coded groups (File Çerçeve, Pleksi, Arka Dekota),
 * each assigned to its own dedicated sheet tab; non-fileli constructions emit only outer body parts.
 * When nesting.targetPart === 'sidewalls', extracts ONLY unfolded return sidewall strips.
 */
export function extractNestingItems(metricsList, state) {
  const copies = Math.max(1, Number(state.nesting?.copies || 1));
  const targetPart = state.nesting?.targetPart || 'all';
  if (targetPart === 'sidewalls') {
    return extractSidewallStripItems(metricsList, state);
  }
  const items = [];

  for (let c = 0; c < copies; c++) {
    for (const m of metricsList) {
      if (!m.polygonsMm?.length) continue;
      const cType = m.constructionType || state.constructionType || 'metal';

      const addRing = (outer, holes, partType, materialName, thicknessMm, operation, extra = {}) => {
        const rawOuter = ensureWinding(outer, true);
        const normOuter = rawOuter; // preserve original manufacturing contour
        if (normOuter.length < 3) return;
        const b = polygonBounds(normOuter);
        const shift = p => ({ x: p.x - b.minX, y: p.y - b.minY });
        const normHoles = (holes || []).map(h => ensureWinding(h, false).map(shift));
        const holeArea = normHoles.reduce((acc, h) => acc + polygonArea(h), 0);
        const areaMm2 = Math.max(0, polygonArea(normOuter) - holeArea);

        items.push({
          id: `${m.objectId}_${m.label}_${partType}_c${c}_${items.length}`,
          projectId: state.projectId || 'proj_default',
          projectName: state.projectName || 'Proje',
          parentId: m.objectId,
          label: `${m.label} (${partType})`,
          partType,
          partGroup: extra.partGroup || 'body',
          partGroupLabel: extra.partGroupLabel || 'Gövde',
          partColor: extra.partColor || null,
          dxfLayer: extra.dxfLayer || null,
          operation,
          material: materialName,
          thicknessMm,
          materialGroup: extra.materialGroupOverride || `${materialName} · ${thicknessMm} mm`,
          outer: normOuter.map(shift),
          holes: normHoles,
          areaMm2,
          locked: false,
        });
      };

      if (cType === 'fileli') {
        const obj = (state.objects || []).find(o => o.id === m.objectId);
        const fileThick = state.fileli?.fileThicknessMm || 2;
        const acThick = state.fileli?.acrylicThicknessMm || 3;
        const dekThick = state.fileli?.dekotaThicknessMm || 5;
        const overlapMm = Math.max(0, Number(state.fileli?.acrylicOverlapMm ?? 3));
        const hasDirectAcrylicInset = Number.isFinite(Number(state.fileli?.acrylicCutInsetMm)) && state.fileli?.acrylicCutInsetMm !== null;
        const acrylicCutInsetMm = hasDirectAcrylicInset ? Math.max(0, Number(state.fileli.acrylicCutInsetMm)) : null;
        const dekotaInsetMm = Math.max(0, Number(state.fileli?.dekotaInsetMm ?? 2));
        const fmtNum = v => Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
        const overlapLabel = fmtNum(overlapMm);
        const dekotaInsetLabel = fmtNum(dekotaInsetMm);
        const wallMm = Math.max(0.4, Number(m.metalThicknessMm ?? state.fileli?.metalThicknessMm ?? 1));
        const targetFileW = Math.max(0, Number(obj?.fileWidthMm ?? state.fileli?.fileWidthMm ?? m.fileWidthMm ?? 5));
        const fileWidthChanged = m.fileWidthMm != null && Math.abs(targetFileW - m.fileWidthMm) > 1e-4;

        const fileGroupName = `File Çerçeve · ${fileThick} mm`;
        const acrylicGroupName = acrylicCutInsetMm !== null
          ? `Pleksi (-${fmtNum(acrylicCutInsetMm)} mm İçe) · ${acThick} mm`
          : (overlapMm > 0.01 ? `Pleksi (+${overlapLabel} mm Pay) · ${acThick} mm` : `Pleksi (Akrilik) · ${acThick} mm`);
        const dekotaGroupName = dekotaInsetMm > 0.01
          ? `Arka Dekota (-${dekotaInsetLabel} mm) · ${dekThick} mm`
          : `Arka Dekota · ${dekThick} mm`;

        let fileRings = m.exportContours?.file?.length ? m.exportContours.file : m.polygonsMm;
        if (fileWidthChanged && targetFileW > 0.05 && m.polygonsMm?.length) {
          const recomputedFile = [];
          for (const poly of m.polygonsMm) {
            const fRes = computeFileliContours(poly.outer, poly.holes, targetFileW);
            if (fRes.ok && fRes.fileRings?.length) recomputedFile.push(...fRes.fileRings);
          }
          if (recomputedFile.length) fileRings = recomputedFile;
        }
        const fileMat = state.fileli?.fileMaterial || 'aynaAltin';
        if (targetPart === 'all' || targetPart === 'file') {
          for (const poly of fileRings) {
            addRing(poly.outer, poly.holes, 'File Çerçeve', fileMat, fileThick, 'CUT_OUTER', {
              partGroup: FILELI_NESTING_GROUPS.file_frame.id,
              partGroupLabel: FILELI_NESTING_GROUPS.file_frame.label,
              partColor: FILELI_NESTING_GROUPS.file_frame.color,
              dxfLayer: FILELI_NESTING_GROUPS.file_frame.layer,
              materialGroupOverride: fileGroupName,
            });
          }
        }
        if (targetPart === 'all' || targetPart === 'acrylic') {
          let acrylicCutPolys = [];
          if (acrylicCutInsetMm !== null && m.polygonsMm?.length) {
            for (const poly of m.polygonsMm) {
              const directRes = computeFileliContours(poly.outer, poly.holes, acrylicCutInsetMm);
              if (directRes.ok && directRes.acrylicPolys?.length) acrylicCutPolys.push(...directRes.acrylicPolys);
            }
          } else if (!fileWidthChanged && m.exportContours?.acrylicCut?.length && Math.abs((m.exportContours.acrylicOverlapMm ?? overlapMm) - overlapMm) < 1e-4) {
            acrylicCutPolys = m.exportContours.acrylicCut;
          } else if (m.fileWidthMm != null && m.polygonsMm?.length) {
            for (const poly of m.polygonsMm) {
              const cutRes = computeFileliAcrylicCutContours(poly.outer, poly.holes, targetFileW, overlapMm, wallMm);
              if (cutRes.ok && cutRes.acrylicPolys.length) acrylicCutPolys.push(...cutRes.acrylicPolys);
            }
          } else if (m.exportContours?.acrylic?.length) {
            acrylicCutPolys = expandAcrylicContoursWithOverlap(m.exportContours.acrylic, overlapMm, m.polygonsMm, wallMm);
          }
          if (!acrylicCutPolys.length && m.exportContours?.acrylic?.length) {
            acrylicCutPolys = m.exportContours.acrylic;
          }
          for (const poly of acrylicCutPolys) {
            addRing(poly.outer, poly.holes, 'Pleksi', state.fileli?.acrylicMaterial || 'opalPleksi', acThick, 'CUT_OUTER', {
              partGroup: FILELI_NESTING_GROUPS.fileli_acrylic.id,
              partGroupLabel: FILELI_NESTING_GROUPS.fileli_acrylic.label,
              partColor: FILELI_NESTING_GROUPS.fileli_acrylic.color,
              dxfLayer: FILELI_NESTING_GROUPS.fileli_acrylic.layer,
              materialGroupOverride: acrylicGroupName,
            });
          }
        }
        if (targetPart === 'all' || targetPart === 'outer' || targetPart === 'dekota') {
          let backingCutPolys = [];
          if (m.exportContours?.backingCut?.length && Math.abs((m.exportContours.dekotaInsetMm ?? dekotaInsetMm) - dekotaInsetMm) < 1e-4) {
            backingCutPolys = m.exportContours.backingCut;
          } else {
            const baseBacking = m.exportContours?.backing?.length ? m.exportContours.backing : m.polygonsMm;
            for (const poly of baseBacking) {
              const dekRes = computeFileliDekotaCutContours(poly.outer, poly.holes, dekotaInsetMm);
              if (dekRes.ok && dekRes.dekotaPolys?.length) backingCutPolys.push(...dekRes.dekotaPolys);
            }
          }
          if (!backingCutPolys.length) {
            backingCutPolys = m.exportContours?.backing?.length ? m.exportContours.backing : m.polygonsMm;
          }
          for (const poly of backingCutPolys) {
            addRing(poly.outer, poly.holes, 'Arka Dekota', 'dekota', dekThick, 'CUT_OUTER', {
              partGroup: FILELI_NESTING_GROUPS.fileli_dekota.id,
              partGroupLabel: FILELI_NESTING_GROUPS.fileli_dekota.label,
              partColor: FILELI_NESTING_GROUPS.fileli_dekota.color,
              dxfLayer: FILELI_NESTING_GROUPS.fileli_dekota.layer,
              materialGroupOverride: dekotaGroupName,
            });
          }
        }
      } else {
        for (const poly of m.polygonsMm) {
          addRing(poly.outer, poly.holes, 'Gövde', state.materials?.faceId || 'metal', m.depthMm || 80, 'CUT_OUTER');
        }
      }
    }
  }
  return items;
}

/**
 * Checks whether `candPoly` can be placed inside `holePoly` of `placedPart`
 * with at least `minSep` clearance on all edges.
 */
function fitsInsideHole(candPoly, holePoly, minSep) {
  if (!holePoly || holePoly.length < 3) return false;
  const cb = polygonBounds(candPoly);
  const hb = polygonBounds(holePoly);
  if (cb.minX < hb.minX + minSep || cb.maxX > hb.maxX - minSep || cb.minY < hb.minY + minSep || cb.maxY > hb.maxY - minSep) {
    return false;
  }
  // Every vertex of candPoly must be inside holePoly
  for (let i = 0; i < candPoly.length; i++) {
    if (!pointInPolygon(candPoly[i], holePoly)) return false;
  }
  // No edge crossing and minimum distance >= minSep
  for (let i = 0; i < candPoly.length; i++) {
    const a = candPoly[i], b = candPoly[(i + 1) % candPoly.length];
    for (let j = 0; j < holePoly.length; j++) {
      if (segmentsIntersect(a, b, holePoly[j], holePoly[(j + 1) % holePoly.length], false)) return false;
    }
  }
  // Boundary-to-boundary distance (containment is desired here, not collision!)
  let minD = Infinity;
  for (const pt of candPoly) {
    for (let j = 0; j < holePoly.length; j++) {
      const a = holePoly[j], b = holePoly[(j + 1) % holePoly.length];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / l2));
      minD = Math.min(minD, Math.hypot(pt.x - (a.x + t * vx), pt.y - (a.y + t * vy)));
    }
  }
  for(const pt of holePoly)for(let j=0;j<candPoly.length;j++)minD=Math.min(minD,distPointToSegment(pt,candPoly[j],candPoly[(j+1)%candPoly.length]));
  return minD >= minSep-1e-7;
}

/**
 * Validates every placement on a sheet for overlaps, out-of-bounds, and insufficient spacing.
 */
export function validateSheetLayout(sheet, minSep = 5, allowHoleNesting = sheet.allowHoleNesting !== false) {
  const errors = [];
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;

  for(const placement of sheet.placements)placement.hasCollision=false;
  const sorted=sheet.placements.slice().sort((a,b)=>a.bounds.minX-b.bounds.minX);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (
      a.bounds.minX < mL - 0.1 ||
      a.bounds.minY < mB - 0.1 ||
      a.bounds.maxX > sheet.widthMm - mR + 0.1 ||
      a.bounds.maxY > sheet.heightMm - mT + 0.1
    ) {
      a.hasCollision = true;
      errors.push(`${a.label}: Plaka kesim sınırı dışında.`);
    }

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const ab=a.bounds,bb=b.bounds;
      if(ab.maxX+minSep<=bb.minX+1e-5)break;
      if(ab.maxX+minSep<=bb.minX+1e-5||bb.maxX+minSep<=ab.minX+1e-5||ab.maxY+minSep<=bb.minY+1e-5||bb.maxY+minSep<=ab.minY+1e-5)continue;
      const insideAHole = allowHoleNesting&&a.holes?.some(h => fitsInsideHole(b.outer, h, minSep));
      const insideBHole = allowHoleNesting&&b.holes?.some(h => fitsInsideHole(a.outer, h, minSep));
      if (insideAHole || insideBHole) continue;

      const d = minDistanceBetweenPolygons(a.outer, b.outer);
      if (d < minSep - 1e-5 || polygonsIntersect(a.outer, b.outer)) {
        a.hasCollision = true;
        b.hasCollision = true;
        errors.push(`${a.label} ↔ ${b.label}: Çarpışma veya yetersiz boşluk (${d.toFixed(1)} mm < ${minSep.toFixed(1)} mm).`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Resolves allowed rotation angles cleanly for both NestingEngine and NestingEnginePro.
 * When brushed grain / texture direction is enforced, zero rotation ([0]) is strictly locked.
 */
export function resolveNestingAngles(config = {}, itemCount = 10) {
  if (
    config.enforceGrainDirection ||
    config.grainDirection === 'horizontal' ||
    config.grainDirection === 'vertical'
  ) {
    return [0];
  }
  if (config.rotationStepDeg === 'auto') {
    if (itemCount <= 16) {
      return [0, 180, 90, 270, 45, 135, 225, 315];
    }
    return [0, 180, 90, 270];
  }
  if (config.rotationStepDeg != null && [0, 5, 15, 30, 45, 90, 180].includes(Number(config.rotationStepDeg))) {
    const step = Number(config.rotationStepDeg);
    return step === 0 ? [0] : Array.from({ length: 360 / step }, (_, i) => i * step);
  }
  if (config.fineAngleStep > 0) {
    const out = [];
    for (let a = 0; a < 360; a += config.fineAngleStep) out.push(a);
    return out;
  }
  return config.allowedAngles?.length ? config.allowedAngles : [0, 90, 180, 270];
}

/**
 * Runs material-aware true-shape irregular polygon nesting.
 * Groups incompatible materials/thicknesses into separate batches automatically.
 */
export function runTrueShapeNesting(items, config = {}, existingLockedSheets = []) {
  const {
    sheetWidthMm = 3000,
    sheetHeightMm = 1500,
    marginMm = 15,
    marginLeftMm,
    marginRightMm,
    marginTopMm,
    marginBottomMm,
    clearanceMm = 5,
    kerfMm = 0.4,
    allowedAngles = [0, 90, 180, 270],
    fineAngleStep = 0,
    rotationStepDeg,
    placementStrategy = 'compact',
    enforceGrainDirection = false,
    grainDirection = 'none',
    allowHoleNesting = true,
    groupByMaterial = true,
    quickImport = false,
    itemOrder='area', deadline=Infinity, nfpSearch=null, orderIds=null, anglePreferences=null,
  } = config;

  const mL = marginLeftMm ?? marginMm;
  const mR = marginRightMm ?? marginMm;
  const mT = marginTopMm ?? marginMm;
  const mB = marginBottomMm ?? marginMm;
  const minSep = Math.max(0.5, clearanceMm + kerfMm);
  const usableW = sheetWidthMm - mL - mR;
  const usableH = sheetHeightMm - mB - mT;
  const effectiveStrategy = placementStrategy === 'auto'
    ? (sheetWidthMm >= sheetHeightMm ? 'compact' : 'bottomLeft')
    : placementStrategy;

  // The UI rotation selector is authoritative. When brush/grain lock is active, zero rotation [0] is forced.
  const angles = resolveNestingAngles({ allowedAngles, fineAngleStep, rotationStepDeg, enforceGrainDirection, grainDirection }, items.length);

  // Group items by materialGroup so acrylic and metal never share a sheet
  const batches = new Map();
  for (const item of items) {
    const key = groupByMaterial ? (item.materialGroup || 'Genel') : 'Genel';
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  }

  const allSheets = [];
  const unplaced = [];

  for (const [materialGroup, batchItems] of batches.entries()) {
    const extent=item=>polygonBounds(item.outer);
    const sizes=new Map(batchItems.map(item=>[item,extent(item)]));
    const sorted=batchItems.slice().sort((a,b)=>{
      const x=sizes.get(a),y=sizes.get(b);
      if(orderIds)return (orderIds.get(a.id)??0)-(orderIds.get(b.id)??0);
      if(itemOrder==='box')return y.width*y.height-x.width*x.height||b.areaMm2-a.areaMm2;
      if(itemOrder==='long')return Math.max(y.width,y.height)-Math.max(x.width,x.height)||b.areaMm2-a.areaMm2;
      if(itemOrder==='short')return Math.min(y.width,y.height)-Math.min(x.width,x.height)||b.areaMm2-a.areaMm2;
      return b.areaMm2-a.areaMm2;
    });
    const batchSheets = [];

    // Preserve any locked placements for this materialGroup
    for (const ex of existingLockedSheets) {
      if (ex.materialGroup === materialGroup) {
        const batchIds=new Set(batchItems.map(item=>item.id));
        const lockedPls = ex.placements.filter(p=>p.locked).map(p=>batchIds.has(p.id)?p:{...p,id:String(p.id).replace(/_copy0$/,'')}).filter(p=>batchIds.has(p.id));
        if (lockedPls.length) {
          batchSheets.push({
            index: allSheets.length + batchSheets.length + 1,
            materialGroup,
            widthMm: sheetWidthMm,
            heightMm: sheetHeightMm,
            marginMm,allowHoleNesting,
            marginLeftMm: mL,
            marginRightMm: mR,
            marginTopMm: mT,
            marginBottomMm: mB,
            placements: lockedPls.map(p => ({ ...p })),
            usedAreaMm2: lockedPls.reduce((s, p) => s + p.areaMm2, 0),
          });
        }
      }
    }

    const lockedIds = new Set(batchSheets.flatMap(s => s.placements.map(p => p.id)));

    const fitsOnSheet = (sheet, candPoly, candBounds) => {
      if (
        candBounds.minX < mL - 1e-4 ||
        candBounds.minY < mB - 1e-4 ||
        candBounds.maxX > sheetWidthMm - mR + 1e-4 ||
        candBounds.maxY > sheetHeightMm - mT + 1e-4
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

        if(allowHoleNesting&&placed.holes?.some(h=>fitsInsideHole(candPoly,h,minSep)))continue;
        const dist = minDistanceBetweenPolygons(candPoly, placed.outer);
        if (dist < minSep) return false;
        if (polygonsIntersect(candPoly, placed.outer)) return false;
      }
      return true;
    };

    const choose=(sheet,variants)=>quickImport||performance.now()>=deadline?findQuickPlacement(sheet,variants,mL,mB,sheetWidthMm-mR,sheetHeightMm-mT,minSep):findBestPlacementOnSheet(sheet,variants,mL,mB,sheetWidthMm-mR,sheetHeightMm-mT,allowHoleNesting,fitsOnSheet,minSep,effectiveStrategy,deadline,nfpSearch);
    for (const item of sorted) {
      if (lockedIds.has(item.id)) continue;

      const preferred=anglePreferences?.get(item.id),orderedAngles=preferred==null?angles:[...angles].sort((a,b)=>(a===preferred?-1:b===preferred?1:0));
      const variants = orderedAngles.map(ang => {
        const rO = rotatePolygon(item.outer, ang);
        const rH = (item.holes || []).map(h => {
          const rad = (ang * Math.PI) / 180;
          const c = Math.cos(rad), s = Math.sin(rad);
          return h.map(p => ({ x: p.x * c - p.y * s + rO.dx, y: p.x * s + p.y * c + rO.dy }));
        });
        const b = polygonBounds(rO.points);
        return { ang, outer: rO.points, holes: rH, bounds: b };
      }).filter(v => v.bounds.width <= usableW && v.bounds.height <= usableH);

      if (!variants.length) {
        unplaced.push({ item, reason: `Parça (${materialGroup}) plaka ölçüsünden (${usableW}×${usableH} mm) büyük.` });
        continue;
      }

      let placedOk = false;
      for (const sheet of batchSheets) {
        const best = choose(sheet,variants);
        if (best) {
          sheet.placements.push(makePlacement(item, best));
          sheet.usedAreaMm2 += item.areaMm2;
          placedOk = true;
          break;
        }
      }

      if (!placedOk) {
        const newSheet = {
          index: allSheets.length + batchSheets.length + 1,
          materialGroup,
          widthMm: sheetWidthMm,
          heightMm: sheetHeightMm,
          marginMm,allowHoleNesting,
          marginLeftMm: mL,
          marginRightMm: mR,
          marginTopMm: mT,
          marginBottomMm: mB,
          placements: [],
          usedAreaMm2: 0,
        };
        const best = choose(newSheet,variants);
        if (best) {
          newSheet.placements.push(makePlacement(item, best));
          newSheet.usedAreaMm2 += item.areaMm2;
          batchSheets.push(newSheet);
        } else {
          unplaced.push({ item, reason: 'Plakaya sığmadı.' });
        }
      }
    }

    for (const sh of batchSheets) {
      sh.index = allSheets.length + 1;
      allSheets.push(sh);
    }
  }

  let interlockedPairs = 0;
  let totalCutLengthMm = 0;
  for (const sh of allSheets) {
    validateSheetLayout(sh, minSep);
    for (let i = 0; i < sh.placements.length; i++) {
      for (let j = i + 1; j < sh.placements.length; j++) {
        const a = sh.placements[i].bounds;
        const b = sh.placements[j].bounds;
        if (!(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)) interlockedPairs++;
      }
    }
    const usableArea = (sh.widthMm - sh.marginLeftMm - sh.marginRightMm) * (sh.heightMm - sh.marginTopMm - sh.marginBottomMm);
    for(const p of sh.placements)totalCutLengthMm+=ringLength(p.outer)+(p.holes||[]).reduce((sum,h)=>sum+ringLength(h),0);
    sh.usableAreaMm2 = usableArea;
    sh.utilizationPct = Math.min(100, (sh.usedAreaMm2 / Math.max(1, usableArea)) * 100);
    sh.scrapAreaM2 = Math.max(0, (sh.widthMm * sh.heightMm - sh.usedAreaMm2) / 1_000_000);
  }

  const totalUsableArea = allSheets.reduce((s, sh) => s + sh.usableAreaMm2, 0);
  const totalUsedArea = allSheets.reduce((s, sh) => s + sh.usedAreaMm2, 0);

  return {
    sheets: allSheets,
    unplaced,
    sheetCount: allSheets.length,
    interlockedPairs,
    overallUtilizationPct: totalUsableArea > 0 ? (totalUsedArea / totalUsableArea) * 100 : 0,
    totalScrapM2: allSheets.reduce((s, sh) => s + sh.scrapAreaM2, 0),
    totalCutLengthM: totalCutLengthMm / 1000,
    minSep,
  };
}

export function ringLength(r){let length=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];length+=Math.hypot(b.x-a.x,b.y-a.y);}return length;}
export function refreshNestingSheet(sheet,minSep){
  sheet.usedAreaMm2=sheet.placements.reduce((sum,p)=>sum+(p.areaMm2||0),0);
  const usable=(sheet.widthMm-(sheet.marginLeftMm??sheet.marginMm??15)-(sheet.marginRightMm??sheet.marginMm??15))*(sheet.heightMm-(sheet.marginBottomMm??sheet.marginMm??15)-(sheet.marginTopMm??sheet.marginMm??15));
  sheet.usableAreaMm2=Math.max(0,usable);sheet.utilizationPct=100*sheet.usedAreaMm2/Math.max(1,usable);
  sheet.scrapAreaM2=Math.max(0,(sheet.widthMm*sheet.heightMm-sheet.usedAreaMm2)/1e6);
  return validateSheetLayout(sheet,minSep);
}
export function editNestingPlacement(p,action,value){
  if(!p||p.locked||!Number.isFinite(value))return false;
  const b=p.bounds,x=b.minX,y=b.minY;
  let outer=p.outer,holes=p.holes||[],angle=p.angleDeg||0;
  if(action==='x'||action==='y'){
    const dx=action==='x'?value-x:0,dy=action==='y'?value-y:0;
    outer=translatePolygon(outer,dx,dy);holes=holes.map(h=>translatePolygon(h,dx,dy));
  }else if(action==='scale'){
    if(value<=0||value>100)return false;
    const scale=pt=>({x:x+(pt.x-x)*value,y:y+(pt.y-y)*value});
    outer=outer.map(scale);holes=holes.map(h=>h.map(scale));p.areaMm2*=value*value;
  }else if(action==='rot'){
    const d=(value-angle)*Math.PI/180,c=Math.cos(d),s=Math.sin(d);
    const rotate=pt=>({x:(pt.x-x)*c-(pt.y-y)*s,y:(pt.x-x)*s+(pt.y-y)*c});
    outer=outer.map(rotate);holes=holes.map(h=>h.map(rotate));
    const bounds=polygonBounds(outer),dx=x-bounds.minX,dy=y-bounds.minY;
    outer=translatePolygon(outer,dx,dy);holes=holes.map(h=>translatePolygon(h,dx,dy));angle=value;
  }else return false;
  p.outer=outer;p.holes=holes;p.bounds=polygonBounds(outer);p.xMm=p.bounds.minX;p.yMm=p.bounds.minY;p.angleDeg=angle;
  return true;
}
function makePlacement(item, best) {
  return {
    id: item.id,
    projectId: item.projectId,
    label: item.label,
    partType: item.partType,
    partGroup: item.partGroup || 'body',
    partGroupLabel: item.partGroupLabel || 'Gövde',
    partColor: item.partColor || null,
    dxfLayer: item.dxfLayer || null,
    material: item.material,
    thicknessMm: item.thicknessMm,
    materialGroup: item.materialGroup,
    locked: !!item.locked,
    angleDeg: best.angleDeg,
    xMm: best.xMm,
    yMm: best.yMm,
    outer: best.outer,
    holes: best.holes,
    bounds: best.bounds,
    areaMm2: item.areaMm2,
    hasCollision: false,
  };
}

// Fast initial placement uses conservative non-overlapping bounding-box shelves.
 // Original paths are preserved; the explicit optimize action can run true-shape nesting later.
const quickShelves=new WeakMap();
function findQuickPlacement(sheet,variants,minX,minY,maxX,maxY,sep){
  const gap=sep+.001;
  let layout=quickShelves.get(sheet);
  if(!layout){
    let startY=minY;
    for(const p of sheet.placements)startY=Math.max(startY,p.bounds.maxY+gap);
    layout={shelves:[],nextY:startY};quickShelves.set(sheet,layout);
  }
  let pick=null;
  // A true-shape search may have inserted parts after the quick shelf cache
  // was created. Reset that cache whenever its recorded population changes.
  if(layout.count!==sheet.placements.length){
    layout={shelves:[],nextY:Math.max(minY,...sheet.placements.map(p=>p.bounds.maxY+gap)),count:sheet.placements.length};quickShelves.set(sheet,layout);
  }
  for(const shelf of layout.shelves)for(const v of variants){
    const w=v.bounds.width,h=v.bounds.height;
    if(h<=shelf.h+1e-6&&shelf.x+w<=maxX+1e-6){
      const score=(shelf.h-h)*w+(maxX-shelf.x-w)*.01;
      if(!pick||score<pick.score)pick={shelf,v,score};
    }
  }
  if(!pick){
    const options=variants.filter(v=>minX+v.bounds.width<=maxX+1e-6&&layout.nextY+v.bounds.height<=maxY+1e-6).sort((a,b)=>a.bounds.height-b.bounds.height||a.bounds.width-b.bounds.width);
    if(!options.length)return null;
    const v=options[0],shelf={x:minX,y:layout.nextY,h:v.bounds.height};
    layout.shelves.push(shelf);layout.nextY+=shelf.h+gap;pick={shelf,v};
  }
  const {shelf,v}=pick,x=shelf.x,y=shelf.y,w=v.bounds.width,h=v.bounds.height;
  shelf.x+=w+gap;layout.count=sheet.placements.length+1;
  return {angleDeg:v.ang,xMm:x,yMm:y,outer:translatePolygon(v.outer,x,y),holes:v.holes.map(r=>translatePolygon(r,x,y)),bounds:{minX:x,minY:y,maxX:x+w,maxY:y+h,width:w,height:h}};
}

function findBestPlacementOnSheet(sheet, variants, minX, minY, maxX, maxY, allowHoleNesting, fitsOnSheet, minSep = 5, strategy = 'compact',deadline=Infinity,nfpSearch=null) {
  let best = null, bestScore = Infinity;
  const occupiedX = Math.max(minX, ...sheet.placements.map(p => p.bounds.maxX));
  const occupiedY = Math.max(minY, ...sheet.placements.map(p => p.bounds.maxY));
  const usableW = Math.max(1, maxX - minX), usableH = Math.max(1, maxY - minY);
  const sheetArea = usableW * usableH;
  const snap = value => Math.round(value * 10) / 10;

  const scoreAt = (x, y, v) => {
    if (strategy === 'bottomLeft') return (x - minX) + (y - minY) * 1.3;
    if (strategy === 'vertical') return (x - minX) * 3 + (y - minY) * 0.2;
    // Minimize the envelope occupied by parts, not the distance from the
    // bottom-left corner. This considers stacking parts above one another
    // when it avoids extending a long row across the sheet.
    const width = Math.max(occupiedX, x + v.bounds.width) - minX;
    const height = Math.max(occupiedY, y + v.bounds.height) - minY;
    return width * height +
      sheetArea * 0.012 * (width / usableW + height / usableH) +
      (x - minX + y - minY) * 0.001;
  };

  for (const v of variants) {
    if(performance.now()>=deadline)break;
    const candX = new Set([minX]);
    const candY = new Set([minY]);
    const stepX = Math.max(35, usableW / 14);
    const stepY = Math.max(35, usableH / 12);
    for (let x = minX; x + v.bounds.width <= maxX + 1e-5; x += stepX) candX.add(snap(x));
    for (let y = minY; y + v.bounds.height <= maxY + 1e-5; y += stepY) candY.add(snap(y));
    for (const placed of sheet.placements) {
      const b = placed.bounds;
      // Exact edge-contact candidates improve on a coarse fixed grid.
      for (const x of [b.minX, b.maxX + minSep, b.minX - v.bounds.width - minSep, b.maxX - v.bounds.width]) {
        if (x >= minX - 1e-5 && x + v.bounds.width <= maxX + 1e-5) candX.add(snap(x));
      }
      for (const y of [b.minY, b.maxY + minSep, b.minY - v.bounds.height - minSep, b.maxY - v.bounds.height]) {
        if (y >= minY - 1e-5 && y + v.bounds.height <= maxY + 1e-5) candY.add(snap(y));
      }
      if (allowHoleNesting) for (const hole of placed.holes || []) {
        const hb = polygonBounds(hole);
        for(const x of [hb.minX+minSep+.01,hb.maxX-minSep-v.bounds.width-.01,(hb.minX+hb.maxX-v.bounds.width)/2])candX.add(x);
        for(const y of [hb.minY+minSep+.01,hb.maxY-minSep-v.bounds.height-.01,(hb.minY+hb.maxY-v.bounds.height)/2])candY.add(y);
      }
    }
    const xs = [...candX].filter(x => x >= minX && x + v.bounds.width <= maxX + 1e-5).sort((a,b)=>a-b);
    const ys = [...candY].filter(y => y >= minY && y + v.bounds.height <= maxY + 1e-5).sort((a,b)=>a-b);
    if(Number.isFinite(deadline)){
      if(performance.now()>=deadline)break;
      const candidates=[];
      if(nfpSearch&&sheet.placements.length&&performance.now()<deadline){
        for(const {x,y} of nfpSearch(sheet,v,minX,minY,maxX,maxY,minSep,deadline))candidates.push({x,y,score:scoreAt(x,y,v)});
      }
      for(const x of xs)for(const y of ys)candidates.push({x,y,score:scoreAt(x,y,v)});
      // Sample contour vertex contacts (not an exact no-fit-polygon solver).
      const sample=pts=>pts.filter((_,i)=>i%Math.max(1,Math.ceil(pts.length/12))===0);
      for(const p of sheet.placements){
        if(performance.now()>=deadline)break;
        for(const a of sample(p.outer))for(const b of sample(v.outer)){
          for(const [dx,dy] of [[minSep+.01,0],[-minSep-.01,0],[0,minSep+.01],[0,-minSep-.01]]){
            const x=a.x-b.x+dx,y=a.y-b.y+dy;
            if(x>=minX&&y>=minY&&x+v.bounds.width<=maxX+1e-5&&y+v.bounds.height<=maxY+1e-5)candidates.push({x,y,score:scoreAt(x,y,v)});
          }
        }
      }
      candidates.sort((a,b)=>a.score-b.score);
      let found=null,checks=0;const seen=new Set();
      for(const {x,y,score} of candidates){
        if(performance.now()>deadline)break;
        const key=Math.round(x*1000)+','+Math.round(y*1000);if(seen.has(key))continue;seen.add(key);
        if(++checks>1200)break;
        if(!fitsOnSheet(sheet,translatePolygon(v.outer,x,y),{minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height}))continue;
        found={x,y,score};break;
      }
      if(found){
        let cx=found.x,cy=found.y;
        const fits=(x,y)=>fitsOnSheet(sheet,translatePolygon(v.outer,x,y),{minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height});
        for(const delta of [12,3,1,.1]){
          if(performance.now()>=deadline)break;
          while(cx-delta>=minX&&fits(cx-delta,cy)){cx-=delta;if(performance.now()>deadline)break;}
          while(cy-delta>=minY&&fits(cx,cy-delta)){cy-=delta;if(performance.now()>deadline)break;}
        }
        const score=scoreAt(cx,cy,v);
        if(score<bestScore){bestScore=score;best={angleDeg:v.ang,xMm:cx,yMm:cy,outer:translatePolygon(v.outer,cx,cy),holes:v.holes.map(h=>translatePolygon(h,cx,cy)),bounds:{minX:cx,minY:cy,maxX:cx+v.bounds.width,maxY:cy+v.bounds.height,width:v.bounds.width,height:v.bounds.height}};}
      }
      continue;
    }
    for (const x of xs) {
      if(performance.now()>deadline)break;
      for (const y of ys) {
        if(performance.now()>deadline)break;
        const box = {minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height};
        const outline = translatePolygon(v.outer,x,y);
        if (!fitsOnSheet(sheet,outline,box)) continue;
        let cx=x,cy=y;
        // Snap tightly against neighboring shapes while preserving all cut
        // clearances and avoiding collision with actual polygon contours.
        for (const delta of [12,3,1]) {
          while (cx-delta >= minX) {
            const px=cx-delta, poly=translatePolygon(v.outer,px,cy);
            if (!fitsOnSheet(sheet,poly,{minX:px,maxX:px+v.bounds.width,minY:cy,maxY:cy+v.bounds.height})) break;
            cx=px;
          }
          while (cy-delta >= minY) {
            const py=cy-delta,poly=translatePolygon(v.outer,cx,py);
            if (!fitsOnSheet(sheet,poly,{minX:cx,maxX:cx+v.bounds.width,minY:py,maxY:py+v.bounds.height})) break;
            cy=py;
          }
        }
        const score = scoreAt(cx,cy,v);
        if (score + 1e-5 < bestScore) {
          bestScore=score;
          best={
            angleDeg:v.ang,xMm:cx,yMm:cy,
            outer:translatePolygon(v.outer,cx,cy),
            holes:v.holes.map(h=>translatePolygon(h,cx,cy)),
            bounds:{minX:cx,minY:cy,maxX:cx+v.bounds.width,maxY:cy+v.bounds.height,width:v.bounds.width,height:v.bounds.height}
          };
        }
      }
    }
  }
  return best;
}
