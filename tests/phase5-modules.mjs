import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { parseFont } from '../src/vendor/opentype.mjs';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import {
  BENDING_MACHINE_PROFILES,
  buildBendingJob,
  buildBendingJobSheetHtml,
  exportBendingDxf,
  exportBendingGcode,
  exportBendingPlt,
} from '../src/manufacturing/BendingSimulator.js';
import { renderCncCenter } from '../src/ui/CentralWorkspaces.js';

const loadWoff = fn => {
  const b = fs.readFileSync(new URL(`../public/fonts/${fn}`, import.meta.url));
  return parseFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const cinzel = [
  loadWoff('cinzel-latin-700-normal-C-gK7hA8.woff'),
  loadWoff('cinzel-latin-ext-700-normal-CORa-yIv.woff'),
];

const lay = layoutTextMm(cinzel, 'AV', 400, 8);
const metricsList = lay.glyphs.map((g, i) => {
  const built = buildChannelComponent(g.shapes, { constructionType: 'metal', depthMm: 80 });
  const m = {
    objectId: 'bend_obj_' + i,
    label: g.char,
    ...built.metrics,
    depthMm: 80,
    constructionType: 'metal',
    polygonsMm: built.polygonsMm,
    offsetXMm: i * 320,
    offsetYMm: 0,
  };
  for (const geo of [...built.outerGeos, ...built.fileGeos, ...built.acrylicGeos]) geo.dispose();
  return m;
});

// 1. Smart hidden seam, overlap, V-notch/flange markers & springback compensation
const job = buildBendingJob(metricsList, { coilId: 'ss_08', machineId: 'accubend', overlapMm: 8 });
assert(job.contours.length >= 2, 'Expected outer contours for AV');
for (const c of job.contours) {
  assert.equal(c.overlapMm, 8);
  assert(Math.abs(c.totalStripMm - (c.perimeterMm + 8)) < 0.05, 'Total strip must equal perimeter + overlap');
  assert(c.vNotchCount >= 1, 'Sharp corners must produce V-notch markers');
  const firstSignificantBend = c.bends.find(b => Math.abs(b.rawAngleDeg) >= 20);
  assert(firstSignificantBend, 'Expected at least one significant bend');
  assert(
    Math.abs(firstSignificantBend.targetAngleDeg) > Math.abs(firstSignificantBend.rawAngleDeg),
    'Springback compensation must increase target bend magnitude',
  );
}

// Manual seamOverride changes start point
const firstKey = job.contours[0].key;
const altIdx = (job.contours[0].seamIndex + 2) % job.contours[0].ringPoints.length;
const overridden = buildBendingJob(metricsList, {
  coilId: 'ss_08',
  machineId: 'accubend',
  overlapMm: 8,
  seamOverrides: { [firstKey]: altIdx },
});
assert.equal(overridden.contours[0].seamIndex, altIdx);

// 2. Acute inner-corner / short-segment collision detection
const tightStarMetrics = [{
  objectId: 'tight_star',
  label: 'M',
  depthMm: 80,
  polygonsMm: [{
    outer: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 120 },
      { x: 52, y: 120 },
      { x: 50, y: 117 },
      { x: 48, y: 120 },
      { x: 0, y: 120 },
    ],
    holes: [],
  }],
}];
const collisionJob = buildBendingJob(tightStarMetrics, { coilId: 'ss_08' });
assert(collisionJob.totalCollisions >= 1, 'Acute tight return bends must flag collision warning');
assert(collisionJob.contours[0].bends.some(b => b.hasCollision), 'Expected hasCollision bend marker');

// 3. DXF R2000 / R12, PLT, G-Code & Job Sheet exporters
const dxf2000 = exportBendingDxf(job, 'R2000');
const dxf12 = exportBendingDxf(job, 'R12');
assert(dxf2000.includes('AC1015') && dxf12.includes('AC1009'));
for (const layer of ['CONTOUR', 'V_NOTCH', 'FLANGE_CUT', 'START_POINT']) {
  assert(dxf2000.includes(layer), `DXF R2000 missing layer ${layer}`);
  assert(dxf12.includes(layer), `DXF R12 missing layer ${layer}`);
}

const plt = exportBendingPlt(job);
assert(plt.startsWith('IN;') && plt.includes('SP1;') && plt.includes('PD'));

for (const mp of BENDING_MACHINE_PROFILES.filter(p => p.kind === 'gcode')) {
  const gcode = exportBendingGcode(job, mp.id);
  assert(gcode.includes('G01 F') && gcode.includes('G02 A') && gcode.includes('M30'), `Invalid G-code for ${mp.id}`);
}

const sheetHtml = buildBendingJobSheetHtml(job);
assert(sheetHtml.includes('Yan Bant Büküm İş Emri') && sheetHtml.includes(`${job.totalMeters} m`));

// 4. renderCncCenter preserves default 'cnc' IDs and renders 'workshop' & 'bending' sub-tabs
const st = createDefaultState();
const defaultCnc = renderCncCenter(st);
assert(defaultCnc.includes('id="cncProfile"') && defaultCnc.includes('id="cncBtnExportDxf"'));
assert(defaultCnc.includes('data-cnc-subtab="workshop"') && defaultCnc.includes('data-cnc-subtab="bending"'));

const workshopHtml = renderCncCenter(st, { subTab: 'workshop', metricsList });
assert(workshopHtml.includes('id="wsExportStudDxf"') && workshopHtml.includes('id="wsExportStudSvg"') && workshopHtml.includes('IP67 Trafo'));

const bendingHtml = renderCncCenter(st, {
  subTab: 'bending',
  bendingJob: job,
  bendingConfig: { machineId: 'accubend', coilId: 'ss_08', overlapMm: 8 },
  bendingSimState: { activeContourIdx: 0, progress: 0.5, playing: false, speed: 1 },
});
assert(bendingHtml.includes('id="bendingSimCanvas"') && bendingHtml.includes('id="bendExpDxfR2000"') && bendingHtml.includes('id="bendExpGcode"'));
assert(
  bendingHtml.includes('class="bend-select"') &&
  bendingHtml.includes('class="bend-num-field"') &&
  bendingHtml.includes('class="bend-unit"') &&
  bendingHtml.includes('class="bend-player-bar"') &&
  bendingHtml.includes('class="bend-export-grid"'),
  'Redesigned Bending Simulator classes must be present',
);

console.log('✓ Phase 5 Module 10 (Bending Simulator, Collisions, Exporters & Workshop UI) verified cleanly');
