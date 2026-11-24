import { createObjectId, structuredCloneSafe } from './state.js';

/** Copy exact editable geometry, styling, materials and manufacturing properties. */
export function captureObjectClipboard(state, { includeLocked = true, sourceDocumentId = null } = {}) {
  const selection = new Set(state.selectedIds || []);
  const objects = (state.objects || [])
    .filter(o => selection.has(o.id) && (includeLocked || !o.locked))
    .map(structuredCloneSafe);
  if (!objects.length) return null;
  const page = (state.pages || []).find(p => p.id === state.activePageId);
  const layers = (page?.layers || []).filter(l => objects.some(o => o.layerId === l.id)).map(structuredCloneSafe);
  return { version: 1, sourceDocumentId, objects, layers };
}

/** Paste into the current document/page, remapping IDs and layer/group relationships. */
export function pasteObjectClipboard(state, packet, { offsetMm = 0 } = {}) {
  if (!packet || !packet.objects?.length) return [];
  const page = (state.pages || []).find(p => p.id === state.activePageId);
  if (page && !Array.isArray(page.layers)) page.layers = [];
  const targetLayers = page?.layers || [];
  if (!targetLayers.length) targetLayers.push({ id: createObjectId('layer'), name: 'Katman 1', visible: true, locked: false, exportable: true });
  const sourceLayers = new Map((packet.layers || []).map(l => [l.id, l]));
  const layerMap = new Map();
  for (const o of packet.objects) {
    if (layerMap.has(o.layerId)) continue;
    const src = sourceLayers.get(o.layerId);
    let target = src && targetLayers.find(l => l.name === src.name && !l.locked);
    if (!target && src) {
      target = { ...structuredCloneSafe(src), id: createObjectId('layer'), locked: false, visible: true };
      targetLayers.push(target);
    }
    layerMap.set(o.layerId, target?.id || targetLayers.find(l => !l.locked)?.id || targetLayers[0].id);
  }
  const groupCounts = new Map();
  for (const o of packet.objects) if (o.groupId) groupCounts.set(o.groupId, (groupCounts.get(o.groupId) || 0) + 1);
  const groupMap = new Map();
  const idMap = new Map(packet.objects.map(o => [o.id, createObjectId('obj')]));
  const clones = packet.objects.map(orig => {
    const copy = structuredCloneSafe(orig);
    copy.id = idMap.get(orig.id);
    copy.layerId = layerMap.get(orig.layerId);
    copy.xMm = Number(copy.xMm || 0) + offsetMm;
    copy.yMm = Number(copy.yMm || 0) - offsetMm;
    if (copy.groupId && groupCounts.get(copy.groupId) > 1) {
      if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, createObjectId('group'));
      copy.groupId = groupMap.get(copy.groupId);
    } else copy.groupId = null;
    if (copy.parentId && idMap.has(copy.parentId)) copy.parentId = idMap.get(copy.parentId);
    else if (copy.parentId) copy.parentId = null;
    return copy;
  });
  state.objects.push(...clones);
  state.selectedIds = clones.map(o => o.id);
  if (page) page.objects = structuredCloneSafe(state.objects);
  return state.selectedIds;
}
