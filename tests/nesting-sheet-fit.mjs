import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { renderNestingCenter } from '../src/ui/CentralWorkspaces.js';
import { renderNestingSvg } from '../src/ui/NestingView.js';
import { SHEET_PRESETS, runTrueShapeNesting } from '../src/manufacturing/NestingEngine.js';
const state = createDefaultState(); state.nesting.sheets = [];
for (const p of SHEET_PRESETS) {
  state.nesting.sheetWidthMm=p.w; state.nesting.sheetHeightMm=p.h;
  const html=renderNestingCenter(state,{activeSheetIdx:0});
  assert.ok(html.includes(`viewBox="0 0 ${p.w} ${p.h}"`));
  assert.ok(html.includes(`value="${p.id}" selected`));
}
state.nesting.sheetWidthMm=2350; state.nesting.sheetHeightMm=1275;
const custom=renderNestingCenter(state,{activeSheetIdx:0});
assert.ok(custom.includes('value="custom" selected'));
assert.ok(custom.includes('viewBox="0 0 2350 1275"'));
assert.match(renderNestingSvg({widthMm:1000,heightMm:2000,placements:[]}),/preserveAspectRatio="xMidYMid meet"/);
const css=fs.readFileSync(new URL('../src/styles/studio.css',import.meta.url),'utf8');
assert.match(css,/#nestingCenterWrap \.nesting-sheet-svg/);
const piece={id:'piece',label:'Parça',materialGroup:'metal',material:'metal',thicknessMm:2,outer:[{x:0,y:0},{x:250,y:0},{x:250,y:150},{x:0,y:150}],holes:[],areaMm2:37500};
for(const p of [{w:1000,h:2000},{w:3000,h:1500},{w:1220,h:2440}]) {
 const r=runTrueShapeNesting([piece],{sheetWidthMm:p.w,sheetHeightMm:p.h,marginMm:15,clearanceMm:5,kerfMm:0.4});
 assert.ok(r.sheets.length);
 assert.equal(r.sheets[0].widthMm,p.w); assert.equal(r.sheets[0].heightMm,p.h);
}
console.log('✓ Nesting levha ölçüsü, oranlı önizleme ve yeniden yerleşim testleri');
