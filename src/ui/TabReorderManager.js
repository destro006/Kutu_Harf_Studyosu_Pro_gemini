/**
 * App-Wide Drag-and-Drop Reorderable Tabs Manager + localStorage Persistence
 */

export const TAB_ORDER_STORAGE_KEY = 'khs_tab_orders_v1';

export function loadTabOrder(groupKey, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage || !groupKey) return [];
  try {
    const raw = storage.getItem(TAB_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.[groupKey]) ? parsed[groupKey].map(String) : [];
  } catch {
    return [];
  }
}

export function saveTabOrder(groupKey, ids = [], storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage || !groupKey) return false;
  try {
    const raw = storage.getItem(TAB_ORDER_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[groupKey] = [...ids].map(String);
    storage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function reorderTabIds(ids = [], draggedId, targetId, insertAfter = false) {
  const list = [...ids].map(String);
  const d = String(draggedId);
  const t = String(targetId);
  const fromIdx = list.indexOf(d);
  const toIdx = list.indexOf(t);
  if (fromIdx < 0 || toIdx < 0 || d === t) return list;
  list.splice(fromIdx, 1);
  let targetPos = list.indexOf(t);
  if (insertAfter) targetPos++;
  list.splice(targetPos, 0, d);
  return list;
}

export function sortItemsBySavedOrder(items = [], getKey, groupKey, storage) {
  const order = loadTabOrder(groupKey, storage);
  if (!order.length) return [...items];
  const rank = new Map(order.map((id, idx) => [String(id), idx]));
  return [...items].sort((a, b) => {
    const ra = rank.has(String(getKey(a))) ? rank.get(String(getKey(a))) : 9999;
    const rb = rank.has(String(getKey(b))) ? rank.get(String(getKey(b))) : 9999;
    return ra - rb;
  });
}

export function applySavedTabOrder(container, itemSelector, getKey, groupKey) {
  if (!container) return [];
  const items = Array.from(container.querySelectorAll(itemSelector));
  if (items.length < 2) return items;
  const order = loadTabOrder(groupKey);
  if (!order.length) return items;

  const anchorNext = items[items.length - 1].nextSibling;
  const sorted = sortItemsBySavedOrder(items, getKey, groupKey);
  for (const el of sorted) {
    container.insertBefore(el, anchorNext || null);
  }
  return sorted;
}

export function attachTabDragReorder({ container, itemSelector, getKey, groupKey, onReorder = null }) {
  if (!container) return;
  const items = applySavedTabOrder(container, itemSelector, getKey, groupKey);
  if (items.length < 2) return;

  let draggedKey = null;
  const clearHighlights = () => {
    container.querySelectorAll(itemSelector).forEach(el => {
      el.classList.remove('tab-dragging', 'tab-drag-over-before', 'tab-drag-over-after');
    });
  };

  for (const el of items) {
    el.setAttribute('draggable', 'true');
    el.ondragstart = e => {
      const k = getKey(el);
      if (!k) return;
      draggedKey = String(k);
      el.classList.add('tab-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedKey);
      }
    };
    el.ondragend = () => {
      draggedKey = null;
      clearHighlights();
    };
    el.ondragover = e => {
      const targetKey = getKey(el);
      if (!draggedKey || !targetKey || String(targetKey) === draggedKey) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const insertAfter = e.clientX > rect.left + rect.width * 0.5;
      clearHighlights();
      el.classList.add(insertAfter ? 'tab-drag-over-after' : 'tab-drag-over-before');
    };
    el.ondragleave = () => {
      el.classList.remove('tab-drag-over-before', 'tab-drag-over-after');
    };
    el.ondrop = e => {
      e.preventDefault();
      const targetKey = getKey(el);
      if (!draggedKey || !targetKey || String(targetKey) === draggedKey) {
        clearHighlights();
        return;
      }
      const rect = el.getBoundingClientRect();
      const insertAfter = e.clientX > rect.left + rect.width * 0.5;
      const currentEls = Array.from(container.querySelectorAll(itemSelector));
      const currentIds = currentEls.map(x => String(getKey(x)));
      const nextIds = reorderTabIds(currentIds, draggedKey, targetKey, insertAfter);
      saveTabOrder(groupKey, nextIds);
      applySavedTabOrder(container, itemSelector, getKey, groupKey);
      clearHighlights();
      onReorder?.(nextIds);
    };
  }
}
