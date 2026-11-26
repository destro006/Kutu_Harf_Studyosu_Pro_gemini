import assert from 'node:assert/strict';
import fs from 'node:fs';
import THREE from '../src/vendor/three.js';
import { createDefaultState } from '../src/core/state.js';
import { moveLayerToTarget } from '../src/cad/LayerManager.js';
import { renderNestingCenter } from '../src/ui/CentralWorkspaces.js';
import { computeSignageDimensionData } from '../src/render/Dimensions3DOverlay.js';
import { CHOREOGRAPHY_STAGES, sampleChoreographyKeyframe } from '../src/render/PresentationVideoRecorder.js';

// 1. Module 3: Nesting standard defaults & hole-in-hole inside Gelişmiş Yerleşim Ayarları
const st = createDefaultState();
assert.equal(st.nesting.allowHoleNesting, true, 'Hole-in-hole nesting must be enabled by default');
assert.equal(st.nesting.rotationStepDeg, 180, 'Default rotation step must be 0° / 180° (180)');
assert.equal(st.nesting.placementStrategy, 'compact', 'Default optimization direction must be compact');

const html = renderNestingCenter(st, { activeSheetIdx: 0, advancedOpen: true });
const advStart = html.indexOf('id="cwsNestAdvanced"');
const advEnd = html.indexOf('</details>', advStart);
const advBlock = html.slice(advStart, advEnd);
assert(advBlock.includes('id="cwsNestHoles"') && advBlock.includes('checked'), 'Hole-in-hole option must live inside Gelişmiş Yerleşim Ayarları and be checked by default');
assert(advBlock.includes('Objelerin İçine Ekle'), 'Turkish label for hole-in-hole must be present');

// Quick CNC button right next to Corel'e Aktar and before Otomatik Yerleştir
const corelIdx = html.indexOf('id="cwsSendCorel"');
const cncIdx = html.indexOf('id="cwsSendCncQuick"');
const runIdx = html.indexOf('id="cwsRunNesting"');
assert(corelIdx > 0 && cncIdx > corelIdx && runIdx > cncIdx, 'cwsSendCncQuick must appear right after cwsSendCorel and before cwsRunNesting');
assert(html.includes('id="nestZoomHud"') && html.includes('id="nestZoomVal"'));

// 2. Layer Drag-and-Drop Reordering
const layerState = {
  objects: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
};
assert.equal(moveLayerToTarget(layerState, 'a', 'c', true), true);
assert.deepEqual(layerState.objects.map(o => o.id), ['b', 'c', 'a', 'd']);
assert.equal(moveLayerToTarget(layerState, 'd', 'b', false), true);
assert.deepEqual(layerState.objects.map(o => o.id), ['d', 'b', 'c', 'a']);
assert.equal(moveLayerToTarget(layerState, 'b', 'b', false), false);

// 3. Module 6: 3D Dimensions & Cinematic Video Choreography
const dimFallback = computeSignageDimensionData(null, st, { totalWidthMm: 1850, totalHeightMm: 420 });
assert.equal(dimFallback.valid, true);
assert.equal(dimFallback.widthMm, 1850);
assert.equal(dimFallback.heightMm, 420);
assert.equal(dimFallback.depthMm, 80);

assert.equal(CHOREOGRAPHY_STAGES.length, 4);
const k0 = sampleChoreographyKeyframe(0.1, { showDimensions: true });
const k1 = sampleChoreographyKeyframe(0.4, { showDimensions: true });
const k2 = sampleChoreographyKeyframe(0.75, { showDimensions: true });
const k3 = sampleChoreographyKeyframe(0.98, { showDimensions: true });
const k3NoDims = sampleChoreographyKeyframe(0.98, { showDimensions: false });
assert.equal(k0.night, false);
assert.equal(k0.dimsOpacity, 0);
assert.notEqual(k0.azimuth, k1.azimuth);
assert.equal(k2.night, true);
assert.equal(k2.lightingEnabled, true);
assert(k3.dimsOpacity > 0.9, 'Hero stage must smoothly fade in dimensions when enabled');
assert.equal(k3NoDims.dimsOpacity, 0, 'Dimensions must stay hidden when toggle is off');

// 4. Wiring checks
const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainJs = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(rootHtml.includes('id="btnToggle3DDims"') && rootHtml.includes('id="btnOpenVideoModal"') && rootHtml.includes('id="presentationVideoModal"'));
assert(mainJs.includes('NESTING_DEFAULTS_KEY') && mainJs.includes('triggerQuickCncExport') && mainJs.includes('applyNestingSvgViewBox'));
assert(mainJs.includes('moveLayerToTarget(s, dragged, targetId, after)'));

console.log('✓ Phase 2 Modules (3, Layer Drag-Drop & 6) verified cleanly');
