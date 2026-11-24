import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { renderNestingCenter } from '../src/ui/CentralWorkspaces.js';
import { renderNestingSvg } from '../src/ui/NestingView.js';
import { SHEET_PRESETS, runTrueShapeNesting } from '../src/manufacturing/NestingEngine.js';

const state=createDefaultState();
state.nesting.sheets=[];
for (const preset of SHEET_PRESETS) {
  state.nesting.sheetWidthMm=preset.w;
  state.nesting.sheetHeightMm=preset.h;
  const html=renderNestingCenter(state,{activeSheetIdx:0});
  assert.match(html,new RegExp(`viewBox="0 0 ${preset.w} ${preset.h}"`));
  assert.ok(html.includes(`value="${preset.id}" selected`),`preset ${preset.id} selected`);
  assert.ok(html.includes(`${preset.w} × ${preset.h} mm`));
}
state.nesting.sheetWidthMm=2350;
state.nesting.sheetHeightMm=1275;
const custom=renderNestingCenter(state,{activeSheetIdx:0});
assert.ok(custom.includes('value="custom" selected'));
assert.match(custom,/viewBox="0 0 2350 1275"/);
const svg=renderNestingSvg({widthMm:1000,heightMm:2000,placements:[]});
assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);
assert.match(svg,/class="nesting-sheet-svg"/);
const css=fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url),'utf8');
assert.match(css,/#nestingCenterWrap \.nesting-sheet-svg/);
assert.match(css,/max-height: 100%/);
const square={id:'piece', label:'parca', materialGroup:'metal', material:'metal', thicknessMm:2,
  outer:[{x:0,y:0},{x:250,y:0},{x:250,y:150},{x:0,y:150}],holes:[],areaMm2:37500};
for(const preset of [{w:1000,h:2000},{w:3000,h:1500},{w:1220,h:2440}]){
 const result=runTrueShapeNesting([square],{sheetWidthMm:preset.w,sheetHeightMm:preset.h,marginMm:15,clearanceMm:5,kerfMm:0.4});
 assert.ok(result.sheets.length>0,'sheet produced');
 assert.equal(result.sheets[0].widthMm,preset.w);
 assert.equal(result.sheets[0].heightMm,preset.h);
}
console.log('✓ Nesting preset/preview fit, blank sheet, custom size, aspect ratio, repack dimensions');
