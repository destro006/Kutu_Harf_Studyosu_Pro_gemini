import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveObjectLighting,setLightingValue} from '../src/core/ObjectLighting.js';
import {SignEngine} from '../src/render/SignEngine.js';
import {createSignMaterial} from '../src/render/MaterialLibrary.js';
import {resolveChannelMaterialBinding} from '../src/render/ChannelMaterialBinding.js';
import {createDefaultState,structuredCloneSafe} from '../src/core/state.js';
import THREE from '../src/vendor/three.js';

const s=createDefaultState(),a=s.objects[0],b={...structuredCloneSafe(a),id:'other'};s.objects.push(b);s.selectedIds=[a.id];
assert(setLightingValue(s,'backColor','#ff0000'));assert(setLightingValue(s,'backIntensity',0));assert.equal(resolveObjectLighting(a,s).backColor,'#ff0000');assert.equal(resolveObjectLighting(a,s).backIntensity,0);assert.notEqual(resolveObjectLighting(b,s).backColor,'#ff0000');
assert(setLightingValue(s,'frontColor','#00ff00'));assert.equal(resolveObjectLighting(a,s).frontColor,'#00ff00');assert.equal(resolveObjectLighting(a,s).backColor,'#ff0000');
a.locked=true;assert(!setLightingValue(s,'backColor','#0000ff'));a.locked=false;
s.selectedIds=[a.id,b.id];assert(setLightingValue(s,'backIntensity',2));assert.equal(resolveObjectLighting(b,s).backIntensity,2);
const color={set(v){this.value=v;return this},multiplyScalar(v){this.gain=v;return this}};
let front;const refs={front:[{userData:{updateLed:(c,i)=>front=[c,i]}}],halo:{material:{color}},points:[],height:.4,night:true};
SignEngine.prototype.applyObjectLightAppearance.call({},refs,resolveObjectLighting(a,s));assert.equal(refs.halo.material.color.value,'#ff0000');assert.deepEqual(front,['#00ff00',1]);assert(refs.halo.material.opacity>0);assert.equal(refs.points.length,0);
setLightingValue(s,'backIntensity',0);SignEngine.prototype.applyObjectLightAppearance.call({},refs,resolveObjectLighting(a,s));assert.equal(refs.halo.visible,false);assert.equal(refs.halo.material.opacity,0);

// 1. Selecting a lighting mode must re-enable global lighting if metal/isiksiz had disabled it.
s.lighting.enabled = false;
a.lightingMode = 'front';
assert(setLightingValue(s, 'mode', 'front'), 'Switching to front mode must re-enable global lighting');
assert.equal(s.lighting.enabled, true);

// 2. Fileli white opalPleksi must visibly turn into the chosen front light color without HDR whiteout.
const opalMat = createSignMaterial('opalPleksi', { color: '#f3f3ee' }, { lit: true, night: true, glowHex: '#ef4444', lightIntensity: 1.0 });
assert(opalMat.color.r > 0.75 && opalMat.color.g < 0.25 && opalMat.color.b < 0.25, `Expected red opal diffuse color, got rgb(${opalMat.color.r}, ${opalMat.color.g}, ${opalMat.color.b})`);
assert.equal(opalMat.emissive.getHexString(), new THREE.Color('#ef4444').getHexString());
assert(opalMat.emissiveIntensity >= 0.8 && opalMat.emissiveIntensity <= 1.8, `Expected ACES-safe emissiveIntensity, got ${opalMat.emissiveIntensity}`);
opalMat.userData.updateLed('#1d4ed8', 1.0);
assert(opalMat.color.b > 0.65 && opalMat.color.r < 0.25, `Expected blue opal diffuse color after updateLed, got rgb(${opalMat.color.r}, ${opalMat.color.g}, ${opalMat.color.b})`);
assert.equal(opalMat.emissive.getHexString(), new THREE.Color('#1d4ed8').getHexString());
opalMat.userData.updateLed('#1d4ed8', 0);
assert.equal(opalMat.color.getHexString(), new THREE.Color('#f3f3ee').getHexString());
assert.equal(opalMat.emissiveIntensity, 0);
opalMat.dispose();

// 3. Pleksi kutu harf sidewalls must bind acrylic (not metal) and share the same front-lit material.
const ps = createDefaultState();
const po = ps.objects[0];
po.constructionType = 'pleksi';
po.faceMaterial = 'aynaAltin';
po.faceColor = '#f5c66a';
po.sideFollowsFace = false;
po.sideMaterial = 'matSiyah';
let pb = resolveChannelMaterialBinding(po, ps);
assert.equal(pb.pleksi, true);
assert.equal(pb.acrylicId, 'opalPleksi');
assert.equal(pb.acrylicColor, '#f3f3ee');
assert.equal(pb.sideId, 'opalPleksi');
assert.equal(pb.shareAcrylicMaterial, true);
const pleksiSideMat = createSignMaterial(pb.sideId, { color: pb.sideColor }, { lit: true, night: true, glowHex: '#22c55e', lightIntensity: 1.0 });
assert.equal(pleksiSideMat.metalness, 0);
assert.equal(pleksiSideMat.emissive.getHexString(), new THREE.Color('#22c55e').getHexString());
pleksiSideMat.dispose();

po.faceMaterial = 'renkliPleksi';
po.faceColor = '#d3222c';
pb = resolveChannelMaterialBinding(po, ps);
assert.equal(pb.acrylicId, 'renkliPleksi');
assert.equal(pb.sideId, 'renkliPleksi');
assert.equal(pb.sideColor, '#d3222c');

const signSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
assert(/cType === 'pleksi'[\s\S]*?sideMat = acrylicMat/.test(signSrc), 'Pleksi sideMat must share front-lit acrylicMat in SignEngine');

console.log('✓ Per-object front/halo lighting, fileli opal LED color fidelity & pleksi acrylic sidewall sync verified');