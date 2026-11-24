// Restricted to a same-origin, disposable worker and the engine's virtual filesystem.
import {extractPostScript} from './VectorFormatDetect.js';
export async function postScriptToPdf(bytes){
 const text=extractPostScript(bytes);
 if(!/^\s*%!PS-Adobe/.test(text))throw Error('AI içeriği PDF veya PostScript değil; özel Illustrator verisi desteklenmiyor.');
 const {initWGhostscript}=await import(new URL('../../public/vendor/cad/ghostscript-entry.js',import.meta.url).href);
 const gs=await initWGhostscript();
 // The public operation uses Ghostscript's pdfwrite pipeline, not a raster trace.
 try{
  const output=await gs.ops.psToPdf(new TextEncoder().encode(text));
  let data=output?.data??output?.pdf??output;
  if(data instanceof Blob)data=await data.arrayBuffer();
  if(data instanceof ArrayBuffer)data=new Uint8Array(data);
  if(!ArrayBuffer.isView(data)||new TextDecoder().decode(data.subarray(0,5))!=='%PDF-')throw Error('AI/EPS motoru geçerli PDF üretmedi.');
  return new Uint8Array(data);
 }finally{gs.dispose?.();}
}
