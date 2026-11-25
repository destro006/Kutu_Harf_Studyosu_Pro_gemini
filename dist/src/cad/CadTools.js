import { createObjectId } from '../core/state.js';
import { booleanPolygons, offsetRing, polygonBounds } from '../geometry/PolygonOffset.js';
import { restoreLogoShape } from '../geometry/LogoTracer.js';
import { layoutTextMm } from '../geometry/FontManager.js';

/**
 * Corel-Inspired Professional CAD & Vector Editing Tools (in millimeters)
 * Every tool performs real geometric operations — zero decorative buttons.
 */

export function createShapeObject(kind, state, overrides = {}) {
  const base = {
    id: createObjectId(kind),
    name: kind === 'rect' ? 'Dikdörtgen' : kind === 'ellipse' ? 'Elips' : kind === 'text' ? 'Yeni Yazı' : 'Özel Şekil',
    kind,
    xMm: 0,
    yMm: 0,
    widthMm: kind === 'rect' ? 320 : 240,
    heightMm: kind === 'rect' ? 160 : kind === 'ellipse' ? 240 : 300,
    cornerRadiusMm: 0,
    depthMm: state.dimensions?.depthMm ?? 80,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    mirrorX: false,
    mirrorY: false,
    proportionalLock: true,
    visible: true,
    locked: false,
    groupId: null,
    constructionType: state.constructionType || 'fileli',
    fileWidthMm: state.fileli?.fileWidthMm ?? 8,
    faceMaterial: state.materials?.faceId || 'aynaAltin',
    faceColor: state.materials?.faceColor || '#f5c66a',
    sideMaterial: state.materials?.sideId || 'aynaAltin',
    sideColor: state.materials?.sideColor || '#f5c66a',
    sideFollowsFace: state.materials?.sideFollowsFace ?? true,
    fileMaterial: state.fileli?.fileMaterial || 'aynaAltin',
    fileColor: state.fileli?.fileColor || '#f5c66a',
    acrylicMaterial: 'opalPleksi',
    acrylicColor: state.fileli?.acrylicColor || '#f3f3ee',
    lightingMode: state.lighting?.mode || 'both',
  };

  if (kind === 'text') {
    base.text = 'YENİ';
    base.fontId = 'montserrat';
    base.letterSpacingMm = 8;
  }

  return { ...base, ...overrides };
}

/**
 * Converts a text, rect, or ellipse object into editable millimeter polygon curves.
 */
export function convertObjectToCurves(obj, fontMap) {
  if (!obj || obj.locked) return null;
  if (obj.kind === 'polygon') return obj;

  let polygonsMm = [];
  if (obj.kind === 'rect') {
    const w = obj.widthMm || 300;
    const h = obj.heightMm || 150;
    polygonsMm = [{
      outer: [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 },
      ],
      holes: [],
    }];
  } else if (obj.kind === 'ellipse') {
    const rx = (obj.widthMm || 240) / 2;
    const ry = (obj.heightMm || 240) / 2;
    const outer = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      outer.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
    }
    polygonsMm = [{ outer, holes: [] }];
  } else if (obj.kind === 'text') {
    const fl = fontMap.get(obj.fontId || 'cinzel');
    if (fl) {
      const layout = layoutTextMm(fl, obj.text || '', obj.heightMm || 400, obj.letterSpacingMm || 0);
      const allPts = layout.glyphs.flatMap(g => g.shapes.flatMap(s => s.getPoints(10)));
      const b = allPts.length ? polygonBounds(allPts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      for (const g of layout.glyphs) {
        for (const s of g.shapes) {
          polygonsMm.push({
            outer: s.getPoints(10).map(p => ({ x: p.x - cx, y: p.y - cy })),
            holes: (s.holes || []).map(h => h.getPoints(10).map(p => ({ x: p.x - cx, y: p.y - cy }))),
          });
        }
      }
    }
  } else if (obj.kind === 'logo' && obj.logoData) {
    const hMm = obj.heightMm || 500;
    for (const part of obj.logoData.parts) {
      for (const raw of part.shapes) {
          const s=restoreLogoShape(raw);
        polygonsMm.push({
          outer: s.getPoints(10).map(p => ({ x: p.x * hMm, y: p.y * hMm })),
          holes: (s.holes || []).map(h => h.getPoints(10).map(p => ({ x: p.x * hMm, y: p.y * hMm }))),
        });
      }
    }
  }

  if (!polygonsMm.length) return null;
  return {
    ...obj,
    kind: 'polygon',
    name: `${obj.name} (Eğri)`,
    polygonsMm,
  };
}

