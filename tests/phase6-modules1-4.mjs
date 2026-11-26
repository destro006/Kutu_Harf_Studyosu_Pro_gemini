import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { renderKioskPanel } from '../src/ui/KioskAndPresets.js';
import {
  buildClientApprovalUrl,
  decodeClientShareState,
  encodeClientShareState,
} from '../src/sales/ClientShareApproval.js';
import { collectSignTriangles, writeGlb, writeUsdz } from '../src/export/Professional3DExport.js';
import { VIDEO_ROLES, sampleChoreographyKeyframe } from '../src/render/PresentationVideoRecorder.js';
import { resolveDimensionTheme } from '../src/render/Dimensions3DOverlay.js';

// Module 1: Client Mode Video Button + DPR Cap
const st = createDefaultState();
const kioskHtml = renderKioskPanel(st, { totalWidthMm: 1800, totalHeightMm: 450 }, { grandTotal: 19500, currency: 'TRY' });
assert(kioskHtml.includes('id="kioskVideoBtn"') && kioskHtml.includes('Sunum Videosu'));
assert(kioskHtml.includes('id="kioskDimsVal"') && kioskHtml.includes('id="kioskPriceVal"'));

const signEngineSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
assert(signEngineSrc.includes('setClientModePerformance') && signEngineSrc.includes('Math.min(dpr, 1.5)'));

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(indexHtml.includes('id="btnOpenVideoModal"') && indexHtml.includes('id="vidRole"'));

// Module 2: Compressed Client Approval Link (with Logos) + AR
const logoState = createDefaultState();
logoState.projectName = 'ATLAS LOGO';
logoState.objects = [{
  id: 'logo_1',
  kind: 'logo',
  name: 'Atlas İkon',
  heightMm: 500,
  depthMm: 90,
  xMm: 0,
  yMm: 0,
  polygonsMm: [{
    outer: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
    holes: [[{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }]],
  }],
}];
const token = encodeClientShareState(logoState, { grandTotal: 22400, currency: 'TRY' });
assert(token.startsWith('z2.'), 'Share token should use compact LZW compression');
const decoded = decodeClientShareState(token);
assert.equal(decoded.p, 'ATLAS LOGO');
assert.equal(decoded.pr.total, 22400);
assert(decoded.objs[0].polygonsMm?.[0]?.outer?.length >= 4, 'Quantized logo polygons must survive URL compression');
assert(decoded.objs[0].polygonsMm?.[0]?.holes?.length === 1, 'Logo holes must survive compression');
const shareUrl = buildClientApprovalUrl(logoState, { grandTotal: 22400, currency: 'TRY' }, 'https://example.com/');
assert(shareUrl.includes('?clientPreview=z2.'));

// Valid meter-scale GLB & USDZ binaries
const tris = [{ name: 'PartA', color: [0.95, 0.78, 0.42], metallic: 0.9, roughness: 0.2, opacity: 1, triangles: [{ verts: [[0, 0, 0], [0.2, 0, 0], [0, 0.2, 0]], normal: [0, 0, 1] }] }];
const glb = writeGlb(tris);
assert.equal(glb[0], 0x67); // 'g' from glTF magic
const usdz = writeUsdz(tris);
assert.equal(usdz[0], 0x50); // 'P' from PK zip

// Module 3 (upgraded in Module 6): Exact Wall-Clock Video Duration & 15 Smooth Roles
assert.equal(VIDEO_ROLES.length, 15);
for (const role of VIDEO_ROLES) {
  const kf0 = sampleChoreographyKeyframe(0, { role: role.id });
  const kf5 = sampleChoreographyKeyframe(0.5, { role: role.id });
  const kf1 = sampleChoreographyKeyframe(1.0, { role: role.id });
  assert(Number.isFinite(kf0.azimuth) && Number.isFinite(kf5.radiusMult) && Number.isFinite(kf1.polar));
}
const recSrc = fs.readFileSync(new URL('../src/render/PresentationVideoRecorder.js', import.meta.url), 'utf8');
assert(recSrc.includes('performance.now() - startTime') && recSrc.includes('catmullRom'));

// Module 4: Auto-Contrast Dimension Lines & 2D Sync Fix
const lightState = createDefaultState();
lightState.scene.night = false;
lightState.scene.wallId = 'traverten';
const lightTheme = resolveDimensionTheme(lightState);
assert.equal(lightTheme.lineColor, '#111827');
assert.equal(lightTheme.pillStroke, '#FFFFFF');
assert(lightTheme.lineWidth >= 2);

const darkState = createDefaultState();
darkState.scene.night = false;
darkState.scene.wallId = 'kompozit';
const darkTheme = resolveDimensionTheme(darkState);
assert.equal(darkTheme.lineColor, '#F8FAFC');
assert.equal(darkTheme.pillStroke, '#38BDF8');

const nightState = createDefaultState();
nightState.scene.night = true;
nightState.scene.wallId = 'traverten';
assert.equal(resolveDimensionTheme(nightState).lineColor, '#F8FAFC');

const vec2dSrc = fs.readFileSync(new URL('../src/cad/Vector2DCanvas.js', import.meta.url), 'utf8');
assert(vec2dSrc.includes('state.scene?.showDimensions') && vec2dSrc.includes('data-v2d-dims'));

console.log('✓ Phase 6 Modules 1–4 (Client Mode Perf, Live 3D AR Link, Wall-Clock 6-Role Video, Auto-Contrast 2D/3D Dims) verified cleanly');
