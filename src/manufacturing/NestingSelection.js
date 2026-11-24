import {refreshNestingSheet} from './NestingEngine.js';

/** Selection is confined to the currently displayed nesting sheet. */
export function nextNestingSelection(orderedIds,current,anchor,id,{toggle=false,range=false,addRange=false}={}){
 const ids=new Set(orderedIds),selected=new Set([...current].filter(x=>ids.has(x)));
 if(id==null||!ids.has(id))return {ids:[],anchor:null,primary:null};
 if(range&&ids.has(anchor)){
  const a=orderedIds.indexOf(anchor),b=orderedIds.indexOf(id);
  const span=orderedIds.slice(Math.min(a,b),Math.max(a,b)+1);
  const result=addRange?[...new Set([...selected,...span])]:span;
  return {ids:result,anchor,primary:id};
 }
 if(toggle){
  if(selected.has(id))selected.delete(id);else selected.add(id);
  const result=[...selected];
  return {ids:result,anchor:id,primary:selected.has(id)?id:result.at(-1)??null};
 }
 return {ids:[id],anchor:id,primary:id};
}

/** Only the current nesting job is changed; overrides prevent repack resurrection. */
export function deleteNestingParts(n,sheetIndex,ids,minSep){
 const sheet=n.sheets?.[sheetIndex];
 if(!sheet)return [];
 const wanted=new Set(ids);
 const removed=sheet.placements.filter(p=>wanted.has(p.id)&&!p.locked).map(p=>p.id);
 if(!removed.length)return [];
 const removedSet=new Set(removed);
 n.partOverrides||={};
 for(const id of removed)n.partOverrides[id]={...(n.partOverrides[id]||{}),deleted:true};
 sheet.placements=sheet.placements.filter(p=>!removedSet.has(p.id));
 n.unplaced=(n.unplaced||[]).filter(x=>!removedSet.has(x.item?.id||x.id));
 n.optimizationInfo=null;
 refreshNestingSheet(sheet,minSep);
 return removed;
}