/**
 * Aligns selected unlocked objects along X or Y axis.
 * mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'
 */
export function alignSelectedObjects(state, mode) {
  const sel = state.objects.filter(o => state.selectedIds.includes(o.id) && !o.locked);
  if (sel.length < 2) return false;
  const xs = sel.map(o => o.xMm || 0);
  const ys = sel.map(o => o.yMm || 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs), midX = (minX + maxX) / 2;
  const minY = Math.min(...ys), maxY = Math.max(...ys), midY = (minY + maxY) / 2;

  for (const o of sel) {
    if (mode === 'left') o.xMm = minX;
    else if (mode === 'centerX') o.xMm = midX;
    else if (mode === 'right') o.xMm = maxX;
    else if (mode === 'bottom') o.yMm = minY;
    else if (mode === 'centerY') o.yMm = midY;
    else if (mode === 'top') o.yMm = maxY;
  }
  return true;
}

/**
 * Distributes 3+ selected unlocked objects evenly horizontally or vertically.
 */
export function distributeSelectedObjects(state, axis = 'x') {
  const sel = state.objects.filter(o => state.selectedIds.includes(o.id) && !o.locked);
  if (sel.length < 3) return false;
  const sorted = sel.slice().sort((a, b) => (axis === 'x' ? (a.xMm || 0) - (b.xMm || 0) : (a.yMm || 0) - (b.yMm || 0)));
  const first = axis === 'x' ? (sorted[0].xMm || 0) : (sorted[0].yMm || 0);
  const last = axis === 'x' ? (sorted[sorted.length - 1].xMm || 0) : (sorted[sorted.length - 1].yMm || 0);
  const step = (last - first) / (sorted.length - 1);
  sorted.forEach((o, idx) => {
    if (axis === 'x') o.xMm = Math.round(first + step * idx);
    else o.yMm = Math.round(first + step * idx);
  });
  return true;
}

export function mirrorSelectedObjects(state, axis = 'x') {
  for (const o of state.objects) {
    if (state.selectedIds.includes(o.id) && !o.locked) {
      if (axis === 'x') o.mirrorX = !o.mirrorX;
      else o.mirrorY = !o.mirrorY;
    }
  }
}

/**
 * Runs 2D Boolean operation ('union' | 'difference' | 'intersection') on the first 2 selected objects.
 */
export function applyBooleanToSelected(state, op, fontMap) {
  const sel = state.objects.filter(o => state.selectedIds.includes(o.id) && !o.locked);
  if (sel.length < 2) return { ok: false, error: 'Boolean işlemi için en az 2 kilitli olmayan nesne seçin.' };

  const cA = convertObjectToCurves(sel[0], fontMap);
  const cB = convertObjectToCurves(sel[1], fontMap);
  if (!cA || !cB) return { ok: false, error: 'Seçili nesneler eğriye dönüştürülemedi.' };

  const worldOuter = (c) => c.polygonsMm[0].outer.map(p => ({
    x: p.x * (c.scaleX ?? 1) + (c.xMm || 0),
    y: p.y * (c.scaleY ?? 1) + (c.yMm || 0),
  }));

  const resPolys = booleanPolygons(worldOuter(cA), worldOuter(cB), op);
  if (!resPolys.length) return { ok: false, error: 'Boolean işlemi boş geometri üretti.' };

  const b = polygonBounds(resPolys.flat());
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;

  const opNames = { union: 'Birleşim', difference: 'Fark', intersection: 'Kesişim' };
  const newObj = createShapeObject('polygon', state, {
    name: `${opNames[op] || 'Boolean'} Şekil`,
    xMm: Math.round(cx),
    yMm: Math.round(cy),
    widthMm: Math.round(b.width),
    heightMm: Math.round(b.height),
    polygonsMm: resPolys.map(ring => ({
      outer: ring.map(p => ({ x: p.x - cx, y: p.y - cy })),
      holes: [],
    })),
  });

  const rmIds = new Set([sel[0].id, sel[1].id]);
  state.objects = state.objects.filter(o => !rmIds.has(o.id));
  state.objects.push(newObj);
  state.selectedIds = [newObj.id];
  return { ok: true, object: newObj };
}

