import assert from 'node:assert/strict';
import {generateWallPixels} from '../src/photomontage/WallTextureGenerator.js';
import {loadWallPixels,BACKGROUND_SCENES} from '../src/photomontage/BackgroundLibrary.js';
import {SignEngine} from '../src/render/SignEngine.js';
const events=[];const data=generateWallPixels('studioPremium',p=>events.push(p));
assert.equal(data.color.length,512*512*4);assert.equal(data.bump.length,data.color.length);assert.equal(events[0],0);assert.equal(events.at(-1),100);assert(events.every((p,i)=>!i||p>=events[i-1]));
let count=0,terminated=0,worker;
const factory=()=>{count++;worker={postMessage({id}){this.id=id;},terminate(){terminated++;}};return worker;};
assert.equal(count,0,'no preloading');
const a=loadWallPixels('tugla',{workerFactory:factory});assert.equal(count,1);assert.equal(worker.id,'tugla');
worker.onmessage({data:{id:'tugla',percent:50}});worker.onmessage({data:{id:'tugla',result:data}});await a;assert.equal(terminated,1);
await loadWallPixels('tugla',{workerFactory:factory});assert.equal(count,1,'cached choice');
const ctrl=new AbortController();const b=loadWallPixels('beton',{signal:ctrl.signal,workerFactory:factory});const stale=worker;ctrl.abort();await assert.rejects(b,{name:'AbortError'});stale.onmessage({data:{id:'beton',result:data}});
for(const id of ['beton','mermer','siva']){
 const p=loadWallPixels(id,{workerFactory:factory});assert.equal(worker.id,id);worker.onmessage({data:{id,result:data}});await p;
}
const again=loadWallPixels('tugla',{workerFactory:factory});assert.equal(worker.id,'tugla','LRU must evict old pair');worker.onmessage({data:{id:'tugla',result:data}});await again;
assert.equal(BACKGROUND_SCENES.length,15);
const engine={_paused:true,isDisposed:false};assert.doesNotThrow(()=>SignEngine.prototype.requestWall.call(engine,'mermer',{w:1,h:1},false));
console.log('✓ Lazy wall worker, real monotonic pixel progress, cancellation, bounded LRU and hidden-workspace guard');
