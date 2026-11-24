import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildSceneLights} from '../src/render/LightingSystem.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),bar=fs.readFileSync(new URL('../src/ui/PropertyBar.js',import.meta.url),'utf8'),engine=fs.readFileSync(new URL('../src/render/SignEngine.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/studio.css',import.meta.url),'utf8');
assert(bar.includes('compact-property-line'));
assert(!bar.includes('prop-row-measure')&&!bar.includes('prop-row-details'));
assert(bar.includes('id="pbCtype"')&&bar.includes('id="pbLmode"'));
assert(css.includes('#numericPropBar.compact-property-line{flex-wrap:nowrap'));
assert(css.includes('#studioRibbon{flex-wrap:nowrap'));
for(const key of ['properties','materials','lighting','manufacturing','align','background']){assert(html.includes('data-ribbon="'+key+'"'));assert(!html.includes('data-ws="'+key+'"'));}
assert(!html.includes('id="inspectorQuickColors"'));
assert(!engine.includes('new THREE.PointLight('));
for(const night of [true,false]){const group=buildSceneLights(night,{w:3,h:.4});group.traverse(o=>assert(!o.isPointLight&&!o.isSpotLight));}
console.log('✓ Two-row contextual bar, unique ribbon category controls and no circular point/spot halo lights');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(!main.includes('btnOpenRalPalette'));
assert(!main.includes('Tüm RAL'));
assert(main.includes('RAL_COLORS.filter'));
assert(main.includes('[data-ral-hex]'));
assert(main.includes('[data-light-color]'));
assert(!main.includes('renderQuickPalette'));
assert(!css.includes('has-vertical-palette'));
assert(main.includes('</div><div class="material-ribbon-column">'));
assert(css.includes('.material-ribbon-column{display:flex;flex-direction:column'));
console.log('✓ RAL and light controls retained in panels; independent material panel stacks');

assert(html.indexOf('value="layers" selected')<html.indexOf('value="objects"'));
for(const id of ['properties','materials','lighting','manufacturing','align','background'])assert(html.includes('option value="'+id+'"'));
assert(main.includes("let sideWorkspace='layers'"));
assert(main.includes('sideWorkspace=id;ribbonSuppressed=id'));
assert(!css.includes('inspectorQuickColors'));
assert(main.includes('class="lighting-column"'));
assert(css.includes('grid-auto-rows:max-content'));
console.log('✓ Layers first, all categories accessible in inspector, full-width viewport and non-overlapping lighting layout');
