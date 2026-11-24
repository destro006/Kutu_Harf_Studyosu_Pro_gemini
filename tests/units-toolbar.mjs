import assert from 'node:assert/strict';
import { createDefaultState } from '../src/core/state.js';
import { DISPLAY_UNITS, displayToMm, mmToDisplay, formatMmAsUnit, PAGE_SIZE_PRESETS } from '../src/core/units.js';
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
