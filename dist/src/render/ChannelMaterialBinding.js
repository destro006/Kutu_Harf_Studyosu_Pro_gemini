/**
 * Fileli: visible front rim and the full-height metal return are the same
 * construction material while linked. Acrylic remains a separate component.
 * A deliberately disabled link permits a separately specified side finish.
 */
export function resolveChannelMaterialBinding(obj, state) {
  const fileli = (obj.constructionType || state.constructionType) === 'fileli';
  const linked = (obj.sideFollowsFace ?? state.materials?.sideFollowsFace ?? true) !== false;
  const faceId = obj.faceMaterial || state.materials?.faceId || 'aynaAltin';
  const faceColor = obj.faceColor || state.materials?.faceColor || '#f5c66a';
  const fileId = obj.fileMaterial || state.fileli?.fileMaterial || faceId;
  const fileColor = obj.fileColor || state.fileli?.fileColor || faceColor;
  const separateSideId = obj.sideMaterial || state.materials?.sideId || faceId;
  const separateSideColor = obj.sideColor || state.materials?.sideColor || faceColor;
  return {
    fileli,
    linked,
    fileId,
    fileColor,
    sideId: linked ? (fileli ? fileId : faceId) : separateSideId,
    sideColor: linked ? (fileli ? fileColor : faceColor) : separateSideColor,
    shareMetalMaterial: fileli && linked,
  };
}
