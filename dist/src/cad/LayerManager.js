import { createObjectId, structuredCloneSafe } from '../core/state.js';

/**
 * Object-Based Persistent Layer Manager
 * Synchronized 1:1 with 3D Three.js raycasting, measurements, nesting, and cost engine.
 * Keeps visual layer ordering separate from physical 3D depth.
 */

export function selectLayer(state, id, additive = false) {
  const exists = state.objects.some(o => o.id === id);
  if (!exists) return state.selectedIds;
  if (!additive) return [id];
  return state.selectedIds.includes(id)
    ? state.selectedIds.filter(x => x !== id)
    : [...state.selectedIds, id];
}

export function renameLayer(state, id, newName) {
  const obj = state.objects.find(o => o.id === id);
  if (obj && !obj.locked && newName.trim()) {
    obj.name = newName.trim();
  }
}

export function toggleLayerVisibility(state, id) {
  const obj = state.objects.find(o => o.id === id);
  if (obj) obj.visible = !obj.visible;
}

export function toggleLayerLock(state, id) {
  const obj = state.objects.find(o => o.id === id);
  if (obj) obj.locked = !obj.locked;
}

export function reorderLayer(state, id, direction) {
  const idx = state.objects.findIndex(o => o.id === id);
  if (idx < 0) return;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= state.objects.length) return;
  const [item] = state.objects.splice(idx, 1);
  state.objects.splice(target, 0, item);
}

export function duplicateSelectedLayers(state, offsetMm = 30) {
  const selected = state.objects.filter(o => state.selectedIds.includes(o.id));
  if (!selected.length) return [];
  const newIds = [];
  for (const src of selected) {
    const copy = structuredCloneSafe(src);
    copy.id = createObjectId('obj');
    copy.name = `${src.name} (Kopya)`;
    copy.locked = false;
    copy.xMm = (copy.xMm || 0) + offsetMm;
    copy.yMm = (copy.yMm || 0) - offsetMm;
    state.objects.push(copy);
    newIds.push(copy.id);
  }
  state.selectedIds = newIds;
  return newIds;
}

export function deleteSelectedLayers(state) {
  const toDelete = new Set(
    state.objects.filter(o => state.selectedIds.includes(o.id) && !o.locked).map(o => o.id)
  );
  if (!toDelete.size) return 0;
  state.objects = state.objects.filter(o => !toDelete.has(o.id));
  state.selectedIds = state.selectedIds.filter(id => !toDelete.has(id));
  if (!state.selectedIds.length && state.objects.length) {
    state.selectedIds = [state.objects[0].id];
  }
  return toDelete.size;
}

export function groupSelectedLayers(state) {
  const ids = state.selectedIds.filter(id => {
    const o = state.objects.find(x => x.id === id);
    return o && !o.locked;
  });
  if (ids.length < 2) return null;
  const gid = createObjectId('grp');
  for (const o of state.objects) {
    if (ids.includes(o.id)) o.groupId = gid;
  }
  return gid;
}

export function ungroupSelectedLayers(state) {
  for (const o of state.objects) {
    if (state.selectedIds.includes(o.id) && !o.locked) {
      o.groupId = null;
    }
  }
}

export function assignMaterialToSelected(state, patch) {
  for (const o of state.objects) {
    if (state.selectedIds.includes(o.id) && !o.locked) {
      Object.assign(o, patch);
    }
  }
}