/**
 * Applies a contour offset (positive = expand, negative = inset) to a polygon object.
 */
export function offsetPolygonObject(obj, deltaMm) {
  if (!obj || obj.locked || obj.kind !== 'polygon' || !obj.polygonsMm?.length) return { ok: false };
  const updated = [];
  for (const p of obj.polygonsMm) {
    const res = offsetRing(p.outer, deltaMm);
    if (!res.ok) return res;
    updated.push({ outer: res.points, holes: p.holes || [] });
  }
  obj.polygonsMm = updated;
  return { ok: true };
}

/**
 * Splits a multi-glyph text or polygon object into independently editable letter objects (CorelDRAW Ctrl+K Break Apart).
 * Each letter retains its exact world millimeter coordinates, materials, depth, file width, and lighting.
 */
export function breakApartObjectToLetters(obj, state, fontMap) {
  if (!obj || obj.locked) return { ok: false, error: 'Kilitsiz bir nesne seçin.' };
  const baseCurves = obj.kind === 'polygon' ? obj : convertObjectToCurves(obj, fontMap);
  if (!baseCurves || !baseCurves.polygonsMm?.length) {
    return { ok: false, error: 'Harflere ayrılacak vektör geometrisi bulunamadı.' };
  }
  if (baseCurves.polygonsMm.length <= 1) {
    return { ok: false, error: 'Bu nesne zaten tek bir bağımsız parçadan oluşuyor.' };
  }

  const labelChars = obj.kind === 'text' ? [...(obj.text || '').replace(/\s+/g, '')] : [];
  const sx = obj.scaleX ?? 1;
  const sy = obj.scaleY ?? 1;
  const ox = obj.xMm || 0;
  const oy = obj.yMm || 0;
  const groupId = obj.groupId || createObjectId('grp');

  const letterObjs = baseCurves.polygonsMm.map((poly, idx) => {
    const b = polygonBounds(poly.outer);
    const lcx = (b.minX + b.maxX) * 0.5;
    const lcy = (b.minY + b.maxY) * 0.5;
    const ch = labelChars[idx] || `Parça ${idx + 1}`;
    return {
      ...createShapeObject('polygon', state, {
        name: `Harf: ${ch}`,
        xMm: Math.round(ox + lcx * sx),
        yMm: Math.round(oy + lcy * sy),
        widthMm: Math.round(b.width * Math.abs(sx)),
        heightMm: Math.round(b.height * Math.abs(sy)),
        depthMm: obj.depthMm ?? 80,
        rotationDeg: obj.rotationDeg || 0,
        rotXDeg: obj.rotXDeg || 0,
        rotYDeg: obj.rotYDeg || 0,
        scaleX: sx,
        scaleY: sy,
        constructionType: obj.constructionType || state.constructionType,
        fileWidthMm: obj.fileWidthMm ?? state.fileli?.fileWidthMm ?? 5,
        faceMaterial: obj.faceMaterial,
        faceColor: obj.faceColor,
        sideMaterial: obj.sideMaterial,
        sideColor: obj.sideColor,
        sideFollowsFace: obj.sideFollowsFace,
        fileMaterial: obj.fileMaterial,
        fileColor: obj.fileColor,
        acrylicMaterial: obj.acrylicMaterial,
        acrylicColor: obj.acrylicColor,
        lightingMode: obj.lightingMode,
        layerId: obj.layerId || 'layer_main',
        parentTextGroup: groupId,
        polygonsMm: [{
          outer: poly.outer.map(p => ({ x: p.x - lcx, y: p.y - lcy })),
          holes: (poly.holes || []).map(h => h.map(p => ({ x: p.x - lcx, y: p.y - lcy }))),
        }],
      }),
    };
  });

  return { ok: true, letters: letterObjs };
}

