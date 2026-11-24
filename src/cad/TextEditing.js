// Detect completed clicks even when the 2D SVG replaces its children after selection.
export function isTextDoubleClick(previous,next){
 return !!previous&&previous.id===next.id&&next.time>=previous.time&&next.time-previous.time<=450&&Math.hypot(next.x-previous.x,next.y-previous.y)<=8;
}
export function editableTextObject(state,id){
 if(!['model3d','materials','design2d'].includes(state.mainWorkspace||'model3d'))return null;
 return state.objects.find(o=>o.id===id&&o.kind==='text'&&!o.locked&&o.visible!==false)||null;
}
export function applyTextEdit(state,id,text){
 const obj=editableTextObject(state,id);
 if(!obj||typeof text!=='string'||!text.trim()||obj.text===text)return false;
 obj.text=text;state.selectedIds=[id];return true;
}