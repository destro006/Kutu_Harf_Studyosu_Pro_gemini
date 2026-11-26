/**
 * Module 10: Kutu Harf Yan Bant (Channel Letter Return) Büküm Simülatörü
 * - Bobin malzeme profilleri (Alüminyum, Paslanmaz, Galvaniz, Trimcap) + yaylanma telafisi
 * - Akıllı gizli birleşim yeri (seam) seçimi + kullanıcı tarafından sürüklenebilir başlangıç noktası
 * - V-Kerç (V-Notch), flanş kesimi (Flange Cut) ve dar açı / kafa çarpışma algılama
 * - DXF (R12 / R2000), HPGL (.plt), Accubend / SuperBender / SDS / Standart G-Code & İş Emri dışa aktarımı
 */

export const BENDING_COIL_PROFILES = [
  { id: 'alu_08', label: 'Alüminyum Bobin · 0.8 mm', material: 'Alüminyum', thicknessMm: 0.8, springbackPct: 4.0, minRadiusMm: 2.2, flangeWidthMm: 6, notchAngleDeg: 30 },
  { id: 'alu_10', label: 'Alüminyum Bobin · 1.0 mm', material: 'Alüminyum', thicknessMm: 1.0, springbackPct: 5.0, minRadiusMm: 2.8, flangeWidthMm: 6, notchAngleDeg: 30 },
  { id: 'alu_12', label: 'Alüminyum Bobin · 1.2 mm', material: 'Alüminyum', thicknessMm: 1.2, springbackPct: 6.5, minRadiusMm: 3.5, flangeWidthMm: 7, notchAngleDeg: 28 },
  { id: 'ss_06', label: 'Paslanmaz Çelik · 0.6 mm', material: 'Paslanmaz 304', thicknessMm: 0.6, springbackPct: 9.0, minRadiusMm: 3.0, flangeWidthMm: 5, notchAngleDeg: 28 },
  { id: 'ss_08', label: 'Paslanmaz Çelik · 0.8 mm', material: 'Paslanmaz 304', thicknessMm: 0.8, springbackPct: 11.5, minRadiusMm: 4.0, flangeWidthMm: 5, notchAngleDeg: 25 },
  { id: 'galv_08', label: 'Galvaniz Sac · 0.8 mm', material: 'Galvaniz', thicknessMm: 0.8, springbackPct: 7.0, minRadiusMm: 3.0, flangeWidthMm: 6, notchAngleDeg: 28 },
  { id: 'trimcap_alu', label: 'Trimcap Kanal Profil · 1.0 mm', material: 'Trimcap Alüminyum', thicknessMm: 1.0, springbackPct: 4.5, minRadiusMm: 3.2, flangeWidthMm: 8, notchAngleDeg: 32 },
];

export const BENDING_MACHINE_PROFILES = [
  { id: 'universal_dxf', label: 'Universal DXF Harf Bükme (R12/R2000)', kind: 'dxf', ext: 'dxf', codeStyle: 'dxf' },
  { id: 'accubend', label: 'Computerized Cutters Accubend', kind: 'gcode', ext: 'nc', codeStyle: 'accubend' },
  { id: 'superbender', label: 'Adams / SuperBender Pro', kind: 'gcode', ext: 'nc', codeStyle: 'superbender' },
  { id: 'sds_channel', label: 'SDS / ChannelBender', kind: 'gcode', ext: 'cnc', codeStyle: 'sds' },
  { id: 'generic_gcode', label: 'Standart Büküm G-Code (.nc)', kind: 'gcode', ext: 'nc', codeStyle: 'gcode' },
];

const round2 = v => Math.round(Number(v || 0) * 100) / 100;
const round3 = v => Math.round(Number(v || 0) * 1000) / 1000;

export function getCoilProfile(id) {
  return BENDING_COIL_PROFILES.find(p => p.id === id) || BENDING_COIL_PROFILES[0];
}

