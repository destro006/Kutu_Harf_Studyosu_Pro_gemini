import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { MACHINE_PROFILES, MACHINE_PROFILE_CATEGORIES, getMachineProfile, generateNestedGcode, generateNestedHpgl } from '../src/export/CncGcodeExporter.js';
import {
  buildCorelNestingPayload,
  generateCorelColoredSvg,
  generateCorelVbaMacro,
  generateCorelBridgeLauncherBat,
  getCorelBridgePs1Script,
  getCorelInstallerPs1Script,
  getCorelPluginBasScript,
  getCorelAddonXslt,
  copySvgVectorToClipboard,
} from '../src/export/CorelDrawBridge.js';
import {
  getDefaultMachineConnection,
  buildMachineUploadPayload,
  generateCncBridgeLauncherBat,
  getCncBridgePs1Script,
} from '../src/export/CncMachineBridge.js';
import { renderNestingCenter, renderCncCenter } from '../src/ui/CentralWorkspaces.js';
import { createDefaultState } from '../src/core/state.js';
import { postScriptToPdf } from '../src/manufacturing/PostScriptWasmImport.js';
import { extractAiOutlineFallback } from '../src/manufacturing/LegacyPostScriptImport.js';
import { detectVectorFormat } from '../src/manufacturing/VectorFormatDetect.js';
import { importDxfText, importSvgText, importHpglText } from '../src/manufacturing/VectorFileImport.js';
import { cleanCdrSvg, dwgDatabaseToDxf } from '../src/manufacturing/NativeCadImport.js';
import { importWmfEmf } from '../src/manufacturing/WmfEmfImport.js';
import { extractNestingItems, FILELI_NESTING_GROUPS, SIDEWALL_STRIP_GROUP, runTrueShapeNesting } from '../src/manufacturing/NestingEngine.js';
import { renderNestingSvg } from '../src/ui/NestingView.js';
import { parseFont } from '../src/vendor/opentype.mjs';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import {
  auditAndRepairContourNodes,
  healPolygonWithHoles,
  offsetRing,
  pointInPolygon,
  polygonBounds,
  hasSelfIntersection,
} from '../src/geometry/PolygonOffset.js';
import THREE from '../src/vendor/three.js';
import { calculateProjectCosts, COST_ROLE_LABELS } from '../src/manufacturing/CostEngine.js';
import { PostProcessor } from '../src/render/PostProcessor.js';
import {
  rotateNestingParts,
  alignNestingParts,
  cloneNestingPlacements,
  pasteNestingParts,
  transferNestingParts,
} from '../src/manufacturing/NestingSelection.js';
import { attachShortcuts } from '../src/cad/Shortcuts.js';

// 1. Machine profiles catalogue (>= 40 profiles, 5 original IDs intact, dialect G-Code & HPGL)
assert(MACHINE_PROFILES.length >= 40, `Expected >=40 profiles, got ${MACHINE_PROFILES.length}`);
assert(MACHINE_PROFILE_CATEGORIES.length === 5);
for (const legacyId of ['dxf_r2000', 'svg_1to1', 'gcode_router', 'gcode_laser', 'hpgl_plt']) {
  assert.equal(getMachineProfile(legacyId).id, legacyId);
}
const sampleSheet = [{
  index: 1, name: 'Levha 1', materialGroup: 'Alüminyum', widthMm: 2000, heightMm: 1000,
  placements: [{
    label: 'Harf A',
    outer: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 60, y: 110 }],
    holes: [[{ x: 45, y: 30 }, { x: 75, y: 30 }, { x: 60, y: 65 }]],
  }],
}];
const plasmaGcode = generateNestedGcode(sampleSheet, { profile: 'gcode_plasma', kerfMm: 1.5, toolDiameterMm: 1.5 });
assert(plasmaGcode.includes('G4 P0.6') && plasmaGcode.includes('M3') && plasmaGcode.includes('M5'));
const grblLaserGcode = generateNestedGcode(sampleSheet, { profile: 'gcode_grbl_laser' });
assert(grblLaserGcode.includes('M4 S1000') && grblLaserGcode.startsWith('; Kutu Harf Studyosu'));
const rolandPlt = generateNestedHpgl(sampleSheet, { profile: 'plt_roland' });
assert(rolandPlt.includes('VS30;') && rolandPlt.includes('PU') && rolandPlt.includes('PD'));
console.log(`✓ ${MACHINE_PROFILES.length} machine profiles & G-Code/HPGL dialects validated`);

// 2. Legacy Adobe Illustrator AI5 with Adobe_packedarray -> Ghostscript WASM psToPdf
const aiPackedArray = `%!PS-Adobe-3.0
%%Creator: Adobe Illustrator(TM) 8.0
%%BoundingBox: -50 -20 250 180
%%IncludeResource: procset Adobe_packedarray 2.0 0
%%IncludeResource: procset Adobe_cmykcolor 1.1 0
%%IncludeResource: procset Adobe_customcolor 1.0 0
%%IncludeResource: procset Adobe_Illustrator_AI5 1.0 0
%%EndComments
%%EndProlog
%%BeginSetup
Adobe_packedarray /initialize get exec
Adobe_cmykcolor /initialize get exec
Adobe_customcolor /initialize get exec
Adobe_Illustrator_AI5_vars Adobe_Illustrator_AI5 /initialize get exec
%%EndSetup
1 XR
*u
-40 -10 m
200 -10 L
200 150 l
-40 150 L
-40 -10 l
f
20 20 m
100 20 L
100 90 L
20 90 L
20 20 l
f
*U
%%Trailer
Adobe_Illustrator_AI5 /terminate get exec
%%EOF`;

const enc = new TextEncoder();
const pdfBytes = await postScriptToPdf(enc.encode(aiPackedArray));
assert.equal(new TextDecoder().decode(pdfBytes.subarray(0, 5)), '%PDF-');
console.log('✓ Legacy AI with Adobe_packedarray / Adobe_Illustrator_AI5 converted via Ghostscript WASM');

// 3. Tolerant AI fallback contour extractor
const fbAi = extractAiOutlineFallback(aiPackedArray + '\n0 To\n(TEXT) Tx\nTO\n', 'restroom.ai');
assert.equal(fbAi.items.length, 1);
assert.equal(fbAi.items[0].holes.length, 1);
console.log('✓ Tolerant AI outline fallback handles compound hole & skips text blocks');

// 4. VectorFormatDetect: ZIP CDR, EMF, WMF, offset PDF
assert.equal(detectVectorFormat(new Uint8Array([80, 75, 3, 4, 20, 0]), 'sign.cdr'), 'cdr');
assert.equal(detectVectorFormat(new Uint8Array([...Array(2048).fill(0x20), ...enc.encode('%PDF-1.6')]), 'modern.ai'), 'pdf');
console.log('✓ ZIP CDR & >1KB offset PDF-AI signature detection');

// 5. DXF advanced entities: unflagged LWPOLYLINE, ARC+LINE loop, ELLIPSE, SPLINE, BLOCK/INSERT
const advDxf = [
  '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'BLOCKS',
  '0', 'BLOCK', '2', 'SQUARE_BLK', '10', '0', '20', '0',
  '0', 'LWPOLYLINE', '70', '0',
  '10', '0', '20', '0', '10', '40', '20', '0', '10', '40', '20', '40', '10', '0', '20', '40', '10', '0', '20', '0',
  '0', 'ENDBLK',
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  // Block insert translated to (200, 10)
  '0', 'INSERT', '2', 'SQUARE_BLK', '10', '200', '20', '10', '41', '1', '42', '1', '50', '0',
  // Full ellipse
  '0', 'ELLIPSE', '10', '80', '20', '80', '11', '30', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI * 2),
  // Stitched D-shape: vertical line (0,0)->(0,60) + semicircle center(0,30) r=30 from -90 to +90 deg
  '0', 'LINE', '10', '0', '20', '0', '11', '0', '21', '60',
  '0', 'ARC', '10', '0', '20', '30', '40', '30', '50', '270', '51', '90',
  // Closed quadratic B-spline triangle/loop
  '0', 'SPLINE', '70', '1', '71', '2',
  '40', '0', '40', '0', '40', '0', '40', '0.5', '40', '1', '40', '1', '40', '1',
  '10', '300', '20', '0', '10', '360', '20', '0', '10', '330', '20', '60', '10', '300', '20', '0',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n');
const dxfRes = importDxfText(advDxf, 'advanced.dxf');
assert.equal(dxfRes.items.length, 4, `Expected 4 DXF parts (INSERT+ELLIPSE+ARC/LINE+SPLINE), got ${dxfRes.items.length}`);
console.log('✓ DXF INSERT, ELLIPSE, stitched ARC+LINE, SPLINE & unflagged LWPOLYLINE imported');

