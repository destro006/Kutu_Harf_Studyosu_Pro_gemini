/**
 * NestingEngine v3 Pro integration from nesting-engine-pro.zip.
 * Exact manufacturing contours, existing editing/validation API, cooperative
 * time budget, per-material batches and safe locked placement preservation.
 * The worker retains the fast baseline and independently validates candidates.
 */
import {polygonBounds,pointInPolygon,segmentsIntersect,minDistanceBetweenPolygons} from '../geometry/PolygonOffset.js';
import {rotatePolygon,translatePolygon,validateSheetLayout,ringLength,refreshNestingSheet} from './NestingEngine.js';

const check=(deadline)=>{if(performance.now()>=deadline)throw new Error('PRO_BUDGET');};

// v3 Pro: allocation-free segment clearance with squared distances.
function fastPolygonsClear(ptsA,dx,dy,ptsB,minSep,deadline){
 const sep2=minSep*minSep,nA=ptsA.length,nB=ptsB.length;
 const clamp=t=>Math.max(0,Math.min(1,t));
 for(let i=0;i<nA;i++){
  if((i&31)===0)check(deadline);
  const a1x=ptsA[i].x+dx,a1y=ptsA[i].y+dy,a2x=ptsA[(i+1)%nA].x+dx,a2y=ptsA[(i+1)%nA].y+dy;
  const adx=a2x-a1x,ady=a2y-a1y,aLen2=adx*adx+ady*ady||1e-9;
  const minX=Math.min(a1x,a2x)-minSep,maxX=Math.max(a1x,a2x)+minSep,minY=Math.min(a1y,a2y)-minSep,maxY=Math.max(a1y,a2y)+minSep;
  for(let j=0;j<nB;j++){
   if((j&1023)===0)check(deadline);
   const b1=ptsB[j],b2=ptsB[(j+1)%nB];
   if(Math.max(b1.x,b2.x)<minX||Math.min(b1.x,b2.x)>maxX||Math.max(b1.y,b2.y)<minY||Math.min(b1.y,b2.y)>maxY)continue;
   const bdx=b2.x-b1.x,bdy=b2.y-b1.y,denom=adx*bdy-ady*bdx;
   if(Math.abs(denom)>1e-9){
    const cx=b1.x-a1x,cy=b1.y-a1y,t=(cx*bdy-cy*bdx)/denom,u=(cx*ady-cy*adx)/denom;
    if(t>=0&&t<=1&&u>=0&&u<=1)return false;
   }
   const t1=clamp(((b1.x-a1x)*adx+(b1.y-a1y)*ady)/aLen2);
   const d1x=b1.x-(a1x+t1*adx),d1y=b1.y-(a1y+t1*ady);
   if(d1x*d1x+d1y*d1y<sep2-1e-8)return false;
   const t2=clamp(((b2.x-a1x)*adx+(b2.y-a1y)*ady)/aLen2);
   const d2x=b2.x-(a1x+t2*adx),d2y=b2.y-(a1y+t2*ady);
   if(d2x*d2x+d2y*d2y<sep2-1e-8)return false;
   const bl2=bdx*bdx+bdy*bdy||1e-9;
   const s1=clamp(((a1x-b1.x)*bdx+(a1y-b1.y)*bdy)/bl2);
   const d3x=a1x-(b1.x+s1*bdx),d3y=a1y-(b1.y+s1*bdy);
   if(d3x*d3x+d3y*d3y<sep2-1e-8)return false;
   const s2=clamp(((a2x-b1.x)*bdx+(a2y-b1.y)*bdy)/bl2);
   const d4x=a2x-(b1.x+s2*bdx),d4y=a2y-(b1.y+s2*bdy);
   if(d4x*d4x+d4y*d4y<sep2-1e-8)return false;
  }
 }
 return !pointInPolygon({x:ptsA[0].x+dx,y:ptsA[0].y+dy},ptsB)&&!pointInPolygon({x:ptsB[0].x-dx,y:ptsB[0].y-dy},ptsA);
}
function fitsInsideHole(outer,dx,dy,hole,hb,w,h,sep,deadline){
 if(dx<hb.minX+sep-1e-7||dx+w>hb.maxX-sep+1e-7||dy<hb.minY+sep-1e-7||dy+h>hb.maxY-sep+1e-7)return false;
 check(deadline);
 const ring=translatePolygon(outer,dx,dy);
 if(!ring.every(p=>pointInPolygon(p,hole)))return false;
 for(let i=0;i<ring.length;i++){
  check(deadline);
  for(let j=0;j<hole.length;j++)if(segmentsIntersect(ring[i],ring[(i+1)%ring.length],hole[j],hole[(j+1)%hole.length],false))return false;
 }
 return minDistanceBetweenPolygons(ring,hole)>=sep-1e-7;
}

