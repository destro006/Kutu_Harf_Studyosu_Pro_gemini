const hex=(v,f)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():f;
const num=(v,f,min,max)=>v==null||v===''||!Number.isFinite(Number(v))?f:Math.max(min,Math.min(max,Number(v)));
export function resolveObjectLighting(obj,state){
 const g=state.lighting||{},l=obj?.lightSettings||{},fallback=hex(g.colorHex,'#ffc982');
 return {mode:obj?.lightingMode||g.mode||'halo',enabled:g.enabled!==false,frontColor:hex(l.frontColor,hex(g.frontColor,fallback)),backColor:hex(l.backColor,hex(g.backColor,fallback)),frontIntensity:num(l.frontIntensity,num(g.frontIntensity,1,0,3),0,3),backIntensity:num(l.backIntensity,num(g.backIntensity,1.35,0,3),0,3),wallDistanceMm:num(l.wallDistanceMm,num(g.wallDistanceMm,35,5,150),5,150),haloSpread:num(l.haloSpread,num(g.haloSpread,1,.3,2.5),.3,2.5),falloff:num(l.falloff,num(g.falloff,1,.3,2.5),.3,2.5)};
}
export function selectedLightingObjects(s){return (s.objects||[]).filter(o=>(s.selectedIds||[]).includes(o.id));}
export function setLightingValue(s,key,value){
 let v;if(key==='mode'){if(!['front','halo','both','none'].includes(value))return false;v=value;}
 else if(['frontColor','backColor'].includes(key)){v=hex(value,null);if(!v)return false;}
 else if(['frontIntensity','backIntensity','wallDistanceMm','haloSpread','falloff'].includes(key)){v=num(value,null,...(key==='wallDistanceMm'?[5,150]:['haloSpread','falloff'].includes(key)?[.3,2.5]:[0,3]));if(v===null)return false;}else return false;
 const selected=selectedLightingObjects(s);
 if(selected.length){let changed=false;for(const o of selected){if(o.locked||resolveObjectLighting(o,s)[key]===v)continue;if(key==='mode')o.lightingMode=v;else o.lightSettings={...o.lightSettings,[key]:v};changed=true;}return changed;}
 if(s.lighting[key]===v)return false;s.lighting[key]=v;return true;
}