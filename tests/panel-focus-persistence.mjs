import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { renderPropertyBar } from '../src/ui/PropertyBar.js';

const callbacks = new Map();
const control = { id:'pbDisplayUnit', tagName:'SELECT' };
const bar = {
  dataset: {}, innerHTML:'', 
  addEventListener(name, fn) { callbacks.set(name,fn); },
  contains(node) {return node === control;},
  querySelector() {return null;},
  querySelectorAll() {return [];}
};
globalThis.document = {
  activeElement: { tagName:'BODY' },
  getElementById(id) { return id === 'numericPropBar' ? bar : null; }
};
const state=createDefaultState();
state.mainWorkspace='model3d';
state.selectedIds=[state.objects[0].id];
let refreshCalls=0;
const refresh = () => { refreshCalls++; renderPropertyBar(state, {onRefreshBar:refresh}); };
renderPropertyBar(state,{onRefreshBar:refresh});
assert.match(bar.innerHTML,/id="pbDisplayUnit"/);
assert.match(bar.innerHTML,/id="pbCtype"/);
const initial=bar.innerHTML;
document.activeElement=control;
state.objects[0].depthMm=137;
renderPropertyBar(state,{onRefreshBar:refresh});
assert.equal(bar.innerHTML,initial,'opening a select must not replace its DOM node');
assert.equal(bar.dataset.pendingRefresh,'1');
callbacks.get('focusout')();
document.activeElement={tagName:'BODY'};
await new Promise(resolve=>setTimeout(resolve,8));
assert.equal(refreshCalls,1,'deferred refresh runs after the native menu closes');
assert.notEqual(bar.innerHTML,initial);
assert.match(bar.innerHTML,/value="137"/);

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/studio.css',import.meta.url),'utf8');
assert(main.includes("const sel = state.objects.find(o => (state.selectedIds || []).includes(o.id))"),
  'HUD must never show an unselected first object which will be immediately hidden by its frame callback');
assert(main.includes("hud.dataset.pendingRefresh = '1'"),'HUD preserves focused controls');
assert(main.includes("root.dataset.pendingRefresh = '1'"),'right inspector preserves native input and select controls');
assert(main.includes("layer.dataset.pendingRefresh = '1'"),'floating windows preserve native input and select controls');
assert(main.includes("hud.dataset.dismissedKey = currentKey"),'HUD only closes explicitly');
assert(main.includes("const ids = new Set((s.selectedIds || []).length ? s.selectedIds : [s.objects[0]?.id].filter(Boolean))"),
  'construction changes apply to the visible object when no explicit selection exists');
assert(css.includes('.hud-close-btn'));
console.log('✓ Persistent units/property selects, HUD focus and explicit close, inspector controls and construction selection');
