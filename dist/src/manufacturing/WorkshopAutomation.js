/**
 * Workshop, Manufacturing & Installation Automations:
 *  1. Auto 1:1 Mounting (Stud / Saplama) Template Generator (DXF & SVG)
 *  2. Smart LED Layout & IP67 Power Supply Calculator (with 20% safety margin)
 *  3. Side Return (Bobin / Coil) Consumption, Waste & Cost Calculator
 */

const pointInRing = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const pointInsidePoly = (p, outer, holes = []) => {
  if (!pointInRing(p, outer)) return false;
  for (const h of holes) if (pointInRing(p, h)) return false;
  return true;
};

const distToRing = (p, ring) => {
  let minD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 > 1e-8 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < minD) minD = d;
  }
  return minD;
};

function polyBounds(outer) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Computes balanced interior mounting stud/screw hole locations on the back of each letter.
 */
export function computeMountingStuds(metricsList = [], options = {}) {
  const minMarginMm = Math.max(4, Number(options.minMarginMm ?? 10));
  const maxSpacingMm = Math.max(60, Number(options.maxSpacingMm ?? 180));
  const studDiaMm = Math.max(3, Number(options.studDiaMm ?? 6));
  const letters = [];
  let totalStuds = 0;

  for (const m of metricsList) {
    const ox = m.offsetXMm || 0, oy = m.offsetYMm || 0;
    const polys = m.polygonsMm || [];
    for (let pIdx = 0; pIdx < polys.length; pIdx++) {
      const poly = polys[pIdx];
      if (!poly?.outer?.length) continue;
      const outer = poly.outer.map(pt => ({ x: pt.x + ox, y: pt.y + oy }));
      const holes = (poly.holes || []).map(h => h.map(pt => ({ x: pt.x + ox, y: pt.y + oy })));
      const b = polyBounds(outer);
      const step = Math.max(10, Math.min(24, Math.min(b.width, b.height) / 10));
      const candidates = [];
      for (let y = b.minY + step * 0.5; y < b.maxY; y += step) {
        for (let x = b.minX + step * 0.5; x < b.maxX; x += step) {
          const pt = { x, y };
          if (!pointInsidePoly(pt, outer, holes)) continue;
          let clearance = distToRing(pt, outer);
          for (const h of holes) clearance = Math.min(clearance, distToRing(pt, h));
          if (clearance >= Math.min(minMarginMm, Math.min(b.width, b.height) * 0.14)) {
            candidates.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, clearance });
          }
        }
      }

      if (!candidates.length) {
        const c = { x: Math.round((b.minX + b.maxX) * 5) / 10, y: Math.round((b.minY + b.maxY) * 5) / 10, clearance: 5 };
        candidates.push(c);
      }

      // Farthest-point greedy selection weighted by edge clearance
      const targetCount = Math.max(2, Math.min(6, Math.ceil(Math.max(b.width, b.height) / maxSpacingMm) + 1));
      candidates.sort((a, z) => z.clearance - a.clearance);
      const studs = [candidates[0]];
      while (studs.length < targetCount && studs.length < candidates.length) {
        let best = null, bestScore = -1;
        for (const cand of candidates) {
          const minDist = Math.min(...studs.map(s => Math.hypot(s.x - cand.x, s.y - cand.y)));
          if (minDist < 28) continue;
          const score = minDist * 0.75 + cand.clearance * 0.25;
          if (score > bestScore) { bestScore = score; best = cand; }
        }
        if (!best) break;
        studs.push(best);
      }

      totalStuds += studs.length;
      letters.push({
        label: m.label || `Parça ${letters.length + 1}`,
        outer,
        holes,
        studs: studs.map(s => ({ x: s.x, y: s.y, diaMm: studDiaMm })),
      });
    }
  }

  return { letters, totalStuds, studDiaMm };
}