export function getBendingMachineProfile(id) {
  return BENDING_MACHINE_PROFILES.find(p => p.id === id) || BENDING_MACHINE_PROFILES[0];
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function normalizeCcwRing(raw = [], minStepMm = 0.6) {
  if (!Array.isArray(raw) || raw.length < 3) return [];
  const pts = [];
  for (const pt of raw) {
    const x = Number(pt?.x), y = Number(pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(x - prev.x, y - prev.y) >= minStepMm) pts.push({ x, y });
  }
  if (pts.length >= 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < minStepMm) {
    pts.pop();
  }
  if (pts.length < 3) return [];
  if (signedArea(pts) < 0) pts.reverse();
  return pts;
}

function edgeTurnDeflectionDeg(a, b, c) {
  const vx1 = b.x - a.x, vy1 = b.y - a.y;
  const vx2 = c.x - b.x, vy2 = c.y - b.y;
  const l1 = Math.hypot(vx1, vy1), l2 = Math.hypot(vx2, vy2);
  if (l1 < 1e-6 || l2 < 1e-6) return 0;
  const dot = (vx1 * vx2 + vy1 * vy2) / (l1 * l2);
  const cross = (vx1 * vy2 - vy1 * vx2) / (l1 * l2);
  const rad = Math.atan2(cross, Math.max(-1, Math.min(1, dot)));
  return (rad * 180) / Math.PI;
}

function chooseSmartSeamIndex(ring) {
  const n = ring.length;
  if (n < 3) return 0;
  let minY = Infinity, maxY = -Infinity;
  for (const p of ring) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const h = Math.max(1, maxY - minY);
  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < n; i++) {
    const pPrev = ring[(i - 1 + n) % n];
    const p0 = ring[i];
    const p1 = ring[(i + 1) % n];
    const p2 = ring[(i + 2) % n];
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const t0 = Math.abs(edgeTurnDeflectionDeg(pPrev, p0, p1));
    const t1 = Math.abs(edgeTurnDeflectionDeg(p0, p1, p2));
    // Prefer straight segments on the bottom or top hidden perimeter
    const midYNorm = ((p0.y + p1.y) * 0.5 - minY) / h;
    const edgeHiddenBonus = midYNorm < 0.22 ? 26 : (midYNorm > 0.82 ? 18 : 0);
    const flatnessBonus = Math.max(0, 20 - (t0 + t1) * 0.15);
    const score = len * 1.4 + edgeHiddenBonus + flatnessBonus;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildContourSteps(ring, contourMeta, coil, cfg) {
  const n = ring.length;
  const seamIdx = Math.max(0, Math.min(n - 1, Number.isInteger(cfg.seamIndex) ? cfg.seamIndex : chooseSmartSeamIndex(ring)));
  const rotated = [];
  for (let k = 0; k < n; k++) rotated.push(ring[(seamIdx + k) % n]);

  // Start exactly at midpoint of seam edge so weld/joint lands centered on straight hidden edge
  const seamStart = {
    x: (rotated[0].x + rotated[1].x) * 0.5,
    y: (rotated[0].y + rotated[1].y) * 0.5,
  };
  const ordered = [seamStart, ...rotated.slice(1), rotated[0], seamStart];

  const overlapMm = Math.max(0, Number(cfg.overlapMm ?? 6));
  const notchThresholdDeg = Math.max(10, Number(cfg.notchAngleDeg ?? coil.notchAngleDeg ?? 30));
  const minSegmentCollisionMm = Math.max(coil.minRadiusMm * 1.8, Number(cfg.minCollisionDistMm ?? 4.5));
  const springbackMult = 1 + (Number(cfg.springbackPct ?? coil.springbackPct ?? 4) / 100);

  let cumMm = 0;
  let perimeterMm = 0;
  let vNotchCount = 0;
  let flangeCutCount = 0;
  let collisionCount = 0;
  const segments = [];
  const bends = [];
  const stripMarkers = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const p0 = ordered[i], p1 = ordered[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.05) continue;
    const prevCum = cumMm;
    cumMm += segLen;
    perimeterMm += segLen;

    let turnDeg = 0;
    if (i < ordered.length - 2) {
      const p2 = ordered[i + 2];
      turnDeg = edgeTurnDeflectionDeg(p0, p1, p2);
    }
    const absTurn = Math.abs(turnDeg);
    // In CCW outer ring, negative turn is concave/inner; inside hole ring (we treat ring CCW too), outer corner vs inner reverses
    const isConcave = contourMeta.isHole ? turnDeg > 0 : turnDeg < 0;
    const isBend = absTurn >= 1.5;
    const isVNotch = absTurn >= notchThresholdDeg;
    const isFlangeCut = isConcave && absTurn >= Math.max(22, notchThresholdDeg - 6);
    const targetBendDeg = round2(turnDeg * springbackMult);

    let hasCollision = false;
    let collisionReason = '';
    if (isBend) {
      if (isConcave && absTurn > 108) {
        hasCollision = true;
        collisionReason = `Dar iç büküm (${round2(180 - absTurn)}° iç açı): büküm kafası çarpma riski`;
      } else if (segLen < minSegmentCollisionMm && absTurn > 35) {
        hasCollision = true;
        collisionReason = `Çok kısa segment (${round2(segLen)} mm < ${round2(minSegmentCollisionMm)} mm) sonrası sert dönüş`;
      } else if (coil.minRadiusMm > 2.5 && segLen < coil.minRadiusMm * 1.3 && absTurn > 48) {
        hasCollision = true;
        collisionReason = `Min. büküm yarıçapı (R${coil.minRadiusMm} mm) sınırı aşıldı`;
      }
    }

    if (isVNotch) vNotchCount++;
    if (isFlangeCut) flangeCutCount++;
    if (hasCollision) collisionCount++;

    segments.push({
      index: segments.length,
      from: p0,
      to: p1,
      lengthMm: round2(segLen),
      startDistMm: round2(prevCum),
      endDistMm: round2(cumMm),
    });

    if (i < ordered.length - 2) {
      bends.push({
        index: bends.length,
        point: p1,
        distMm: round2(cumMm),
        rawAngleDeg: round2(turnDeg),
        targetAngleDeg: targetBendDeg,
        springbackDeltaDeg: round2(targetBendDeg - turnDeg),
        isConcave,
        isVNotch,
        isFlangeCut,
        hasCollision,
        collisionReason,
      });

      if (isVNotch || isFlangeCut || hasCollision) {
        stripMarkers.push({
          distMm: round2(cumMm),
          rawAngleDeg: round2(turnDeg),
          targetAngleDeg: targetBendDeg,
          isVNotch,
          isFlangeCut,
          hasCollision,
          collisionReason,
        });
      }
    }
  }

  const totalStripMm = round2(perimeterMm + overlapMm);
  return {
    key: contourMeta.key,
    label: contourMeta.label,
    contourType: contourMeta.isHole ? 'İç Delik' : 'Dış Kontur',
    isHole: Boolean(contourMeta.isHole),
    depthMm: round2(contourMeta.depthMm),
    ringPoints: ring,
    orderedPoints: ordered,
    seamIndex: seamIdx,
    seamPoint: seamStart,
    perimeterMm: round2(perimeterMm),
    overlapMm: round2(overlapMm),
    totalStripMm,
    vNotchCount,
    flangeCutCount,
    collisionCount,
    segments,
    bends,
    stripMarkers,
  };
}

/**
 * Computes full channel-return bending simulation & CNC strip job from scene letter metrics.
 */
export function buildBendingJob(metricsList = [], config = {}) {
  const coil = getCoilProfile(config.coilId);
  const machine = getBendingMachineProfile(config.machineId);
  const seamOverrides = config.seamOverrides || {};
  const overlapMm = Math.max(0, Number(config.overlapMm ?? 6));
  const springbackPct = Number.isFinite(Number(config.springbackPct)) ? Number(config.springbackPct) : coil.springbackPct;
  const notchAngleDeg = Number.isFinite(Number(config.notchAngleDeg)) ? Number(config.notchAngleDeg) : coil.notchAngleDeg;

  const contours = [];
  for (let mIdx = 0; mIdx < metricsList.length; mIdx++) {
    const m = metricsList[mIdx];
    const ox = Number(m.offsetXMm || 0), oy = Number(m.offsetYMm || 0);
    const depthMm = Math.max(20, Number(m.depthMm || config.defaultDepthMm || 80));
    const letterLabel = String(m.label || `Harf ${mIdx + 1}`).trim() || `Harf ${mIdx + 1}`;
    const polys = m.polygonsMm || [];
    for (let pIdx = 0; pIdx < polys.length; pIdx++) {
      const poly = polys[pIdx];
      if (!poly?.outer?.length) continue;
      const outer = normalizeCcwRing(poly.outer.map(pt => ({ x: pt.x + ox, y: pt.y + oy })));
      if (outer.length >= 3) {
        const key = `${m.objectId || mIdx}_p${pIdx}_outer`;
        contours.push(buildContourSteps(outer, { key, label: `${letterLabel}${polys.length > 1 ? ` #${pIdx + 1}` : ''}`, isHole: false, depthMm }, coil, {
          seamIndex: seamOverrides[key],
          overlapMm,
          springbackPct,
          notchAngleDeg,
          minCollisionDistMm: config.minCollisionDistMm,
        }));
      }
      const holes = poly.holes || [];
      for (let hIdx = 0; hIdx < holes.length; hIdx++) {
        const hole = normalizeCcwRing(holes[hIdx].map(pt => ({ x: pt.x + ox, y: pt.y + oy })));
        if (hole.length >= 3) {
          const key = `${m.objectId || mIdx}_p${pIdx}_h${hIdx}`;
          contours.push(buildContourSteps(hole, { key, label: `${letterLabel} İç#${hIdx + 1}`, isHole: true, depthMm }, coil, {
            seamIndex: seamOverrides[key],
            overlapMm,
            springbackPct,
            notchAngleDeg,
            minCollisionDistMm: config.minCollisionDistMm,
          }));
        }
      }
    }
  }

  let totalNetPerimeterMm = 0;
  let totalStripWithOverlapMm = 0;
  let totalVNotches = 0;
  let totalFlangeCuts = 0;
  let totalCollisions = 0;
  for (const c of contours) {
    totalNetPerimeterMm += c.perimeterMm;
    totalStripWithOverlapMm += c.totalStripMm;
    totalVNotches += c.vNotchCount;
    totalFlangeCuts += c.flangeCutCount;
    totalCollisions += c.collisionCount;
  }

  return {
    coil,
    machine,
    overlapMm,
    springbackPct,
    notchAngleDeg,
    contours,
    totalContours: contours.length,
    totalNetPerimeterMm: round2(totalNetPerimeterMm),
    totalStripWithOverlapMm: round2(totalStripWithOverlapMm),
    totalMeters: round3(totalStripWithOverlapMm / 1000),
    totalVNotches,
    totalFlangeCuts,
    totalCollisions,
  };
}

function dxfLine(layer, x1, y1, x2, y2) {
  return `0\nLINE\n8\n${layer}\n10\n${round3(x1)}\n20\n${round3(y1)}\n30\n0\n11\n${round3(x2)}\n21\n${round3(y2)}\n31\n0\n`;
}

function dxfCircle(layer, cx, cy, r) {
  return `0\nCIRCLE\n8\n${layer}\n10\n${round3(cx)}\n20\n${round3(cy)}\n30\n0\n40\n${round3(r)}\n`;
}

/**
 * Generates layered 1:1 mm unfolded strip DXF (R12 or R2000) with CONTOUR, V_NOTCH, FLANGE_CUT, START_POINT layers.
 */
export function exportBendingDxf(job, format = 'R2000') {
  const isR12 = String(format).toUpperCase() === 'R12';
  const acadVer = isR12 ? 'AC1009' : 'AC1015';
  const layers = [
    { name: 'CONTOUR', color: 7 },
    { name: 'V_NOTCH', color: 2 },
    { name: 'FLANGE_CUT', color: 4 },
    { name: 'START_POINT', color: 3 },
  ];

  let out = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\n${acadVer}\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n`;
  out += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.length}\n`;
  for (const l of layers) {
    out += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n`;
  }
  out += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  let cursorY = 0;
  const gapY = 25;
  for (const c of job?.contours || []) {
    const w = c.totalStripMm;
    const h = c.depthMm;
    // Strip boundary rectangle on CONTOUR
    out += dxfLine('CONTOUR', 0, cursorY, w, cursorY);
    out += dxfLine('CONTOUR', w, cursorY, w, cursorY + h);
    out += dxfLine('CONTOUR', w, cursorY + h, 0, cursorY + h);
    out += dxfLine('CONTOUR', 0, cursorY + h, 0, cursorY);

    // Start seam cross + circle on START_POINT
    out += dxfCircle('START_POINT', 0, cursorY + h * 0.5, 3);
    out += dxfLine('START_POINT', 0, cursorY, 0, cursorY + h);

    // Overlap trim dashed line marker near end
    if (c.overlapMm > 0 && c.perimeterMm < w) {
      out += dxfLine('START_POINT', c.perimeterMm, cursorY, c.perimeterMm, cursorY + h);
    }

    // V-Notches & Flange Cuts along top/bottom flanges
    for (const m of c.stripMarkers) {
      const x = m.distMm;
      if (m.isVNotch) {
        const vw = Math.min(4, Math.max(1.8, Math.abs(m.rawAngleDeg) * 0.035));
        const vd = Math.min(7, job.coil?.flangeWidthMm || 6);
        out += dxfLine('V_NOTCH', x - vw, cursorY, x, cursorY + vd);
        out += dxfLine('V_NOTCH', x, cursorY + vd, x + vw, cursorY);
        out += dxfLine('V_NOTCH', x - vw, cursorY + h, x, cursorY + h - vd);
        out += dxfLine('V_NOTCH', x, cursorY + h - vd, x + vw, cursorY + h);
      }
      if (m.isFlangeCut) {
        out += dxfLine('FLANGE_CUT', x, cursorY, x, cursorY + 8);
        out += dxfLine('FLANGE_CUT', x, cursorY + h - 8, x, cursorY + h);
      }
    }

    cursorY += h + gapY;
  }

  out += `0\nENDSEC\n0\nEOF\n`;
  return out;
}

/**
 * Generates HPGL (.plt) file in 40 units/mm plotter coordinates.
 */
export function exportBendingPlt(job) {
  const U = 40;
  const cmds = ['IN', 'SP1'];
  let cursorY = 0;
  for (const c of job?.contours || []) {
    const w = Math.round(c.totalStripMm * U);
    const h = Math.round(c.depthMm * U);
    const y0 = Math.round(cursorY * U);
    const y1 = Math.round((cursorY + c.depthMm) * U);
    cmds.push(`PU0,${y0}`, `PD${w},${y0},${w},${y1},0,${y1},0,${y0}`, 'PU');
    cmds.push('SP2');
    for (const m of c.stripMarkers) {
      const mx = Math.round(m.distMm * U);
      if (m.isVNotch) {
        cmds.push(`PU${mx - 80},${y0}`, `PD${mx},${y0 + 200},${mx + 80},${y0}`, 'PU');
      }
      if (m.isFlangeCut) {
        cmds.push('SP3', `PU${mx},${y1 - 240}`, `PD${mx},${y1}`, 'PU', 'SP2');
      }
    }
    cmds.push('SP1');
    cursorY += c.depthMm + 25;
  }
  cmds.push('SP0', 'PU0,0');
  return cmds.join(';\n') + ';\n';
}

/**
 * Generates machine-specific channel letter bending code (Accubend, SuperBender, SDS, G-Code).
 */
export function exportBendingGcode(job, profileId) {
  const profile = getBendingMachineProfile(profileId || job?.machine?.id);
  const coil = job?.coil || getCoilProfile();
  const lines = [];
  const style = profile.codeStyle || 'gcode';

  if (style === 'accubend') {
    lines.push(`; ACCUBEND CHANNEL LETTER PROGRAM`);
    lines.push(`; COIL=${coil.label} DEPTH_DEFAULT=${job?.contours?.[0]?.depthMm || 80}mm SPRINGBACK=${job?.springbackPct || 0}%`);
    lines.push('G90 G21');
  } else if (style === 'superbender') {
    lines.push(`(SUPERBENDER PRO OUTPUT)`);
    lines.push(`(MATERIAL: ${coil.material} ${coil.thicknessMm}MM)`);
    lines.push('M03 S1');
  } else if (style === 'sds') {
    lines.push(`// SDS CHANNELBENDER DATA`);
    lines.push(`// SPRINGBACK_COMP=${job?.springbackPct || 0}%`);
    lines.push('G21');
  } else {
    lines.push(`(STANDART KUTU HARF BUKUM G-CODE)`);
    lines.push(`(MALZEME: ${coil.label} | YAYLANMA: %${job?.springbackPct || 0})`);
    lines.push('G21 G90');
  }

  for (const c of job?.contours || []) {
    lines.push('');
    lines.push(`(${c.label} - ${c.contourType} | BANT=${c.totalStripMm}mm | DERINLIK=${c.depthMm}mm)`);
    let lastDist = 0;
    for (const b of c.bends) {
      const feed = round2(b.distMm - lastDist);
      lastDist = b.distMm;
      if (feed > 0.05) lines.push(`G01 F${feed} ; Besleme ${feed} mm -> ${b.distMm} mm`);
      if (b.isVNotch) lines.push(`M10 ; V-Kerc Ac (${round2(b.rawAngleDeg)} deg)`);
      if (b.isFlangeCut) lines.push(`M11 ; Flans Kesimi`);
      if (Math.abs(b.targetAngleDeg) >= 1.5) {
        lines.push(`G02 A${b.targetAngleDeg} ; Hedef Bukum (Yaylanma telafili)`);
      }
    }
    const tail = round2(c.totalStripMm - lastDist);
    if (tail > 0.05) lines.push(`G01 F${tail} ; Bindirme Payi (${c.overlapMm} mm dahil)`);
    lines.push(`M05 ; Kes / Bant Ayir (${c.label})`);
  }

  lines.push('M30');
  return lines.join('\n') + '\n';
}

/**
 * Generates printable shop-floor Job Sheet HTML (İş Emri).
 */
export function buildBendingJobSheetHtml(job) {
  const rows = (job?.contours || []).map((c, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${c.label}</strong></td>
      <td>${c.contourType}</td>
      <td>${c.depthMm} mm</td>
      <td>${c.perimeterMm} mm</td>
      <td>+${c.overlapMm} mm</td>
      <td><strong>${c.totalStripMm} mm</strong></td>
      <td>${c.vNotchCount}</td>
      <td>${c.flangeCutCount}</td>
      <td style="color:${c.collisionCount ? '#dc2626' : '#16a34a'}">${c.collisionCount ? `⚠ ${c.collisionCount} Risk` : '✓ Temiz'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Yan Bant Büküm İş Emri</title>
  <style>body{font-family:Inter,Arial,sans-serif;padding:24px;color:#0f172a}h1{margin:0 0 6px;font-size:20px}.meta{color:#475569;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left}th{background:#f1f5f9}.sum{margin-top:14px;display:flex;gap:18px;font-size:13px;background:#f8fafc;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px}</style>
  </head><body>
    <h1>Yan Bant Büküm İş Emri (Channel Return Job Sheet)</h1>
    <div class="meta">Makine: <strong>${job?.machine?.label || '-'}</strong> · Bobin: <strong>${job?.coil?.label || '-'}</strong> · Yaylanma Telafisi: <strong>%${job?.springbackPct || 0}</strong> · Bindirme Payı: <strong>${job?.overlapMm || 0} mm</strong></div>
    <table>
      <thead><tr><th>#</th><th>Harf / Kontur</th><th>Tip</th><th>Derinlik</th><th>Net Çevre</th><th>Bindirme</th><th>Toplam Şerit</th><th>V-Kerç</th><th>Flanş</th><th>Durum</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sum">
      <div>Toplam Kontur: <strong>${job?.totalContours || 0}</strong></div>
      <div>Toplam Bobin: <strong>${job?.totalMeters || 0} m (${job?.totalStripWithOverlapMm || 0} mm)</strong></div>
      <div>Toplam V-Kerç: <strong>${job?.totalVNotches || 0}</strong></div>
      <div>Flanş Kesimi: <strong>${job?.totalFlangeCuts || 0}</strong></div>
      <div>Dar Açı / Çarpışma Uyarısı: <strong>${job?.totalCollisions || 0}</strong></div>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
  </body></html>`;
}
