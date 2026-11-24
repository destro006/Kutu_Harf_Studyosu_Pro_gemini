import {runTrueShapeNesting,validateSheetLayout} from './NestingEngine.js';
// Compare full feasible layouts: first unplaced count, then sheet count, then
// occupied strip/extent (larger continuous reusable offcuts), then envelope.
export function nestingScore(result){
  let strips=0,envelope=0;
  for(const s of result.sheets){
    let x=0,y=0;for(const p of s.placements){x=Math.max(x,p.bounds.maxX);y=Math.max(y,p.bounds.maxY);}
    strips+=Math.min(x*s.heightMm,y*s.widthMm);envelope+=x*y;
  }
  return [result.unplaced.length,result.sheets.length,strips,envelope];
}
export function betterNesting(a,b){
  if(!b)return true;const x=nestingScore(a),y=nestingScore(b);
  for(let i=0;i<x.length;i++)if(Math.abs(x[i]-y[i])>1e-4)return x[i]<y[i];return false;
}
export function optimizeNesting(items,config={},locked=[],onProgress=()=>{}){
  const start=performance.now(),budget=Math.max(500,Math.min(30000,Number(config.optimizationBudgetMs)||7000)),end=start+budget;
  let best=null,attempts=0;
  const sep=Math.max(.5,(config.clearanceMm??5)+(config.kerfMm??.4));
  const accept=result=>{if(result.sheets.every(s=>validateSheetLayout(s,sep).valid)&&betterNesting(result,best))best=result;};
  // Deterministic multiple orderings: retain safe fast baseline if search times out.
  const trials=[['area','compact',true],['box','compact',true],['long','compact',true],['area',config.placementStrategy||'compact',false],['box','bottomLeft',false],['long','vertical',false],['short','compact',false],['area','bottomLeft',false]];
  for(const [itemOrder,placementStrategy,quickImport] of trials){
    if(attempts&&performance.now()>=end)break;
    if(!quickImport&&items.length>160)continue;
    const deadline=quickImport?(best?end:Infinity):Math.min(end,performance.now()+Math.max(250,budget/4));
    try{const out=runTrueShapeNesting(items,{...config,itemOrder,placementStrategy,quickImport,deadline},locked);attempts++;accept(out);onProgress({attempts,score:best?nestingScore(best):null});}
    catch(e){if(e.message!=='NEST_BUDGET')throw e;}
  }
  if(!best)throw Error('Geçerli yerleşim bulunamadı. Kilitli parçaları ve levha ölçülerini kontrol edin.');
  return {...best,optimization:{attempts,elapsedMs:Math.round(performance.now()-start),method:'multi-start true-shape + shelf'}};
}