export function generateMountingTemplateDxf(studPlan) {
  const lines = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const emitPoly = (pts, layer) => {
    lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', '1');
    for (const p of pts) lines.push('10', p.x.toFixed(3), '20', p.y.toFixed(3));
  };
  for (const item of studPlan?.letters || []) {
    emitPoly(item.outer, 'LETTER_OUTLINE');
    for (const h of item.holes || []) emitPoly(h, 'LETTER_OUTLINE');
    for (const s of item.studs || []) {
      const r = (s.diaMm || 6) * 0.5;
      lines.push('0', 'CIRCLE', '8', 'MOUNTING_STUD_HOLES', '10', s.x.toFixed(3), '20', s.y.toFixed(3), '40', r.toFixed(3));
      lines.push('0', 'LINE', '8', 'CROSSHAIR', '10', (s.x - 5).toFixed(3), '20', s.y.toFixed(3), '11', (s.x + 5).toFixed(3), '21', s.y.toFixed(3));
      lines.push('0', 'LINE', '8', 'CROSSHAIR', '10', s.x.toFixed(3), '20', (s.y - 5).toFixed(3), '11', s.x.toFixed(3), '21', (s.y + 5).toFixed(3));
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function generateMountingTemplateSvg(studPlan) {
  const all = (studPlan?.letters || []).flatMap(l => l.outer);
  if (!all.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"></svg>';
  const b = polyBounds(all);
  const pad = 20;
  const vx = b.minX - pad, vy = -b.maxY - pad, vw = b.width + pad * 2, vh = b.height + pad * 2;
  const shapes = studPlan.letters.map(l => {
    const outerD = 'M' + l.outer.map(p => `${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join('L') + 'Z';
    const holesD = (l.holes || []).map(h => 'M' + h.map(p => `${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join('L') + 'Z').join('');
    const studs = l.studs.map(s =>
      `<circle cx="${s.x.toFixed(2)}" cy="${(-s.y).toFixed(2)}" r="${((s.diaMm || 6) * 0.5).toFixed(2)}" fill="none" stroke="#ef4444" stroke-width="0.6"/>` +
      `<path d="M${(s.x - 5).toFixed(2)},${(-s.y).toFixed(2)}h10M${s.x.toFixed(2)},${(-s.y - 5).toFixed(2)}v10" stroke="#ef4444" stroke-width="0.4"/>`
    ).join('');
    return `<path d="${outerD}${holesD}" fill="none" stroke="#111827" stroke-width="0.7" fill-rule="evenodd"/>${studs}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw.toFixed(2)}mm" height="${vh.toFixed(2)}mm" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}"><rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${vw.toFixed(2)}" height="${vh.toFixed(2)}" fill="#ffffff"/>${shapes}</svg>`;
}

/**
 * Smart LED Module Placement & IP67 Power Supply Calculator (20% safety margin).
 */
export function calculateSmartLedAndPsu(metricsList = [], state = {}, options = {}) {
  const lightingEnabled = state.lighting?.enabled ?? true;
  const moduleWatt = Number(options.moduleWatt ?? 1.2);
  const voltage = Number(options.voltage ?? 12);
  const safetyMargin = Number(options.safetyMargin ?? 0.20);
  const depthMm = Number(state.dimensions?.depthMm ?? 80);

  // Shallower depth requires tighter LED spacing to avoid hotspot dots on acrylic
  const cm2PerModule = depthMm < 55 ? 32 : depthMm < 75 ? 40 : 48;
  let totalModules = 0;
  const placements = [];

  for (const m of metricsList) {
    const mode = m.lightingMode || state.lighting?.mode || 'halo';
    const isLit = lightingEnabled && mode && mode !== 'none';
    if (!isLit) continue;
    const areaCm2 = ((m.acrylicAreaMm2 > 0 ? m.acrylicAreaMm2 : m.outerAreaMm2) || 0) / 100;
    const mult = mode === 'both' ? 2 : 1;
    const count = Math.max(2, Math.ceil(areaCm2 / cm2PerModule) * mult);
    totalModules += count;

    // Sample interior LED module coordinates for visual layout
    const poly = m.polygonsMm?.[0];
    if (poly?.outer?.length) {
      const ox = m.offsetXMm || 0, oy = m.offsetYMm || 0;
      const outer = poly.outer.map(p => ({ x: p.x + ox, y: p.y + oy }));
      const holes = (poly.holes || []).map(h => h.map(p => ({ x: p.x + ox, y: p.y + oy })));
      const b = polyBounds(outer);
      const step = Math.max(18, Math.sqrt((areaCm2 * 100) / count));
      let added = 0;
      for (let y = b.minY + step * 0.5; y < b.maxY && added < count; y += step) {
        for (let x = b.minX + step * 0.5; x < b.maxX && added < count; x += step) {
          if (pointInsidePoly({ x, y }, outer, holes)) {
            placements.push({ x: Math.round(x), y: Math.round(y), objectId: m.objectId });
            added++;
          }
        }
      }
    }
  }

  const totalWatt = Math.round(totalModules * moduleWatt * 10) / 10;
  const requiredWatt = Math.round(totalWatt * (1 + safetyMargin) * 10) / 10;
  const standardPsus = [60, 100, 150, 200, 300, 400];
  let psuWatt = 150;
  let psuCount = 0;
  if (requiredWatt > 0) {
    const single = standardPsus.find(w => w >= requiredWatt);
    if (single) {
      psuWatt = single;
      psuCount = 1;
    } else {
      psuWatt = 300;
      psuCount = Math.ceil(requiredWatt / psuWatt);
    }
  }
  const capacityWatt = psuWatt * psuCount;
  const loadPct = capacityWatt > 0 ? Math.round((totalWatt / capacityWatt) * 100) : 0;

  return {
    totalModules,
    moduleWatt,
    voltage,
    totalWatt,
    safetyMarginPct: Math.round(safetyMargin * 100),
    requiredWatt,
    psuWatt,
    psuCount,
    psuLabel: psuCount > 0 ? `${psuCount} × ${voltage}V ${psuWatt}W IP67 Trafo` : 'Trafo gerekmez',
    loadPct,
    placements,
  };
}

/**
 * Side Return (Yanak Bobin) Calculator: exact total perimeter, waste & roll consumption.
 */
export function calculateReturnCoilPlan(metricsList = [], state = {}, options = {}) {
  const rollLengthM = Math.max(10, Number(options.rollLengthM ?? 50));
  const wastePct = Math.max(0, Number(options.wastePct ?? 8));
  let netPerimeterMm = 0;
  let maxDepthMm = Number(state.dimensions?.depthMm ?? 80);

  for (const m of metricsList) {
    netPerimeterMm += Number(m.perimeterMm || 0);
    if (Number(m.depthMm) > maxDepthMm) maxDepthMm = Number(m.depthMm);
  }

  const netPerimeterM = Math.round((netPerimeterMm / 1000) * 100) / 100;
  const grossPerimeterM = Math.round(netPerimeterM * (1 + wastePct / 100) * 100) / 100;
  const rollsNeeded = grossPerimeterM > 0 ? Math.max(1, Math.ceil(grossPerimeterM / rollLengthM)) : 0;
  const thicknessMm = Number(state.fileli?.metalThicknessMm ?? 0.8);
  const densityKgM3 = options.material === 'paslanmaz' ? 7900 : 2700;
  const stripAreaM2 = grossPerimeterM * (maxDepthMm / 1000);
  const estimatedWeightKg = Math.round(stripAreaM2 * (thicknessMm / 1000) * densityKgM3 * 100) / 100;

  return {
    netPerimeterM,
    wastePct,
    grossPerimeterM,
    coilWidthMm: Math.round(maxDepthMm),
    rollLengthM,
    rollsNeeded,
    estimatedWeightKg,
  };
}
