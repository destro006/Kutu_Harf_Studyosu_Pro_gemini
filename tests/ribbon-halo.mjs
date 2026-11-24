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
assert.equal((html.match(/id="inspectorQuickColors"/g)||[]).length,1);
assert(!engine.includes('new THREE.PointLight('));
for(const night of [true,false]){const group=buildSceneLights(night,{w:3,h:.4});group.traverse(o=>assert(!o.isPointLight&&!o.isSpotLight));}
console.log('✓ Two-row contextual bar, unique ribbon category controls and no circular point/spot halo lights');