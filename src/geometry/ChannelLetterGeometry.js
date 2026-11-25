import THREE from '../vendor/three.js';
import {
  computeFileliContours,
  ensureWinding,
  healPolygonWithHoles,
  polygonArea,
  polygonBounds,
  polygonPerimeter,
} from './PolygonOffset.js';

/**
 * Manufacturing & 3D Channel Letter Geometry Builder
 * Converts 2D vector contours (in millimeters) into:
 *  - Authentic Fileli Kutu Harf (inward metallic border, recessed acrylic face, opaque sidewall)
 *  - Pleksi Kutu Harf
 *  - Krom / Metal Kutu Harf
 *  - Arkadan Işıklı (Halo) Kutu Harf
 *  - Işıksız Kutu Harf
 *  - Independent manufacturing part records (acrylic front, metal rim, sidewall flat strip, backing panel)
 */

const MM_TO_M = 0.001;

export function shapeToPolygonMm(shape, curveSegments = 16) {
  const rawOuter = shape.getPoints(curveSegments).map(p => ({ x: p.x, y: p.y }));
  const rawHoles = (shape.holes || []).map(h => h.getPoints(curveSegments).map(p => ({ x: p.x, y: p.y })));
  const healed = healPolygonWithHoles(rawOuter, rawHoles, 0.025);
  return {
    outer: healed.outer.length >= 3 ? healed.outer : ensureWinding(rawOuter, true),
    holes: healed.outer.length >= 3 ? healed.holes : rawHoles.map(h => ensureWinding(h, false)),
  };
}

export function polygonMmToThreeShape(outer, holes = [], scale = MM_TO_M) {
  const s = new THREE.Shape();
  outer.forEach((p, idx) => {
    if (idx === 0) s.moveTo(p.x * scale, p.y * scale);
    else s.lineTo(p.x * scale, p.y * scale);
  });
  s.closePath();

  for (const h of holes) {
    if (h.length < 3) continue;
    const hp = new THREE.Path();
    h.forEach((p, idx) => {
      if (idx === 0) hp.moveTo(p.x * scale, p.y * scale);
      else hp.lineTo(p.x * scale, p.y * scale);
    });
    hp.closePath();
    s.holes.push(hp);
  }
  return s;
}

