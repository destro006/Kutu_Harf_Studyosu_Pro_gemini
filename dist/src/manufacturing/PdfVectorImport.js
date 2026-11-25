import {slicePdfBytes} from './VectorFormatDetect.js';
/**
 * Local, on-device PDF vector contour importer using self-hosted PDF.js.
 * It intentionally rejects image-only pages and un-outlined text for CNC use.
 * Geometries are converted from PDF points (1/72 in) to millimeters.
 */
const POINT_TO_MM = 25.4 / 72;
const ID = [1, 0, 0, 1, 0, 0];
const mul=(a,b)=>[
 a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
 a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
 a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
];
const apply=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
const closeEnough=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-5;
const area=r=>Math.abs(r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p.x*q.y-q.x*p.y},0))/2;

/** Interpret PDF.js path/graphics operators; exposed for regression testing. */
export function pdfOperatorRings(list, OPS, opts={}) {
 const toleranceMm=Math.max(.05,Number(opts.tolerance)||.5);
 const warnings=new Set();
 const completed=[],groups=[];
 let currentMatrix=ID,stack=[],subpaths=[],points=[],start=null,cur=null,closed=false;
 let totalPoints=0,hasText=false,hasImages=false;
 const pathOp={moveTo:OPS.moveTo,lineTo:OPS.lineTo,curveTo:OPS.curveTo,
  curveTo2:OPS.curveTo2,curveTo3:OPS.curveTo3,closePath:OPS.closePath,rectangle:OPS.rectangle};
 const pt=(x,y)=>apply(currentMatrix,x,y);
 const move=(p)=>{if(points.length>2)subpaths.push({points,closed});points=[p];start=p;cur=p;closed=false;};
 const append=(p)=>{if(!points.length){move(p);return}if(!closeEnough(points.at(-1),p)){points.push(p);totalPoints++;}cur=p;};
 const close=()=>{if(points.length>2){closed=true;}if(points.length){subpaths.push({points,closed});points=[];start=cur=null;closed=false;}};
 const curve=(c1,c2,end)=>{
  const a=cur||end;
  const len=Math.hypot(a.x-c1.x,a.y-c1.y)+Math.hypot(c1.x-c2.x,c1.y-c2.y)+Math.hypot(c2.x-end.x,c2.y-end.y);
  // Adaptive De Casteljau subdivision: flatness, not path length.
  const midpoint=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
  const dist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
    if(!l)return Math.hypot(p.x-a.x,p.y-a.y);
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
  const flatten=(a,b,c,d,depth)=>{
    if(depth>=18||Math.max(dist(b,a,d),dist(c,a,d))*POINT_TO_MM<=toleranceMm){append(d);return;}
    const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d),abc=midpoint(ab,bc),bcd=midpoint(bc,cd),mid=midpoint(abc,bcd);
    flatten(a,ab,abc,mid,depth+1);flatten(mid,bcd,cd,d,depth+1);
  };
  flatten(a,c1,c2,end,0);
 };
 const discard=()=>{subpaths=[];points=[];start=cur=null;closed=false;};
 const flush=(fill)=>{
  if(points.length){subpaths.push({points,closed});points=[];}
  const group=[];
  for(const sub of subpaths){
   const implicitlyClosed=sub.points.length>=4&&Math.hypot(sub.points[0].x-sub.points.at(-1).x,sub.points[0].y-sub.points.at(-1).y)<0.05;
   if(sub.points.length<3||(!fill&&!sub.closed&&!implicitlyClosed))continue;
   const pts=sub.points.slice();
   if(pts.length>2&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<0.05)pts.pop();
   const scaled=pts.map(p=>({x:p.x*POINT_TO_MM,y:p.y*POINT_TO_MM}));
   if(scaled.length>=3&&area(scaled)>.0001){completed.push(scaled);group.push(scaled);}
  }
  if(group.length)groups.push(group);
  discard();
 };
 const finishOps=new Set([OPS.stroke,OPS.closeStroke,OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
 const fillOps=new Set([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
 const closeOps=new Set([OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
 for(let i=0;i<(list?.fnArray?.length||0);i++){
  const op=list.fnArray[i], args=list.argsArray?.[i]||[];
  if(op===OPS.save){stack.push(currentMatrix.slice());continue}
  if(op===OPS.restore){currentMatrix=stack.pop()||ID;continue}
  if(op===OPS.transform){currentMatrix=mul(currentMatrix,args);continue}
  if(op===OPS.constructPath){
   const types=args[0]||[],nums=args[1]||[];let at=0;
   for(const cmd of types){
    if(cmd===pathOp.moveTo)move(pt(nums[at++],nums[at++]));
    else if(cmd===pathOp.lineTo)append(pt(nums[at++],nums[at++]));
    else if(cmd===pathOp.curveTo){const a=pt(nums[at++],nums[at++]),b=pt(nums[at++],nums[at++]),c=pt(nums[at++],nums[at++]);curve(a,b,c);}
    else if(cmd===pathOp.curveTo2){const b=pt(nums[at++],nums[at++]),c=pt(nums[at++],nums[at++]);curve(cur||b,b,c);}
    else if(cmd===pathOp.curveTo3){const b=pt(nums[at++],nums[at++]),c=pt(nums[at++],nums[at++]);curve(b,c,c);}
    else if(cmd===pathOp.rectangle){const x=nums[at++],y=nums[at++],w=nums[at++],h=nums[at++];move(pt(x,y));append(pt(x+w,y));append(pt(x+w,y+h));append(pt(x,y+h));close();}
    else if(cmd===pathOp.closePath)close();
   }
  }else if(finishOps.has(op)){
   if(closeOps.has(op))close();
   flush(fillOps.has(op));
  }else if(op===OPS.endPath){discard();}
  else if(op===OPS.clip||op===OPS.eoClip){warnings.add('PDF clipping masks are not applied; inspect contours before CNC cutting.');}
  else if([OPS.showText,OPS.showSpacedText,OPS.nextLineShowText,OPS.nextLineSetSpacingShowText].includes(op))hasText=true;
  else if([OPS.paintImageXObject,OPS.paintImageXObjectRepeat,OPS.paintInlineImageXObject].includes(op))hasImages=true;
  if(totalPoints>2_000_000)throw Error('PDF extremely complex: over 2 million contour points. Reduce curve tolerance or isolate pages.');
 }
 if(hasText)warnings.add('PDF contains live text. Convert all text to outlines before manufacturing; text is not converted automatically.');
 if(hasImages)warnings.add('PDF contains raster images. Images are not CNC cut contours.');
 return {rings:completed,groups,warnings:[...warnings]};
}

export async function importPdfFile(file, options={}, progress=()=>{},signal){
 const lib=globalThis.pdfjsLib;
 if(signal?.aborted)throw new DOMException('PDF içe aktarma iptal edildi.','AbortError');
 if(!lib?.getDocument)throw Error('Yerel PDF motoru yüklenemedi. PDF.js paketini kontrol edin.');
 lib.GlobalWorkerOptions.workerSrc = new URL('../../public/vendor/pdfjs/pdf.worker.min.js',import.meta.url).href;
 const raw=new Uint8Array(await file.arrayBuffer());
 const data=slicePdfBytes(raw);
 progress('PDF sayfaları çözülüyor…');
 const task=lib.getDocument({data,isEvalSupported:false,disableFontFace:true});
 const warnings=[],pages=[];
 const abort=()=>{task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  const pdf=await task.promise;
  for(let p=1;p<=pdf.numPages;p++){
   progress(`PDF vektörleri okunuyor: ${p}/${pdf.numPages}`);
   const page=await pdf.getPage(p);
   const opList=await page.getOperatorList();
   if(signal?.aborted)throw new DOMException('PDF içe aktarma iptal edildi.','AbortError');
   pages.push({fnArray:opList.fnArray,argsArray:opList.argsArray});
   page.cleanup();
   await new Promise(r=>setTimeout(r,0));
  }
 }finally{signal?.removeEventListener('abort',abort);await task.destroy();}
 return {filename:file.name,format:'pdf',pages,ops:lib.OPS,warnings};
}
