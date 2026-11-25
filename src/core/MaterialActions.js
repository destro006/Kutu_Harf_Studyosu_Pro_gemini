import { MATERIAL_PRESETS } from '../render/MaterialLibrary.js';
/** Unified metal/RAL selection: only one finish per face, shared with file & linked sides. */
export function applySurfaceMaterialPreset(state,id) {
  const preset=MATERIAL_PRESETS[id]; if(!preset)throw new Error('Bilinmeyen materyal: '+id);
  const isAcrylic = preset.kind === 'acrylic';
  const ids=new Set(state.selectedIds||[]);
  const objects=(state.objects||[]).filter(o=>!o.locked&&(!ids.size||ids.has(o.id)));
  state.materials.faceId=id; state.materials.faceColor=preset.color; state.materials.ralCode='';
  if (!isAcrylic) {
    state.fileli.fileMaterial=id; state.fileli.fileColor=preset.color;
  } else {
    state.fileli.acrylicColor=preset.color;
  }
  state.materialOverrides.metalness=null; state.materialOverrides.roughness=null;
  if(state.materials.sideFollowsFace!==false){state.materials.sideId=id;state.materials.sideColor=preset.color;}
  for(const o of objects){
    o.faceMaterial=id;o.faceColor=preset.color;o.ralCode='';
    if (isAcrylic) {
      o.acrylicMaterial=id; o.acrylicColor=preset.color;
    } else if((o.constructionType||state.constructionType)==='fileli'){
      o.fileMaterial=id;o.fileColor=preset.color;
    }
    if((o.sideFollowsFace??state.materials.sideFollowsFace)!==false){o.sideMaterial=id;o.sideColor=preset.color;}
  }
  return objects.length;
}
export function getDisplayedSurfaceMaterial(state){
  const o=(state.objects||[]).find(x=>(state.selectedIds||[]).includes(x.id));
  return (o?.constructionType||state.constructionType)==='fileli'
    ?(o?.fileMaterial||state.fileli?.fileMaterial||state.materials?.faceId)
    :(o?.faceMaterial||state.materials?.faceId);
}
