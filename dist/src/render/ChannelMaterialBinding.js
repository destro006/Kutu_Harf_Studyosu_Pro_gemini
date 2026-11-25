/**
 * Fileli: visible front rim and the full-height metal return are the same
 * construction material while linked. Acrylic remains a separate component.
 * Pleksi: both front cap and full-depth sidewalls are matching acrylic so
 * front LED illumination colors face and sides identically.
 */
export function resolveChannelMaterialBinding(obj, state) {
  const cType = obj.constructionType || state.constructionType;
  const fileli = cType === 'fileli';
  const pleksi = cType === 'pleksi';
  const linked = (obj.sideFollowsFace ?? state.materials?.sideFollowsFace ?? true) !== false;
  const faceId = obj.faceMaterial || state.materials?.faceId || 'aynaAltin';
  const faceColor = obj.faceColor || state.materials?.faceColor || '#f5c66a';
  const fileId = obj.fileMaterial || state.fileli?.fileMaterial || faceId;
  const fileColor = obj.fileColor || state.fileli?.fileColor || faceColor;
  const separateSideId = obj.sideMaterial || state.materials?.sideId || faceId;
  const separateSideColor = obj.sideColor || state.materials?.sideColor || faceColor;
  const acrylicId = (pleksi && faceId === 'renkliPleksi') ? 'renkliPleksi' : (obj.acrylicMaterial || 'opalPleksi');
  const acrylicColor = acrylicId === 'renkliPleksi'
    ? (faceId === 'renkliPleksi' ? faceColor : (obj.acrylicColor || '#d3222c'))
    : (obj.acrylicColor || state.fileli?.acrylicColor || '#f3f3ee');
  return {
    fileli,
    pleksi,
    linked,
    fileId,
    fileColor,
    acrylicId,
    acrylicColor,
    sideId: pleksi ? acrylicId : (linked ? (fileli ? fileId : faceId) : separateSideId),
    sideColor: pleksi ? acrylicColor : (linked ? (fileli ? fileColor : faceColor) : separateSideColor),
    shareMetalMaterial: fileli && linked,
    shareAcrylicMaterial: pleksi,
  };
}
