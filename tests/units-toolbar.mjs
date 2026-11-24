import assert from 'node:assert/strict';
import { createDefaultState } from '../src/core/state.js';
import { DISPLAY_UNITS, displayToMm, mmToDisplay, formatMmAsUnit, PAGE_SIZE_PRESETS,formatPresetLabel,formatDimensions,formatAreaM2 } from '../src/core/units.js';
import { renderPropertyBar } from '../src/ui/PropertyBar.js';

function makeBar() {
  const controls = new Map();
  const bar = {
    innerHTML: '',
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, {value: '', listeners: {}, addEventListener(type, fn){this.listeners[type] = fn;}});
      return controls.get(selector);
    },
    querySelectorAll(){return [];},
    fire(selector, type, value) { const el=this.querySelector(selector); el.value=value; assert(el.listeners[type], `${selector} must respond to ${type}`); el.listeners[type]({target:el}); }
  };
  globalThis.document = {getElementById(id){return id==='numericPropBar' ? bar : null;}};
  return bar;
}

for(const u of DISPLAY_UNITS) {
  const v=2418.625;
  assert(Math.abs(displayToMm(mmToDisplay(v,u.id),u.id)-v) < 1e-7, u.id);
}
assert.equal(formatMmAsUnit(1200, 'cm'),'120');
assert.equal(formatMmAsUnit(1200, 'm'),'1.2');
assert.equal(formatMmAsUnit(25.4, 'in'),'1');
assert.equal(formatMmAsUnit(25.4/96, 'px'),'1');
assert.equal(PAGE_SIZE_PRESETS.find(x => x.id === 'A4').widthMm,210);

const state=createDefaultState();
state.selectedIds=[];
state.pageLayout.displayUnit='cm';
const bar=makeBar();
let size=null, unit=null, preset=null;
const ctx={onPageSize:(w,h)=>{size=[w,h];},onDisplayUnit:(x)=>{unit=x;},onPagePreset:(id)=>{preset=id;}};
renderPropertyBar(state,ctx);
assert.match(bar.innerHTML,/Sayfa ve Yerleşim/);
assert.match(bar.innerHTML,/value="200"/); // 2000mm -> 200cm
assert.match(bar.innerHTML,/Genişlik \(cm\)/);
bar.fire('#pageW','change','120');
assert.deepEqual(size,[1200,null]);
bar.fire('#pbDisplayUnit','change','in');
assert.equal(unit,'in');
bar.fire('#pbPagePreset','change','A4');
assert.equal(preset,'A4');

state.selectedIds=[state.objects[0].id];
state.objects[0].xMm=1200;
let edit=null;
renderPropertyBar(state,{onDisplayUnit:x=>unit=x,onEditSelected: fn=>{edit=fn;}});
assert.match(bar.innerHTML,/X \(cm\)/);
assert.match(bar.innerHTML,/value="120"/); // 1200mm -> 120cm
bar.fire('#numX','change','130');
assert.equal(typeof edit,'function');
edit(state.objects[0]);
assert.equal(state.objects[0].xMm,1300);
console.log('✓ Corel tarzı ölçü birimleri, sayfa/nesne dönüşümü ve bar olayları doğrulandı.');

import {renderNestingCenter,renderCncCenter} from '../src/ui/CentralWorkspaces.js';
import {renderNestingSvg} from '../src/ui/NestingView.js';
import {SHEET_PRESETS} from '../src/manufacturing/NestingEngine.js';
const preset2=PAGE_SIZE_PRESETS.find(p=>p.id==='2000x1000');
assert.equal(formatPresetLabel(preset2,'cm'),'Tabela · 200 × 100 cm');
assert.equal(formatPresetLabel(preset2,'m'),'Tabela · 2 × 1 m');
assert.equal(formatPresetLabel(PAGE_SIZE_PRESETS.find(p=>p.id==='A4'),'cm'),'A4 · 21 × 29.7 cm');
assert.equal(formatAreaM2(1,'cm'),'10000 cm²');
state.selectedIds=[];state.pageLayout.preset=preset2.id;
state.pageLayout.displayUnit='cm';renderPropertyBar(state,ctx);
assert.ok(bar.innerHTML.includes('Tabela · 200 × 100 cm'));
assert.ok(!bar.innerHTML.includes('Tabela · 2000 × 1000 mm'));
state.pageLayout.displayUnit='m';renderPropertyBar(state,ctx);
assert.ok(bar.innerHTML.includes('Tabela · 2 × 1 m'));
const n=state.nesting;n.sheetWidthMm=3000;n.sheetHeightMm=1500;n.clearanceMm=5;n.marginLeftMm=15;n.sheets=[];
state.pageLayout.displayUnit='cm';
const before=JSON.stringify(n);
const nestHtml=renderNestingCenter(state,{activeSheetIdx:0});
assert.ok(nestHtml.includes('300 × 150 cm'));
assert.ok(nestHtml.includes('Levha Genişliği (cm)'));
assert.match(nestHtml,/id="cwsNestW"[^>]*value="300"/);
assert.match(nestHtml,/id="cwsNestSp"[^>]*value="0.5"/);
assert.match(nestHtml,/viewBox="0 0 3000 1500"/);
assert.equal(JSON.stringify(n),before);
assert.equal(formatPresetLabel(SHEET_PRESETS.find(p=>p.id==='3000x1500'),'cm'),'300 × 150 cm (Yatay)');
assert.ok(renderNestingSvg({widthMm:3000,heightMm:1500,placements:[]},null,{},'cm').includes('300 × 150 cm'));
state.cnc={...state.cnc,kerfMm:.2,toolDiameterMm:3,leadInMm:3,curveTolMm:.1};
const cncHtml=renderCncCenter(state);
assert.ok(cncHtml.includes('Kesim Kerfi (cm)'));
assert.match(cncHtml,/id="cncToolDia"[^>]*value="0.3"/);
assert.equal(displayToMm('0.3','cm'),3);
console.log('✓ Page and sheet presets, nesting input/preview, CNC units and unchanged geometry');
assert.equal(formatMmAsUnit(555.428571,'mm',2),'555.43');
