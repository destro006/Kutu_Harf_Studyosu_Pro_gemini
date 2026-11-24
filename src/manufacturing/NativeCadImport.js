// Local-only binary vector engines. Worker loads just the requested format.
import {importDxfText,importSvgText} from './VectorFileImport.js';
const asset=name=>new URL('../../public/vendor/cad/'+name,import.meta.url);
async function wasmBytes(name){
 const url=asset(name);
 if(url.protocol==='file:'){
   // Node-only regression harness; the browser branch performs a same-origin GET.
   const {readFile}=await import('node:fs/promises');return readFile(url);
 }
 const response=await fetch(url);if(!response.ok)throw Error('CAD motoru yüklenemedi: '+name);return response.arrayBuffer();
}
async function convertDwgViaWriter(bytes,progress=()=>{}){
 progress('LibreDWG motoru yükleniyor…');
 const mod=await import(asset('libredwg-web.js').href);
 const create=mod.createModule||mod.default;
 if(typeof create!=='function')throw Error('LibreDWG başlatılamadı.');
 const wasmBinary=await wasmBytes('libredwg-web.wasm');
 const engine=await create({wasmBinary,locateFile:()=>asset('libredwg-web.wasm').href,print:()=>{},printErr:()=>{}});
 progress('DWG çizimi yerel olarak çözülüyor…');
 engine.FS.writeFile('input.dwg',new Uint8Array(bytes));
 try{
  if(typeof engine.dwg_write_dxf!=='function')throw Error('LibreDWG DXF dönüştürme işlevi bulunamadı.');
  const code=engine.dwg_write_dxf('input.dwg','output.dxf');
  if(code!==0)throw Error('LibreDWG dönüşümü tamamlanamadı (kod '+code+').');
  return new TextDecoder().decode(engine.FS.readFile('output.dxf'));
 }finally{for(const p of ['input.dwg','output.dxf'])try{engine.FS.unlink(p);}catch{}}
}
// The native writer can trap on some older DWGs. Decode the model database
// independently and normalize supported planar entities to a minimal DXF.
export function dwgDatabaseToDxf(db){
 const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70',String(db.header?.INSUNITS||0),'0','ENDSEC','0','SECTION','2','ENTITIES'];
 const emit=(k,v)=>{if(typeof v==='number'&&!Number.isFinite(v))throw Error('DWG koordinatı geçersiz.');lines.push(String(k),String(v));};
 const xy=(p,x=10,y=20)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('DWG koordinatı eksik.');emit(x,p.x);emit(y,p.y);};
 const warnings=new Set();
 for(const e of db.entities||[]){
  if(e.extrusionDirection&&(Math.abs(e.extrusionDirection.x||0)>1e-8||Math.abs(e.extrusionDirection.y||0)>1e-8||e.extrusionDirection.z<0)){warnings.add(e.type+' (düzlem dışı)');continue;}
  if(e.type==='LWPOLYLINE'||e.type==='POLYLINE2D'||e.type==='POLYLINE'){
    const pts=e.vertices||[],closed=e.type==='LWPOLYLINE'?!!(e.flag&512):!!(e.flag&1);
    if(pts.length<3||!closed){warnings.add(e.type+' (açık)');continue;}
    emit(0,'LWPOLYLINE');emit(90,pts.length);emit(70,1);
    for(const pt of pts){xy(pt);emit(42,Number(pt.bulge)||0);}
  }else if(e.type==='CIRCLE'){emit(0,'CIRCLE');xy(e.center);emit(40,e.radius);}
  else if(e.type==='LINE'){emit(0,'LINE');xy(e.startPoint);xy(e.endPoint,11,21);}
  else warnings.add(e.type);
 }
 emit(0,'ENDSEC');emit(0,'EOF');
 return {text:lines.join('\n'),warnings:[...warnings].map(x=>'DWG doğrudan okuyucu: kesim dışı veya desteklenmeyen öğe '+x)};
}
async function readDwgDatabase(bytes){
 const {LibreDwg,Dwg_File_Type}=await import(asset('libredwg-api.js').href);
 const wasmDir=asset('libredwg-web.wasm');
 const base=wasmDir.protocol==='file:'?decodeURIComponent(new URL('.',wasmDir).pathname).replace(/\/$/,''):new URL('.',wasmDir).href.replace(/\/$/,'');
 const decoder=await LibreDwg.create(base);
 const ptr=decoder.dwg_read_data(bytes,Dwg_File_Type.DWG);
 if(!ptr)throw Error('DWG veri tabanı okunamadı.');
 try{return dwgDatabaseToDxf(decoder.convert(ptr));}finally{decoder.dwg_free(ptr);}
}
export async function convertDwg(bytes,progress=()=>{}){
 try{return await convertDwgViaWriter(bytes,progress);}
 catch(e){progress('Eski DWG sürümü doğrudan geometri okuyucuyla deneniyor…');return (await readDwgDatabase(bytes)).text;}
}
export async function convertCdr(bytes,progress=()=>{}){
 progress('CorelDRAW vektör motoru yükleniyor…');
 const {WASI,File,OpenFile,PreopenDirectory,unzipSync}=await import(asset('cdr-runtime.js').href);
 const module=await WebAssembly.compile(await wasmBytes('cdr2svg.wasm'));
 const run=async input=>{
  const stdout=new File(new Uint8Array()),stderr=new File(new Uint8Array());
  const wasi=new WASI(['cdr2svg','/input.cdr'],[],[new OpenFile(new File(new Uint8Array())),new OpenFile(stdout),new OpenFile(stderr),new PreopenDirectory('/',[['input.cdr',new File(input)]])]);
  const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});
  const code=wasi.start(instance);
  if(code!==0)throw Error('libcdr dosyayı okuyamadı (kod '+code+').');
  return new TextDecoder().decode(stdout.data);
 };
 progress('CDR vektörleri yerel olarak çözülüyor…');
 const data=new Uint8Array(bytes);
 let svg;
 try{svg=await run(data);}
 catch(error){
  // Some CorelDRAW archives wrap a traditional RIFF document.
  if(data[0]!==80||data[1]!==75)throw error;
  const zip=unzipSync(data,{filter:e=>/^(?:content\/)?riffData\.cdr$/i.test(e.name)&&e.originalSize<=128*1024*1024});
  const riff=Object.values(zip)[0];if(!riff)throw error;svg=await run(riff);
 }
 if(!/<(?:\w+:)?svg\b/i.test(svg))throw Error('CDR motoru SVG konturu üretmedi.');
 return svg;
}
export function cleanCdrSvg(svg){
 // The converter can emit a preview bitmap. Never trace a bitmap for CNC.
 // Ignore only preview images; reject other active/unsupported geometry in the
 // strict downstream parser. The string is never mounted as HTML.
 const warnings=[];
 if(/<(?:\w+:)?image\b/i.test(svg)){warnings.push('CDR içindeki raster görseller kesim konturu değildir; atlandı.');svg=svg.replace(/<(?:\w+:)?image\b(?:"[^"]*"|'[^']*'|[^'">])*\s*\/>/gi,'').replace(/<(?:\w+:)?image\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/(?:\w+:)?image\s*>/gi,'');}
 if(/<(?:\w+:)?text\b/i.test(svg))warnings.push('CDR canlı yazıları kesim konturu olarak alınmaz; eğriye dönüştürülmüş yazılar kullanın.');
 // Strip only a static standard SVG declaration; never accept internal entities.
 svg=svg.replace(/<!DOCTYPE\s+svg\s+PUBLIC\s+"[^"\[]*"\s+"[^"\[]*"\s*>/i,'');
 return {svg,warnings};
}
export async function importNativeCad(bytes,filename,kind,options={},progress=()=>{}){
 let result;
 if(kind==='dwg'){
  let converted;
  try{converted={text:await convertDwgViaWriter(bytes,progress),warnings:[]};}
  catch(e){progress('DWG model geometrisi doğrudan okunuyor…');converted=await readDwgDatabase(bytes);}
  progress('DWG kapalı kesim konturları hazırlanıyor…');
  result=importDxfText(converted.text,filename,options);result.warnings.push(...converted.warnings);
  result.warnings.push('DWG: model alanındaki desteklenen 2B kesim konturları okundu; blok, spline ve diğer öğe uyarılarını kontrol edin.');
 }else if(kind==='cdr'){
  const converted=cleanCdrSvg(await convertCdr(bytes,progress));
  progress('CDR kapalı kesim konturları hazırlanıyor…');
  result=importSvgText(converted.svg,filename,options);
  result.warnings.push(...converted.warnings,'CDR: ilk sayfa okundu; çok sayfalı belgeleri ayrı kontrol edin.');
 }else throw Error('Bilinmeyen CAD motoru.');
 return {...result,format:kind,filename};
}