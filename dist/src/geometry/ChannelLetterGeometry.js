import THREE from '../vendor/three.js';
import {
  computeFileliContours,
  ensureWinding,
  polygonArea,
  polygonBounds,
  polygonPerimeter,
} from './PolygonOffset.js';

/**
 * Manufacturing & 3D Channel Letter Geometry Builder
 * Converts 2D vector contours (in millimeters) into:
 *  - Authentic Fileli Kutu Harf (inward metallic border, independent acrylic face, opaque sidewall)
 *  - Pleksi Kutu Harf
 *  - Krom / Metal Kutu Harf
 *  - Arkadan Işıklı (Halo) Kutu Harf
 *  - Işıksız Kutu Harf
 *
 * All measurements are strictly in millimeters internally and converted to meters (0.001) for Three.js.
 */

const MM_TO_M = 0.001;

/**
 * Converts a Three.js Shape (in mm) into { outer: [{x,y}], holes: [[{x,y}]] }.
 */
export function shapeToPolygonMm(shape, curveSegments = 16) {
  const outer = ensureWinding(
    shape.getPoints(curveSegments).map(p => ({ x: p.x, y: p.y })),
    true
  );
  const holes = (shape.holes || []).map(h =>
    ensureWinding(
      h.getPoints(curveSegments).map(p => ({ x: p.x, y: p.y })),
      false
    )
  );
  return { outer, holes };
}

/**
 * Converts { outer, holes } (in mm) back to a Three.js Shape (in meters).
 */
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

/**
 * Builds Three.js ExtrudeGeometry with real geometric bevels in meters.
 */
export function extrudeShapeMm(shapeM, depthMm, bevelMm = 1.6, bevelSegments = 3, curveSegments = 14) {
  const depthM = Math.max(0.002, depthMm * MM_TO_M);
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
 * Builds a complete manufactured component (letter or logo part) with:
 *  - Exact 2D manufacturing contours (outer, fileRings, acrylicContours)
 *  - Accurate millimeter areas & cutting perimeters
 *  - 3D meshes (body/sidewall, file border, acrylic face) without overlapping Z-fighting
 *  - Clear Turkish warning if inward file width is too large for narrow strokes
 */
export function buildChannelComponent(shapesMm, config) {
  const {
    constructionType = 'fileli', // 'fileli' | 'pleksi' | 'metal' | 'halo' | 'isiksiz'
    depthMm = 80,
    bevelMm = 1.8,
    fileWidthMm = 8,
    fileThicknessMm = 2,
    borderBevelMm = 0.8,
    acrylicInsetMm = 2.5,
    acrylicThicknessMm = 3,
  } = config;

  const warnings = [];
  const polygonsMm = shapesMm.map(s => shapeToPolygonMm(s, 14)).filter(p => p.outer.length >= 3);

  const outerGeos = [];
  const fileGeos = [];
  const acrylicGeos = [];

  const exportOuterContours = [];
  const exportFileContours = [];
  const exportAcrylicContours = [];

  let outerAreaMm2 = 0;
  let acrylicAreaMm2 = 0;
  let fileAreaMm2 = 0;
  let perimeterMm = 0;

  for (const poly of polygonsMm) {
    const holeArea = poly.holes.reduce((acc, h) => acc + polygonArea(h), 0);
    const polyNetArea = Math.max(0, polygonArea(poly.outer) - holeArea);
    outerAreaMm2 += polyNetArea;

    const polyPerim = polygonPerimeter(poly.outer) + poly.holes.reduce((acc, h) => acc + polygonPerimeter(h), 0);
    perimeterMm += polyPerim;

    exportOuterContours.push({ outer: poly.outer, holes: poly.holes });

    if (constructionType === 'fileli') {
      const res = computeFileliContours(poly.outer, poly.holes, fileWidthMm);

      // Sidewall / return body ALWAYS preserves exact outer contour!
      const bodyShapeM = polygonMmToThreeShape(poly.outer, poly.holes, MM_TO_M);
      // Sidewall height stops just behind the acrylic/file front cap so no Z-fighting
      const bodyDepthMm = Math.max(4, depthMm - Math.max(fileThicknessMm, 0.5));
      outerGeos.push(extrudeShapeMm(bodyShapeM, bodyDepthMm, bevelMm * 0.6, 2));

      if (!res.ok) {
        warnings.push(res.warning);
        // Fallback: solid front cap so geometry stays valid while warning user
        acrylicAreaMm2 += polyNetArea * 0.5;
        fileAreaMm2 += polyNetArea * 0.5;
        const capGeo = extrudeShapeMm(bodyShapeM, Math.max(1.5, fileThicknessMm), borderBevelMm, 2);
        capGeo.translate(0, 0, bodyDepthMm * MM_TO_M);
        fileGeos.push(capGeo);
      } else {
        // 1. Metallic File Border Rings (placed cleanly at front: z = bodyDepthMm .. depthMm)
        for (const ring of res.fileRings) {
          const rHoleArea = ring.holes.reduce((acc, h) => acc + polygonArea(h), 0);
          fileAreaMm2 += Math.max(0, polygonArea(ring.outer) - rHoleArea);
          exportFileContours.push({ outer: ring.outer, holes: ring.holes });

          const ringShapeM = polygonMmToThreeShape(ring.outer, ring.holes, MM_TO_M);
          const fGeo = extrudeShapeMm(ringShapeM, Math.max(1.0, fileThicknessMm), borderBevelMm, 2);
          fGeo.translate(0, 0, bodyDepthMm * MM_TO_M);
          fileGeos.push(fGeo);
        }

        // 2. Independent Translucent Acrylic Face (inset cleanly inside file border, NO overlap!)
        const acHoleArea = res.acrylicHoles.reduce((acc, h) => acc + polygonArea(h), 0);
        acrylicAreaMm2 += Math.max(0, polygonArea(res.acrylicOuter) - acHoleArea);
        exportAcrylicContours.push({ outer: res.acrylicOuter, holes: res.acrylicHoles });

        const acShapeM = polygonMmToThreeShape(res.acrylicOuter, res.acrylicHoles, MM_TO_M);
        const acThick = Math.max(1.5, acrylicThicknessMm);
        const acGeo = extrudeShapeMm(acShapeM, acThick, 0.3, 1);
        const acZ = Math.max(2, depthMm - acrylicInsetMm - acThick);
        acGeo.translate(0, 0, acZ * MM_TO_M);
        acrylicGeos.push(acGeo);
      }
    } else if (constructionType === 'pleksi') {
      // Acrylic face + sidewall body
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
      // 'metal' | 'halo' | 'isiksiz' — solid extruded body with face & side material groups
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
