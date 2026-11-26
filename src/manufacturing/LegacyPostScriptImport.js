// Read only static outline operators. No PostScript execution, eval, or IO.
import {pdfOperatorRings} from './PdfVectorImport.js';
import {groupRings} from './VectorFileImport.js';
const OPS={constructPath:1,moveTo:2,lineTo:3,curveTo:4,curveTo2:5,curveTo3:6,closePath:7,rectangle:8,fill:9,eoFill:10,stroke:11,closeStroke:12,fillStroke:13,closeFillStroke:14,save:15,restore:16,transform:17,endPath:18,clip:19,eoClip:20};

const SAFE_STYLE_OPS=new Set([
 'setrgbcolor','setcmykcolor','setgray','setlinewidth','setlinejoin','setlinecap','setmiterlimit','setdash',
 'w','j','J','M','d','k','K','g','G','Xa','XA','x','X','Xk','XK','Xx','XX','Xz','XZ',
 'i','D','A','R','O','W','Lb','LB','Ln','Ld','Lm','Lp','Lw','Lz','LN',
 'XR','Xw','XW','Ap','Ar','Ae','AE','Al','AL','As','AS',
 'Xm','Xy','XY','Xd','XD','Xq','XQ','Xs','XS','X!','X#','XH','Xh',
 'showpage','u','U','Adobe_Illustrator_AI5','Adobe_Illustrator_AI3','begin','end',
]);

function stripAiSetupAndComments(raw){
 const text=raw.replace(/\r\n?|\n/g,'\n');
 const marks=[...text.matchAll(/^%%(?:EndSetup|EndProlog|EndComments|Page:\s.*)\s*$/gm)];
 const mark=marks.find(x=>/^%%EndSetup/.test(x[0]))||marks.find(x=>/^%%Page:/.test(x[0]))||marks.find(x=>/^%%EndProlog/.test(x[0]))||marks[0];
 return text.slice(mark?mark.index+mark[0].length:0).split(/^%%(?:Trailer|EOF)\b/m)[0].replace(/^%.*$/gm,'');
}

function decodePsString(raw){
 if(typeof raw!=='string'||!raw.startsWith('(')||!raw.endsWith(')'))return null;
 return raw.slice(1,-1).replace(/\\([\\()])/g,'$1').replace(/\\n/g,' ').trim()||null;
}
function rgbToHex(r,g,b){
 const c=v=>Math.max(0,Math.min(255,Math.round((Number(v)||0)*255))).toString(16).padStart(2,'0');
 return '#'+c(r)+c(g)+c(b);
}
function cmykToHex(c,m,y,k){
 return rgbToHex((1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k));
}

