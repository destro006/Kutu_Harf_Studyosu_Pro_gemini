/**
 * Corel-Inspired Keyboard Shortcuts Manager
 * Safely ignores shortcuts when the user is typing in text inputs, numeric fields, or textareas.
 */

export const SHORTCUT_LIST = [
  { keys: 'F6', label: 'Dikdörtgen Aracı' },
  { keys: 'F7', label: 'Elips Aracı' },
  { keys: 'F8', label: 'Yazı Aracı' },
  { keys: 'Boşluk (Space)', label: 'Seçim Aracı' },
  { keys: 'Ctrl + D', label: 'Seçili Nesneyi Çoğalt' },
  { keys: 'Ctrl + Z', label: 'Geri Al' },
  { keys: 'Ctrl + Shift + Z / Ctrl + Y', label: 'Yinele' },
  { keys: 'Ctrl + C / Ctrl + X / Ctrl + V', label: 'Kopyala / Kes / Yapıştır' },
  { keys: 'Ctrl + A', label: 'Tüm Nesneleri Seç' },
  { keys: 'Ctrl + S', label: 'Projeyi Kaydet' },
  { keys: 'Delete', label: 'Seçili Kilitsiz Nesneyi Sil' },
  { keys: 'Esc', label: 'Seçimi Temizle / Araçtan Çık' },
  { keys: 'Ok Tuşları', label: 'Seçili Nesneyi 5 mm Taşı' },
  { keys: 'Shift + Ok Tuşları', label: 'Seçili Nesneyi 25 mm Taşı' },
];

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function attachShortcuts(handlers) {
  const onKeyDown = (e) => {
    // Never intercept while typing in an input or numeric field
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) {
      if (e.key === 'Escape') {
        document.activeElement?.blur?.();
      }
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === 'F6') { e.preventDefault(); handlers.onTool?.('rect'); return; }
    if (e.key === 'F7') { e.preventDefault(); handlers.onTool?.('ellipse'); return; }
    if (e.key === 'F8') { e.preventDefault(); handlers.onTool?.('text'); return; }
    if (e.key === ' ') { e.preventDefault(); handlers.onTool?.('select'); return; }

    if (ctrl && key === 'd') { e.preventDefault(); handlers.onDuplicate?.(); return; }
    if (ctrl && e.shiftKey && key === 'z') { e.preventDefault(); handlers.onRedo?.(); return; }
    if (ctrl && key === 'z') { e.preventDefault(); handlers.onUndo?.(); return; }
    if (ctrl && key === 'y') { e.preventDefault(); handlers.onRedo?.(); return; }
    if (ctrl && key === 'c') { e.preventDefault(); handlers.onCopy?.(); return; }
    if (ctrl && key === 'x') { e.preventDefault(); handlers.onCut?.(); return; }
    if (ctrl && key === 'v') { e.preventDefault(); handlers.onPaste?.(); return; }
    if (ctrl && key === 's') { e.preventDefault(); handlers.onSave?.(); return; }
    if (ctrl && key === 'a') { e.preventDefault(); handlers.onSelectAll?.(); return; }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handlers.onDelete?.();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handlers.onEscape?.();
      return;
    }

    const step = e.shiftKey ? 25 : 5;
    if (e.key === 'ArrowLeft') { e.preventDefault(); handlers.onNudge?.(-step, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); handlers.onNudge?.(step, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); handlers.onNudge?.(0, step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); handlers.onNudge?.(0, -step); }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
