/**
 * Safe, browser-only manufacturing contour import. All returned coordinates are millimeters.
 * No silent fallback for CDR/AI/PDF/EPS/DWG: those need verified native converters.
 */
export const VECTOR_INPUT_FORMATS=[
 {id:'svg',ext:'.svg',label:'SVG · Gerçek vektör',ready:true},
 {id:'pdf',ext:'.pdf',label:'PDF · Yerel PDF.js vektör konturları',ready:true},
 {id:'dxf',ext:'.dxf',label:'AutoCAD DXF · Kesim konturları',ready:true},
 {id:'plt',ext:'.plt',label:'HPGL/PLT · Plotter konturları',ready:true},
 {id:'hpgl',ext:'.hpgl',label:'HPGL · Plotter konturları',ready:true},
 ...['eps','ps','ai','cdr','dwg','wmf','emf','cgm','cmx','svgz','afdesign','sketch'].map(id=>({id,ext:'.'+id,label:id.toUpperCase()+' · Harici dönüştürme gerekli',ready:false})),
];
const D=1e-9;
const round=v=>Math.round(v*1000)/1000;
const signedArea=ring=>ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p.x*q.y-q.x*p.y},0)/2;
const inside=(p,ring)=>{let value=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)value=!value;}return value};
const bounds=ring=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of ring){if(p.x<minX)minX=p.x;if(p.y<minY)minY=p.y;if(p.x>maxX)maxX=p.x;if(p.y>maxY)maxY=p.y;}return {minX,minY,maxX,maxY};};
const clean=ring=>{let out=[];for(const p of ring){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Vektör koordinatı geçersiz.');if(!out.length||Math.hypot(p.x-out.at(-1).x,p.y-out.at(-1).y)>1e-5)out.push({x:p.x,y:p.y});}if(out.length>1&&Math.hypot(out[0].x-out.at(-1).x,out[0].y-out.at(-1).y)<1e-4)out.pop();return out};
const matMul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const apply=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const I=[1,0,0,1,0,0];
export function svgTransform(value) {
 let m=I;const re=/([a-zA-Z]+)\s*\(([^)]*)\)/g;let x;
 while((x=re.exec(value||''))){const a=x[2].split(/[\s,]+/).filter(Boolean).map(Number);let t=I;
 switch(x[1].toLowerCase()){
 case 'matrix':if(a.length!==6)throw Error('Geçersiz SVG matrix dönüşümü.');t=a;break;
 case 'translate':t=[1,0,0,1,a[0]||0,a[1]||0];break;
 case 'scale':t=[a[0]??1,0,0,a[1]??a[0]??1,0,0];break;
 case 'rotate': {const z=(a[0]||0)*Math.PI/180,c=Math.cos(z),s=Math.sin(z);t=[c,s,-s,c,0,0];if(a.length>2)t=matMul(matMul([1,0,0,1,a[1],a[2]],t),[1,0,0,1,-a[1],-a[2]]);break;}
 case 'skewx':t=[1,0,Math.tan((a[0]||0)*Math.PI/180),1,0,0];break;
 case 'skewy':t=[1,Math.tan((a[0]||0)*Math.PI/180),0,1,0,0];break;
 default: throw Error('Desteklenmeyen SVG dönüşümü: '+x[1]);
 }m=matMul(m,t);
 }return m;
}
function sampleArc(a,rx,ry,angle,large,sweep,b){
 rx=Math.abs(rx);ry=Math.abs(ry);if(rx<1e-8||ry<1e-8)return[b];
 const phi=angle*Math.PI/180,cp=Math.cos(phi),sp=Math.sin(phi);
 const dx=(a.x-b.x)/2,dy=(a.y-b.y)/2;
 let x1=cp*dx+sp*dy,y1=-sp*dx+cp*dy;
 let lam=x1*x1/(rx*rx)+y1*y1/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam)}
 const sign=large===sweep?-1:1,nom=Math.max(0,(rx*rx*ry*ry-rx*rx*y1*y1-ry*ry*x1*x1));
 const denom=rx*rx*y1*y1+ry*ry*x1*x1||1;const coef=sign*Math.sqrt(nom/denom);
 const cxp=coef*rx*y1/ry,cyp=-coef*ry*x1/rx;
 const cx=cp*cxp-sp*cyp+(a.x+b.x)/2,cy=sp*cxp+cp*cyp+(a.y+b.y)/2;
 const vec=(u,v)=>Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
 const u=[(x1-cxp)/rx,(y1-cyp)/ry],v=[(-x1-cxp)/rx,(-y1-cyp)/ry];
 const start=vec([1,0],u);let delta=vec(u,v);
 if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
 const steps=Math.min(256,Math.max(8,Math.ceil(Math.abs(delta)*Math.max(rx,ry)/2)));
 return Array.from({length:steps},(_,i)=>{let z=start+delta*(i+1)/steps;return {x:cx+cp*rx*Math.cos(z)-sp*ry*Math.sin(z),y:cy+sp*rx*Math.cos(z)+cp*ry*Math.sin(z)}});
}
/** Pure SVG path-data flattener supporting M/L/H/V/C/S/Q/T/A/Z, including holes. */
export function svgPathRings(d, tolerance=1.5) {
 const tokens=(d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)||[]);
 let i=0,cmd='',curr={x:0,y:0},start={x:0,y:0},pts=[],rings=[],prevCmd='',prevC=null,prevQ=null,guard=0;
 const isCmd=t=>/^[a-zA-Z]$/.test(t||'');const count=n=>i+n<=tokens.length&&tokens.slice(i,i+n).every(x=>!isCmd(x));
 const nums=n=>{if(!count(n))throw Error('Eksik SVG path koordinatı.');return Array.from({length:n},()=>Number(tokens[i++]));};
 const point=(x,y,rel)=>({x:x+(rel?curr.x:0),y:y+(rel?curr.y:0)});
 const endRing=()=>{const cleaned=clean(pts);if(cleaned.length>=3&&Math.abs(signedArea(cleaned))>0.0001)rings.push(cleaned);pts=[]};
 const push=p=>{pts.push(p);curr=p};
 while(i<tokens.length){if(++guard>5000000)throw Error('SVG path birincil kontur başına çok karmaşık; dosyayı daha küçük üretim parçalara ayırın.');if(isCmd(tokens[i]))cmd=tokens[i++];if(!cmd)throw Error('SVG path komutu bulunamadı.');
 const lower=cmd.toLowerCase(),rel=cmd!==cmd.toUpperCase();
 if(lower==='z'){if(pts.length)endRing();curr={...start};prevC=prevQ=null;prevCmd='z';cmd='';continue;}
 if(lower==='m'){const [x,y]=nums(2);const p=point(x,y,rel);if(pts.length)pts=[];push(p);start=p;cmd=rel?'l':'L';prevC=prevQ=null;prevCmd='m';continue;}
 if(lower==='l'){const [x,y]=nums(2);push(point(x,y,rel));}
 else if(lower==='h'){const [x]=nums(1);push({x:rel?curr.x+x:x,y:curr.y});}
 else if(lower==='v'){const [y]=nums(1);push({x:curr.x,y:rel?curr.y+y:y});}
 else if(lower==='c'||lower==='s'){let c1,c2,p;if(lower==='c'){const a=nums(6);c1=point(a[0],a[1],rel);c2=point(a[2],a[3],rel);p=point(a[4],a[5],rel)}else{const a=nums(4);c1=['c','s'].includes(prevCmd)&&prevC?{x:2*curr.x-prevC.x,y:2*curr.y-prevC.y}:{...curr};c2=point(a[0],a[1],rel);p=point(a[2],a[3],rel)}const a={...curr};const length=Math.hypot(p.x-a.x,p.y-a.y)+Math.hypot(c1.x-a.x,c1.y-a.y)+Math.hypot(c2.x-p.x,c2.y-p.y);const steps=Math.min(256,Math.max(8,Math.ceil(length/Math.max(.5,tolerance))));for(let k=1;k<=steps;k++){const t=k/steps,q=1-t;push({x:q*q*q*a.x+3*q*q*t*c1.x+3*q*t*t*c2.x+t*t*t*p.x,y:q*q*q*a.y+3*q*q*t*c1.y+3*q*t*t*c2.y+t*t*t*p.y})}prevC=c2;}
 else if(lower==='q'||lower==='t'){let c,p;if(lower==='q'){const a=nums(4);c=point(a[0],a[1],rel);p=point(a[2],a[3],rel)}else{const a=nums(2);c=['q','t'].includes(prevCmd)&&prevQ?{x:2*curr.x-prevQ.x,y:2*curr.y-prevQ.y}:{...curr};p=point(a[0],a[1],rel)}const a={...curr};const steps=Math.min(128,Math.max(8,Math.ceil((Math.hypot(p.x-a.x,p.y-a.y)+Math.hypot(c.x-a.x,c.y-a.y))/Math.max(.5,tolerance))));for(let k=1;k<=steps;k++){let t=k/steps,q=1-t;push({x:q*q*a.x+2*q*t*c.x+t*t*p.x,y:q*q*a.y+2*q*t*c.y+t*t*p.y})}prevQ=c;}
 else if(lower==='a'){const a=nums(7),p=point(a[5],a[6],rel);for(const x of sampleArc(curr,a[0],a[1],a[2],!!a[3],!!a[4],p))push(x);}
 else if(!['c','s','q','t'].includes(lower))throw Error('Desteklenmeyen SVG path komutu: '+cmd);
 if(!['c','s'].includes(lower))prevC=null;if(!['q','t'].includes(lower))prevQ=null;prevCmd=lower;
 }return rings;
}
const svgNums=s=>[...(s||'').matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)].map(x=>+x[0]);
function svgLength(v){if(!v)return null;const m=String(v).trim().match(/^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(mm|cm|m|in|pt|pc|px)?$/i);if(!m)return null;const k={mm:1,cm:10,m:1000,in:25.4,pt:25.4/72,pc:25.4/6,px:25.4/96};return Number(m[1])*(k[m[2]?.toLowerCase()||'px']);}
export function groupRings(input,fileName,format,unitFactor,warnings=[]){
 const valid=input.map((ring)=>clean(ring)).filter(r=>r.length>=3&&Math.abs(signedArea(r))>0.001);
 if(!valid.length)throw Error('İçe aktarılan dosyada kapalı vektör kesim konturu bulunamadı. Açık çizgileri CorelDRAW’da kapatıp SVG/DXF olarak dışa aktarın.');
 if(valid.length>10000)warnings.push('Büyük iş: '+valid.length+' kontur analiz ediliyor; optimizasyon cihazınıza bağlı olarak uzun sürebilir.');
 const scaled=valid.map(r=>r.map(p=>({x:p.x*unitFactor,y:p.y*unitFactor})));
 const candidates=scaled.map((r,i)=>({ring:r,index:i,area:Math.abs(signedArea(r)),bbox:bounds(r),parent:null,depth:0})).sort((a,b)=>b.area-a.area);
 // Spatially indexed containment: ordinary CAD files contain thousands of
 // unrelated paths; comparing every path against every other path is O(N²).
 const allBounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const c of candidates){const b=c.bbox;allBounds.minX=Math.min(allBounds.minX,b.minX);allBounds.minY=Math.min(allBounds.minY,b.minY);allBounds.maxX=Math.max(allBounds.maxX,b.maxX);allBounds.maxY=Math.max(allBounds.maxY,b.maxY);}
 const cells=Math.min(48,Math.max(4,Math.ceil(Math.sqrt(candidates.length)/2)));
 const stepX=Math.max(1e-6,(allBounds.maxX-allBounds.minX)/cells),stepY=Math.max(1e-6,(allBounds.maxY-allBounds.minY)/cells);
 const index=new Map(),broad=[];
 const gridX=x=>Math.max(0,Math.min(cells-1,Math.floor((x-allBounds.minX)/stepX)));
 const gridY=y=>Math.max(0,Math.min(cells-1,Math.floor((y-allBounds.minY)/stepY)));
 for(const c of candidates){
   const bx=gridX(c.ring[0].x),by=gridY(c.ring[0].y);
   const possible=[...(index.get(by*cells+bx)||[]),...broad];
   for(const outer of possible){
     const a=outer.bbox,b=c.bbox;
     if(outer.area<=c.area||a.minX>b.minX+1e-5||a.minY>b.minY+1e-5||a.maxX<b.maxX-1e-5||a.maxY<b.maxY-1e-5)continue;
     if(c.parent&&outer.area>=c.parent.area)continue;
     if(inside(c.ring[0],outer.ring))c.parent=outer;
   }
   c.depth=c.parent?c.parent.depth+1:0;
   const x0=gridX(c.bbox.minX),x1=gridX(c.bbox.maxX),y0=gridY(c.bbox.minY),y1=gridY(c.bbox.maxY);
   if((x1-x0+1)*(y1-y0+1)>512){broad.push(c);continue;}
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
     const key=y*cells+x;
     if(!index.has(key))index.set(key,[]);
     index.get(key).push(c);
   }
 }
 const root=candidates.filter(x=>x.depth%2===0);
 const items=[];
 for(const c of root){const holes=candidates.filter(x=>x.parent===c && x.depth===c.depth+1).map(h=>h.ring);
  const b=bounds(c.ring),shift=p=>({x:round(p.x-b.minX),y:round(p.y-b.minY)});
  const outer=c.ring.map(shift),hh=holes.map(h=>h.map(shift));
  const area=Math.abs(signedArea(c.ring))-holes.reduce((sum,h)=>sum+Math.abs(signedArea(h)),0);
  items.push({id:'import_'+items.length,projectId:'external',projectName:fileName,parentId:'external',label:fileName.replace(/\.[^.]+$/,'')+' · Parça '+(items.length+1),partType:'Gövde',operation:'CUT_OUTER',material:'İçe Aktarılan Vektör',thicknessMm:1,materialGroup:'İçe Aktarılan Vektör · 1 mm',outer,holes:hh,areaMm2:Math.max(0,area),locked:false});
 }
 if(valid.length!==root.length)warnings.push((valid.length-root.length)+' iç kontur/delik geometrik olarak eşleştirildi.');
 const b=allBounds;return {filename:fileName,format,items,contourCount:valid.length,widthMm:round(b.maxX-b.minX),heightMm:round(b.maxY-b.minY),warnings};
}

