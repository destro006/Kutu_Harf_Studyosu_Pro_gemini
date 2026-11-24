// Read only static outline operators. No PostScript execution, eval, or IO.
import {pdfOperatorRings} from './PdfVectorImport.js';
import {groupRings} from './VectorFileImport.js';
const OPS={constructPath:1,moveTo:2,lineTo:3,curveTo:4,curveTo2:5,curveTo3:6,closePath:7,rectangle:8,fill:9,eoFill:10,stroke:11,closeStroke:12,fillStroke:13,closeFillStroke:14,save:15,restore:16,transform:17,endPath:18,clip:19,eoClip:20};
export function importLegacyPostScript(text,filename,options={}){
 if(!/^\s*%!PS-Adobe/.test(text))throw Error('AI/EPS içeriği tanınmadı; özel Illustrator verisi olabilir.');
 const ai=/Adobe Illustrator|%AI[0-9]|Illustrator.*ProcSet/i.test(text);
 const marks=[...text.matchAll(/^%%(?:EndSetup|EndProlog|EndComments|Page:\s.*)\s*$/gm)];
 const mark=marks.find(x=>/^%%EndSetup/.test(x[0]))||marks.find(x=>/^%%Page:/.test(x[0]))||marks.find(x=>/^%%EndProlog/.test(x[0]))||marks[0];
 const body=text.slice(mark?mark.index+mark[0].length:0).split(/^%%(?:Trailer|EOF)\b/m)[0].replace(/^%.*$/gm,'');
 if(/\b(?:exec|run|file|deletefile|renamefile|loop|repeat|forall|for|ifelse|if|image|colorimage|imagemask|show|ashow|glyphshow|charpath|clip|eoclip|def|bind|setmatrix|initmatrix|shfill|arc|arcn|arcto)\b|[{}]/.test(body))throw Error('AI/EPS karmaşık PostScript içeriyor; statik kontur okuyucu eksiksiz açamaz.');
 const tokens=body.matchAll(/\((?:\\.|[^\\()])*\)|\[[^\]]*\]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|\*?[A-Za-z_][\w.-]*/g);
 let operands=[],types=[],nums=[],compound=0,compoundPaint=null,steps=0;
 const list={fnArray:[],argsArray:[]},emit=(op,args=[])=>{list.fnArray.push(op);list.argsArray.push(args);};
 const path=(type,values=[])=>{types.push(type);nums.push(...values);};
 const flush=()=>{if(types.length){emit(OPS.constructPath,[types,nums]);types=[];nums=[];}};
 const take=n=>{if(operands.length!==n||!operands.every(Number.isFinite))throw Error('AI/EPS koordinat komutu geçersiz.');const v=operands;operands=[];return v;};
 const style=new Set(['setrgbcolor','setcmykcolor','setgray','setlinewidth','setlinejoin','setlinecap','setmiterlimit','setdash','w','j','J','M','d','k','K','g','G','Xa','XA','x','X','i','D','A','R','O','W','Lb','LB','Ln','showpage','u','U','Adobe_Illustrator_AI5','Adobe_Illustrator_AI3','begin','end']);
 for(const match of tokens){
  if(++steps>5000000)throw Error('AI/EPS kontur karmaşıklığı güvenli işlem sınırını aşıyor.');
  const t=match[0],n=Number(t);
  if(Number.isFinite(n)){operands.push(n);continue;}
  if(t.startsWith('(')||t.startsWith('[')){operands.push(t);continue;}
  if(t==='m'||t==='moveto')path(OPS.moveTo,take(2));
  else if(['l','L','lineto'].includes(t))path(OPS.lineTo,take(2));
  else if(['c','C','curveto'].includes(t))path(OPS.curveTo,take(6));
  else if(ai&&['v','V'].includes(t))path(OPS.curveTo2,take(4));
  else if(ai&&['y','Y'].includes(t))path(OPS.curveTo3,take(4));
  else if(t==='closepath'||t==='H'||t==='h'){take(0);path(OPS.closePath);}
  else if(t==='*u'){take(0);compound++;}
  else if(t==='*U'){take(0);if(compound<=0)throw Error('AI bileşik konturu bozuk.');if(!--compound){flush();emit(compoundPaint||OPS.eoFill);compoundPaint=null;}}
  else if(['f','F','fill','eofill','s','S','stroke','b','B','N','n','newpath','rectfill','rectstroke'].includes(t)){
    if(t==='rectfill'||t==='rectstroke')path(OPS.rectangle,take(4));else take(0);
    if(['f','s','b','n'].includes(t))path(OPS.closePath);
    const op=['f','F','fill','rectfill'].includes(t)?OPS.fill:t==='eofill'?OPS.eoFill:['s','S','stroke','rectstroke'].includes(t)?OPS.stroke:['b','B'].includes(t)?OPS.fillStroke:OPS.endPath;
    flush();if(compound){if(op!==OPS.endPath)compoundPaint=op;}else emit(op);
  }else if(['gsave','grestore','q','Q'].includes(t)){take(0);flush();emit(t==='gsave'||t==='q'?OPS.save:OPS.restore);}
  else if(['translate','scale','rotate','concat'].includes(t)){
    let mat;
    if(t==='translate'){const [x,y]=take(2);mat=[1,0,0,1,x,y];}
    if(t==='scale'){const [x,y]=take(2);mat=[x,0,0,y,0,0];}
    if(t==='rotate'){const [d]=take(1),z=d*Math.PI/180;mat=[Math.cos(z),Math.sin(z),-Math.sin(z),Math.cos(z),0,0];}
    if(t==='concat'){if(operands.length!==1||typeof operands[0]!=='string')throw Error('EPS matris geçersiz.');mat=operands.pop().slice(1,-1).trim().split(/\s+/).map(Number);if(mat.length!==6||!mat.every(Number.isFinite))throw Error('EPS matris geçersiz.');}
    flush();emit(OPS.transform,mat);
  }else if(style.has(t)){operands=[];}else throw Error('AI/EPS desteklenmeyen komut: '+t+'. Eksik kontur üretmemek için durduruldu.');
 }
 if(compound||types.length||operands.length)throw Error('AI/EPS tamamlanmamış kontur.');
 const decoded=pdfOperatorRings(list,OPS,options),scale=Number(options.scale??1),units={mm:1,cm:10,m:1000,in:25.4,px:25.4/96};
 const factor=options.unit&&options.unit!=='auto'?units[options.unit]/(25.4/72):1;
 if(!(scale>0&&scale<=1000&&factor>0))throw Error('Ölçek geçersiz.');
 const items=[];let count=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const ring of decoded.rings)for(const p of ring){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 for(const group of decoded.groups){const parsed=groupRings(group,filename,ai?'ai':'eps',factor*scale,[]);count+=parsed.contourCount;for(const item of parsed.items)items.push({...item,id:'import_'+items.length,label:filename.replace(/\.[^.]+$/,'')+' · Parça '+(items.length+1)});}
 if(!items.length)throw Error('AI/EPS dosyasında kapalı vektör konturu yok.');
 return {filename,format:ai?'ai':'eps',items,contourCount:count,widthMm:(maxX-minX)*factor*scale,heightMm:(maxY-minY)*factor*scale,warnings:['AI/EPS: statik konturlar okundu; CNC öncesi ölçüleri doğrulayın.',...decoded.warnings]};
}