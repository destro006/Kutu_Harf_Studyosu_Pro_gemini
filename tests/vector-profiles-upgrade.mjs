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
assert(mainJs.includes('./public/trace-studio/index.html?v=20261125-v8'));
assert(rootHtml.includes('./src/main.js?v=20261125-v15'));
assert(rootHtml.includes('./src/styles/studio.css?v=20261125-v15'));
assert(mainJs.includes('./ui/CentralWorkspaces.js?v=20261125-v15'));
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
assert(corelSvg.includes('fill="#e11d48"') && corelSvg.includes('fill="#0ea5e9"'));
assert(corelSvg.includes('fill-rule="evenodd"'));

const corelBas = generateCorelVbaMacro(corelPayload);
assert(corelBas.includes('Sub KutuHarf_Nesting_Aktar()'));
assert(corelBas.includes('doc.Unit = cdrMillimeter'));
assert(corelBas.includes('p.SetSize 3000.000, 1500.000'));
assert(corelBas.includes('CreateRGBColor(225, 29, 72)') && corelBas.includes('CreateRGBColor(14, 165, 233)'));

const launcherBat = generateCorelBridgeLauncherBat();
assert(launcherBat.includes('PS1_B64_START###') && launcherBat.includes('PS1_B64_END###'));
const b64Block = launcherBat.match(/::###PS1_B64_START###\r?\n([\s\S]*?)\r?\n::###PS1_B64_END###/)[1].replace(/^::/gm, '').replace(/\s+/g, '');
const decodedPs1 = Buffer.from(b64Block, 'base64').toString('utf8');
assert.equal(decodedPs1, getCorelBridgePs1Script());
assert(decodedPs1.includes('127.0.0.1:$port/') && decodedPs1.includes('Access-Control-Allow-Private-Network'));
assert(decodedPs1.includes('CorelDRAW.Application') && decodedPs1.includes('ApplyUniformFill'));

// Verify zero PowerShell syntax errors in the embedded CorelDRAW COM bridge script
if (process.platform === 'win32') {
  const psCheck = execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    "$code=[Console]::In.ReadToEnd(); $errs=$null; [void][System.Management.Automation.Language.Parser]::ParseInput($code,[ref]$null,[ref]$errs); if($errs.Count -gt 0){$errs | ForEach-Object {Write-Error $_.Message}; exit 1}",
  ], { input: decodedPs1, encoding: 'utf8' });
  assert.equal(typeof psCheck, 'string');
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
assert(rootHtml.includes('id="cncMachineModal"'));
console.log(`✓ 1-Click CNC machine bridge verified for all ${MACHINE_PROFILES.length} profiles (Browser USB/Folder + PowerShell COM/FTP/TCP/UDP)`);
