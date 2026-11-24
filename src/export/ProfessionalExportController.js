/** Unified multi-format export dispatcher. Always downloads genuinely encoded files. */
import {getExportFormat,formatSupportsSource} from './ExportFormatCatalog.js';
import {collectManufacturingContours,collectNestingContours,generateVectorPdf,generateVectorEps,generateVectorHpgl} from './Professional2DExport.js';
import {collectSignTriangles,writeStlAscii,writeStlBinary,writeObjMtl,writePly,writeGlb,writeGltf,write3mf} from './Professional3DExport.js';
import {convertPngDataUrl} from './RasterExport.js';
import {getExportSelection} from './ExportScope.js';
import {generateManufacturingSvg,generateManufacturingDxf,generateNestedSvg,generateNestedDxf,generateNestedCsv,downloadBlob,downloadDataUrl} from './ExportService.js';
import {generateNestedGcode,generateNestedHpgl,validateNestedProduction} from './CncGcodeExporter.js';
import {serializeProject} from '../core/projectSerializer.js';

const mime={pdf:'application/pdf',eps:'application/postscript',ps:'application/postscript',plt:'application/vnd.hp-hpgl',svg:'image/svg+xml',dxf:'application/dxf',csv:'text/csv',gcode:'text/plain',json:'application/json',obj:'text/plain',mtl:'text/plain',stl:'model/stl',stla:'model/stl',ply:'application/octet-stream',glb:'model/gltf-binary',gltf:'model/gltf+json','3mf':'model/3mf'};
function csvCell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"';}
export function formatManufacturingCsv(metrics){
  const rows=[['Parça','Nesne','Üretim Türü','Genişlik (mm)','Yükseklik (mm)','Derinlik (mm)','Dış Alan (mm²)','Kesim (mm)']];
  for(const m of metrics||[])rows.push([m.label,m.objectId,m.constructionType,m.boundsMm?.width||0,m.boundsMm?.height||0,m.depthMm||0,m.outerAreaMm2||0,m.cuttingLengthMm||0]);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
/**
 * source='design' | 'nestingActive' | 'nestingAll'
 * selectedOnly applies to original CAD objects; cannot be combined with nesting sheets.
 */
export async function runProfessionalExport({
  format,source='design',selectedOnly=false,resolution='2400x1500',state,metricsList=[],signEngine,
  activeSheetIdx=0,download=downloadBlob,downloadUrl=downloadDataUrl,
  confirmCnc=()=>true,
}) {
  const meta=getExportFormat(format);
  if(!meta)throw Error('Bilinmeyen dosya biçimi: '+format);
  if(!meta.ready)throw Error(meta.label+' için harici dönüştürücü gerekir. '+(meta.alt||'PDF')+' kullanın.');
  if(!formatSupportsSource(format,source))throw Error('Seçilen dosya biçimi bu çalışma kaynağıyla kullanılamıyor.');
  if(source!=='design'&&selectedOnly)throw Error('Yalnızca seçili nesneler için Tasarım kaynağını seçin.');
  const scope=getExportSelection(state,metricsList,selectedOnly);
  if(selectedOnly&&!scope.objectCount)throw Error('Önce en az bir görünür nesne seçin.');
  const root=String(state.projectName||'tabela').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
  const suffix=(selectedOnly?'_secili':'')+(source==='nestingActive'?'_levha_'+(activeSheetIdx+1):source==='nestingAll'?'_tum_levhalar':'');
  const base=root+suffix;
  const sheets=source==='design'?[]:source==='nestingActive'?[state.nesting?.sheets?.[activeSheetIdx]]:(state.nesting?.sheets||[]);
  if(source!=='design'&&(!sheets.length||sheets.some(x=>!x)))throw Error('Önce Nesting ekranında levhayı yerleştirin.');
  const contours=source==='design'?collectManufacturingContours(scope.metrics):collectNestingContours(sheets);
  const emit=(ext,data,type=mime[format]||'application/octet-stream')=>download(base+'.'+ext,data,type);
  const src3d=()=>{
    if(source!=='design')throw Error('3D dosyalar Tasarım kaynağından dışa aktarılır.');
    if(!signEngine?.signGroup)throw Error('3D model için WebGL önizlemesini açın.');
    return collectSignTriangles(signEngine.signGroup,scope.ids);
  };
  if(['png','transparentPng','jpg','webp','bmp'].includes(format)) {
    if(!signEngine?.capturePng)throw Error('Görsel çıktı için 3D önizlemeyi etkinleştirin.');
    const [width,height]=resolution.split('x').map(Number);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<100||height<100||width*height>16_400_000)throw Error('Görsel ebatı geçersiz veya çok büyük.');
    const dataUrl=signEngine.capturePng(width,height,{transparent:format==='transparentPng'||selectedOnly,selectedIds:scope.ids});
    if(['png','transparentPng'].includes(format))downloadUrl(base+(format==='transparentPng'?'_seffaf':'')+'.png',dataUrl);
    else {const {bytes,mime:type}=await convertPngDataUrl(dataUrl,format);emit(format,bytes,type);}
  } else if(format==='svg') {
    if(!contours.length)throw Error('SVG konturu bulunamadı.');emit('svg',source==='design'?generateManufacturingSvg(scope.metrics):generateNestedSvg(sheets));
  } else if(format==='dxf') {
    if(!contours.length)throw Error('DXF konturu bulunamadı.');
    emit('dxf',source==='design'?generateManufacturingDxf(scope.metrics).dxfText:generateNestedDxf(sheets));
  } else if(format==='pdf') emit('pdf',generateVectorPdf(contours));
  else if(format==='eps'||format==='ps')emit(format,generateVectorEps(contours));
  else if(format==='plt')emit('plt',source==='design'?generateVectorHpgl(contours):generateNestedHpgl(sheets));
  else if(format==='csv')emit('csv',source==='design'?formatManufacturingCsv(scope.metrics):generateNestedCsv(sheets));
  else if(format==='gcode') {
    const cfg=state.cnc||{};
    const validity=validateNestedProduction(sheets,cfg);
    if(!validity.valid)throw Error('Üretim doğrulaması başarısız: '+validity.issues.filter(x=>x.level==='critical').map(x=>x.msg).join('; '));
    if(!confirmCnc('G-code doğrudan üretim riski taşır. Takım, kerf, Z ve giriş-çıkış yollarını CAM tezgâhında kontrol ettiniz mi?'))return false;
    emit('nc',generateNestedGcode(sheets,cfg),'text/plain');
  } else if(format==='json')emit('khs.json',serializeProject(scope.state));
  else if(format==='stl')emit('stl',writeStlBinary(src3d()));
  else if(format==='stla')emit('stl',writeStlAscii(src3d()),'text/plain');
  else if(format==='glb')emit('glb',writeGlb(src3d()));
  else if(format==='gltf')emit('gltf',writeGltf(src3d()),mime.gltf);
  else if(format==='ply')emit('ply',writePly(src3d()),'text/plain');
  else if(format==='3mf')emit('3mf',write3mf(src3d()));
  else if(format==='obj') {
    const result=writeObjMtl(src3d(),base+'.mtl');
    emit('mtl',result.mtl,mime.mtl);
    emit('obj',result.obj,mime.obj);
  } else throw Error('Bu dışa aktarma biçimi henüz uygulamada uygulanmadı.');
  return true;
}
