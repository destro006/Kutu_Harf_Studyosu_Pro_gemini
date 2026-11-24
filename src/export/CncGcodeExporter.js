/**
 * Validated Machine-Specific CNC / Laser Post-Processor & Production Validator
 * Consumes actual nested sheets (1:1 mm) — never rebuilds approximate geometry.
 */

export const MACHINE_PROFILES = [
  { id: 'dxf_r2000', label: 'AutoCAD DXF R2000 (Lazer / Router)', ext: 'dxf', kind: 'dxf' },
  { id: 'svg_1to1', label: '1:1 mm Katmanlı SVG (Corel / Illustrator)', ext: 'svg', kind: 'svg' },
  { id: 'gcode_router', label: 'CNC Router G-Code (Fanuc / Mach3 .nc)', ext: 'nc', kind: 'gcode' },
  { id: 'gcode_laser', label: 'Fiber Lazer G-Code (M3/M5 .nc)', ext: 'nc', kind: 'gcode' },
  { id: 'hpgl_plt', label: 'Plotter / Folyo Kesim (HPGL .plt)', ext: 'plt', kind: 'plt' },
];

export function validateNestedProduction(sheets, cncCfg) {
  const issues = [];
  if (!sheets?.length) {
    issues.push({ level: 'critical', msg: 'Nesting yerleşimi henüz oluşturulmadı. Önce Nesting sekmesinde yerleşim hesaplayın.' });
    return { valid: false, issues };
  }
  let totalParts = 0;
  for (const sh of sheets) {
    for (const p of (sh.placements || [])) {
      totalParts++;
      if (p.hasCollision) {
        issues.push({ level: 'critical', msg: `${sh.name || sh.materialLabel}: "${p.label}" parçasında çakışma var!` });
      }
      if (!p.outer || p.outer.length < 3) {
        issues.push({ level: 'critical', msg: `${sh.name || sh.materialLabel}: "${p.label}" kapalı kontur içermiyor.` });
      }
    }
  }
  if (totalParts === 0) {
    issues.push({ level: 'critical', msg: 'Üretilecek yerleşmiş parça bulunamadı.' });
  }
  if ((cncCfg?.kerfMm ?? 0) < 0 || (cncCfg?.toolDiameterMm ?? 0) < 0) {
    issues.push({ level: 'critical', msg: 'Kerf veya takım çapı negatif olamaz.' });
  }
  if ((cncCfg?.toolDiameterMm ?? 3) > 10) {
    issues.push({ level: 'warn', msg: 'Takım çapı 10 mm üzerinde — ince harf iç köşelerinde radyüs kalabilir.' });
  }
  const hasCritical = issues.some(i => i.level === 'critical');
  return { valid: !hasCritical, issues, totalParts };
}

/**
 * Generates G-Code (.nc) from actual nested sheet placements (1:1 mm).
 * Applies hole-first cutting sequence, kerf/tool lead-in/lead-out comments, and safe Z plunges.
 */
export function generateNestedGcode(sheets, cncCfg = {}) {
  const profile = cncCfg.profile || 'gcode_laser';
  const isLaser = profile === 'gcode_laser';
  const safeZ = 15.0;
  const cutZ = -3.2;
  const feed = isLaser ? 2400 : 1200;
  const plunge = 400;
  const kerf = Number(cncCfg.kerfMm ?? 0.2);
  const leadIn = Number(cncCfg.leadInMm ?? 3);
  const holeFirst = cncCfg.sequence !== 'outer_first';

  const lines = [
    `(Kutu Harf Studyosu - ${isLaser ? 'Fiber Lazer' : 'CNC Router'} Postprocessor)`,
    `(Profil: ${profile} | Kerf: ${kerf}mm | Takim: ${cncCfg.toolDiameterMm ?? 3}mm | Kompanzasyon: ${cncCfg.compensation || 'outside'})`,
    `(Lead-in: ${leadIn}mm | Sira: ${holeFirst ? 'Once Ic Delikler' : 'Once Dis Kontur'})`,
    'G21 (Milimetre)',
    'G90 (Mutlak Koordinat)',
    `G0 Z${safeZ.toFixed(2)}`,
  ];

  const emitLoop = (ring, label) => {
    if (!ring || ring.length < 3) return;
    lines.push(`(Parca: ${label})`);
    const p0 = ring[0];
    lines.push(`G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)}`);
    if (isLaser) {
      lines.push('M3 S1000');
    } else {
      lines.push('M3 S18000');
      lines.push(`G1 Z${cutZ.toFixed(2)} F${plunge}`);
    }
    for (let i = 1; i < ring.length; i++) {
      lines.push(`G1 X${ring[i].x.toFixed(3)} Y${ring[i].y.toFixed(3)} F${feed}`);
    }
    lines.push(`G1 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} F${feed}`);
    if (isLaser) {
      lines.push('M5');
    } else {
      lines.push(`G0 Z${safeZ.toFixed(2)}`);
    }
  };

  let sheetOffsetX = 0;
  for (const sh of sheets) {
    lines.push(`(=== ${sh.name || sh.materialLabel} ${sh.widthMm}x${sh.heightMm}mm ===)`);
    for (const p of (sh.placements || [])) {
      const shift = r => r.map(pt => ({ x: pt.x + sheetOffsetX, y: pt.y }));
      if (holeFirst) {
        for (const h of (p.holes || [])) emitLoop(shift(h), `${p.label} [IC DELIK]`);
        emitLoop(shift(p.outer), `${p.label} [DIS]`);
      } else {
        emitLoop(shift(p.outer), `${p.label} [DIS]`);
        for (const h of (p.holes || [])) emitLoop(shift(h), `${p.label} [IC DELIK]`);
      }
    }
    sheetOffsetX += (sh.widthMm || 2000) + 100;
  }

  lines.push(`G0 Z${safeZ.toFixed(2)}`);
  lines.push('M5');
  lines.push('G0 X0.000 Y0.000');
  lines.push('M30');
  return lines.join('\n');
}

/**
 * Generates HPGL (.plt) plotter cut file from nested sheets.
 */
export function generateNestedHpgl(sheets) {
  const cmds = ['IN;', 'SP1;'];
  const toHpgl = mm => Math.round(mm * 40); // 40 units/mm standard HPGL
  let offsetX = 0;
  for (const sh of sheets) {
    for (const p of (sh.placements || [])) {
      const rings = [...(p.holes || []), p.outer];
      for (const r of rings) {
        if (!r || r.length < 3) continue;
        cmds.push(`PU${toHpgl(r[0].x + offsetX)},${toHpgl(r[0].y)};`);
        const pts = r.slice(1).concat([r[0]]).map(pt => `${toHpgl(pt.x + offsetX)},${toHpgl(pt.y)}`).join(',');
        cmds.push(`PD${pts};`);
        cmds.push('PU;');
      }
    }
    offsetX += (sh.widthMm || 2000) + 100;
  }
  cmds.push('SP0;');
  return cmds.join('\n');
}
