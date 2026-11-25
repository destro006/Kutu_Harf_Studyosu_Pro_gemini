import assert from 'node:assert/strict';
import { MACHINE_PROFILES, MACHINE_PROFILE_CATEGORIES, getMachineProfile, generateNestedGcode, generateNestedHpgl } from '../src/export/CncGcodeExporter.js';
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
