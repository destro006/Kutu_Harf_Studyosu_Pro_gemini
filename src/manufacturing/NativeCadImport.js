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
// independently and normalize supported planar entities (including BLOCKS/INSERT,
// ARC, ELLIPSE, SPLINE) to a standard ASCII DXF.
export function dwgDatabaseToDxf(db){
 const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70',String(db.header?.INSUNITS||0),'0','ENDSEC','0','SECTION'];
 const emit=(k,v)=>{if(typeof v==='number'&&!Number.isFinite(v))throw Error('DWG koordinatı geçersiz.');lines.push(String(k),String(v));};
 const xy=(p,x=10,y=20)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('DWG koordinatı eksik.');emit(x,p.x);emit(y,p.y);};
 const warnings=new Set();

 const emitEntity=(e)=>{
  if(e.extrusionDirection&&(Math.abs(e.extrusionDirection.x||0)>1e-8||Math.abs(e.extrusionDirection.y||0)>1e-8||e.extrusionDirection.z<0)){warnings.add(e.type+' (düzlem dışı)');return;}
  if(e.type==='LWPOLYLINE'||e.type==='POLYLINE2D'||e.type==='POLYLINE'){
    const pts=e.vertices||[];
    if(pts.length<2)return;
    const flagClosed=e.type==='LWPOLYLINE'?!!(e.flag&512)||!!(e.flag&1):!!(e.flag&1);
    const implicitClosed=pts.length>=3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<0.05;
    emit(0,'LWPOLYLINE');emit(90,pts.length);emit(70,(flagClosed||implicitClosed)?1:0);
    for(const pt of pts){xy(pt);emit(42,Number(pt.bulge)||0);}
  }else if(e.type==='CIRCLE'){
    emit(0,'CIRCLE');xy(e.center);emit(40,e.radius);
  }else if(e.type==='ARC'){
    emit(0,'ARC');xy(e.center);emit(40,e.radius);
    emit(50,((e.startAngle||0)*180)/Math.PI);emit(51,((e.endAngle||0)*180)/Math.PI);
  }else if(e.type==='ELLIPSE'){
    emit(0,'ELLIPSE');xy(e.center);xy(e.majorAxisEndPoint,11,21);
    emit(40,Number(e.axisRatio??1));
    emit(41,Number(e.startAngle??0));
    emit(42,Number(e.endAngle??Math.PI*2));
  }else if(e.type==='SPLINE'){
    const ctrl=e.controlPoints||[],fit=e.fitPoints||[];
    emit(0,'SPLINE');emit(70,Number(e.flag??0));emit(71,Number(e.degree??3));
    emit(72,(e.knots||[]).length);emit(73,ctrl.length);emit(74,fit.length);
    for(const k of (e.knots||[]))emit(40,Number(k));
    for(let idx=0;idx<ctrl.length;idx++){xy(ctrl[idx],10,20);if(e.weights?.[idx]!=null)emit(41,Number(e.weights[idx]));}
    for(const fp of fit)xy(fp,11,21);
  }else if(e.type==='LINE'){
    emit(0,'LINE');xy(e.startPoint);xy(e.endPoint,11,21);
  }else if(e.type==='SOLID'||e.type==='3DFACE'){
    const c=[e.corner1,e.corner2,e.corner3,e.corner4||e.corner3].filter(Boolean);
    if(c.length>=3){emit(0,'LWPOLYLINE');emit(90,c.length);emit(70,1);for(const pt of c)xy(pt);}
  }else if(e.type==='INSERT'&&e.name){
    emit(0,'INSERT');emit(2,e.name);
    xy(e.insertionPoint||{x:0,y:0});
    emit(41,Number(e.xScale??e.scale?.x??1)||1);
    emit(42,Number(e.yScale??e.scale?.y??1)||1);
    emit(50,((e.rotation||0)*180)/Math.PI);
    if(e.columnCount>1){emit(70,e.columnCount);emit(44,Number(e.columnSpacing||0));}
    if(e.rowCount>1){emit(71,e.rowCount);emit(45,Number(e.rowSpacing||0));}
  }else warnings.add(e.type);
 };

 const blocks=(db.tables?.BLOCK_RECORD?.entries||[]).filter(b=>b?.name&&!/^\*(?:Model_Space|Paper_Space)/i.test(b.name)&&b.entities?.length);
 if(blocks.length){
  lines.push('2','BLOCKS');
  for(const b of blocks){
   emit(0,'BLOCK');emit(2,b.name);xy(b.basePoint||{x:0,y:0});
   for(const ent of b.entities)emitEntity(ent);
   emit(0,'ENDBLK');
  }
  emit(0,'ENDSEC');emit(0,'SECTION');
 }
 lines.push('2','ENTITIES');
 for(const e of db.entities||[])emitEntity(e);
 emit(0,'ENDSEC');emit(0,'EOF');
 return {text:lines.join('\n'),warnings:[...warnings].map(x=>'DWG doğrudan okuyucu: kesim dışı veya desteklenmeyen öğe '+x)};
}
async function readDwgDatabase(bytes){
 const {LibreDwg,Dwg_File_Type}=await import(asset('libredwg-api.js').href);
 const wasmDir=asset('libredwg-web.wasm');
 let base;
 if(wasmDir.protocol==='file:'){
   const {fileURLToPath}=await import('node:url');
   base=fileURLToPath(new URL('.',wasmDir)).replace(/[\\/]$/,'');
 }else{
   base=new URL('.',wasmDir).href.replace(/\/$/,'');
 }
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
  if(code!==0){
   const errTxt=new TextDecoder().decode(stderr.data).trim().slice(0,180);
   throw Error('libcdr dosyayı okuyamadı (kod '+code+(errTxt?': '+errTxt:'')+').');
  }
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

function inlineLocalSvgUses(svg){
 const idMap=new Map();
 const idRe=/<([A-Za-z_][\w:.-]*)\b([^>]*?\bid\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*)>/gi;
 let m;
 while((m=idRe.exec(svg))){
  const tag=m[1],id=m[3]||m[4];
  const openTag=m[0];
  if(/\/>\s*$/.test(openTag)){idMap.set(id,openTag);continue;}
  let depth=1,pos=m.index+openTag.length;
  const tagScan=new RegExp(`<(\\/)?${tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b[^>]*>`,'gi');
  tagScan.lastIndex=pos;
  let innerMatch;
  while((innerMatch=tagScan.exec(svg))){
   if(innerMatch[1])depth--;
   else if(!/\/>\s*$/.test(innerMatch[0]))depth++;
   if(depth===0){
    const raw=svg.slice(m.index,innerMatch.index+innerMatch[0].length);
    idMap.set(id,tag.toLowerCase()==='symbol'?raw.replace(/^<symbol\b/i,'<g').replace(/<\/symbol\s*>$/i,'</g>'):raw);
    break;
   }
  }
 }
 if(!idMap.size)return svg;
 let out=svg;
 for(let pass=0;pass<6;pass++){
  let changed=false;
  out=out.replace(/<(?:\w+:)?use\b([^>]*?)(?:\s*\/>|>[\s\S]*?<\/(?:\w+:)?use\s*>)/gi,(full,attrs)=>{
   const hrefM=attrs.match(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   const ref=(hrefM?.[1]??hrefM?.[2]??'').trim();
   if(!ref.startsWith('#'))return full; // Keep external refs untouched for security blocker
   const target=idMap.get(ref.slice(1));
   if(!target)return '';
   const xM=attrs.match(/\bx\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   const yM=attrs.match(/\by\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   const trM=attrs.match(/\btransform\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   const x=Number(xM?.[1]??xM?.[2]??0)||0,y=Number(yM?.[1]??yM?.[2]??0)||0;
   const tr=[trM?.[1]??trM?.[2]??'',(x||y)?`translate(${x},${y})`:''].filter(Boolean).join(' ');
   changed=true;
   return `<g${tr?` transform="${tr.replace(/"/g,'&quot;')}"`:''}>${target}</g>`;
  });
  if(!changed)break;
 }
 return out;
}

export function cleanCdrSvg(svg){
 // The converter can emit preview bitmaps, filters, patterns, or internal <use>
 // clones. Never trace a bitmap for CNC; strip non-cutting metadata cleanly
 // while preserving security rejection for any external references or entities.
 const warnings=[];
 if(/<(?:\w+:)?image\b/i.test(svg)){
  warnings.push('CDR içindeki raster görseller kesim konturu değildir; atlandı.');
  svg=svg.replace(/<(?:\w+:)?image\b(?:"[^"]*"|'[^']*'|[^'">])*\s*\/>/gi,'').replace(/<(?:\w+:)?image\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/(?:\w+:)?image\s*>/gi,'');
 }
 if(/<(?:\w+:)?(?:filter|pattern)\b/i.test(svg)){
  svg=svg.replace(/<(?:\w+:)?filter\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/(?:\w+:)?filter\s*>/gi,'')
         .replace(/<(?:\w+:)?pattern\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/(?:\w+:)?pattern\s*>/gi,'');
 }
 svg=inlineLocalSvgUses(svg);
 if(/<(?:\w+:)?text\b/i.test(svg))warnings.push('CDR canlı yazıları kesim konturu olarak alınmaz; eğriye dönüştürülmüş yazılar kullanın.');
 // Strip only static <!DOCTYPE svg ...> without internal DTD entity subsets ([...]).
 svg=svg.replace(/<!DOCTYPE\s+svg(?:\s+(?:PUBLIC|SYSTEM)\s+(?:"[^"\[]*"|'[^'\[]*')(?:\s+(?:"[^"\[]*"|'[^'\[]*'))?)?\s*>/gi,'');
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
  result.warnings.push('DWG: model alanındaki 2B kesim konturları (ARC/ELLIPSE/SPLINE/BLOCK dahil) okundu.');
 }else if(kind==='cdr'){
  const converted=cleanCdrSvg(await convertCdr(bytes,progress));
  progress('CDR kapalı kesim konturları hazırlanıyor…');
  result=importSvgText(converted.svg,filename,options);
  result.warnings.push(...converted.warnings,'CDR: ilk sayfa okundu; çok sayfalı belgeleri ayrı kontrol edin.');
 }else throw Error('Bilinmeyen CAD motoru.');
 return {...result,format:kind,filename};
}