// 6. DWG database bridge emits ARC/ELLIPSE/SPLINE
const bridged = dwgDatabaseToDxf({
  header: { INSUNITS: 4 },
  entities: [
    { type: 'ELLIPSE', center: { x: 50, y: 50 }, majorAxisEndPoint: { x: 25, y: 0 }, axisRatio: 0.6, startAngle: 0, endAngle: Math.PI * 2 },
  ],
});
assert(bridged.text.includes('ELLIPSE'));
assert.equal(importDxfText(bridged.text, 'dwg.dxf').items.length, 1);
console.log('✓ DWG database bridge converts ELLIPSE cleanly');

// 7. SVG robustness (implicit close without Z, rounded rect, local <use>, cleanCdrSvg) + security checks
const messySvg = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">
  <defs><path id="badge" d="M 0 0 L 40 0 L 40 30 L 0 30 L 0 0"/></defs>
  <rect x="10" y="10" width="80" height="50" rx="8" ry="8"/>
  <use href="#badge" x="120" y="20"/>
  <image href="preview.png" width="10" height="10"/>
</svg>`;
const cleaned = cleanCdrSvg(messySvg);
const svgRes = importSvgText(cleaned.svg, 'cdr_export.svg');
assert.equal(svgRes.items.length, 2);
assert.throws(() => importSvgText('<svg><script>alert(1)</script><rect width="10" height="10"/></svg>', 'bad.svg'), /çalışan içerik/);
assert.throws(() => importSvgText('<svg><use href="https://evil.example/x.svg#a"/></svg>', 'bad2.svg'), /engellendi|harici/i);
console.log('✓ SVG implicit close, rounded rect, local <use>, CDR cleaning & security blocks verified');

// 8. Pure-JS WMF and EMF binary import
const wmf = new Uint8Array(22 + 18 + 14 + 6);
const wv = new DataView(wmf.buffer);
wv.setUint32(0, 0x9ac6cdd7, true); // Aldus key
wv.setUint16(14, 254, true); // 254 units/inch -> 0.1 mm/unit
wv.setUint16(24, 9, true); // header size 9 words
let wp = 22 + 18;
wv.setUint32(wp, 7, true); wv.setUint16(wp + 4, 0x041b, true); // META_RECTANGLE (7 words = 14 bytes)
wv.setInt16(wp + 6, 500, true); wv.setInt16(wp + 8, 1000, true); wv.setInt16(wp + 10, 0, true); wv.setInt16(wp + 12, 0, true);
wp += 14;
wv.setUint32(wp, 3, true); wv.setUint16(wp + 4, 0, true); // EOF
const wmfRes = importWmfEmf(wmf, 'logo.wmf', 'wmf');
assert.equal(wmfRes.items.length, 1);
assert(Math.abs(wmfRes.widthMm - 100) < 0.1);
assert(Math.abs(wmfRes.heightMm - 50) < 0.1);

const emf = new Uint8Array(88 + 24 + 8);
const ev = new DataView(emf.buffer);
ev.setUint32(0, 1, true); ev.setUint32(4, 88, true); // EMR_HEADER
ev.setInt32(8, 0, true); ev.setInt32(12, 0, true); ev.setInt32(16, 1000, true); ev.setInt32(20, 500, true); // rclBounds
ev.setInt32(24, 0, true); ev.setInt32(28, 0, true); ev.setInt32(32, 10000, true); ev.setInt32(36, 5000, true); // 100mm x 50mm
ev.setUint32(40, 0x464d4520, true); // ' EMF'
ev.setUint32(88, 43, true); ev.setUint32(92, 24, true); // EMR_RECTANGLE
ev.setInt32(96, 0, true); ev.setInt32(100, 0, true); ev.setInt32(104, 1000, true); ev.setInt32(108, 500, true);
ev.setUint32(112, 14, true); ev.setUint32(116, 8, true); // EMR_EOF
assert.equal(detectVectorFormat(emf, 'vector.emf'), 'emf');
const emfRes = importWmfEmf(emf, 'vector.emf', 'emf');
assert.equal(emfRes.items.length, 1);
assert(Math.abs(emfRes.widthMm - 100) < 0.1);
assert(Math.abs(emfRes.heightMm - 50) < 0.1);
console.log('✓ Pure-JS WMF and EMF binary vector imports verified');

// 9. Trace Studio Pro integrated as Image Tracer tab immediately left of Nesting
const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tracerBtn = rootHtml.indexOf('data-main-ws="tracer"');
const nestingBtn = rootHtml.indexOf('data-main-ws="nesting"');
assert(tracerBtn > 0 && nestingBtn > tracerBtn, 'Image Tracer tab must precede Nesting tab');
const between = rootHtml.slice(tracerBtn + 'data-main-ws="tracer"'.length, nestingBtn);
assert(!between.includes('data-main-ws='), 'Image Tracer tab must sit immediately left of Nesting');
const traceStudioHtml = fs.readFileSync(new URL('../public/trace-studio/index.html', import.meta.url), 'utf8');
assert(traceStudioHtml.includes('SIGNAGE_STUDIO_IMPORT_VECTOR') && traceStudioHtml.includes('SIGNAGE_STUDIO_IMPORT_NESTING'));
assert(traceStudioHtml.includes('activePreset.name') && traceStudioHtml.includes("if (state.viewMode === 'vector')"));
const mainJs = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(mainJs.includes('tracerCenterWrap') && mainJs.includes('SIGNAGE_STUDIO_IMPORT_VECTOR') && mainJs.includes('SIGNAGE_STUDIO_IMPORT_NESTING'));
assert(mainJs.includes('./public/trace-studio/index.html?v=20261126-v9'));
assert(rootHtml.includes('./src/main.js?v=20261126-v36'));
assert(rootHtml.includes('./src/styles/studio.css?v=20261126-v36'));
assert(rootHtml.includes('id="stagePmPhotoUpload"') && mainJs.includes("getElementById('stagePmPhotoUpload')"));
assert(mainJs.includes('./ui/CentralWorkspaces.js?v=20261126-v36'));
console.log('✓ Image Tracer tab, bridge, cache-busting, and position left of Nesting verified');

// 10. All 8 Image Tracer enhancement presets produce distinct, goal-accurate pixel outputs
const scriptMatch = traceStudioHtml.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
assert(scriptMatch, 'Expected inline script in public/trace-studio/index.html');
const makeStubEl = () => ({
  style: {},
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  addEventListener() {},
  querySelectorAll: () => [],
  querySelector: () => null,
  getContext: () => ({
    clearRect() {}, drawImage() {}, putImageData() {}, fillRect() {},
    beginPath() {}, roundRect() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, fill() {}, fillText() {},
    getImageData: (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  }),
  width: 32, height: 32, checked: true, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {}
});
const elCache = new Map();
const sandbox = {
  window: { addEventListener() {}, opener: null, parent: null },
  document: {
    getElementById(id) { if (!elCache.has(id)) elCache.set(id, makeStubEl()); return elCache.get(id); },
    querySelectorAll: () => [],
    createElement: () => makeStubEl()
  },
  requestAnimationFrame: () => 0,
  setTimeout: () => 0,
  clearTimeout() {},
  Uint8ClampedArray, Float32Array, Int32Array, Uint32Array, Set, Map, Math
};
sandbox.ImageData = class ImageData { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
vm.runInNewContext(scriptMatch[1], sandbox);
const engine = sandbox.window.__TRACE_ENHANCE_ENGINE__;
assert(engine && Array.isArray(engine.PRESETS) && engine.PRESETS.length === 8, 'Expected 8 presets in Image Tracer engine');

// Build a synthetic 96x64 RGBA test image covering:
// - top-left (x<48, y<32): flat muted warm badge with dark text-like stripes
// - top-right (x>=48, y<32): sharp edge + midtone muted teal/gold block
// - bottom-left (x<48, y>=32): noisy flat gradient
// - bottom-right (x>=48, y>=32): off-white background with thin dark strokes
const W = 96, H = 64;
const srcBuf = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let r = 232, g = 234, b = 238;
    if (x < 48 && y < 32) {
      r = 160; g = 135; b = 105;
      if ((y >= 10 && y <= 20) && (x % 6 === 2 || x % 6 === 3)) { r = 42; g = 40; b = 38; }
    } else if (x >= 48 && y < 32) {
      r = x < 72 ? 95 : 175;
      g = x < 72 ? 148 : 138;
      b = x < 72 ? 152 : 90;
      if (y === 16 || y === 17) { r = 220; g = 175; b = 95; }
    } else if (x < 48 && y >= 32) {
      const base = 110 + ((x * 2) % 60);
      const noise = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 28 - 14;
      r = base + noise; g = base + 8 + noise; b = base + 14 + noise;
    } else {
      r = 228; g = 228; b = 230;
      if ((x === 68 || x === 78) && y >= 38 && y <= 58) { r = 55; g = 55; b = 58; }
      if (y === 48 && x >= 60 && x <= 86) { r = 55; g = 55; b = 58; }
    }
    srcBuf[i] = Math.max(0, Math.min(255, Math.round(r)));
    srcBuf[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    srcBuf[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    srcBuf[i + 3] = 255;
  }
}

const outputs = new Map();
for (const p of engine.PRESETS) {
  outputs.set(p.id, engine.runPresetDspPipelineSync(srcBuf, W, H, p.id, 0.25, 4));
}

// Check all 28 unordered pairs are clearly distinct
const ids = engine.PRESETS.map(p => p.id);
for (let a = 0; a < ids.length; a++) {
  for (let b = a + 1; b < ids.length; b++) {
    const ba = outputs.get(ids[a]), bb = outputs.get(ids[b]);
    let sumAbs = 0, maxAbs = 0;
    for (let k = 0; k < W * H; k++) {
      const i = k * 4;
      for (let ch = 0; ch < 3; ch++) {
        const d = Math.abs(ba[i + ch] - bb[i + ch]);
        sumAbs += d;
        if (d > maxAbs) maxAbs = d;
      }
    }
    const mad = sumAbs / (W * H * 3);
    assert(mad > 1.0 && maxAbs >= 12, `Presets ${ids[a]} vs ${ids[b]} too similar (MAD=${mad.toFixed(2)}, max=${maxAbs})`);
  }
}

const avgChroma = (buf) => {
  let s = 0, n = 0;
  for (let y = 4; y < 28; y++) {
    for (let x = 52; x < 92; x++) {
      const i = (y * W + x) * 4;
      s += Math.max(buf[i], buf[i + 1], buf[i + 2]) - Math.min(buf[i], buf[i + 1], buf[i + 2]);
      n++;
    }
  }
  return s / n;
};
const edgeEnergy = (buf) => {
  let s = 0, n = 0;
  for (let y = 12; y < 22; y++) {
    for (let x = 66; x < 78; x++) {
      const i = (y * W + x) * 4;
      s += Math.abs(buf[i] - buf[i + 4]) + Math.abs(buf[i] - buf[i + W * 4]);
      n++;
    }
  }
  return s / n;
};
const noiseDiff = (buf) => {
  let s = 0, n = 0;
  for (let y = 36; y < 60; y++) {
    for (let x = 4; x < 44; x++) {
      const i = (y * W + x) * 4;
      const g = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
      const gr = 0.299 * buf[i + 4] + 0.587 * buf[i + 5] + 0.114 * buf[i + 6];
      s += Math.abs(g - gr);
      n++;
    }
  }
  return s / n;
};
const strokeMinLum = (buf) => {
  let m = 255;
  for (let y = 40; y < 56; y++) {
    const i = (y * W + 68) * 4;
    const lum = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
    if (lum < m) m = lum;
  }
  return m;
};

assert(avgChroma(outputs.get('digital_art')) > avgChroma(outputs.get('photo_3d_soft')) + 8, 'digital_art must boost chroma saturation');
assert(edgeEnergy(outputs.get('photo_sharp')) > edgeEnergy(outputs.get('photo_3d_soft')) + 15, 'photo_sharp must have crisper edges than photo_3d_soft');
assert(edgeEnergy(outputs.get('diffusion_razor')) > edgeEnergy(outputs.get('photo_3d_nr')) + 10, 'diffusion_razor must have crisper edges than photo_3d_nr');
assert(noiseDiff(outputs.get('photo_3d_soft')) < noiseDiff(outputs.get('photo_sharp')), 'photo_3d_soft must reduce noise vs photo_sharp');
assert(noiseDiff(outputs.get('photo_3d_nr')) < noiseDiff(srcBuf), 'photo_3d_nr must reduce input noise');
assert(strokeMinLum(outputs.get('photo_text')) < strokeMinLum(outputs.get('photo_3d_soft')), 'photo_text must deepen ink strokes vs photo_3d_soft');
assert(strokeMinLum(outputs.get('pixel_line')) < strokeMinLum(outputs.get('photo_3d_soft')), 'pixel_line must deepen ink strokes vs photo_3d_soft');
console.log('✓ All 8 Image Tracer enhancement presets verified as visually & mathematically distinct');

// 11. 1-Click CorelDRAW Nesting Integration (sheets, plate dims, selected body/hole colors, VBA & PS1 syntax)
const corelSheets = [{
  index: 1,
  name: 'Levha 1',
  materialGroup: 'Altın Ayna · 2 mm',
  widthMm: 3000,
  heightMm: 1500,
  marginLeftMm: 15,
  marginRightMm: 15,
  marginTopMm: 15,
  marginBottomMm: 15,
  placements: [{
    id: 'O1',
    label: 'O (Gövde)',
    angleDeg: 0,
    bounds: { minX: 20, minY: 20, maxX: 220, maxY: 220, width: 200, height: 200 },
    outer: [{ x: 20, y: 20 }, { x: 220, y: 20 }, { x: 220, y: 220 }, { x: 20, y: 220 }],
    holes: [[{ x: 70, y: 70 }, { x: 70, y: 170 }, { x: 170, y: 170 }, { x: 170, y: 70 }]],
  }],
}];
const corelColors = { body: '#e11d48', holes: '#0ea5e9' };
const corelPayload = buildCorelNestingPayload(corelSheets, corelColors, 'DenemeTabela');
assert.deepEqual(corelPayload.colors.bodyRgb, [225, 29, 72]);
assert.deepEqual(corelPayload.colors.holesRgb, [14, 165, 233]);
assert.equal(corelPayload.sheets[0].widthMm, 3000);
assert.equal(corelPayload.sheets[0].heightMm, 1500);

const corelSvg = generateCorelColoredSvg(corelSheets, corelColors, 'DenemeTabela');
assert(corelSvg.includes('width="3000.000mm" height="1500.000mm"'));
assert(corelSvg.includes('id="PLAKA_EBATI_1"'));
assert(corelSvg.includes('fill="none"') && !corelSvg.includes('fill="#e11d48"') && !corelSvg.includes('fill="#0ea5e9"'));
assert(corelSvg.includes('stroke="#e11d48"') && corelSvg.includes('stroke="#0ea5e9"'));

const corelBas = generateCorelVbaMacro(corelPayload);
assert(corelBas.includes('Sub KutuHarf_Nesting_Aktar()'));
assert(corelBas.includes('doc.Unit = cdrMillimeter'));
assert(corelBas.includes('p.SetSize 3000.000, 1500.000'));
assert(corelBas.includes('sh.Fill.ApplyNoFill') && !corelBas.includes('ApplyUniformFill'));
assert(corelBas.includes('sh.Outline.Color.RGBAssign 225, 29, 72') && corelBas.includes('sh.Outline.Color.RGBAssign 14, 165, 233'));

const launcherBat = generateCorelBridgeLauncherBat();
assert(launcherBat.includes('PS1_B64_START###') && launcherBat.includes('PS1_B64_END###'));
assert(launcherBat.includes('INSTALLER_B64_START###') && launcherBat.includes('INSTALLER_B64_END###'));
const b64Block = launcherBat.match(/::###PS1_B64_START###\r?\n([\s\S]*?)\r?\n::###PS1_B64_END###/)[1].replace(/^::/gm, '').replace(/\s+/g, '');
const decodedPs1 = Buffer.from(b64Block, 'base64').toString('utf8');
assert.equal(decodedPs1, getCorelBridgePs1Script());
assert(decodedPs1.includes('127.0.0.1:$($port)/') && decodedPs1.includes('Access-Control-Allow-Private-Network'));
assert(decodedPs1.includes('CorelDRAW.Application') && decodedPs1.includes('ApplyNoFill()') && !decodedPs1.includes('ApplyUniformFill') && decodedPs1.includes('Outline.Color.RGBAssign'));
assert(decodedPs1.includes('Mutex') && decodedPs1.includes('NotifyIcon') && decodedPs1.includes('/api/pull-from-corel') && decodedPs1.includes('/api/import-latest') && decodedPs1.includes('FILE_CERCEVE'));
assert(decodedPs1.includes('/api/copy-vector-clipboard') && decodedPs1.includes('Set-VectorClipboard') && decodedPs1.includes('SetFileDropList') && decodedPs1.includes('image/svg+xml') && decodedPs1.includes('ApartmentState'));
assert(!mainJs.includes('navigator.clipboard.writeText(svg)') && mainJs.includes('copySvgVectorToClipboard(svg)'));

// Verify copySvgVectorToClipboard writes ONLY vector image/svg+xml (never text/plain XML) when browser ClipboardItem is used
const origClip = globalThis.navigator?.clipboard;
const origClipItem = globalThis.ClipboardItem;
let capturedMimeKeys = [];
try {
  globalThis.ClipboardItem = class MockClipboardItem {
    constructor(items) { capturedMimeKeys = Object.keys(items); }
  };
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { write: async () => {} },
  });
  const clipRes = await copySvgVectorToClipboard('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(clipRes.ok, true);
  assert.deepEqual(capturedMimeKeys, ['image/svg+xml']);
} finally {
  if (origClipItem === undefined) delete globalThis.ClipboardItem; else globalThis.ClipboardItem = origClipItem;
  if (origClip !== undefined) Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: origClip });
}

const instB64Block = launcherBat.match(/::###INSTALLER_B64_START###\r?\n([\s\S]*?)\r?\n::###INSTALLER_B64_END###/)[1].replace(/^::/gm, '').replace(/\s+/g, '');
const decodedInstallerPs1 = Buffer.from(instB64Block, 'base64').toString('utf8');
assert.equal(decodedInstallerPs1, getCorelInstallerPs1Script());
assert(decodedInstallerPs1.includes('CurrentVersion\\Run') && decodedInstallerPs1.includes('Classes\\kutuharf') && decodedInstallerPs1.includes('start_silent.vbs') && decodedInstallerPs1.includes('coreldrw.addon') && decodedInstallerPs1.includes('AppUI.xslt') && decodedInstallerPs1.includes('uninstall.bat'));
assert(getCorelPluginBasScript().includes('KutuHarf_Son_Nestingi_Getir') && getCorelAddonXslt().includes('xsl:stylesheet'));
assert(rootHtml.includes('id="btnCorelPullSelection"'));

// Verify zero PowerShell syntax errors in both embedded CorelDRAW scripts
if (process.platform === 'win32') {
  for (const psCode of [decodedPs1, decodedInstallerPs1]) {
    const psCheck = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "$code=[Console]::In.ReadToEnd(); $errs=$null; [void][System.Management.Automation.Language.Parser]::ParseInput($code,[ref]$null,[ref]$errs); if($errs.Count -gt 0){$errs | ForEach-Object {Write-Error $_.Message}; exit 1}",
    ], { input: psCode, encoding: 'utf8' });
    assert.equal(typeof psCheck, 'string');
  }
}

const cwsState = createDefaultState();
const emptyNestHtml = renderNestingCenter(cwsState, { activeSheetIdx: 0 });
const sendCorelIdx = emptyNestHtml.indexOf('id="cwsSendCorel"');
const runNestIdx = emptyNestHtml.indexOf('id="cwsRunNesting"');
assert(sendCorelIdx > 0 && runNestIdx > sendCorelIdx, 'cwsSendCorel must appear directly before cwsRunNesting');
const sendCorelBtn = emptyNestHtml.slice(sendCorelIdx - 25, emptyNestHtml.indexOf('</button>', sendCorelIdx) + 9);
assert(sendCorelBtn.includes("Corel'e Aktar") && !/\bdisabled\b/.test(sendCorelBtn), 'cwsSendCorel must remain visible and enabled left of Otomatik Yerleştir');
assert(mainJs.indexOf("root.querySelector('#cwsSendCorel')") < mainJs.indexOf('nestingEventsBound'), 'cwsSendCorel must re-bind on every redraw outside nestingEventsBound');
cwsState.nesting.sheets = corelSheets;
const cwsHtml = renderNestingCenter(cwsState, { activeSheetIdx: 0 });
assert(cwsHtml.includes('id="cwsSendCorel"') && cwsHtml.includes('id="cwsExpCorel"') && cwsHtml.includes('id="cwsCorelSetup"'));
assert(cwsHtml.includes('class="cws-nesting-topbar"') && cwsHtml.includes('class="cws-nesting-actions"'));
const studioCss = fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url), 'utf8');
assert(studioCss.includes('.cws-nesting-actions .cta-btn{width:auto'), 'Otomatik Yerleştir button must not expand to 100% width inside topbar');
assert(rootHtml.includes('id="corelBridgeModal"'));
console.log('✓ CorelDRAW 1-click live COM bridge, colored SVG, VBA macro, and UI controls verified');

// 12. Photomontage fixes: full-sign framing, 2-pass halo compositing, cross-tab & Katmanlar visibility, top-right confirm + exit -> Image Tracer
const signEngineSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
assert(signEngineSrc.includes('mesh.userData.isHalo=true') && signEngineSrc.includes('opts.fitToSign'));
assert(signEngineSrc.includes('!child.userData?.layerId&&!child.userData?.isHalo'));
assert(signEngineSrc.includes('mat.blending = THREE.NormalBlending'));
assert(signEngineSrc.includes("haloMode === 'only'") && signEngineSrc.includes("haloMode === 'exclude'"));

const perspFitterSrc = fs.readFileSync(new URL('../src/photomontage/PerspectiveFitter.js', import.meta.url), 'utf8');
assert(perspFitterSrc.includes('haloCanvas = null') && perspFitterSrc.includes('if (hData)'));

const pmOverlaySrc = fs.readFileSync(new URL('../src/ui/PhotomontageOverlay.js', import.meta.url), 'utf8');
assert(pmOverlaySrc.includes('id="pmConfirmBtn"') && pmOverlaySrc.includes("e.key !== 'Enter'"));
assert(pmOverlaySrc.includes('id="pmHaloImg"') && pmOverlaySrc.includes('mix-blend-mode:screen'));
assert(pmOverlaySrc.includes('id="pmCloseBtn"') && pmOverlaySrc.includes('onClose'));
assert(pmOverlaySrc.includes('id="pmSendTracerBtn"') && pmOverlaySrc.includes('buildCompositeDataUrl'));
assert(pmOverlaySrc.includes("window.addEventListener('keydown', onKey, true)"));
assert(pmOverlaySrc.indexOf('class="pm-frame"') < pmOverlaySrc.indexOf('id="pmConfirmBtn"'), '#pmConfirmBtn must sit inside .pm-frame top-right');
assert(pmOverlaySrc.includes('id="pmEditPerspBtn"') && pmOverlaySrc.includes("signImg.addEventListener('load', updateTransform)"));

assert(traceStudioHtml.includes('SIGNAGE_STUDIO_LOAD_IMAGE') && traceStudioHtml.includes('loadImageFromDataUrl') && traceStudioHtml.includes('TRACE_STUDIO_READY'));
assert(mainJs.includes('sendPhotomontageToTracer') && mainJs.includes('SIGNAGE_STUDIO_LOAD_IMAGE') && mainJs.includes('TRACE_STUDIO_READY'));
assert(mainJs.includes('lastPhotomontageHaloUrl') && mainJs.includes('s.photomontage.visible = false'));
assert(mainJs.includes('fitToSign: true') && mainJs.includes('data-pm-layer="true"'));
assert(!mainJs.includes("state.activeWorkspace==='background'&&state.photomontage.photoUrl"));
console.log('✓ Photomontage 2-pass halo composite, top-right Confirm + Exit (Esc) & Image Tracer handoff verified');

// 13. 1-Click CNC / Laser / Plasma / Waterjet / Plotter Direct Upload Bridge across all 42 profiles
for (const profile of MACHINE_PROFILES) {
  const conn = getDefaultMachineConnection(profile);
  assert(['folder', 'lightburn', 'webserial', 'ftp'].includes(conn.transport), `Unexpected default transport for ${profile.id}: ${conn.transport}`);
  if (profile.id.includes('lightburn')) assert.equal(conn.transport, 'lightburn');
  if (profile.id.includes('grbl') || profile.kind === 'plt') assert.equal(conn.transport, 'webserial');
}
for (const pid of ['dxf_cypcut', 'svg_lightburn', 'gcode_syntec', 'gcode_grbl_laser', 'plt_roland']) {
  const up = buildMachineUploadPayload(corelSheets, { profile: pid, kerfMm: 0.2, toolDiameterMm: 3 }, 'Tabela');
  assert(up.valid && up.content.length > 40, `Expected valid machine payload for ${pid}`);
  assert(up.fileName.endsWith(`.${up.profile.ext}`), `Expected matching ext for ${pid}`);
}
const cncBat = generateCncBridgeLauncherBat();
const cncB64 = cncBat.match(/::###PS1_B64_START###\r?\n([\s\S]*?)\r?\n::###PS1_B64_END###/)[1].replace(/^::/gm, '').replace(/\s+/g, '');
const cncPs1 = Buffer.from(cncB64, 'base64').toString('utf8');
assert.equal(cncPs1, getCncBridgePs1Script());
assert(cncPs1.includes('127.0.0.1:$listenPort/') && cncPs1.includes('FtpWebRequest') && cncPs1.includes('UdpClient') && cncPs1.includes('SerialPort'));
if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    "$code=[Console]::In.ReadToEnd(); $errs=$null; [void][System.Management.Automation.Language.Parser]::ParseInput($code,[ref]$null,[ref]$errs); if($errs.Count -gt 0){$errs | ForEach-Object {Write-Error $_.Message}; exit 1}",
  ], { input: cncPs1, encoding: 'utf8' });
}
const cncHtml = renderCncCenter(cwsState);
assert(cncHtml.includes('id="cncBtnSendMachine"') && cncHtml.includes('id="cncBtnMachineConfig"'));
assert(cwsHtml.includes('id="nestCncSendMachine"') && cwsHtml.includes('id="nestCncMachineConfig"'));
assert(!cwsHtml.includes('(1 Tık)') && !cncHtml.includes('Tek Tıkla'));
assert(rootHtml.includes('id="cncMachineModal"'));
console.log(`✓ 1-Click CNC machine bridge verified for all ${MACHINE_PROFILES.length} profiles (Browser USB/Folder + PowerShell COM/FTP/TCP/UDP)`);

// 14. Fileli 3-color grouped nesting on separate sheet tabs & configurable Pleksi overlap (+3 mm default)
const sqOuter = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const sqInner = [{ x: 15, y: 15 }, { x: 15, y: 85 }, { x: 85, y: 85 }, { x: 85, y: 15 }];
const fileliMetric = [{
  objectId: 'o1',
  label: 'A',
  constructionType: 'fileli',
  depthMm: 80,
  polygonsMm: [{ outer: sqOuter, holes: [] }],
  exportContours: {
    file: [{ outer: sqOuter, holes: [sqInner] }],
    acrylic: [{ outer: sqInner, holes: [] }],
    backing: [{ outer: sqOuter, holes: [] }],
  },
}];
const fState = createDefaultState();
assert.equal(fState.fileli.acrylicOverlapMm, 3, 'Default Fileli acrylic overlap must be 3 mm');
assert.equal(fState.fileli.dekotaInsetMm, 2, 'Default Fileli dekota inset must be 2 mm');
assert.equal(fState.fileli.dekotaThicknessMm, 5, 'Default Fileli dekota thickness must be 5 mm');
const fileliItems = extractNestingItems(fileliMetric, fState);
assert.equal(fileliItems.length, 3);
assert.deepEqual(fileliItems.map(i => i.partGroup), ['file_frame', 'fileli_acrylic', 'fileli_dekota']);
assert.equal(new Set(fileliItems.map(i => i.materialGroup)).size, 3, 'Each of the 3 Fileli groups must receive its own dedicated sheet group');
assert.equal(new Set(fileliItems.map(i => i.partColor)).size, 3, 'Each fileli group must carry a distinct color');
assert.equal(fileliItems[0].holes.length, 1, 'File Çerçeve must emit hollow frame contours');

// Verify Pleksi cutting contour expands outward by acrylicOverlapMm per side (default +3 mm -> 76x76 mm)
const acBounds3 = polygonBounds(fileliItems[1].outer);
assert(Math.abs(acBounds3.width - 76) < 0.15 && Math.abs(acBounds3.height - 76) < 0.15,
  `Expected 76x76 mm Pleksi (+3 mm per side over 70x70 mm file inner hole), got ${acBounds3.width.toFixed(2)}x${acBounds3.height.toFixed(2)}`);

// Verify Arka Dekota shrinks inward by dekotaInsetMm per side (default -2 mm -> 96x96 mm)
const dekBounds2 = polygonBounds(fileliItems[2].outer);
assert(Math.abs(dekBounds2.width - 96) < 0.15 && Math.abs(dekBounds2.height - 96) < 0.15,
  `Expected 96x96 mm Arka Dekota (-2 mm per side from 100x100 mm), got ${dekBounds2.width.toFixed(2)}x${dekBounds2.height.toFixed(2)}`);

// Verify customer-adjustable overlap (5 mm -> 80x80 mm) & dekota inset (5 mm -> 90x90 mm, 0 mm -> 100x100 mm)
const customOverlapState = createDefaultState();
customOverlapState.fileli.acrylicOverlapMm = 5;
customOverlapState.fileli.dekotaInsetMm = 5;
const customItems = extractNestingItems(fileliMetric, customOverlapState);
const acBounds5 = polygonBounds(customItems[1].outer);
const dekBounds5 = polygonBounds(customItems[2].outer);
assert(Math.abs(acBounds5.width - 80) < 0.15 && Math.abs(acBounds5.height - 80) < 0.15,
  `Expected 80x80 mm Pleksi (+5 mm per side), got ${acBounds5.width.toFixed(2)}x${acBounds5.height.toFixed(2)}`);
assert(Math.abs(dekBounds5.width - 90) < 0.15 && Math.abs(dekBounds5.height - 90) < 0.15,
  `Expected 90x90 mm Arka Dekota (-5 mm per side), got ${dekBounds5.width.toFixed(2)}x${dekBounds5.height.toFixed(2)}`);
customOverlapState.fileli.dekotaInsetMm = 0;
const dekZero = polygonBounds(extractNestingItems(fileliMetric, customOverlapState)[2].outer);
assert(Math.abs(dekZero.width - 100) < 0.15, `Expected 100x100 mm Arka Dekota at 0 mm inset, got ${dekZero.width.toFixed(2)}`);

// Verify separate sheet tabs created by runTrueShapeNesting (File, Pleksi, Dekota) & left File Malzeme Ayarları tab
const splitNested = runTrueShapeNesting(fileliItems, fState.nesting);
assert.equal(splitNested.sheets.length, 3, 'Fileli must produce 3 separate sheet tabs (File Çerçeve, Pleksi, Arka Dekota)');
assert.deepEqual(splitNested.sheets.map(s => s.placements[0].partGroup), ['file_frame', 'fileli_acrylic', 'fileli_dekota']);
fState.nesting.sheets = splitNested.sheets;
const splitUiHtml = renderNestingCenter(fState, { activeSheetIdx: 1, leftTab: 'parts' });
assert(splitUiHtml.includes('data-cws-left-tab="parts"') && splitUiHtml.includes('data-cws-left-tab="fileli"'), 'Left sidebar must have Parçalar and File Malzeme Ayarları tabs');
assert(splitUiHtml.includes('File Malzeme Ayarları'));
assert(splitUiHtml.includes('sheet-tab-dot'), 'Separate sheet tabs must display group color indicators');
assert(splitUiHtml.includes('class="sheet-tab-close"') && splitUiHtml.includes('data-cws-sheet-close="0"') && splitUiHtml.includes('data-cws-sheet-close="1"') && splitUiHtml.includes('data-cws-sheet-close="2"'), 'Each sheet tab must render top-left close (x) button');
assert(mainJs.includes('data-cws-sheet-close'));
assert(splitUiHtml.includes('File Çerçeve') && splitUiHtml.includes('Pleksi') && splitUiHtml.includes('Arka Dekota'));

const fileliTabHtml = renderNestingCenter(fState, { activeSheetIdx: 1, leftTab: 'fileli' });
assert(fileliTabHtml.includes('id="cwsFileliSettingsPanel"') && fileliTabHtml.includes('id="cwsFileliAcrylicOverlap"')
  && fileliTabHtml.includes('id="cwsFileliDekotaInset"') && fileliTabHtml.includes('id="cwsFileliDekotaThick"')
  && fileliTabHtml.includes('id="cwsFileliWidth"') && fileliTabHtml.includes('id="cwsFileliApplyRepack"'),
  'Left File Malzeme Ayarları tab must render all File/Pleksi/Dekota controls');

// Verify real buildChannelComponent emits larger acrylicCut, inset backingCut (outer shrunk & hole expanded), & respects sidewall clamp
const sqShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(100, 0), new THREE.Vector2(100, 100), new THREE.Vector2(0, 100)]);
const builtSq3 = buildChannelComponent([sqShape], { constructionType: 'fileli', depthMm: 80, fileWidthMm: 8, metalThicknessMm: 1, acrylicOverlapMm: 3, dekotaInsetMm: 2 });
const cutB3 = polygonBounds(builtSq3.exportContours.acrylicCut[0].outer);
const visB3 = polygonBounds(builtSq3.exportContours.acrylic[0].outer);
const backB3 = polygonBounds(builtSq3.exportContours.backingCut[0].outer);
assert(Math.abs(visB3.width - 84) < 0.15 && Math.abs(cutB3.width - 90) < 0.15,
  `File inner opening 84 mm + 3 mm overlap/side must yield 90 mm acrylicCut (got ${cutB3.width.toFixed(2)} mm)`);
assert(Math.abs(backB3.width - 96) < 0.15 && Math.abs(backB3.height - 96) < 0.15,
  `Expected 96x96 mm backingCut with 2 mm dekotaInsetMm (got ${backB3.width.toFixed(2)})`);
assert(builtSq3.metrics.acrylicAreaMm2 + builtSq3.metrics.fileAreaMm2 <= builtSq3.metrics.outerAreaMm2 * 1.025);

const holedSq = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(100, 0), new THREE.Vector2(100, 100), new THREE.Vector2(0, 100)]);
holedSq.holes.push(new THREE.Path([new THREE.Vector2(30, 30), new THREE.Vector2(30, 70), new THREE.Vector2(70, 70), new THREE.Vector2(70, 30)]));
const builtHoleDek = buildChannelComponent([holedSq], { constructionType: 'fileli', depthMm: 80, fileWidthMm: 8, metalThicknessMm: 1, dekotaInsetMm: 2 });
const dekOuterHole = polygonBounds(builtHoleDek.exportContours.backingCut[0].outer);
const dekInnerHole = polygonBounds(builtHoleDek.exportContours.backingCut[0].holes[0]);
assert(Math.abs(dekOuterHole.width - 96) < 0.15, 'Holed glyph Dekota outer must shrink by 2 mm/side to 96 mm');
assert(Math.abs(dekInnerHole.width - 44) < 0.15, `Holed glyph Dekota inner hole must expand by 2 mm/side to 44 mm (got ${dekInnerHole.width.toFixed(2)})`);

const builtSqClamped = buildChannelComponent([sqShape], { constructionType: 'fileli', depthMm: 80, fileWidthMm: 4, metalThicknessMm: 1, acrylicOverlapMm: 10 });
const cutBClamp = polygonBounds(builtSqClamped.exportContours.acrylicCut[0].outer);
assert(cutBClamp.width <= 98.15, `Excessive overlap must clamp inside 1 mm metal sidewall (<= 98 mm, got ${cutBClamp.width.toFixed(2)})`);

const metalOnlyItems = extractNestingItems([{ ...fileliMetric[0], constructionType: 'metal' }], fState);
assert.equal(metalOnlyItems.length, 1);
assert.equal(metalOnlyItems[0].partGroup, 'body', 'Acrylic/Dekota split rule applies ONLY to fileli construction');
const pleksiOnlyItems = extractNestingItems([{ ...fileliMetric[0], constructionType: 'pleksi' }], fState);
assert.equal(pleksiOnlyItems.length, 1);

const grpSheet = {
  index: 1, name: 'Levha 1', materialGroup: fileliItems[0].materialGroup, widthMm: 1000, heightMm: 1000,
  placements: fileliItems.map((it, idx) => ({
    ...it, xMm: idx * 120, yMm: 10, angleDeg: 0,
    outer: it.outer.map(p => ({ x: p.x + idx * 120, y: p.y + 10 })),
    holes: it.holes.map(h => h.map(p => ({ x: p.x + idx * 120, y: p.y + 10 }))),
    bounds: { minX: idx * 120, minY: 10, maxX: idx * 120 + 100, maxY: 110, width: 100, height: 100 },
  })),
};
fState.nesting.sheets = [grpSheet];
const grpUiHtml = renderNestingCenter(fState, { activeSheetIdx: 0, activePartGroup: 'fileli_acrylic' });
for (const gid of Object.keys(FILELI_NESTING_GROUPS)) {
  assert(grpUiHtml.includes(`data-nest-group="${gid}"`), `Expected left-panel group box for ${gid}`);
}
assert(grpUiHtml.includes('data-nest-group-select') && grpUiHtml.includes('data-nest-group-focus') && grpUiHtml.includes('data-nest-group-color'));
const grpSvg = renderNestingSvg(grpSheet, null, fState.nesting.previewColors, 'mm', { activeGroup: 'fileli_acrylic' });
assert(grpSvg.includes('nest-group-dimmed'), 'Non-active color groups must be visually isolated on SVG');
assert(grpSvg.includes('fill="none"') && !grpSvg.includes('fill-opacity'), 'Nesting SVG must use stroke-only outlines with zero interior fills');
assert(mainJs.includes('async function repackNestingSettings(label,updateNesting,quickImport=false)'));
console.log('✓ Fileli 3-color separate sheet tabs, +3 mm adjustable Pleksi overlap, non-fileli exclusion & group controls verified');

// 15. Cinzel 'Z' & universal node auto-healing, vivid Fileli/Pleksi glow, return sidewall costing & Kenar Çıtaları nesting button
const loadFontFile = p => {
  const b = fs.readFileSync(new URL(p, import.meta.url));
  return parseFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const cinzelFonts = [
  loadFontFile('../public/fonts/cinzel-latin-700-normal-C-gK7hA8.woff'),
  loadFontFile('../public/fonts/cinzel-latin-ext-700-normal-CORa-yIv.woff'),
];
const markanizLay = layoutTextMm(cinzelFonts, 'MARKANIZ', 400);
for (const fw of [5, 8]) {
  const zGlyph = markanizLay.glyphs.find(g => g.char === 'Z');
  const zBuilt = buildChannelComponent(zGlyph.shapes, { constructionType: 'fileli', depthMm: 80, fileWidthMm: fw, metalThicknessMm: 1 });
  assert.equal(zBuilt.warnings.length, 0, `Cinzel Z at fw=${fw} must have zero warnings`);
  assert(zBuilt.fileGeos.length >= 1 && zBuilt.acrylicGeos.length >= 1);
  const fPos = zBuilt.fileGeos[0].attributes.position;
  const fNorm = zBuilt.fileGeos[0].attributes.normal;
  let actualFileArea = 0;
  for (let i = 0; i < fPos.count; i += 3) {
    if (fNorm.getZ(i) > 0.9) {
      const ax = fPos.getX(i) * 1000, ay = fPos.getY(i) * 1000;
      const bx = fPos.getX(i + 1) * 1000, by = fPos.getY(i + 1) * 1000;
      const cx = fPos.getX(i + 2) * 1000, cy = fPos.getY(i + 2) * 1000;
      actualFileArea += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5;
    }
  }
  const relErr = Math.abs(actualFileArea - zBuilt.metrics.fileAreaMm2) / Math.max(1, zBuilt.metrics.fileAreaMm2);
  assert(relErr < 0.03, `Cinzel Z fw=${fw} file mesh front area (${actualFileArea.toFixed(0)}) must match ring area (${zBuilt.metrics.fileAreaMm2.toFixed(0)}), relErr=${relErr.toFixed(4)}`);
  for (const pt of zBuilt.exportContours.acrylic[0].outer) {
    assert(pointInPolygon(pt, zBuilt.polygonsMm[0].outer), `Acrylic vertex must stay inside outer contour for Z at fw=${fw}`);
  }
  for (const g of [...zBuilt.outerGeos, ...zBuilt.fileGeos, ...zBuilt.acrylicGeos]) g.dispose();
}

// Node audit & spike immunity across Cinzel Z, MARKANIZ, and Playfair Display D/Q
const checkMinInteriorAngleDeg = (pts) => {
  let minDeg = 180;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const dot = Math.max(-1, Math.min(1, ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2)));
    const deg = Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI;
    if (deg < minDeg) minDeg = deg;
  }
  return minDeg;
};
const zGlyphAudit = markanizLay.glyphs.find(g => g.char === 'Z');
const zBaseBuilt = buildChannelComponent(zGlyphAudit.shapes, { constructionType: 'fileli', depthMm: 80, fileWidthMm: 5 });
const zOuterRing = zBaseBuilt.polygonsMm[0].outer;
for (const fw of [4, 5, 6, 8]) {
  const off = offsetRing(zOuterRing, -fw);
  assert(off.ok && !hasSelfIntersection(off.points), `offsetRing(Z, -${fw}) must be ok with zero self-intersection`);
  for (const pt of off.points) {
    assert(pointInPolygon(pt, zOuterRing), `offsetRing(Z, -${fw}) vertex (${pt.x.toFixed(2)},${pt.y.toFixed(2)}) escaped outer boundary`);
  }
}
const playfairFonts = [
  loadFontFile('../public/fonts/playfair-display-latin-800-normal-D0Xz4t1K.woff'),
  loadFontFile('../public/fonts/playfair-display-latin-ext-800-normal-DD7uHqs8.woff'),
];
const auditGlyphSets = [
  ...markanizLay.glyphs.map(g => ({ tag: `Cinzel:${g.char}`, glyph: g })),
  ...layoutTextMm(playfairFonts, 'DQZ', 400).glyphs.map(g => ({ tag: `Playfair:${g.char}`, glyph: g })),
];
for (const { tag, glyph } of auditGlyphSets) {
  for (const fw of [4, 5, 8]) {
    if (tag.startsWith('Playfair:') && fw !== 5) continue;
    const built = buildChannelComponent(glyph.shapes, { constructionType: 'fileli', depthMm: 80, fileWidthMm: fw, metalThicknessMm: 1 });
    for (const r of [...built.exportContours.file, ...built.exportContours.acrylicCut, ...built.exportContours.backingCut]) {
      assert(!hasSelfIntersection(r.outer), `${tag} fw=${fw} outer self-intersection detected`);
      assert(checkMinInteriorAngleDeg(r.outer) >= 16, `${tag} fw=${fw} outer needle spike detected`);
      for (const h of r.holes || []) {
        assert(!hasSelfIntersection(h), `${tag} fw=${fw} hole self-intersection detected`);
        assert(checkMinInteriorAngleDeg(h) >= 16, `${tag} fw=${fw} hole needle spike (<16 deg) detected`);
      }
    }
    for (const g of [...built.outerGeos, ...built.fileGeos, ...built.acrylicGeos]) g.dispose();
  }
}
// Synthetic hairpin node repair + clean square preservation
const spikePoly = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 140, y: 101 }, { x: 99, y: 100 }, { x: 0, y: 100 }];
const repairedSpike = auditAndRepairContourNodes(spikePoly, { ccw: true });
assert(checkMinInteriorAngleDeg(repairedSpike) >= 16 && polygonBounds(repairedSpike).maxX <= 100.5, 'Synthetic hairpin spike must be cleanly auto-healed');
const cleanSq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
assert.equal(auditAndRepairContourNodes(cleanSq, { ccw: true }).length, 4, 'Clean orthogonal 100x100 square must stay untouched');
assert(generateCorelColoredSvg(corelSheets).includes('stroke-linejoin="round"'));
assert(getCorelBridgePs1Script().includes('Outline.LineJoin = 1'));

// Synthetic open-gap / duplicate-node / self-intersecting bowtie polygon auto-healing
const dirtyOpenPoly = [
  { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 100 }, { x: 40, y: 100 }, { x: 60, y: 60 }, { x: 0, y: 100 },
];
const healedDirty = healPolygonWithHoles(dirtyOpenPoly, []);
assert(healedDirty.outer.length >= 3 && !hasSelfIntersection(healedDirty.outer), 'Dirty/bowtie contours must auto-heal cleanly');

// Fileli/Pleksi glow & bloom calibration
const postSrc = fs.readFileSync(new URL('../src/render/PostProcessor.js', import.meta.url), 'utf8');
assert(postSrc.includes('this.bloomThreshold = lit ?'), 'PostProcessor must lower HDR bloom threshold when signage is lit');
assert(signEngineSrc.includes('frontGlows') && signEngineSrc.includes('isFrontGlow') && signEngineSrc.includes("addGlowPlane(depthM * 0.45, 'side'"), 'SignEngine must render face + acrylic sidewall glow planes');

// Costing: return sidewalls (kenar dönüşleri) included for metal, fileli & pleksi
assert.equal(COST_ROLE_LABELS.side, 'Kenar Dönüşü (Yanak)');
const aGlyph = markanizLay.glyphs.find(g => g.char === 'A');
const aBuilt = buildChannelComponent(aGlyph.shapes, { constructionType: 'fileli', depthMm: 80, fileWidthMm: 5, metalThicknessMm: 1 });
assert(aBuilt.exportContours.sidewallStrips.some(s => s.kind === 'outer') && aBuilt.exportContours.sidewallStrips.some(s => s.kind === 'hole'), 'Both outer and hole return strips must be emitted');
for (const g of [...aBuilt.outerGeos, ...aBuilt.fileGeos, ...aBuilt.acrylicGeos]) g.dispose();

const pleksiCostState = createDefaultState();
pleksiCostState.objects[0].constructionType = 'pleksi';
pleksiCostState.objects[0].acrylicMaterial = 'opalPleksi';
const pleksiCosts = calculateProjectCosts({
  componentCount: 1, totalWidthMm: 400, totalHeightMm: 400,
  outerAreaM2: 0.1, metalFaceAreaM2: 0, sideAreaM2: 0.12, sidewallAreaM2: 0.12, acrylicAreaM2: 0.1, fileAreaM2: 0,
  perimeterM: 1.5, cuttingLengthM: 1.5, totalLedModules: 8, powerSupplies: 1,
  components: [{ objectId: pleksiCostState.objects[0].id, label: 'A', constructionType: 'pleksi', outerAreaCm2: 1000, acrylicAreaCm2: 1000, fileAreaCm2: 0, sidewallAreaCm2: 1200, perimeterMm: 1500, cuttingLengthMm: 1500, ledCount: 8 }],
}, pleksiCostState);
assert(pleksiCosts.lines.some(l => l.key === 'side:opalPleksi' && l.costAmount > 0), 'Pleksi return sidewall cost must be billed');

// Dedicated 'Kenar Çıtaları' button & sidewall strip nesting mode
const stripState = createDefaultState();
stripState.nesting.sheetWidthMm = 1000;
stripState.nesting.sheetHeightMm = 600;
stripState.nesting.targetPart = 'sidewalls';
const longMetric = [{
  objectId: 'o1', label: 'A', constructionType: 'fileli', depthMm: 80,
  polygonsMm: aBuilt.polygonsMm, exportContours: aBuilt.exportContours,
}];
const stripItems = extractNestingItems(longMetric, stripState);
assert(stripItems.length >= 2 && stripItems.every(it => it.partGroup === SIDEWALL_STRIP_GROUP.id), 'Sidewall strip mode must emit ONLY rectangular sidewall_strip parts');
assert(stripItems.every(it => Math.max(...it.outer.map(p => p.x)) <= 970), 'Strips longer than sheet usable span must split cleanly to avoid unplaced overflows');
const stripUiHtml = renderNestingCenter(stripState, { activeSheetIdx: 0 });
assert(stripUiHtml.includes('id="cwsSidewallStrips"') && stripUiHtml.includes('cws-sidewall-banner') && stripUiHtml.includes('id="cwsBackToFaces"'));
const stripSheetMacro = generateCorelVbaMacro([{
  index: 1, name: 'Levha 1', materialGroup: 'Kenar Çıtaları · 80 mm', widthMm: 1000, heightMm: 600,
  placements: [{ id: stripItems[0].id, label: stripItems[0].label, partGroup: SIDEWALL_STRIP_GROUP.id, angleDeg: 0, outer: stripItems[0].outer, holes: [] }],
}]);
assert(decodedPs1.includes('KENAR_CITALARI') && stripSheetMacro.includes('KENAR_CITALARI'));
console.log('✓ Cinzel Z & node auto-healing, vivid Fileli/Pleksi lighting glow, return sidewall costing & Kenar Çıtaları nesting verified');

// 16. Nesting CorelDRAW CAD features: Ctrl+A select-all + batch delete, 2-click rotate handles + top rotate bar, alignment & cut/copy/paste/duplicate
const cadState = createDefaultState();
const mkRectPart = (id, x, y, w, h, locked = false) => ({
  id, label: id, partType: 'Gövde', partGroup: 'body', material: 'aynaAltin', thicknessMm: 2,
  angleDeg: 0, areaMm2: w * h, xMm: x, yMm: y, locked, holes: [],
  outer: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
  bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
});
cadState.nesting.sheets = [{
  index: 1, name: 'Levha 1', materialGroup: 'Altın', widthMm: 1000, heightMm: 500,
  marginLeftMm: 10, marginRightMm: 10, marginTopMm: 10, marginBottomMm: 10,
  placements: [mkRectPart('p1', 20, 20, 60, 40), mkRectPart('p2', 120, 80, 80, 40), mkRectPart('p3', 300, 140, 100, 40)],
}];
// Rotate 90 deg around single part
assert.deepEqual(rotateNestingParts(cadState.nesting, 0, ['p1'], 90, 5), ['p1']);
const p1Rot = cadState.nesting.sheets[0].placements[0];
assert(Math.abs(p1Rot.bounds.width - 40) < 1 && Math.abs(p1Rot.bounds.height - 60) < 1, 'Rotated 60x40 part by 90° must become 40x60');
// Grain direction blocks rotation
cadState.nesting.enforceGrainDirection = true;
assert.deepEqual(rotateNestingParts(cadState.nesting, 0, ['p1'], 45, 5), []);
cadState.nesting.enforceGrainDirection = false;
// Alignment: left to last selected ('p3' minX=300), then page center
assert(alignNestingParts(cadState.nesting, 0, ['p1', 'p2', 'p3'], 'left', 5).length >= 2);
assert.equal(Math.round(cadState.nesting.sheets[0].placements[0].bounds.minX), 300);
assert.equal(Math.round(cadState.nesting.sheets[0].placements[1].bounds.minX), 300);
alignNestingParts(cadState.nesting, 0, ['p1'], 'page', 5);
assert.equal(Math.round((p1Rot.bounds.minX + p1Rot.bounds.maxX) * 0.5), 500);
assert.equal(Math.round((p1Rot.bounds.minY + p1Rot.bounds.maxY) * 0.5), 250);
// Clone & paste
const copied = cloneNestingPlacements([p1Rot, cadState.nesting.sheets[0].placements[1]]);
const pastedIds = pasteNestingParts(cadState.nesting, 0, copied, { offsetX: 30, offsetY: 20, minSep: 5 });
assert.equal(pastedIds.length, 2);
assert.equal(cadState.nesting.sheets[0].placements.length, 5);
assert(pastedIds.every(id => id.includes('_copy_')));

// Visual rotate gizmo + floating #nestingRotateBar HTML
const selSvg = renderNestingSvg(cadState.nesting.sheets[0], new Set(['p1']), {}, 'mm', { rotateMode: false });
assert(selSvg.includes('data-gizmo-mode="select"') && !selSvg.includes('data-nest-rotate-handle'));
const rotSvg = renderNestingSvg(cadState.nesting.sheets[0], new Set(['p1']), {}, 'mm', { rotateMode: true });
assert(rotSvg.includes('data-gizmo-mode="rotate"') && rotSvg.includes('data-nest-rotate-handle="top"'));
assert.equal((rotSvg.match(/data-nest-rotate-handle="corner"/g) || []).length, 4);
const rotCenterHtml = renderNestingCenter(cadState, { activeSheetIdx: 0, selectedPlacementId: 'p1', selectedPlacementIds: ['p1'], rotateMode: true });
assert(rotCenterHtml.includes('id="nestingRotateBar"') && rotCenterHtml.includes('id="nestRotAngleInput"') && rotCenterHtml.includes('data-nest-rot-delta="90"'));

// Shortcuts: Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D, Delete, Backspace in Nesting
let keyCb = null;
const origWin = globalThis.window, origDoc = globalThis.document;
const fired = [];
try {
  globalThis.window = { addEventListener: (t, fn) => { if (t === 'keydown') keyCb = fn; }, removeEventListener: () => {} };
  const fakeCb = { tagName: 'INPUT', type: 'checkbox', matches: s => s === '[data-cws-check]' };
  const numInput = { tagName: 'INPUT', type: 'number', matches: () => false };
  globalThis.document = { activeElement: fakeCb };
  const stopKeys = attachShortcuts({
    isNesting: () => true,
    onSelectAll: () => fired.push('selectAll'),
    onCopy: () => fired.push('copy'),
    onCut: () => fired.push('cut'),
    onPaste: () => fired.push('paste'),
    onDuplicate: () => fired.push('duplicate'),
    onDelete: () => fired.push('delete'),
  });
  for (const ev of [
    { key: 'a', ctrlKey: true },
    { key: 'c', ctrlKey: true },
    { key: 'x', ctrlKey: true },
    { key: 'v', ctrlKey: true },
    { key: 'd', ctrlKey: true },
    { key: 'Delete' },
    { key: 'Backspace' },
  ]) {
    keyCb({ ...ev, target: fakeCb, preventDefault() {} });
  }
  assert.deepEqual(fired, ['selectAll', 'copy', 'cut', 'paste', 'duplicate', 'delete', 'delete']);
  globalThis.document.activeElement = numInput;
  keyCb({ key: 'a', ctrlKey: true, target: numInput, preventDefault() {} });
  assert.equal(fired.length, 7, 'Ctrl+A inside numeric input must not steal input selection');
  stopKeys();
} finally {
  if (origWin === undefined) delete globalThis.window; else globalThis.window = origWin;
  if (origDoc === undefined) delete globalThis.document; else globalThis.document = origDoc;
}
assert(mainJs.includes('function selectAllNestingParts()') && mainJs.includes('function duplicateNestingSelection()') && mainJs.includes("['model3d','materials','design2d','nesting'].includes(ws)"));
// Collapsible left Nesting panel + default-collapsed group accordions + single-line rows
const collapsedByDefaultHtml = renderNestingCenter(grpSheetStateSafe(fState), { activeSheetIdx: 0 });
assert(!/<details class="nest-group-box[^"]*"[^>]*\bopen\b/.test(collapsedByDefaultHtml), 'Nesting part/color groups must start collapsed by default');
const onlyOneOpenHtml = renderNestingCenter(grpSheetStateSafe(fState), { activeSheetIdx: 0, openGroups: new Set(['fileli_acrylic']) });
assert((onlyOneOpenHtml.match(/<details class="nest-group-box[^"]*"[^>]*\bopen\b/g) || []).length === 1, 'Only explicitly toggled group should be expanded');
const collapsedSidebarHtml = renderNestingCenter(grpSheetStateSafe(fState), { activeSheetIdx: 0, leftPanelCollapsed: true });
assert(collapsedSidebarHtml.includes('cws-left-collapsed') && collapsedSidebarHtml.includes('id="cwsToggleLeftPanel"'));
assert(studioCss.includes('.nesting-part-row{flex-wrap:nowrap;align-items:center}'));

// Cross-sheet part transfer: Copy & Move between sheet tabs + Transfer bar UI
const xferState = createDefaultState();
const makeSqPart = (id, label, x, y, locked = false) => ({
  id, label, partGroup: 'body', material: 'metal', thicknessMm: 2, materialGroup: 'Metal · 2 mm',
  areaMm2: 2500, xMm: x, yMm: y, angleDeg: 0, locked,
  outer: [{ x, y }, { x: x + 50, y }, { x: x + 50, y: y + 50 }, { x, y: y + 50 }],
  holes: [],
  bounds: { minX: x, minY: y, maxX: x + 50, maxY: y + 50, width: 50, height: 50 },
});
xferState.nesting.sheets = [
  { index: 1, name: 'Levha 1', materialGroup: 'G1', widthMm: 1000, heightMm: 1000, marginMm: 15, usedAreaMm2: 5000, utilizationPct: 0.5, placements: [makeSqPart('pA', 'Harf A', 20, 20, false), makeSqPart('pLock', 'Kilitli B', 90, 20, true)] },
  { index: 2, name: 'Levha 2', materialGroup: 'G2', widthMm: 1000, heightMm: 1000, marginMm: 15, usedAreaMm2: 2500, utilizationPct: 0.25, placements: [makeSqPart('pExist', 'Mevcut', 20, 20, false)] },
];
const copyRes = transferNestingParts(xferState.nesting, 0, 1, ['pLock'], { mode: 'copy', minSep: 5 });
assert.equal(copyRes.ids.length, 1, 'Copy must work even from a locked placement (unlocking the clone)');
assert.equal(xferState.nesting.sheets[0].placements.length, 2, 'Source sheet must retain copied part');
assert.equal(xferState.nesting.sheets[1].placements.length, 2, 'Target sheet must receive cloned part');
assert.equal(xferState.nesting.sheets[1].placements[1].locked, false);
assert(xferState.nesting.sheets[1].placements[1].bounds.minX >= 74.9, 'Copied part must avoid overlapping existing part on target sheet');

const moveRes = transferNestingParts(xferState.nesting, 0, 1, ['pA', 'pLock'], { mode: 'move', minSep: 5 });
assert.deepEqual(moveRes.ids, ['pA'], 'Move must transfer unlocked pA and protect locked pLock');
assert.deepEqual(xferState.nesting.sheets[0].placements.map(p => p.id), ['pLock']);
assert.equal(xferState.nesting.sheets[1].placements.length, 3);

const xferHtml = renderNestingCenter(xferState, { activeSheetIdx: 0, selectedPlacementIds: ['pLock'] });
assert(xferHtml.includes('id="cwsSheetTransferBar"') && xferHtml.includes('id="cwsTransferTargetSheet"')
  && xferHtml.includes('id="cwsMoveToSheetBtn"') && xferHtml.includes('id="cwsCopyToSheetBtn"')
  && xferHtml.includes('draggable="true"') && xferHtml.includes('<option value="1">Levha 2'));
assert(mainJs.includes('function transferNestingParts') === false && mainJs.includes('transferNestingParts'));

// Right panel collapsible & Corel-style floatable/re-dockable sections
assert(xferHtml.includes('id="cwsToggleRightPanel"') && xferHtml.includes('id="cwsResetRightPanels"') && xferHtml.includes('id="cwsNestFloatLayer"'));
for (const pid of ['sheet', 'colors', 'cnc', 'export']) {
  assert(xferHtml.includes(`data-nest-panel="${pid}"`) && xferHtml.includes(`data-nest-panel-toggle="${pid}"`) && xferHtml.includes(`data-nest-panel-float="${pid}"`));
}
const rightCollapsedHtml = renderNestingCenter(xferState, {
  activeSheetIdx: 0,
  rightPanelCollapsed: true,
  rightPanels: { open: new Set(['sheet', 'cnc']), floating: { cnc: { x: 120, y: 80 } } },
});
assert(rightCollapsedHtml.includes('cws-right-collapsed'));
assert(rightCollapsedHtml.includes('data-nest-panel-float="cnc" title="Eski yerine yerleştir">↙'));
assert(mainJs.includes('applyNestingRightPanelLayout') && mainJs.includes('khs_nesting_panels_v1') && mainJs.includes('cws-dock-hover'));
console.log('✓ Nesting CorelDRAW CAD features (Ctrl+A, 2-click rotate gizmo/bar, alignment & cut/copy/paste/duplicate) + collapsible sidebar + cross-sheet transfer + Corel-style right panels verified');

function grpSheetStateSafe(st) { return st; }