/** Worker-safe strict SVG tag reader (DOMParser is not available in Web Workers).
 * Only geometry and transforms are accepted; scripts/external references are rejected.
 */
function parseSvgXmlInWorker(xml){
 if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml))throw Error('SVG içindeki DTD/harici varlıklar güvenlik nedeniyle engellendi.');
 let root=null,stack=[],total=0;
 const tags=xml.matchAll(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g);
 for(const match of tags){
   const token=match[0];
   if(token.startsWith('<!--')||token.startsWith('<?')||token.startsWith('<!'))continue;
   if(token.startsWith('</')){
     const name=token.slice(2).split(/[\s>]/)[0].toLowerCase().split(':').pop();
     const last=stack.pop();
     if(!last||last.localName!==name)throw Error('SVG XML kapanış etiketi bozuk: '+name);
     continue;
   }
   const nameMatch=token.match(/^<([A-Za-z_][\w:.-]*)\b/);
   if(!nameMatch)continue;
   const tag=nameMatch[1].toLowerCase().split(':').pop();
   const attrs={};
   const body=token.slice(nameMatch[0].length,token.length-1);
   const attrPattern=/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
   let v;
   while((v=attrPattern.exec(body)))attrs[v[1]]=String(v[2]??v[3]).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
   const node={localName:tag,children:[],getAttribute(key){return attrs[key]??null;}};
   if(!root)root=node;
   if(stack.length)stack.at(-1).children.push(node);
   if(!/\/\s*>$/.test(token))stack.push(node);
   if(++total>1000000)throw Error('SVG 1 milyon öğeyi aşıyor; işlenecek konturları ayırın.');
 }
 if(stack.length)throw Error('SVG XML kapatılmamış öğeler içeriyor.');
 if(root?.localName!=='svg')throw Error('Geçerli SVG kök elementi bulunamadı.');
 const forbidden=new Set(['script','foreignobject','image','use','iframe','animation','animate','set']);
 function querySelector(selectors){
   const patterns=new Set(selectors.toLowerCase().split(',').map(s=>s.trim()));
   const pending=[root];while(pending.length){const a=pending.pop();if(patterns.has(a.localName))return a;pending.push(...a.children);}
   return null;
 }
 for(const tag of forbidden)if(querySelector(tag))throw Error('SVG harici referans/çalışan içerik içeriyor: '+tag+'. Tüm öğeleri eğriye dönüştürün.');
 return {documentElement:root,querySelector};
}
export function importSvgText(text,filename='vektor.svg', options={}){
 const doc=typeof globalThis.DOMParser==='function'?new DOMParser().parseFromString(text,'image/svg+xml'):parseSvgXmlInWorker(text);
 if(doc.querySelector('parsererror'))throw Error('SVG XML dosyası bozuk.');
 const svg=doc.documentElement;if(svg.localName!=='svg')throw Error('Geçerli SVG kök elementi bulunamadı.');
 const forbidden=doc.querySelector('script, foreignObject, image, use, iframe, animation, animate, set');
 if(forbidden)throw Error('SVG içinde harici görsel, referans veya çalışan içerik var. Önce tüm öğeleri eğriye dönüştürüp saf SVG olarak kaydedin.');
 const vb=svgNums(svg.getAttribute('viewBox'));const mw=svgLength(svg.getAttribute('width')),mh=svgLength(svg.getAttribute('height'));
 const unit=options.unit||'auto';const units={mm:1,cm:10,m:1000,in:25.4,px:25.4/96};
 let fx=1,fy=1;const warnings=[];
 if(unit!=='auto'){fx=fy=units[unit];if(!fx)throw Error('SVG birimi geçersiz.');}
 else if(vb.length===4&&mw&&mh){fx=mw/vb[2];fy=mh/vb[3];}
 else {fx=fy=25.4/96;warnings.push('SVG fiziksel boyut içermiyor: 96 DPI piksel ölçeği kullanıldı. Gerçek mm ölçüsünü doğrulayın.');}
 const scale=Number(options.scale??1);if(!(scale>0&&scale<=1000))throw Error('Ölçek 0 ile 1000 arasında olmalıdır.');
 const view=vb.length===4?[1,0,0,1,-vb[0],-vb[1]]:I,all=[];
 function visit(el,m,depth=0){if(depth>60)throw Error('SVG grup derinliği çok büyük.');
  const tag=el.localName?.toLowerCase();if(!tag)return;
  if(['defs','clipPath','mask','pattern','symbol','metadata','style','title','desc','linearGradient','radialGradient'].includes(tag))return;
  if(el.getAttribute('display')==='none'||el.getAttribute('visibility')==='hidden')return;
  const mm=matMul(m,svgTransform(el.getAttribute('transform')));
  let shapes=[];const num=(name,def=0)=>Number(el.getAttribute(name)??def)||0;
  if(tag==='path')shapes=svgPathRings(el.getAttribute('d')||'',Number(options.tolerance)||1.5);
  if(tag==='polygon'||tag==='polyline'){
    const pts=svgNums(el.getAttribute('points'));if(pts.length>=6&&pts.length%2===0&&(tag==='polygon'||/\bclosed\b/i.test(el.getAttribute('class')||''))){shapes=[Array.from({length:pts.length/2},(_,i)=>({x:pts[i*2],y:pts[i*2+1]}))];}
  }
  if(tag==='rect'){const x=num('x'),y=num('y'),w=num('width'),h=num('height');if(w>0&&h>0)shapes=[[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]];}
  if(tag==='circle'||tag==='ellipse'){
    const cx=num('cx'),cy=num('cy'),rx=tag==='circle'?num('r'):num('rx'),ry=tag==='circle'?num('r'):num('ry');
    if(rx>0&&ry>0){const count=Math.min(720,Math.max(36,Math.ceil(2*Math.PI*Math.max(rx,ry)/1.5)));shapes=[Array.from({length:count},(_,i)=>({x:cx+rx*Math.cos(2*Math.PI*i/count),y:cy+ry*Math.sin(2*Math.PI*i/count)}))];}
  }
  all.push(...shapes.map(r=>r.map(p=>apply(mm,p))));
  for(const child of [...el.children])visit(child,mm,depth+1);
 }
 visit(svg,view);
 const transformed=all.map(r=>r.map(p=>({x:p.x*fx,y:p.y*fy})));const ret=groupRings(transformed,filename,'svg',scale,warnings);return ret;
}
function arcBulge(a,b,bulge){if(Math.abs(bulge)<1e-8)return[b];const chord=Math.hypot(b.x-a.x,b.y-a.y),theta=4*Math.atan(bulge),radius=chord/(2*Math.sin(Math.abs(theta)/2)),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const h=chord/(2*Math.tan(theta/2));const normal={x:-(b.y-a.y)/chord,y:(b.x-a.x)/chord};const center={x:mid.x+normal.x*h,y:mid.y+normal.y*h};const start=Math.atan2(a.y-center.y,a.x-center.x),steps=Math.min(720,Math.max(8,Math.ceil(Math.abs(theta)*Math.abs(radius)/1.5)));return Array.from({length:steps},(_,i)=>{const ang=start+theta*(i+1)/steps;return {x:center.x+Math.abs(radius)*Math.cos(ang),y:center.y+Math.abs(radius)*Math.sin(ang)}})}
const dxfUnitFactor=u=>({1:25.4,2:304.8,4:1,5:10,6:1000,7:1000000,8:0.0000254,9:0.0254,10:914.4,11:0.0000001,12:0.000001,13:0.001,14:100,15:10000,16:100000})[u];
/** Supports closed LWPOLYLINE/POLYLINE (including bulge curves), CIRCLE, ELLIPSE and assembled LINE loops. */
export function importDxfText(text,filename='vektor.dxf', options={}){
 const lines=text.replace(/\r/g,'').split('\n');if(lines.length>1000000)throw Error('DXF çok büyük.');
 const pairs=[];for(let i=0;i+1<lines.length;i+=2)pairs.push({k:Number(lines[i].trim()),v:lines[i+1].trim()});
 if(!pairs.some(x=>x.k===0&&x.v==='SECTION'))throw Error('Geçerli ASCII DXF dosyası değil. Binary DXF için SVG/ASCII DXF dışa aktarın.');
 let ins=0,all=[],warnings=[],lineSegments=[];
 for(let i=0;i<pairs.length;i++)if(pairs[i].k===9&&pairs[i].v==='$INSUNITS'&&pairs[i+1]?.k===70)ins=Number(pairs[i+1].v);
 const unit=options.unit||'auto';const custom={mm:1,cm:10,m:1000,in:25.4,px:25.4/96};
 let factor=unit==='auto'?(dxfUnitFactor(ins)||1):custom[unit];if(!(factor>0))throw Error('DXF birimi geçersiz.');
 if(unit==='auto'&&!dxfUnitFactor(ins))warnings.push('DXF $INSUNITS birimi belirtilmemiş; mm kabul edildi. Gerçek ölçüyü doğrulayın.');
 let entityStart=pairs.findIndex((p,i)=>p.k===2&&p.v==='ENTITIES'&&pairs[i-1]?.v==='SECTION');
 if(entityStart<0)entityStart=pairs.findIndex(p=>p.k===0&&['LWPOLYLINE','CIRCLE','LINE','POLYLINE'].includes(p.v));
 let i=entityStart>=0?entityStart+1:pairs.length;
 function fields(start){let j=start+1;while(j<pairs.length&&pairs[j].k!==0)j++;return {type:pairs[start].v,fields:pairs.slice(start+1,j),end:j};}
 const find=(f,k,d=0)=>Number(f.find(x=>x.k===k)?.v??d);
 function pushPolyline(vertices,closed){if(!closed||vertices.length<3)return;let ring=[];for(let x=0;x<vertices.length;x++){let a=vertices[x],b=vertices[(x+1)%vertices.length];ring.push({x:a.x,y:a.y});ring.push(...arcBulge(a,b,a.bulge||0).slice(0,-1));}all.push(ring);}
 let guard=0;
 while(i<pairs.length&&guard++<150000){const p=pairs[i];if(p.k!==0){i++;continue}if(p.v==='ENDSEC')break;
  const ent=fields(i),f=ent.fields;i=ent.end;
  if(ent.type==='LWPOLYLINE'){
    const vertices=[];let current=null;for(const v of f){if(v.k===10){current={x:Number(v.v),y:0,bulge:0};vertices.push(current)}else if(v.k===20&&current)current.y=Number(v.v);else if(v.k===42&&current)current.bulge=Number(v.v)}
    pushPolyline(vertices,(find(f,70)&1)!==0);
  }else if(ent.type==='POLYLINE'){
    const closed=(find(f,70)&1)!==0,vertices=[];
    while(i<pairs.length){if(pairs[i].k!==0){i++;continue}if(pairs[i].v==='SEQEND'){i=fields(i).end;break;}if(pairs[i].v!=='VERTEX')break;const v=fields(i);vertices.push({x:find(v.fields,10),y:find(v.fields,20),bulge:find(v.fields,42)});i=v.end;}
    pushPolyline(vertices,closed);
  }else if(ent.type==='CIRCLE'){
    const cx=find(f,10),cy=find(f,20),r=find(f,40);if(r>0){const count=Math.min(720,Math.max(36,Math.ceil(2*Math.PI*r/1.5)));all.push(Array.from({length:count},(_,j)=>({x:cx+r*Math.cos(j*2*Math.PI/count),y:cy+r*Math.sin(j*2*Math.PI/count)})));}
  }else if(ent.type==='LINE')lineSegments.push([{x:find(f,10),y:find(f,20)},{x:find(f,11),y:find(f,21)}]);
  else if(['ARC','SPLINE','HATCH','INSERT'].includes(ent.type))warnings.push('Desteklenmeyen DXF öğesi: '+ent.type+'. Kesim eğrilerini kapalı polylinelara dönüştürün.');
 }
 // Join simple LINE segments into closed cut loops (0.02 drawing-unit tolerance).
 while(lineSegments.length){const [start,end]=lineSegments.shift(),ring=[start,end];let steps=0;
  while(lineSegments.length&&steps++<10000){const last=ring.at(-1);if(Math.hypot(last.x-start.x,last.y-start.y)<.02)break;
   const j=lineSegments.findIndex(seg=>seg.some(p=>Math.hypot(p.x-last.x,p.y-last.y)<.02));if(j<0)break;
   const seg=lineSegments.splice(j,1)[0];ring.push(Math.hypot(seg[0].x-last.x,seg[0].y-last.y)<.02?seg[1]:seg[0]);
  }
  if(ring.length>=4&&Math.hypot(ring.at(-1).x-start.x,ring.at(-1).y-start.y)<.02)all.push(ring);
 }
 const scale=Number(options.scale??1);if(!(scale>0&&scale<=1000))throw Error('Ölçek geçersiz.');
 return groupRings(all,filename,'dxf',factor*scale,warnings);
}
export function importHpglText(text,filename='vektor.plt',options={}){
 let x=0,y=0,absolute=true,penDown=false,ring=[],rings=[];const warnings=[];
 const command=/([A-Z]{2})([^A-Z;]*)[;]?/ig;let m,guard=0;
 const close=()=>{if(ring.length>=3&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].y-ring.at(-1).y)<.5)rings.push(ring);ring=[]};
 while((m=command.exec(text))&&guard++<100000){let cmd=m[1].toUpperCase(),n=svgNums(m[2]||'');
  if(cmd==='IN'){x=y=0;absolute=true;penDown=false;close();continue;}
  if(cmd==='PA'){absolute=true;if(!n.length)continue;}if(cmd==='PR'){absolute=false;if(!n.length)continue;}
  if(cmd==='PU'){if(penDown)close();penDown=false;}if(cmd==='PD'){if(!penDown)ring=[{x,y}];penDown=true;}
  if(['PU','PD','PA','PR'].includes(cmd))for(let i=0;i+1<n.length;i+=2){const nx=absolute?n[i]:x+n[i],ny=absolute?n[i+1]:y+n[i+1];x=nx;y=ny;if(penDown)ring.push({x,y});}
 }
 if(penDown)close();
 const factor=options.unit==='mm'?1:1/40,scale=Number(options.scale??1);
 if(!(scale>0&&scale<=1000))throw Error('Ölçek geçersiz.');
 return groupRings(rings,filename,'hpgl',factor*scale,warnings);
}
export function importVectorText(text,filename,options={}){
 const ext=filename.toLowerCase().split('.').pop();
 const meta=VECTOR_INPUT_FORMATS.find(x=>x.id===ext);
 if(!meta)throw Error('Desteklenmeyen uzantı: '+ext+'. SVG, DXF veya HPGL/PLT kullanın.');
 if(!meta.ready)throw Error(ext.toUpperCase()+' dosyasını doğrudan okumak için güvenilir dönüştürücü gerekiyor. CorelDRAW/Illustrator/AutoCAD içinden vektörleri SVG veya ASCII DXF biçiminde dışa aktarıp içe aktarın. Dosyanın uzantısını değiştirmek yeterli değildir.');
 // No arbitrary file-byte limit: conversion runs in a cancellable worker.
 if(ext==='pdf')throw Error('PDF dosyası binary olarak yerel PDF.js motoruyla açılmalıdır.');
 if(ext==='svg')return importSvgText(text,filename,options);
 if(ext==='dxf')return importDxfText(text,filename,options);
 return importHpglText(text,filename,options);
}
