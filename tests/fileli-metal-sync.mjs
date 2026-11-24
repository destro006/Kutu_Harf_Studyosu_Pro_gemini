import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveChannelMaterialBinding } from '../src/render/ChannelMaterialBinding.js';
import { MATERIAL_PRESETS, createSignMaterial } from '../src/render/MaterialLibrary.js';
import { createDefaultState } from '../src/core/state.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import THREE from '../src/vendor/three.js';

const state = createDefaultState();
const obj = structuredClone(state.objects[0]);
// Default new projects are metal; this test intentionally exercises fileli construction.
obj.constructionType = 'fileli';
// Changing only the FILE material in an existing project must color the whole
// channel letter metal, even if that project has a stale independent side ID.
obj.fileMaterial = 'roseGold';
obj.fileColor = '#eaa58b';
obj.faceMaterial = 'aynaKrom';
obj.sideMaterial = 'matSiyah';
obj.sideColor = '#161618';
obj.sideFollowsFace = true;
let binding = resolveChannelMaterialBinding(obj, state);
assert.equal(binding.fileId, 'roseGold');
assert.equal(binding.sideId, 'roseGold');
assert.equal(binding.sideColor, '#eaa58b');
assert.equal(binding.shareMetalMaterial, true);

const rim = createSignMaterial(binding.fileId,{color:binding.fileColor},{lit:false,isOpaqueMetal:true});
const side = binding.shareMetalMaterial ? rim : createSignMaterial(binding.sideId,{color:binding.sideColor},{lit:false,isOpaqueMetal:true});
assert.strictEqual(side,rim,'Linked front-file and full-depth sidewall must use the identical PBR material instance');
assert.equal(rim.metalness,MATERIAL_PRESETS.roseGold.metalness);
assert.equal(rim.roughness,MATERIAL_PRESETS.roseGold.roughness);
assert.equal(rim.color.getHexString(),new THREE.Color('#eaa58b').getHexString());
rim.dispose();

// User-controlled decoupling is deliberately preserved.
obj.sideFollowsFace = false;
binding=resolveChannelMaterialBinding(obj,state);
assert.equal(binding.shareMetalMaterial,false);
assert.equal(binding.sideId,'matSiyah');
assert.equal(binding.sideColor,'#161618');

// Non-fileli letters preserve traditional face/side-follow behavior.
obj.constructionType='metal'; obj.sideFollowsFace=true;
binding=resolveChannelMaterialBinding(obj,state);
assert.equal(binding.sideId,'aynaKrom');
assert.equal(binding.shareMetalMaterial,false);

// Letters must have sidewall extrusion covering the body depth and front rim
// covering the remaining front thickness (total equals target channel depth).
const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(100,0);shape.lineTo(100,80);shape.lineTo(0,80);shape.closePath();
const built=buildChannelComponent([shape],{constructionType:'fileli',depthMm:80,fileWidthMm:5,fileThicknessMm:2,metalThicknessMm:1,acrylicThicknessMm:3});
assert.equal(built.warnings.length,0);
function zBounds(geos) {let min=Infinity,max=-Infinity;for (const g of geos) {const a=g.getAttribute('position');for(let i=0;i<a.count;i++){min=Math.min(min,a.getZ(i));max=Math.max(max,a.getZ(i));}}return {min,max};}
const wallBounds=zBounds(built.outerGeos), rimBounds=zBounds(built.fileGeos);
assert(Math.abs(wallBounds.min)<1e-5 && Math.abs(wallBounds.max-0.078)<1e-4);
assert(Math.abs(rimBounds.max-0.080)<1e-4);
assert(rimBounds.min>=0.078-1e-4);
for(const g of [...built.outerGeos,...built.fileGeos,...built.acrylicGeos])g.dispose();

// Verify controls in the user's screenshots exist in the delivered HTML.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const screenshotTools=['select','move','scale','rotate','node','pen','freehand','rect','ellipse','polygon','text','logo','measure','eyedropper','pan','zoom'];
const screenshotActions=['duplicate','toCurves','breakApart','union','difference','intersection','delete'];
const screenshotDockers=['objects','properties','layers','materials','manufacturing','align','background','projects'];
for(const name of screenshotTools)assert(html.includes(`data-tool="${name}"`),`Missing tool ${name}`);
for(const name of screenshotActions)assert(html.includes(`data-action="${name}"`),`Missing CAD action ${name}`);
for(const name of screenshotDockers)assert(html.includes(`data-ws="${name}"`)||html.includes(`data-ribbon="${name}"`),`Missing tool category ${name}`);
for(const id of ['btnExportPng','btnExportTransparentPng','btnExportSvg','btnExportDxf','btnSaveJson','qualitySelect','btnNewDocTab','documentTabsList','btnCopyBetweenTabs','btnPasteBetweenTabs'])assert(html.includes(`id="${id}"`),`Missing UI ${id}`);
console.log(`✓ Fileli metal eşleştirme: file/yanak aynı PBR; özel yanak korunur; 80 mm derinlik; ekran görsellerindeki ${screenshotTools.length+screenshotActions.length} araç, ${screenshotDockers.length} docker ve 10 üst kontrol kodda mevcut`);
