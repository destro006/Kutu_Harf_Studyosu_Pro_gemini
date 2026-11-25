import THREE from '../vendor/three.js';

/**
 * Architectural Wall & Scene Background Library
 * Preserves all 4 procedural diffuse + bump maps from the reference application
 * (Tuğla, Brüt beton, Ahşap çıta, Antrasit sıva) and extends with 4 new scenes
 * plus custom storefront photograph import.
 */

export const BACKGROUND_SCENES = [
  { id:'studioPremium',label:'Premium Grafit Stüdyo',category:'studio',roughness:.82,bump:.18,tileM:2.4,metalness:0,envMapIntensity:.45 },
  { id:'traverten',label:'Bej Traverten',category:'luxury',roughness:.74,bump:.55,tileM:1.6,metalness:0,envMapIntensity:.55 },
  { id:'kompozit',label:'Antrasit Kompozit Panel',category:'storefront',roughness:.36,bump:.30,tileM:1.8,metalness:.42,envMapIntensity:.85 },
  { id:'siyahMermer',label:'Nero Mermer',category:'luxury',roughness:.18,bump:.14,tileM:1.8,metalness:.04,envMapIntensity:.95 },
  { id:'cevizPanel',label:'Ceviz Ahşap Panel',category:'interior',roughness:.44,bump:.65,tileM:1.35,metalness:0,envMapIntensity:.60 },
  { id:'beyazSiva',label:'Venedik Kırık Beyaz Sıva',category:'wall',roughness:.78,bump:.24,tileM:2.0,metalness:0,envMapIntensity:.50 },
  { id: 'tugla', label: 'Loft Tuğla', category: 'wall', roughness: 0.90, bump: 1.35, tileM: 1.45, metalness: 0, envMapIntensity: 0.38 },
  { id: 'beton', label: 'Brüt Beton', category: 'wall', roughness: 0.88, bump: 0.80, tileM: 1.7, metalness: 0, envMapIntensity: 0.42 },
  { id: 'ahsap', label: 'Meşe Çıta Panel', category: 'wall', roughness: 0.56, bump: 1.30, tileM: 1.0, metalness: 0, envMapIntensity: 0.55 },
  { id: 'siva', label: 'Antrasit Mikrobeton', category: 'wall', roughness: 0.78, bump: 0.50, tileM: 1.7, metalness: 0, envMapIntensity: 0.48 },
  { id: 'mermer', label: 'Calacatta Mermer', category: 'luxury', roughness: 0.18, bump: 0.22, tileM: 1.8, metalness: 0.04, envMapIntensity: 0.95 },
  { id: 'vitrin', label: 'Bronz Mağaza Cephesi', category: 'storefront', roughness: 0.36, bump: 0.38, tileM: 1.8, metalness: 0.38, envMapIntensity: 0.90 },
  { id: 'resepsiyon', label: 'Yivli Taş Resepsiyon', category: 'interior', roughness: 0.62, bump: 0.95, tileM: 1.4, metalness: 0, envMapIntensity: 0.55 },
  { id: 'karanlikCephe', label: 'Bazalt Taş Cephe', category: 'luxury', roughness: 0.72, bump: 0.95, tileM: 1.6, metalness: 0.05, envMapIntensity: 0.52 },
  { id: 'studioNotr', label: 'Grej Galeri Stüdyosu', category: 'studio', roughness: 0.84, bump: 0.14, tileM: 2.2, metalness: 0, envMapIntensity: 0.48 },
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
export function computeWallRepeat(wallId,widthM,heightM,wallScale=1.0){
 const meta=BACKGROUND_SCENES.find(b=>b.id===normalizeWallId(wallId));
 const scale=Math.max(0.25,Math.min(2.5,Number(wallScale)||1.0));
 const effTile=Math.max(0.2,meta.tileM*scale);
 return {rx:Math.max(1,widthM/effTile),ry:Math.max(1,heightM/effTile)};
}
export function createWallTextures(wallId,widthM,heightM,pixels,wallScale=1.0){
 const meta=BACKGROUND_SCENES.find(b=>b.id===normalizeWallId(wallId));
 const {rx,ry}=computeWallRepeat(wallId,widthM,heightM,wallScale);
 const make=(bytes,isColor)=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=pixels.size;
   const ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(bytes,pixels.size,pixels.size),0,0);
   const tex=new THREE.CanvasTexture(canvas);if(isColor)tex.colorSpace=THREE.SRGBColorSpace;
   tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(rx,ry);tex.anisotropy=8;
   tex._disposeOnClear=true;return tex;
 };
 const roughnessMap=pixels.roughness?make(pixels.roughness,false):null;
 return {
   map:make(pixels.color,true),
   bumpMap:make(pixels.bump,false),
   roughnessMap,
   roughness:roughnessMap?1.0:meta.roughness,
   bumpScale:meta.bump*.015,
   metalness:meta.metalness||0,
   envMapIntensity:meta.envMapIntensity??0.55,
 };
}
