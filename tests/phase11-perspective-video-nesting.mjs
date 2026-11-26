import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import {
  buildPerspectiveQuadFromAngles,
  snapCornerWithGuides,
  pointInQuadNorm,
} from '../src/photomontage/PerspectiveFitter.js';
import { computeFramedCameraDistance } from '../src/render/PresentationVideoRecorder.js';
import {
  extractNestingItems,
  extractSidewallStripItems,
  runTrueShapeNesting,
  SIDEWALL_STRIP_GROUP,
} from '../src/manufacturing/NestingEngine.js';
import { renderNestingCenter } from '../src/ui/CentralWorkspaces.js';

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const signEngineSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
const pmOverlaySrc = fs.readFileSync(new URL('../src/ui/PhotomontageOverlay.js', import.meta.url), 'utf8');
const videoRecSrc = fs.readFileSync(new URL('../src/render/PresentationVideoRecorder.js', import.meta.url), 'utf8');

// ============================================================================
// AREA 1: Architectural 28 deg FOV & Intuitive Facade Perspective Controls
// ============================================================================
{
  assert(signEngineSrc.includes('opts.architecturalFov') && signEngineSrc.includes('this.camera.fov = prevFov'));
  assert(pmOverlaySrc.includes('architecturalFov: 28'));
  for (const id of ['pmYawRange', 'pmPitchRange', 'pmRollRange', 'pmScaleRange', 'pmPosX', 'pmPosY', 'pmSignW', 'pmSignH']) {
    assert(pmOverlaySrc.includes(`id="${id}"`), `Missing #${id} in PhotomontageOverlay`);
  }
  assert(pmOverlaySrc.includes('pointInQuadNorm') && pmOverlaySrc.includes('snapCornerWithGuides'));

  const quad = buildPerspectiveQuadFromAngles({ yawDeg: 20, pitchDeg: -10, rollDeg: 5, scale: 1.1 });
  assert.equal(quad.length, 4);
  assert(pointInQuadNorm({ x: 0.5, y: 0.45 }, quad), 'Center must fall inside generated quad');

  const snapped = snapCornerWithGuides(
    [{ x: 0.2, y: 0.25 }, { x: 0.8, y: 0.25 }, { x: 0.8, y: 0.65 }, { x: 0.2, y: 0.65 }],
    1,
    { x: 0.805, y: 0.254 },
    0.015
  );
  assert.equal(snapped.point.x, 0.8);
  assert.equal(snapped.point.y, 0.25);
  assert(snapped.guides.length >= 2);
}

// ============================================================================
// AREA 2: Box3 Auto-Centered Video Framing & CapCut UI Redesign
// ============================================================================
{
  // Wide sign ("DAĞDELEN REKLAM" ~ 3.4m x 0.4m) in both 16:9 and 9:16
  const d169 = computeFramedCameraDistance({ x: 3.4, y: 0.4, z: 0.1 }, 32, 16 / 9, 1.22);
  const d916 = computeFramedCameraDistance({ x: 3.4, y: 0.4, z: 0.1 }, 32, 9 / 16, 1.22);
  assert(d916 > d169 * 2.5, `Portrait 9:16 must pull camera much further back for wide signs (got ${d916.toFixed(2)}m vs ${d169.toFixed(2)}m)`);
  const vFov = (32 * Math.PI) / 180;
  const hFov916 = 2 * Math.atan(Math.tan(vFov * 0.5) * (9 / 16));
  const visibleW916 = 2 * d916 * Math.tan(hFov916 * 0.5);
  assert(visibleW916 >= 3.4 * 1.20, `Expected >=20% safe margin horizontally in 9:16, got visible width ${visibleW916.toFixed(2)}m`);

  assert(videoRecSrc.includes('computeSignGroupBox') && videoRecSrc.includes('THREE.Box3'));
  for (const id of ['vidAspectRatio', 'vidLibTabs', 'vidTransitionCards', 'btnVidPlayPause', 'vidScrubRange', 'vidTimecode', 'btnVidFullscreen', 'vidTimelineRuler']) {
    assert(rootHtml.includes(`id="${id}"`), `Missing #${id} in CapCut Video Studio UI`);
  }
  assert(rootHtml.includes('Videoyu Üret ve İndir'));
  assert(mainSrc.includes('document.getElementById(\'vidAspectRatio\')'));
}

// ============================================================================
// AREA 3: Nesting File Malzeme Ayarları & Separate Kenar / Yan Bant Sheet
// ============================================================================
{
  const sq = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }]; // 800 mm perimeter
  const st = createDefaultState();
  st.fileli.sidewallOverlapMm = 12;
  st.fileli.bandDepthMm = 95;
  const strips = extractSidewallStripItems([{
    objectId: 'o1', label: 'A', constructionType: 'fileli', depthMm: 80,
    polygonsMm: [{ outer: sq, holes: [] }],
  }], st);
  assert.equal(strips.length, 1);
  assert.equal(strips[0].partGroup, SIDEWALL_STRIP_GROUP.id);
  assert(strips[0].materialGroup.startsWith('Kenar / Yan Bant (Şerit Kesim)'));
  const maxX = Math.max(...strips[0].outer.map(p => p.x));
  const maxY = Math.max(...strips[0].outer.map(p => p.y));
  assert.equal(Math.round(maxX), 812, 'Strip length must equal perimeter (800) + bindirme payı (12)');
  assert.equal(Math.round(maxY), 95, 'Strip height must honor bandDepthMm (95)');

  // When includeSidewallStrips is enabled, Fileli emits 4 sheets: File, Pleksi, Dekota + Kenar / Yan Bant
  st.objects[0].constructionType = 'fileli';
  st.nesting.includeSidewallStrips = true;
  const items4 = extractNestingItems([{
    objectId: st.objects[0].id, label: 'A', constructionType: 'fileli', fileWidthMm: 8, depthMm: 80,
    polygonsMm: [{ outer: sq, holes: [] }],
  }], st);
  const nested4 = runTrueShapeNesting(items4, st.nesting);
  assert.equal(nested4.sheets.length, 4, 'Expected 4 dedicated sheets (File, Pleksi, Dekota, Kenar / Yan Bant)');
  assert(nested4.sheets.some(sh => sh.materialGroup.includes('Kenar / Yan Bant')));

  const uiHtml = renderNestingCenter(st, { activeSheetIdx: 0, leftTab: 'fileli' });
  for (const id of ['cwsFileliBandOverlap', 'cwsFileliBandDepth', 'cwsIncludeSidewallSheet', 'cwsBuildSidewallSheetBtn']) {
    assert(uiHtml.includes(`id="${id}"`), `Missing #${id} in File Malzeme Ayarları`);
    assert(mainSrc.includes(id), `Missing handler for #${id} in main.js`);
  }
}

console.log('✓ Phase 11 (Architectural 28° FOV & Perspective Grid/Sliders, Box3 Video Framing & CapCut UI, Fileli Side-Return Band Nesting) verified');
