import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_FACADES,
  FACADE_CATEGORIES,
  addCustomFacade,
  deleteFacadeById,
  findFacadeByQuery,
  getActiveFacades,
  restoreDefaultFacades,
} from '../src/photomontage/FacadeLibrary.js';
import { fitAspectLockedQuad } from '../src/photomontage/PerspectiveFitter.js';
import {
  APP_ACTION_REGISTRY,
  APP_UI_MAP,
  ASSISTANT_TOOLS,
  resolveLocalExpertIntent,
} from '../src/ai/AppExpertAssistant.js';
import { AI_STUDIO_PRESETS, renderAiStudioWorkspace } from '../src/ui/AiStudioView.js';

// Module 3: 35 Optimized Facades + Non-Destructive Delete + Restore Defaults
assert.equal(DEFAULT_FACADES.length, 35, 'All 35 built-in facades must exist');
assert.equal(FACADE_CATEGORIES.length, 4);
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
for (const f of DEFAULT_FACADES) {
  assert(fs.existsSync(path.join(rootDir, f.src.replace('./', ''))), `Missing facade WebP: ${f.src}`);
  assert(fs.existsSync(path.join(rootDir, f.thumb.replace('./', ''))), `Missing facade thumb: ${f.thumb}`);
}

const mem = new Map();
const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
assert.equal(getActiveFacades(storage).length, 35);
deleteFacadeById('otel_girisi', storage);
assert.equal(getActiveFacades(storage).length, 34);
const custom = addCustomFacade({ label: 'Özel Mağazam', dataUrl: 'data:image/png;base64,abc' }, storage);
assert.equal(getActiveFacades(storage).length, 35);
restoreDefaultFacades(storage);
assert.equal(getActiveFacades(storage).length, 36); // 35 defaults restored + custom retained
deleteFacadeById(custom.id, storage);
assert.equal(getActiveFacades(storage).length, 35);
assert.equal(findFacadeByQuery('otel girişi', storage)?.id, 'otel_girisi');

// Module 4: Zero-Stretch Aspect-Locked Perspective Quad
const wideQuad = [
  { x: 100, y: 100 },
  { x: 900, y: 120 },
  { x: 900, y: 320 },
  { x: 100, y: 300 },
]; // 800 x 200 (ratio 4:1)
const squareFit = fitAspectLockedQuad(wideQuad, 500, 500); // sign ratio 1:1
const fittedW = Math.hypot(squareFit[1].x - squareFit[0].x, squareFit[1].y - squareFit[0].y);
const fittedH = Math.hypot(squareFit[3].x - squareFit[0].x, squareFit[3].y - squareFit[0].y);
assert(Math.abs(fittedW / fittedH - 1.0) < 0.03, 'Aspect ratio 1:1 must be preserved cleanly without stretching');

// Module 5: Omniscient AppExpert Registry & Actions
for (const ws of ['design2d', 'model3d', 'materials', 'tracer', 'nesting', 'aistudio', 'cnc', 'cost']) {
  assert(APP_UI_MAP.tabs[ws], `APP_UI_MAP missing workspace ${ws}`);
}
assert(APP_ACTION_REGISTRY.includes('open_cnc_subtab') && APP_ACTION_REGISTRY.includes('select_facade'));
assert(ASSISTANT_TOOLS.some(t => t.name === 'add_video_clip'));

const r1 = resolveLocalExpertIntent('Büküm simülatörünü aç ve paslanmaz 0.8mm seç');
assert.equal(r1.toolCalls[0].name, 'open_cnc_subtab');
assert.equal(r1.toolCalls[0].args.subTab, 'bending');
assert.equal(r1.toolCalls[0].args.coilId, 'ss_08');

const r2 = resolveLocalExpertIntent('Videoya 360 tur ekle');
assert.equal(r2.toolCalls[0].name, 'add_video_clip');
assert.equal(r2.toolCalls[0].args.role, 'orbit_360');

const r3 = resolveLocalExpertIntent('Cepheyi otel girişi yap');
assert.equal(r3.toolCalls[0].name, 'select_facade');

const r4 = resolveLocalExpertIntent('Ölçüleri kapat');
assert.equal(r4.toolCalls[0].name, 'toggle_3d_dimensions');
assert.equal(r4.toolCalls[0].args.visible, false);

// Module 6: Flagship AI Stüdyo Tab Placement & Floating FAB Removal
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const nPos = indexHtml.indexOf('data-main-ws="nesting"');
const aiPos = indexHtml.indexOf('data-main-ws="aistudio"');
assert(nPos > 0 && aiPos > nPos, 'AI Stüdyo tab must appear right after Nesting');
assert(!indexHtml.includes('id="btnAppExpertToggle"'), 'Floating bottom-right FAB button must be removed');
assert(indexHtml.includes('id="aiStudioCenterWrap"'));

assert(AI_STUDIO_PRESETS.length >= 4);
const aiHtml = renderAiStudioWorkspace({ facades: DEFAULT_FACADES, compositeUrl: 'data:image/png;base64,x', resultUrl: 'data:image/png;base64,y' });
assert(aiHtml.includes('id="aiStudioPull3D"') && aiHtml.includes('id="aiStudioCompareRange"') && aiHtml.includes('id="aiStudioExpertForm"'));

console.log('✓ Phase 8 Modules 3, 4, 5 & 6 (35 Facades, Aspect-Locked Perspective, Omniscient Expert & AI Stüdyo) verified cleanly');