export function extrudeShapeMm(shapeM, depthMm, bevelMm = 1.6, bevelSegments = 3, curveSegments = 14) {
  const depthM = Math.max(0.0015, depthMm * MM_TO_M);
  const bM = Math.max(0, Math.min(depthM * 0.35, bevelMm * MM_TO_M));
  const geo = new THREE.ExtrudeGeometry(shapeM, {
    depth: Math.max(0.0005, depthM - bM * 2),
    bevelEnabled: bM > 0.0001,
    bevelThickness: bM,
    bevelSize: bM * 0.8,
    bevelSegments,
    curveSegments,
  });
  if (bM > 0.0001) geo.translate(0, 0, bM);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Computes bend-compensated flat strip development length for a sidewall return.
 * Uses K-factor (default 0.42 for stainless/aluminum channel letter bending).
 */
export function computeSidewallStripLengthMm(perimeterMm, metalThicknessMm = 1.0, kFactor = 0.42, vertexCount = 8) {
  const bendDeductionPerCorner = metalThicknessMm * (1 - kFactor) * 0.35;
  return Math.max(perimeterMm * 0.95, perimeterMm - Math.min(vertexCount, 24) * bendDeductionPerCorner);
}

export function buildChannelComponent(shapesMm, config) {
  const {
    constructionType = 'fileli',
    depthMm = 80,
    bevelMm = 1.8,
    fileWidthMm = 5,
    fileThicknessMm = 2,
    metalThicknessMm = 1.0,
    borderBevelMm = 0.8,
    acrylicInsetMm = 2.5,
    acrylicThicknessMm = 3,
    includeBacking = false,
  } = config;

  const warnings = [];
  const polygonsMm = shapesMm.map(s => shapeToPolygonMm(s, 14)).filter(p => p.outer.length >= 3);

  const outerGeos = [];
  const fileGeos = [];
  const acrylicGeos = [];

  const exportOuterContours = [];
  const exportFileContours = [];
  const exportAcrylicContours = [];
  const exportSidewallStrips = [];

  let outerAreaMm2 = 0;
  let acrylicAreaMm2 = 0;
  let fileAreaMm2 = 0;
  let perimeterMm = 0;

  for (const poly of polygonsMm) {
    const holeArea = poly.holes.reduce((acc, h) => acc + polygonArea(h), 0);
    const polyNetArea = Math.max(0, polygonArea(poly.outer) - holeArea);
    outerAreaMm2 += polyNetArea;

    const outerPerim = polygonPerimeter(poly.outer);
    const holesPerim = poly.holes.reduce((acc, h) => acc + polygonPerimeter(h), 0);
    const polyPerim = outerPerim + holesPerim;
    perimeterMm += polyPerim;

    exportOuterContours.push({ outer: poly.outer, holes: poly.holes });

    // Flat sidewall return strip development (outer contour + every inner hole contour)
    const outerStripLen = computeSidewallStripLengthMm(outerPerim, metalThicknessMm, 0.42, poly.outer.length);
    exportSidewallStrips.push({
      kind: 'outer',
      holeIndex: 0,
      widthMm: outerStripLen,
      heightMm: depthMm,
      thicknessMm: metalThicknessMm,
      rawPerimeterMm: outerPerim,
      cornerCount: poly.outer.length,
    });
    poly.holes.forEach((h, hi) => {
      const hPerim = polygonPerimeter(h);
      if (hPerim > 1) {
        exportSidewallStrips.push({
          kind: 'hole',
          holeIndex: hi + 1,
          widthMm: computeSidewallStripLengthMm(hPerim, metalThicknessMm, 0.42, h.length),
          heightMm: depthMm,
          thicknessMm: metalThicknessMm,
          rawPerimeterMm: hPerim,
          cornerCount: h.length,
        });
      }
    });

    if (constructionType === 'fileli') {
      const bodyShapeM = polygonMmToThreeShape(poly.outer, poly.holes, MM_TO_M);
      const rimThick = Math.max(1.0, fileThicknessMm);
      const bodyDepthMm = Math.max(4, depthMm - rimThick);

      // The sidewall is a thin metal return, NOT a full-depth extrusion of the
      // front file band. Build the two independently from the same outer glyph.
      // This avoids the original file-width-thick wall and the overlapping
      // front/acrylic faces that could generate black stripe artifacts.
      const wallThickness = Math.max(0.2, Math.min(3, metalThicknessMm));
      const wallRes = computeFileliContours(poly.outer, poly.holes, wallThickness);
      const putWall = () => {
        if (!wallRes.ok) {
          warnings.push(`Yanak geometrisi: ${wallRes.warning}`);
          return false;
        }
        for (const ring of wallRes.fileRings) {
          const wallShape = polygonMmToThreeShape(ring.outer, ring.holes, MM_TO_M);
          // Thin metal walls cannot tolerate a large bevel radius.
          outerGeos.push(extrudeShapeMm(wallShape, bodyDepthMm, 0, 1));
        }
        return true;
      };

      if (fileWidthMm <= 0.05) {
        putWall();
        // Without a front file, the acrylic occupies the entire visible
        // opening. Its front face remains below the channel's front plane.
        acrylicAreaMm2 += polyNetArea;
        exportAcrylicContours.push({ outer: poly.outer, holes: poly.holes });
        const acThick = Math.max(1.5, acrylicThicknessMm);
        const acGeo = extrudeShapeMm(bodyShapeM, acThick, 0, 1);
        const acZ = Math.max(2, depthMm - acrylicInsetMm - acThick);
        acGeo.translate(0, 0, acZ * MM_TO_M);
        acrylicGeos.push(acGeo);
      } else {
        const res = computeFileliContours(poly.outer, poly.holes, fileWidthMm);
        if (!res.ok) {
          // Never fabricate a solid metal cap or fake a 50/50 metal/acrylic
          // area when the inset operation failed. Show an explicit warning and
          // fall back to a truthful full-face acrylic preview; do NOT emit a
          // file cutting contour that cannot be manufactured.
          warnings.push(`${res.warning} File üretilemedi; önizleme filesiz gösteriliyor.`);
          putWall();
          acrylicAreaMm2 += polyNetArea;
          exportAcrylicContours.push({ outer: poly.outer, holes: poly.holes });
          const acThick = Math.max(1.5, acrylicThicknessMm);
          const acGeo = extrudeShapeMm(bodyShapeM, acThick, 0, 1);
          acGeo.translate(0, 0, Math.max(2, depthMm - acrylicInsetMm - acThick) * MM_TO_M);
          acrylicGeos.push(acGeo);
        } else {
          putWall();
          // Opaque metal rim: only at the front, physically distinct from
          // the thin sheet-metal sidewalls and acrylic insert.
          for (const ring of res.fileRings) {
            const rHoleArea = ring.holes.reduce((acc, h) => acc + polygonArea(h), 0);
            fileAreaMm2 += Math.max(0, polygonArea(ring.outer) - rHoleArea);
            exportFileContours.push({ outer: ring.outer, holes: ring.holes });

            const rimShape = polygonMmToThreeShape(ring.outer, ring.holes, MM_TO_M);
            const safeBevel = Math.max(0, Math.min(borderBevelMm, rimThick * 0.2, fileWidthMm * 0.08));
            const fGeo = extrudeShapeMm(rimShape, rimThick, safeBevel, 2);
            fGeo.translate(0, 0, bodyDepthMm * MM_TO_M);
            fileGeos.push(fGeo);
          }
          const acPolys = res.acrylicPolys?.length ? res.acrylicPolys : [{ outer: res.acrylicOuter, holes: res.acrylicHoles }];
          const acThick = Math.max(1.5, acrylicThicknessMm);
          const acZ = Math.max(2, bodyDepthMm - acrylicInsetMm - acThick);
          for (const ap of acPolys) {
            const acHoleArea = (ap.holes || []).reduce((acc, h) => acc + polygonArea(h), 0);
            acrylicAreaMm2 += Math.max(0, polygonArea(ap.outer) - acHoleArea);
            exportAcrylicContours.push({ outer: ap.outer, holes: ap.holes || [] });
            const acShapeM = polygonMmToThreeShape(ap.outer, ap.holes || [], MM_TO_M);
            const acGeo = extrudeShapeMm(acShapeM, acThick, 0, 1);
            acGeo.translate(0, 0, acZ * MM_TO_M);
            acrylicGeos.push(acGeo);
          }
        }
      }
    } else if (constructionType === 'pleksi') {
      acrylicAreaMm2 += polyNetArea;
      exportAcrylicContours.push({ outer: poly.outer, holes: poly.holes });

      const shapeM = polygonMmToThreeShape(poly.outer, poly.holes, MM_TO_M);
      const acThick = Math.max(3, acrylicThicknessMm);
      const bodyDepth = Math.max(4, depthMm - acThick);
      outerGeos.push(extrudeShapeMm(shapeM, bodyDepth, bevelMm * 0.5, 2));

      const acGeo = extrudeShapeMm(shapeM, acThick, bevelMm * 0.7, 2);
      acGeo.translate(0, 0, bodyDepth * MM_TO_M);
      acrylicGeos.push(acGeo);
    } else {
      const shapeM = polygonMmToThreeShape(poly.outer, poly.holes, MM_TO_M);
      outerGeos.push(extrudeShapeMm(shapeM, depthMm, bevelMm, 3));
    }
  }

  const allPts = polygonsMm.flatMap(p => p.outer);
  const boundsMm = allPts.length
    ? polygonBounds(allPts)
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  const sidewallAreaMm2 = perimeterMm * depthMm;

  return {
    polygonsMm,
    outerGeos,
    fileGeos,
    acrylicGeos,
    exportContours: {
      outer: exportOuterContours,
      file: exportFileContours,
      acrylic: exportAcrylicContours,
      sidewallStrips: exportSidewallStrips,
      backing: includeBacking ? exportOuterContours : [],
    },
    metrics: {
      boundsMm,
      outerAreaMm2,
      acrylicAreaMm2,
      fileAreaMm2,
      sidewallAreaMm2,
      perimeterMm,
      cuttingLengthMm: perimeterMm + exportFileContours.reduce((s, c) => s + polygonPerimeter(c.outer), 0),
    },
    warnings,
  };
}
