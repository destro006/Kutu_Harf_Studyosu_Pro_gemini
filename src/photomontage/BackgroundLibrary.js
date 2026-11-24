import THREE from '../vendor/three.js';

/**
 * Architectural Wall & Scene Background Library
 * Preserves all 4 procedural diffuse + bump maps from the reference application
 * (Tuğla, Brüt beton, Ahşap çıta, Antrasit sıva) and extends with 4 new scenes
 * plus custom storefront photograph import.
 */

export const BACKGROUND_SCENES = [
  { id:'studioPremium',label:'Premium Grafit Stüdyo',category:'studio',roughness:.77,bump:.12,tileM:4 },
  { id:'traverten',label:'Bej Traverten',category:'luxury',roughness:.83,bump:.45,tileM:2.2 },
  { id:'kompozit',label:'Antrasit Kompozit Panel',category:'storefront',roughness:.43,bump:.28,tileM:3 },
  { id:'siyahMermer',label:'Nero Mermer',category:'luxury',roughness:.26,bump:.12,tileM:2.5 },
  { id:'cevizPanel',label:'Ceviz Ahşap Panel',category:'interior',roughness:.56,bump:.38,tileM:2.2 },
  { id:'beyazSiva',label:'Kırık Beyaz Mikrobeton',category:'wall',roughness:.86,bump:.22,tileM:3 },
  { id: 'tugla', label: 'Tuğla', category: 'wall', roughness: 0.92, bump: 1.4, tileM: 2.0 },
  { id: 'beton', label: 'Brüt Beton', category: 'wall', roughness: 0.88, bump: 0.8, tileM: 2.4 },
  { id: 'ahsap', label: 'Ahşap Çıta', category: 'wall', roughness: 0.62, bump: 1.6, tileM: 1.2 },
  { id: 'siva', label: 'Antrasit Sıva', category: 'wall', roughness: 0.8, bump: 0.6, tileM: 2.0 },
  { id: 'mermer', label: 'Mermer Duvar', category: 'luxury', roughness: 0.22, bump: 0.3, tileM: 2.2 },
  { id: 'vitrin', label: 'Modern Mağaza Cephesi', category: 'storefront', roughness: 0.45, bump: 0.4, tileM: 2.6 },
  { id: 'resepsiyon', label: 'Ofis Resepsiyon', category: 'interior', roughness: 0.55, bump: 0.5, tileM: 2.2 },
  { id: 'karanlikCephe', label: 'Koyu Dış Cephe', category: 'luxury', roughness: 0.68, bump: 0.7, tileM: 2.4 },
  { id: 'studioNotr', label: 'Nötr Stüdyo Fonu', category: 'studio', roughness: 0.85, bump: 0.1, tileM: 3.0 },
];

// Only selected backgrounds are generated. Keep at most three recently
// selected pixel pairs in CPU memory; GPU textures belong to the active mesh.
const texCache=new Map();
const CACHE_LIMIT=3;
export function normalizeWallId(id){return BACKGROUND_SCENES.some(b=>b.id===id)?id:BACKGROUND_SCENES[0].id;}
export function loadWallPixels(wallId,{signal,onProgress=()=>{},workerFactory=()=>new Worker(new URL('./WallTextureWorker.js',import.meta.url),{type:'module'})}={}){
 const id=normalizeWallId(wallId);
 const abortError=()=>new DOMException('Arka plan yüklemesi iptal edildi.','AbortError');
 if(signal?.aborted)return Promise.reject(abortError());
 if(texCache.has(id)){
   const data=texCache.get(id);texCache.delete(id);texCache.set(id,data);onProgress(100);return Promise.resolve(data);
 }
 return new Promise((resolve,reject)=>{
   let worker,finished=false;
   const cleanup=()=>{worker?.terminate();signal?.removeEventListener('abort',abort);};
   const complete=(error,data)=>{if(finished)return;finished=true;cleanup();if(error)reject(error);else resolve(data);};
   const abort=()=>complete(abortError());
   try{worker=workerFactory();}catch(e){complete(e);return;}
   worker.onmessage=e=>{
     if(finished||e.data?.id!==id)return;
     if(e.data.error){complete(Error(e.data.error));return;}
     if(Number.isFinite(e.data.percent)){onProgress(e.data.percent);return;}
     if(e.data.result){
       const data=e.data.result,expected=data.size*data.size*4;
       if(!(data.color instanceof Uint8ClampedArray)||!(data.bump instanceof Uint8ClampedArray)||data.color.length!==expected||data.bump.length!==expected){complete(Error('Doku verisi geçersiz.'));return;}
       texCache.set(id,data);while(texCache.size>CACHE_LIMIT)texCache.delete(texCache.keys().next().value);
       complete(null,data);
     }
   };
   worker.onerror=e=>complete(Error(e.message||'Arka plan hazırlanamadı.'));
   worker.onmessageerror=()=>complete(Error('Arka plan verisi okunamadı.'));
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   onProgress(0);
   try{worker.postMessage({id});}catch(e){complete(e);}
 });
}
export function createWallTextures(wallId,widthM,heightM,pixels){
 const meta=BACKGROUND_SCENES.find(b=>b.id===normalizeWallId(wallId));
 const make=(bytes,isColor)=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=pixels.size;
   const ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(bytes,pixels.size,pixels.size),0,0);
   const tex=new THREE.CanvasTexture(canvas);if(isColor)tex.colorSpace=THREE.SRGBColorSpace;
   tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(Math.max(1,widthM/meta.tileM),Math.max(1,heightM/meta.tileM));tex.anisotropy=8;
   tex._disposeOnClear=true;return tex;
 };
 return {map:make(pixels.color,true),bumpMap:make(pixels.bump,false),roughness:meta.roughness,bumpScale:meta.bump*.015};
}