/**
 * Inserts a new vertex node on the nearest edge of a polygon object.
 */
export function addNodeToPolygon(obj, polyIdx = 0, edgeIdx = 0) {
  if (!obj || obj.locked || obj.kind !== 'polygon' || !obj.polygonsMm?.[polyIdx]) return false;
  const ring = obj.polygonsMm[polyIdx].outer;
  if (!ring || ring.length < 3) return false;
  const i0 = ((edgeIdx % ring.length) + ring.length) % ring.length;
  const i1 = (i0 + 1) % ring.length;
  const mid = { x: (ring[i0].x + ring[i1].x) * 0.5, y: (ring[i0].y + ring[i1].y) * 0.5, mode: 'cusp' };
  ring.splice(i0 + 1, 0, mid);
  return true;
}

/**
 * Deletes a vertex node from a polygon object (preserving minimum 3 vertices).
 */
export function deleteNodeFromPolygon(obj, polyIdx = 0, nodeIdx = 0) {
  if (!obj || obj.locked || obj.kind !== 'polygon' || !obj.polygonsMm?.[polyIdx]) return false;
  const ring = obj.polygonsMm[polyIdx].outer;
  if (!ring || ring.length <= 3) return false;
  ring.splice(nodeIdx, 1);
  return true;
}

/**
 * Reverses the winding direction of a polygon object's outer & hole rings.
 */
export function reversePolygonPath(obj) {
  if (!obj || obj.locked || obj.kind !== 'polygon' || !obj.polygonsMm?.length) return false;
  for (const p of obj.polygonsMm) {
    p.outer.reverse();
    for (const h of (p.holes || [])) h.reverse();
  }
  return true;
}

/**
 * Combines 2+ selected objects into a single compound polygon object (Ctrl+L Combine).
 */
export function combineSelectedToCompound(state, fontMap) {
  const sel = state.objects.filter(o => state.selectedIds.includes(o.id) && !o.locked);
  if (sel.length < 2) return { ok: false, error: 'Birleştirmek için en az 2 nesne seçin.' };
  const curves = sel.map(o => convertObjectToCurves(o, fontMap)).filter(Boolean);
  if (curves.length < 2) return { ok: false, error: 'Nesneler eğriye çevrilemedi.' };

  const allPolys = [];
  for (const c of curves) {
    const sx = c.scaleX ?? 1;
    const sy = c.scaleY ?? 1;
    const ox = c.xMm || 0;
    const oy = c.yMm || 0;
    for (const p of c.polygonsMm) {
      allPolys.push({
        outer: p.outer.map(pt => ({ x: pt.x * sx + ox, y: pt.y * sy + oy })),
        holes: (p.holes || []).map(h => h.map(pt => ({ x: pt.x * sx + ox, y: pt.y * sy + oy }))),
      });
    }
  }
  const b = polygonBounds(allPolys.flatMap(p => p.outer));
  const cx = (b.minX + b.maxX) * 0.5;
  const cy = (b.minY + b.maxY) * 0.5;
  const combined = createShapeObject('polygon', state, {
    name: 'Bileşik Yol',
    xMm: Math.round(cx),
    yMm: Math.round(cy),
    widthMm: Math.round(b.width),
    heightMm: Math.round(b.height),
    polygonsMm: allPolys.map(p => ({
      outer: p.outer.map(pt => ({ x: pt.x - cx, y: pt.y - cy })),
      holes: p.holes.map(h => h.map(pt => ({ x: pt.x - cx, y: pt.y - cy }))),
    })),
  });
  const rm = new Set(sel.map(s => s.id));
  state.objects = state.objects.filter(o => !rm.has(o.id));
  state.objects.push(combined);
  state.selectedIds = [combined.id];
  return { ok: true, object: combined };
}