function parseAiPathStream(body,ai,strict){
 const tokens=body.matchAll(/\((?:\\.|[^\\()])*\)|\[[^\]]*\]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|\*?[A-Za-z_][\w.!-]*\*?#?/g);
 let operands=[],types=[],nums=[],compound=0,compoundPaint=null,steps=0;
 let currentLayer=null,currentColor=null;
 const groupMeta=[];
 const list={fnArray:[],argsArray:[],paintMeta:groupMeta},emit=(op,args=[])=>{list.fnArray.push(op);list.argsArray.push(args);};
 const path=(type,values=[])=>{types.push(type);nums.push(...values);};
 const flush=()=>{if(types.length){emit(OPS.constructPath,[types,nums]);types=[];nums=[];}};
 const emitPaint=op=>{emit(op);groupMeta.push({layerName:currentLayer,color:currentColor});};
 const take=n=>{
  if(strict){
   if(operands.length!==n||!operands.every(Number.isFinite))throw Error('AI/EPS koordinat komutu geçersiz.');
   const v=operands;operands=[];return v;
  }
  if(operands.length<n)return null;
  const slice=operands.slice(operands.length-n);
  operands=[];
  return slice.every(Number.isFinite)?slice:null;
 };
 const peekNums=n=>{
  if(operands.length<n){operands=[];return null;}
  const slice=operands.slice(operands.length-n);
  operands=[];
  return slice.every(v=>typeof v==='number'&&Number.isFinite(v))?slice:null;
 };
 for(const match of tokens){
  if(++steps>5000000)throw Error('AI/EPS kontur karmaşıklığı güvenli işlem sınırını aşıyor.');
  const t=match[0],n=Number(t);
  if(Number.isFinite(n)){operands.push(n);continue;}
  if(t.startsWith('(')||t.startsWith('[')){operands.push(t);continue;}
  if(t==='m'||t==='moveto'){const v=take(2);if(v)path(OPS.moveTo,v);}
  else if(['l','L','lineto'].includes(t)){const v=take(2);if(v)path(OPS.lineTo,v);}
  else if(['c','C','curveto'].includes(t)){const v=take(6);if(v)path(OPS.curveTo,v);}
  else if((ai||!strict)&&['v','V'].includes(t)){const v=take(4);if(v)path(OPS.curveTo2,v);}
  else if((ai||!strict)&&['y','Y'].includes(t)){const v=take(4);if(v)path(OPS.curveTo3,v);}
  else if(t==='closepath'||t==='H'||t==='h'){take(0);path(OPS.closePath);}
  else if(t==='*u'){take(0);compound++;}
  else if(t==='*U'){
   take(0);
   if(compound<=0){if(strict)throw Error('AI bileşik konturu bozuk.');continue;}
   if(!--compound){flush();emitPaint(compoundPaint||OPS.eoFill);compoundPaint=null;}
  }else if(['f','F','f*','F*','fill','eofill','s','S','stroke','b','B','b*','B*','N','n','newpath','rectfill','rectstroke'].includes(t)){
   if(t==='rectfill'||t==='rectstroke'){const v=take(4);if(v)path(OPS.rectangle,v);}else take(0);
   if(['f','f*','s','b','b*','n'].includes(t))path(OPS.closePath);
   const op=['f','F','fill','rectfill'].includes(t)?OPS.fill:['f*','F*','eofill'].includes(t)?OPS.eoFill:['s','S','stroke','rectstroke'].includes(t)?OPS.stroke:['b','B','b*','B*'].includes(t)?OPS.fillStroke:OPS.endPath;
   flush();if(compound){if(op!==OPS.endPath)compoundPaint=op;}else if(op!==OPS.endPath)emitPaint(op);else emit(op);
  }else if(['gsave','grestore','q','Q'].includes(t)){take(0);flush();emit(t==='gsave'||t==='q'?OPS.save:OPS.restore);}
  else if(['translate','scale','rotate','concat'].includes(t)){
   let mat=null;
   if(t==='translate'){const v=take(2);if(v)mat=[1,0,0,1,v[0],v[1]];}
   else if(t==='scale'){const v=take(2);if(v)mat=[v[0],0,0,v[1],0,0];}
   else if(t==='rotate'){const v=take(1);if(v){const z=v[0]*Math.PI/180;mat=[Math.cos(z),Math.sin(z),-Math.sin(z),Math.cos(z),0,0];}}
   else if(t==='concat'){
    if(operands.length===1&&typeof operands[0]==='string'){
     const arr=operands.pop().slice(1,-1).trim().split(/\s+/).map(Number);
     if(arr.length===6&&arr.every(Number.isFinite))mat=arr;
    }else if(strict)throw Error('EPS matris geçersiz.');else operands=[];
    if(strict&&!mat)throw Error('EPS matris geçersiz.');
   }
   if(mat){flush();emit(OPS.transform,mat);}
  }else if(t==='Ln'){
   const s=operands.pop();operands=[];
   const decoded=decodePsString(s);
   if(decoded)currentLayer=decoded;
  }else if(t==='LB'){
   operands=[];currentLayer=null;
  }else if(['Xa','XA','setrgbcolor'].includes(t)){
   const v=peekNums(3);
   if(v&&(t==='Xa'||t==='setrgbcolor'||!currentColor))currentColor=rgbToHex(v[0],v[1],v[2]);
  }else if(['k','K','setcmykcolor'].includes(t)){
   const v=peekNums(4);
   if(v&&(t==='k'||t==='setcmykcolor'||!currentColor))currentColor=cmykToHex(v[0],v[1],v[2],v[3]);
  }else if(['g','G','setgray'].includes(t)){
   const v=peekNums(1);
   if(v&&(t==='g'||t==='setgray'||!currentColor))currentColor=rgbToHex(v[0],v[0],v[0]);
  }else if(SAFE_STYLE_OPS.has(t)||!strict){operands=[];}
  else throw Error('AI/EPS desteklenmeyen komut: '+t+'. Eksik kontur üretmemek için durduruldu.');
 }
 if(strict&&(compound||types.length||operands.length))throw Error('AI/EPS tamamlanmamış kontur.');
 if(!strict&&types.length){flush();emitPaint(OPS.fill);}
 return list;
}