// v3 Pro contact candidates + 16/4/1/.5 mm continuous sliding.
// The previous exact NFP provider can also supply additional contact points.
function findBestNfpPlacement(sheet,variants,minX,minY,maxX,maxY,sep,allowHoleNesting,fits,config,deadline){
 let best=null,bestScore=Infinity;
 const usedX=Math.max(minX,...sheet.placements.map(p=>p.bounds.maxX)),usedY=Math.max(minY,...sheet.placements.map(p=>p.bounds.maxY));
 const score=(x,y,v)=>config.placementStrategy==='vertical'?(x-minX)*3+(y-minY)*.2:config.placementStrategy==='bottomLeft'?(x-minX)+(y-minY)*1.3:
 (Math.max(usedX,x+v.bounds.width)-minX)*(Math.max(usedY,y+v.bounds.height)-minY)+(x-minX+y-minY)*.001;
 for(const v of variants){
  check(deadline);
  const w=v.bounds.width,h=v.bounds.height,cands=new Map(),xs=new Set([minX]),ys=new Set([minY]);
  const add=(x,y)=>{
   if(x<minX-1e-5||y<minY-1e-5||x+w>maxX+1e-5||y+h>maxY+1e-5)return;
   x=Math.max(minX,x);y=Math.max(minY,y);
   const key=Math.round(x*1000)+','+Math.round(y*1000);
   if(!cands.has(key))cands.set(key,{x,y,score:score(x,y,v)});
  };
  add(minX,minY);
  const stepX=Math.max(60,Math.round((maxX-minX)/8)),stepY=Math.max(60,Math.round((maxY-minY)/6));
  for(let x=minX;x<maxX;x+=stepX)add(x,minY);
  for(let y=minY;y<maxY;y+=stepY)add(minX,y);
  for(const p of sheet.placements){
   check(deadline);
   const b=p.bounds;
   for(const x of [b.minX,b.maxX+sep+.001,b.minX-w-sep-.001,b.maxX-w])xs.add(x);
   for(const y of [b.minY,b.maxY+sep+.001,b.minY-h-sep-.001,b.maxY-h])ys.add(y);
   const step=Math.max(1,Math.floor(p.outer.length/8));
   for(let k=0;k<p.outer.length;k+=step){
    const pt=p.outer[k];add(pt.x+sep,pt.y+sep);add(pt.x+sep,b.minY);add(b.minX,pt.y+sep);
   }
   if(allowHoleNesting)for(const hb of p.holeBounds||[]){
    add(hb.minX+sep+.001,hb.minY+sep+.001);
    add((hb.minX+hb.maxX-w)/2,(hb.minY+hb.maxY-h)/2);
   }
  }
  for(const x of xs){check(deadline);for(const y of ys)add(x,y);}
  if(config.nfpSearch&&sheet.placements.length){
   for(const p of config.nfpSearch(sheet,v,minX,minY,maxX,maxY,sep,deadline))add(p.x,p.y);
  }
  const candidates=[...cands.values()].sort((a,b)=>a.score-b.score);
  for(const {x,y} of candidates){
   check(deadline);
   if(!fits(sheet,v,x,y))continue;
   let cx=x,cy=y;
   for(const delta of [16,4,1,.5]){
    while(cy-delta>=minY&&fits(sheet,v,cx,cy-delta))cy-=delta;
    while(cx-delta>=minX&&fits(sheet,v,cx-delta,cy))cx-=delta;
   }
   const finalScore=score(cx,cy,v);
   if(finalScore<bestScore){
    bestScore=finalScore;
    const holes=v.holes.map(r=>translatePolygon(r,cx,cy));
    best={angleDeg:v.ang,xMm:cx,yMm:cy,outer:translatePolygon(v.outer,cx,cy),holes,holeBounds:holes.map(polygonBounds),bounds:{minX:cx,minY:cy,maxX:cx+w,maxY:cy+h,width:w,height:h}};
   }
   break;
  }
 }
 return best;
}

