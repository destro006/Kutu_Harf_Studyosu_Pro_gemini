import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_VIDEO_CLIPS,
  VIDEO_ROLES,
  computeSequenceTimeline,
  sampleSequenceKeyframe,
} from '../src/render/PresentationVideoRecorder.js';
import {
  loadTabOrder,
  reorderTabIds,
  saveTabOrder,
  sortItemsBySavedOrder,
} from '../src/ui/TabReorderManager.js';

// Module 1: Hide selection/page helpers + studio bitrate & high DPR in VideoRecorder
const recSrc = fs.readFileSync(new URL('../src/render/PresentationVideoRecorder.js', import.meta.url), 'utf8');
assert(recSrc.includes('selectionGroup.visible = false') && recSrc.includes('pageGroup.visible = false'));
assert(recSrc.includes('12_000_000') && recSrc.includes('15_000_000'));
assert(recSrc.includes('Math.min(typeof window'));

// Module 2: Multi-Clip Sequencer + Cross-fade & Cut transitions + Video Stüdyosu UI
assert.equal(DEFAULT_VIDEO_CLIPS.length, 3);
const tl = computeSequenceTimeline([
  { id: 'c1', role: 'detail_closeup', durationSec: 4, transition: 'fade' },
  { id: 'c2', role: 'night_led', durationSec: 5, transition: 'fade' },
  { id: 'c3', role: 'tech_dims', durationSec: 4, transition: 'cut' },
]);
assert.equal(tl.totalDurationSec, 13);
assert.equal(tl.segments.length, 3);

const k1 = sampleSequenceKeyframe(1.5, tl, { showDimensions: true });
assert.equal(k1.clipIndex, 0);
assert.equal(k1.clipRole, 'detail_closeup');

const kFadeStart = sampleSequenceKeyframe(4.1, tl, { showDimensions: true });
assert.equal(kFadeStart.clipIndex, 1);
assert(kFadeStart.crossFadeAlpha > 0 && kFadeStart.crossFadeAlpha < 1, 'Expected smooth cross-fade ramp');

const kCut = sampleSequenceKeyframe(9.1, tl, { showDimensions: true });
assert.equal(kCut.clipIndex, 2);
assert.equal(kCut.clipRole, 'tech_dims');

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(indexHtml.includes('Video Stüdyosu') && indexHtml.includes('id="btnAddVideoClip"') && indexHtml.includes('id="vidTimelineList"'));
assert(indexHtml.includes('Birleştir ve Videoyu İndir'));

// Module 7: Drag-and-Drop Reorderable Tabs + localStorage Persistence
const mem = new Map();
const fakeStorage = {
  getItem: k => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, String(v)),
};
const moved = reorderTabIds(['design2d', 'model3d', 'nesting', 'cnc'], 'cnc', 'model3d', false);
assert.deepEqual(moved, ['design2d', 'cnc', 'model3d', 'nesting']);
saveTabOrder('main_ws', moved, fakeStorage);
assert.deepEqual(loadTabOrder('main_ws', fakeStorage), ['design2d', 'cnc', 'model3d', 'nesting']);
const sortedObjs = sortItemsBySavedOrder(
  [{ id: 'model3d' }, { id: 'nesting' }, { id: 'cnc' }, { id: 'design2d' }],
  x => x.id,
  'main_ws',
  fakeStorage,
);
assert.deepEqual(sortedObjs.map(x => x.id), ['design2d', 'cnc', 'model3d', 'nesting']);

const mainJs = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(mainJs.includes("groupKey: 'main_ws'") && mainJs.includes("groupKey: 'doc_tabs'"));
assert(mainJs.includes("groupKey: 'cnc_subtabs'") && mainJs.includes("groupKey: 'nesting_file_tabs'"));

console.log('✓ Phase 7 Modules 1, 2 & 7 (Clean High-Bitrate Video, Multi-Clip Sequencer & Drag-Drop Tabs) verified cleanly');