function finalizeAiList(list,filename,ai,options,extraWarnings=[]){
 const decoded=pdfOperatorRings(list,OPS,options),scale=Number(options.scale??1),units={mm:1,cm:10,m:1000,in:25.4,px:25.4/96};
 const factor=options.unit&&options.unit!=='auto'?units[options.unit]/(25.4/72):1;
 if(!(scale>0&&scale<=1000&&factor>0))throw Error('Ölçek geçersiz.');
 const items=[];let count=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const ring of decoded.rings)for(const p of ring){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 for(let gIdx=0;gIdx<decoded.groups.length;gIdx++){
  const group=decoded.groups[gIdx],meta=list.paintMeta?.[gIdx]||null;
  const parsed=groupRings(group,filename,ai?'ai':'eps',factor*scale,[]);
  count+=parsed.contourCount;
  for(const item of parsed.items){
   items.push({
    ...item,
    id:'import_'+items.length,
    label:filename.replace(/\.[^.]+$/,'')+' · Parça '+(items.length+1),
    layerName:item.layerName||meta?.layerName||null,
    color:item.color||meta?.color||null,
   });
  }
 }
 if(!items.length)throw Error('AI/EPS dosyasında kapalı vektör konturu yok.');
 return {filename,format:ai?'ai':'eps',items,contourCount:count,widthMm:(maxX-minX)*factor*scale,heightMm:(maxY-minY)*factor*scale,warnings:[...extraWarnings,...decoded.warnings]};
}

export function importLegacyPostScript(text,filename,options={}){
 const norm=text.replace(/\r\n?|\n/g,'\n');
 if(!/^\s*%!PS(?:-Adobe)?/i.test(norm))throw Error('AI/EPS içeriği tanınmadı; özel Illustrator verisi olabilir.');
 const ai=/Adobe Illustrator|%AI[0-9]|Illustrator.*ProcSet/i.test(norm);
 const body=stripAiSetupAndComments(norm);
 if(/\b(?:exec|run|file|deletefile|renamefile|loop|repeat|forall|for|ifelse|if|image|colorimage|imagemask|show|ashow|glyphshow|charpath|clip|eoclip|def|bind|setmatrix|initmatrix|shfill|arc|arcn|arcto)\b|[{}]/.test(body))throw Error('AI/EPS karmaşık PostScript içeriyor; statik kontur okuyucu eksiksiz açamaz.');
 const list=parseAiPathStream(body,ai,true);
 return finalizeAiList(list,filename,ai,options,['AI/EPS: statik konturlar okundu; CNC öncesi ölçüleri doğrulayın.']);
}

/**
 * Last-resort tolerant contour extractor when both static PS reader and Ghostscript WASM fail.
 * Still enforces hard security rejection of PostScript file/process execution primitives.
 */
export function extractAiOutlineFallback(text,filename,options={}){
 const norm=text.replace(/\r\n?|\n/g,'\n');
 if(!/^\s*%!PS(?:-Adobe)?/i.test(norm))throw Error('AI/EPS içeriği tanınmadı.');
 const ai=/Adobe Illustrator|%AI[0-9]|Illustrator.*ProcSet/i.test(norm);
 let body=stripAiSetupAndComments(norm);
 if(/\b(?:run|file|deletefile|renamefile)\b/.test(body))throw Error('AI/EPS karmaşık PostScript içeriyor.');
 // Remove Illustrator text object blocks (To ... TO) and gradient definitions (Bd ... BD)
 body=body.replace(/^[ \t]*\d+[ \t]+To[\s\S]*?^[ \t]*TO\b.*$/gm,'');
 body=body.replace(/^[ \t]*[^\n]*\bBd\b[\s\S]*?^[ \t]*BD\b.*$/gm,'');
 // Strip inline procedure literals { ... }
 body=body.replace(/\{[^{}]*\}/g,' ');
 const list=parseAiPathStream(body,ai,false);
 return finalizeAiList(list,filename,ai,options,['AI/EPS: uyumluluk kurtarma okuyucusu ile açıldı; kesim öncesi ölçü ve konturları doğrulayın.']);
}