function packBatchWithOrder(orderedItems,variantMap,params){
 const {sheetWidthMm:w,sheetHeightMm:h,mL,mR,mT,mB,marginMm,minSep,allowHoleNesting,existingSheets,materialGroup,config,deadline}=params;
 const sheets=existingSheets.map(s=>({...s,placements:s.placements.map(p=>({...p}))}));
 const lockedIds=new Set(sheets.flatMap(s=>s.placements.map(p=>p.id))),unplaced=[];
 const fits=(sheet,v,x,y)=>{
  check(deadline);
  const vw=v.bounds.width,vh=v.bounds.height;
  if(x<mL-1e-4||y<mB-1e-4||x+vw>w-mR+1e-4||y+vh>h-mT+1e-4)return false;
  for(const p of sheet.placements){
   const b=p.bounds;
   if(x+vw+minSep<=b.minX||b.maxX+minSep<=x||y+vh+minSep<=b.minY||b.maxY+minSep<=y)continue;
   if(allowHoleNesting&&p.holes?.some((r,i)=>fitsInsideHole(v.outer,x,y,r,p.holeBounds[i],vw,vh,minSep,deadline)))continue;
   if(!fastPolygonsClear(v.outer,x,y,p.outer,minSep,deadline))return false;
  }
  return true;
 };
 for(const item of orderedItems){
  check(deadline);
  if(lockedIds.has(item.id))continue;
  const variants=variantMap.get(item.id);
  if(!variants?.length){unplaced.push({item,reason:'Parça plaka ölçüsünden büyük.'});continue;}
  const choose=sheet=>findBestNfpPlacement(sheet,variants,mL,mB,w-mR,h-mT,minSep,allowHoleNesting,fits,config,deadline);
  let placed=false;
  for(const sheet of sheets){
   const best=choose(sheet);
   if(best){sheet.placements.push({...item,...best,hasCollision:false});sheet.usedAreaMm2+=item.areaMm2;placed=true;break;}
  }
  if(!placed){
   const sheet={index:sheets.length+1,materialGroup,widthMm:w,heightMm:h,marginMm,marginLeftMm:mL,marginRightMm:mR,marginTopMm:mT,marginBottomMm:mB,allowHoleNesting,placements:[],usedAreaMm2:0};
   const best=choose(sheet);
   if(best){sheet.placements.push({...item,...best,hasCollision:false});sheet.usedAreaMm2=item.areaMm2;sheets.push(sheet);}
   else unplaced.push({item,reason:'Plakaya sığmadı.'});
  }
 }
 let envelope=0,strip=0;
 for(const sheet of sheets){
  const x=Math.max(0,...sheet.placements.map(p=>p.bounds.maxX)),y=Math.max(0,...sheet.placements.map(p=>p.bounds.maxY));
  envelope+=x*y;strip+=config.placementStrategy==='vertical'?x*sheet.heightMm:Math.min(x*sheet.heightMm,y*sheet.widthMm);
 }
 return {sheets,unplaced,score:[unplaced.length,sheets.length,config.placementStrategy==='compact'?envelope:strip,config.placementStrategy==='compact'?strip:envelope]};
}
function better(a,b){
 if(!b)return true;
 for(let i=0;i<a.score.length;i++)if(Math.abs(a.score[i]-b.score[i])>1e-5)return a.score[i]<b.score[i];
 return false;
}

