/** Non-destructive filter for the Corel-style "selected objects only" export. */
export function getExportSelection(state,metricsList=[],onlySelected=false){
 if(!onlySelected)return {ids:null,metrics:metricsList,state,objectCount:(state.objects||[]).length};
 const selected=new Set(state.selectedIds||[]);
 const objects=(state.objects||[]).filter(o=>selected.has(o.id)&&o.visible!==false);
 const ids=new Set(objects.map(o=>o.id));
 const pages=(state.pages||[]).map(page=>({...page,objects:page.id===state.activePageId?
   (page.objects||[]).filter(o=>ids.has(o.id)):[]}));
 return {ids,metrics:metricsList.filter(m=>ids.has(m.objectId)),
         state:{...state,objects,pages,selectedIds:[...ids]},objectCount:objects.length};
}
