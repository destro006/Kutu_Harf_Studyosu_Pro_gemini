import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector2DCanvas } from '../src/cad/Vector2DCanvas.js';
import { SignEngine } from '../src/render/SignEngine.js';
import THREE from '../src/vendor/three.js';
import { BACKGROUND_SCENES } from '../src/photomontage/BackgroundLibrary.js';

// Corel-style marquee selects fully enclosed geometry from left to right,
// crossing geometry from right to left, and never selects locked/hidden objects.
const rect = (x,y,w=100,h=100) => [{outer:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],holes:[]}];
let selected=[];
const vector=Object.create(Vector2DCanvas.prototype);
vector.lastState={objects:[
  {id:'one',visible:true,locked:false},
  {id:'two',visible:true,locked:false},
  {id:'locked',visible:true,locked:true},
  {id:'hidden',visible:false,locked:false},
]};
vector.lastFontMap={};
vector._getObjectPolysWorld = obj => ({one:rect(0,0),two:rect(130,0),locked:rect(10,10),hidden:rect(15,15)})[obj.id];
vector.callbacks={onSelectObjects:ids=>selected=ids};
const m=(x0,x1,crossing=false)=>({start:{xMm:x0,yMm:-20},end:{xMm:x1,yMm:120},crossing,additive:false});
vector._finishMarquee(m(-20,110));
assert.deepEqual(selected,['one']);
vector._finishMarquee(m(110,-20));
assert.deepEqual(selected,['one']);
vector._finishMarquee(m(-20,190,true));
assert.deepEqual(selected,['one','two']);
console.log('✓ 2D Pick / Corel seçme çerçevesi: kapsama, kesişim ve kilitli/gizli nesneler');

// 3D marquee is based on projected true object bounding boxes, not on the background/wall.
const three=Object.create(SignEngine.prototype);
three.renderer={domElement:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600})}};
three.camera=new THREE.PerspectiveCamera(40,1000/600,0.1,100);
three.camera.position.set(0,0,5);
three.camera.lookAt(0,0,0);
three.camera.updateProjectionMatrix();
three.camera.updateMatrixWorld(true);
const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,0.1),new THREE.MeshBasicMaterial());a.userData.layerId='A';
const b=new THREE.Mesh(new THREE.BoxGeometry(1,1,0.1),new THREE.MeshBasicMaterial());b.userData.layerId='B';b.position.x=2.8;
three.signGroup=new THREE.Group();three.signGroup.add(a,b);three.signGroup.updateMatrixWorld(true);
let ids=three._getIdsInMarquee({startX:300,startY:170,endX:700,endY:430,crossing:false});
assert.deepEqual(ids,['A']);
ids=three._getIdsInMarquee({startX:980,startY:430,endX:300,endY:170,crossing:false});
assert(ids.includes('A')&&ids.includes('B'));
console.log('✓ 3D Pick: gerçek nesne sınırları, serbest/kesişim seçim');

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
for(const id of ['workspaceTabs','btnFloatActiveDocker','btnResetDockLayout','inspectorQuickColors','btnOpenBackgroundPanel','dockDropZone']) assert(html.includes(`id="${id}"`),`missing ${id}`);
for(const word of ['reorderDockerTab','dockFloatingIntoTabs','onDeselectObject','onSelectObjects','background-preset','data-bg-wall','data-quick-hex']) assert(main.includes(word),`missing ${word}`);
assert(BACKGROUND_SCENES.length>=9);
console.log(`✓ UI: dock/float/restore, hızlı renk paleti ve ${BACKGROUND_SCENES.length} hazır arka plan`);