export function runProNesting(items,config={},existingLockedSheets=[]){
 const {sheetWidthMm=3000,sheetHeightMm=1500,marginMm=15,marginLeftMm,marginRightMm,marginTopMm,marginBottomMm,clearanceMm=5,kerfMm=.4,allowedAngles=[0,90,180,270],fineAngleStep=0,rotationStepDeg,enforceGrainDirection=false,grainDirection='none',allowHoleNesting=true,groupByMaterial=true,timeBudgetMs=220}=config;
 const deadline=Math.min(config.deadline??Infinity,performance.now()+Math.max(40,timeBudgetMs));
 const mL=marginLeftMm??marginMm,mR=marginRightMm??marginMm,mT=marginTopMm??marginMm,mB=marginBottomMm??marginMm,minSep=Math.max(.5,clearanceMm+kerfMm);
 const uw=sheetWidthMm-mL-mR,uh=sheetHeightMm-mB-mT;
 let angles=allowedAngles.length?allowedAngles:[0,90,180,270];
 if(rotationStepDeg!=null&&[0,5,15,30,45,90,180].includes(Number(rotationStepDeg)))angles=Number(rotationStepDeg)===0?[0]:Array.from({length:360/Number(rotationStepDeg)},(_,i)=>i*Number(rotationStepDeg));
 else if(fineAngleStep>0){angles=[];for(let a=0;a<360;a+=fineAngleStep)angles.push(a);}
 if(enforceGrainDirection||grainDirection==='horizontal'||grainDirection==='vertical'){angles=angles.filter(a=>a%180===0);if(!angles.length)angles=[0,180];}
 const batches=new Map();
 for(const item of items){const key=groupByMaterial?item.materialGroup||'Genel':'Genel';if(!batches.has(key))batches.set(key,[]);batches.get(key).push(item);}
 const allSheets=[],allUnplaced=[];
 for(const [materialGroup,batch] of batches){
  check(deadline);
  const variantMap=new Map(),bounds=new Map(batch.map(i=>[i.id,polygonBounds(i.outer)])),ids=new Set(batch.map(i=>i.id));
  for(const item of batch){
   check(deadline);
   variantMap.set(item.id,angles.map(ang=>{
    const r=rotatePolygon(item.outer,ang),rad=ang*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
    return {ang,outer:r.points,holes:(item.holes||[]).map(h=>h.map(p=>({x:p.x*c-p.y*s+r.dx,y:p.x*s+p.y*c+r.dy}))),bounds:polygonBounds(r.points)};
   }).filter(v=>v.bounds.width<=uw+1e-7&&v.bounds.height<=uh+1e-7));
  }
  const existingSheets=[];
  for(const ex of existingLockedSheets)if(ex.materialGroup===materialGroup){
   const placements=ex.placements.filter(p=>p.locked).map(p=>ids.has(p.id)?p:{...p,id:String(p.id).replace(/_copy0$/,'')}).filter(p=>ids.has(p.id)).map(p=>({...p,holeBounds:(p.holes||[]).map(polygonBounds)}));
   if(placements.length)existingSheets.push({index:existingSheets.length+1,materialGroup,widthMm:sheetWidthMm,heightMm:sheetHeightMm,marginMm,marginLeftMm:mL,marginRightMm:mR,marginTopMm:mT,marginBottomMm:mB,allowHoleNesting,placements,usedAreaMm2:placements.reduce((s,p)=>s+p.areaMm2,0)});
  }
  const params={sheetWidthMm,sheetHeightMm,mL,mR,mT,mB,marginMm,minSep,allowHoleNesting,existingSheets,materialGroup,config:{placementStrategy:'compact',...config},deadline};
  // v3 Pro multi-start order strategies and bounded local swap improvement.
  const strategies=[batch.slice().sort((a,b)=>b.areaMm2-a.areaMm2),batch.slice().sort((a,b)=>bounds.get(b.id).height-bounds.get(a.id).height),batch.slice().sort((a,b)=>bounds.get(b.id).width-bounds.get(a.id).width),batch.slice().sort((a,b)=>bounds.get(b.id).width*bounds.get(b.id).height-bounds.get(a.id).width*bounds.get(a.id).height)];
  let best=null,bestOrder=null;
  for(const order of strategies){
   try{const r=packBatchWithOrder(order,variantMap,params);if(better(r,best)){best=r;bestOrder=order;}}
   catch(e){if(e.message!=='PRO_BUDGET')throw e;break;}
  }
  if(!best)throw Error('PRO_BUDGET');
  for(let iter=1;bestOrder.length>2&&iter<=12&&performance.now()<deadline;iter++){
   const order=bestOrder.slice(),i=iter%order.length,j=(i+1+iter%Math.max(1,order.length-1))%order.length;
   [order[i],order[j]]=[order[j],order[i]];
   try{const r=packBatchWithOrder(order,variantMap,params);if(better(r,best)){best=r;bestOrder=order;}}
   catch(e){if(e.message!=='PRO_BUDGET')throw e;break;}
  }
  for(const sh of best.sheets){sh.index=allSheets.length+1;allSheets.push(sh);}
  allUnplaced.push(...best.unplaced);
 }
 let interlockedPairs=0,totalCutLengthM=0;
 for(const sh of allSheets){
  if(!refreshNestingSheet(sh,minSep).valid||!validateSheetLayout(sh,minSep,allowHoleNesting).valid)throw Error('PRO_INVALID_LAYOUT');
  for(let i=0;i<sh.placements.length;i++){
   const p=sh.placements[i];totalCutLengthM+=(ringLength(p.outer)+(p.holes||[]).reduce((s,h)=>s+ringLength(h),0))/1000;
   for(let j=i+1;j<sh.placements.length;j++){const a=p.bounds,b=sh.placements[j].bounds;if(!(a.maxX<b.minX||b.maxX<a.minX||a.maxY<b.minY||b.maxY<a.minY))interlockedPairs++;}
  }
 }
 const usable=allSheets.reduce((s,sh)=>s+sh.usableAreaMm2,0),used=allSheets.reduce((s,sh)=>s+sh.usedAreaMm2,0);
 return {sheets:allSheets,unplaced:allUnplaced,sheetCount:allSheets.length,interlockedPairs,overallUtilizationPct:usable>0?used/usable*100:0,totalScrapM2:allSheets.reduce((s,sh)=>s+sh.scrapAreaM2,0),totalCutLengthM,minSep};
}
