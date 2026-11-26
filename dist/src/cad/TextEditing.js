// Detect completed clicks even when the 2D SVG replaces its children after selection.
export function isTextDoubleClick(previous, next) {
  return !!previous && previous.id === next.id && next.time >= previous.time && next.time - previous.time <= 450 && Math.hypot(next.x - previous.x, next.y - previous.y) <= 8;
}
export function editableTextObject(state, id) {
  if (!['model3d', 'materials', 'design2d'].includes(state.mainWorkspace || 'model3d')) return null;
  return state.objects.find(o => o.id === id && o.kind === 'text' && !o.locked && o.visible !== false) || null;
}
export function applyTextEdit(state, id, textOrOptions) {
  const obj = editableTextObject(state, id);
  if (!obj) return false;
  if (typeof textOrOptions === 'string') {
    if (!textOrOptions.trim() || obj.text === textOrOptions) return false;
    obj.text = textOrOptions;
    state.selectedIds = [id];
    return true;
  }
  if (!textOrOptions || typeof textOrOptions !== 'object') return false;
  const nextText = typeof textOrOptions.text === 'string' ? textOrOptions.text : obj.text;
  if (!nextText || !nextText.trim()) return false;
  obj.text = nextText;
  if (textOrOptions.fontId) obj.fontId = textOrOptions.fontId;
  if (Number.isFinite(Number(textOrOptions.heightMm)) && Number(textOrOptions.heightMm) >= 20) {
    obj.heightMm = Math.max(20, Math.min(3000, Number(textOrOptions.heightMm)));
  }
  if (Number.isFinite(Number(textOrOptions.letterSpacingMm))) {
    obj.letterSpacingMm = Math.max(-50, Math.min(200, Number(textOrOptions.letterSpacingMm)));
  }
  if (Number.isFinite(Number(textOrOptions.lineSpacingMult))) {
    obj.lineSpacingMult = Math.max(0.8, Math.min(3.0, Number(textOrOptions.lineSpacingMult)));
  }
  if (['left', 'center', 'right'].includes(textOrOptions.textAlign)) {
    obj.textAlign = textOrOptions.textAlign;
  }
  if (typeof textOrOptions.fontWeight === 'string') obj.fontWeight = textOrOptions.fontWeight;
  if (typeof textOrOptions.fontItalic === 'boolean') obj.fontItalic = textOrOptions.fontItalic;
  state.selectedIds = [id];
  return true;
}
