export const ALIGN_COMMANDS=[
 ['left','Sola hizala','L'],['centerX','X merkezlerini hizala','C'],['right','Sağa hizala','R'],
 ['top','Üste hizala','T'],['centerY','Y merkezlerini hizala','E'],['bottom','Alta hizala','B'],['page','Sayfaya ortala','P'],
 ['distLeft','Sol kenarları dağıt','Shift+L'],['distCenterX','X merkezlerini dağıt','Shift+C'],['distRight','Sağ kenarları dağıt','Shift+R'],
 ['distTop','Üst kenarları dağıt','Shift+T'],['distCenterY','Y merkezlerini dağıt','Shift+E'],['distBottom','Alt kenarları dağıt','Shift+B'],
 ['distGapX','Yatay eşit boşluk','Shift+P'],['distGapY','Dikey eşit boşluk','Shift+A']
];
export function alignmentCommand(key,shift=false){return ALIGN_COMMANDS.find(c=>c[2]===(shift?'Shift+':'')+key.toUpperCase())?.[0]||null;}
export function contourBounds(polys){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of polys||[])for(const v of p.outer||[]){if(!Number.isFinite(v.x)||!Number.isFinite(v.y))return null;minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);}
 return Number.isFinite(minX)?{minX,minY,maxX,maxY}:null;
}
export function alignmentPlan(state,command,boundsFor){
 const objects=new Map(state.objects.map(o=>[o.id,o]));
 const entries=(state.selectedIds||[]).map(id=>objects.get(id)).filter(o=>o&&o.visible!==false&&!o.locked).map(o=>({o,b:boundsFor(o)}));
 if(!entries.length||entries.some(e=>!e.b))return [];
 const result=[],move=(e,dx,dy)=>{if(Math.abs(dx)>1e-8||Math.abs(dy)>1e-8)result.push({id:e.o.id,xMm:(e.o.xMm||0)+dx,yMm:(e.o.yMm||0)+dy});};
 const cx=b=>(b.minX+b.maxX)/2,cy=b=>(b.minY+b.maxY)/2;
 if(command==='page'){
  const all={minX:Math.min(...entries.map(e=>e.b.minX)),maxX:Math.max(...entries.map(e=>e.b.maxX)),minY:Math.min(...entries.map(e=>e.b.minY)),maxY:Math.max(...entries.map(e=>e.b.maxY))};
  for(const e of entries)move(e,-cx(all),-cy(all));return result;
 }
 const props={left:['x',b=>b.minX],right:['x',b=>b.maxX],centerX:['x',cx],top:['y',b=>b.maxY],bottom:['y',b=>b.minY],centerY:['y',cy]};
 const dist=command.startsWith('dist'),mode=dist?command.slice(4,5).toLowerCase()+command.slice(5):command;
 if(!dist){
  if(entries.length<2||!props[mode])return [];
  const [axis,value]=props[mode],ref=entries.at(-1),target=value(ref.b);
  for(const e of entries){const d=target-value(e.b);move(e,axis==='x'?d:0,axis==='y'?d:0);}return result;
 }
 if(entries.length<3)return [];
 if(mode==='gapX'||mode==='gapY'){
  const axis=mode==='gapX'?'x':'y',lo=axis==='x'?'minX':'minY',hi=axis==='x'?'maxX':'maxY',sorted=entries.slice().sort((a,b)=>a.b[lo]-b.b[lo]);
  const first=sorted[0].b[lo],last=Math.max(...sorted.map(e=>e.b[hi])),gap=(last-first-sorted.reduce((sum,e)=>sum+e.b[hi]-e.b[lo],0))/(sorted.length-1);
  let next=first;for(const e of sorted){const d=next-e.b[lo];move(e,axis==='x'?d:0,axis==='y'?d:0);next+=e.b[hi]-e.b[lo]+gap;}return result;
 }
 if(!props[mode])return [];
 const [axis,value]=props[mode],sorted=entries.slice().sort((a,b)=>value(a.b)-value(b.b)),first=value(sorted[0].b),step=(value(sorted.at(-1).b)-first)/(sorted.length-1);
 sorted.forEach((e,i)=>{const d=first+i*step-value(e.b);move(e,axis==='x'?d:0,axis==='y'?d:0);});return result;
}
export function applyAlignmentPlan(state,plan){const map=new Map(plan.map(p=>[p.id,p]));for(const o of state.objects){const p=map.get(o.id);if(p&&!o.locked){o.xMm=p.xMm;o.yMm=p.yMm;}}}
export function alignmentIcon(command){
 const dist=command.startsWith('dist'),base=dist?command.slice(4,5).toLowerCase()+command.slice(5):command;
 const wrap=body=>'<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
 if(base==='page')return wrap('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 5v14M5 12h14" stroke-dasharray="2 2"/><rect x="8" y="9" width="8" height="6" fill="currentColor"/>');
 const vertical=['top','bottom','centerY','gapY'].includes(base),flip=vertical?'<g transform="translate(24 0) rotate(90)">':'<g>';
 const canonical={top:'left',bottom:'right',centerY:'centerX',gapY:'gapX'}[base]||base;
 if(dist){
  const widths=canonical==='left'?[3,5,7]:canonical==='right'?[7,5,3]:[4,4,4];
  const rects=widths.map((w,i)=>'<rect x="'+(3+i*7+(canonical==='right'?4-w:canonical==='centerX'?(4-w)/2:0))+'" y="'+(5+i%2*3)+'" width="'+w+'" height="'+(14-i%2*5)+'" rx=".5" fill="currentColor"/>').join('');
  return wrap(flip+rects+(canonical==='gapX'?'<path d="M7 3h3m4 0h3M7 21h3m4 0h3"/>':'<path d="M3 3h18M3 21h18" stroke-dasharray="2 2"/>')+'</g>');
 }
 const x=canonical==='left'?4:canonical==='right'?20:12,rects=canonical==='left'?'<rect x="5" y="5" width="12" height="5"/><rect x="5" y="14" width="8" height="5"/>':canonical==='right'?'<rect x="7" y="5" width="12" height="5"/><rect x="11" y="14" width="8" height="5"/>':'<rect x="5" y="5" width="14" height="5"/><rect x="8" y="14" width="8" height="5"/>';
 return wrap(flip+'<path d="M'+x+' 2v20"/>'+rects+'</g>');
}