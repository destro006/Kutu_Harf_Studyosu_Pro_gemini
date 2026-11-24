/**
 * CorelDRAW-Inspired Keyboard Shortcuts Manager
 * Safely ignores text-typing inputs while keeping Ctrl+Z/Y/S/D and CAD tools responsive.
 */

import {ALIGN_COMMANDS,alignmentCommand} from './Alignment.js';
export const SHORTCUT_GROUPS = [
  {title:'Hizalama ve Dağıtma (CorelDRAW)',items:ALIGN_COMMANDS.map(([,label,keys])=>({keys,label}))},
  {
    title: 'CAD Araçları (CorelDRAW)',
    items: [
      { keys: 'Boşluk / V', label: 'Seçim Aracı' },
      { keys: 'M', label: 'Taşıma Aracı' },
      { keys: 'S', label: 'Ölçek & Ebat Aracı' },
      { keys: 'Alt + F8', label: '3D Döndürme Aracı (X/Y/Z)' },
      { keys: 'H', label: 'Sahneyi Kaydır (Pan)' },
      { keys: 'Z', label: 'Yakınlaştır' },
      { keys: 'F4', label: 'Ekrana Sığdır' },
    ],
  },
  {
    title: 'Çizim, Ölçüm & Düzenleme',
    items: [
      { keys: 'F5', label: 'Kalem / Çokgen Çizimi' },
      { keys: 'F6', label: 'Dikdörtgen Aracı' },
      { keys: 'F7', label: 'Elips Aracı' },
      { keys: 'F8', label: 'Yazı Aracı' },
      { keys: 'F10', label: 'Düğüm (Shape) Düzenleme' },
      { keys: 'D', label: 'Mesafe Ölçüm Aracı' },
      { keys: 'Ctrl + Q', label: 'Eğriye Çevir (Convert to Curves)' },
      { keys: 'Ctrl + K', label: 'Harflere / Parçalara Ayır (Break Apart)' },
      { keys: 'Ctrl + L', label: 'Bileşik Yol Yap (Combine)' },
      { keys: 'Ctrl + I', label: 'Logo / SVG İçe Aktar' },
    ],
  },
  {
    title: 'Genel İşlemler & Klavye',
    items: [
      { keys: 'Ctrl + D', label: 'Seçili Nesneyi Çoğalt' },
      { keys: 'Ctrl + G / Ctrl + U', label: 'Grupla / Grubu Çöz' },
      { keys: 'Ctrl + Z / Ctrl + Y', label: 'Geri Al / Yinele' },
      { keys: 'Ctrl + C / Ctrl + X / Ctrl + V', label: 'Kopyala / Kes / Yapıştır' },
      { keys: 'Ctrl + E', label: 'Dışa Aktar (Seçili Nesneler Dahil)' },
      { keys: 'Ctrl + A', label: 'Tüm Nesneleri Seç' },
      { keys: 'Ctrl + S', label: 'Projeyi Kaydet' },
      { keys: 'Delete', label: 'Seçili Kilitsiz Nesneyi Sil' },
      { keys: 'Esc', label: 'İşlemi İptal Et / Araçtan Çık' },
      { keys: 'Ok Tuşları / Shift + Ok', label: '5 mm / 25 mm Hassas Taşı' },
    ],
  },
];

export const SHORTCUT_LIST = SHORTCUT_GROUPS.flatMap(g => g.items);

export function isTextTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'password'].includes(t);
  }
  if (el.isContentEditable) return true;
  return false;
}

export function isAnyInputTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function attachShortcuts(handlers) {
  const onKeyDown = (e) => {
    const activeEl = document.activeElement;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Always allow Esc to cancel active operation or blur input
    if (e.key === 'Escape') {
      if (isAnyInputTarget(activeEl)) activeEl?.blur?.();
      e.preventDefault();
      handlers.onEscape?.();
      return;
    }

    // Allow Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z / Ctrl+S even when a numeric/range/select input had focus
    if (!isTextTypingTarget(e.target) && !isTextTypingTarget(activeEl)) {
      if (ctrl && e.shiftKey && key === 'z') { e.preventDefault(); handlers.onRedo?.(); return; }
      if (ctrl && key === 'z') { e.preventDefault(); handlers.onUndo?.(); return; }
      if (ctrl && key === 'y') { e.preventDefault(); handlers.onRedo?.(); return; }
      if (ctrl && key === 's') { e.preventDefault(); handlers.onSave?.(); return; }
      if (ctrl && key === 'e') { e.preventDefault(); handlers.onExport?.(); return; }
    }

    // Never intercept single-key tools or Delete while typing in any input/select
    if (isAnyInputTarget(e.target) || isAnyInputTarget(activeEl)) {
      return;
    }

    if(!ctrl&&e.altKey&&!e.shiftKey&&e.key==='F8'){e.preventDefault();handlers.onTool?.('rotate');return;}
    if(!ctrl&&!e.altKey){const cmd=alignmentCommand(key,e.shiftKey);if(cmd){e.preventDefault();if(!e.repeat)handlers.onAlignment?.(cmd);return;}}
    // Function keys (CorelDRAW standard)
    if (e.key === 'F4') { e.preventDefault(); handlers.onFitCamera?.(); return; }
    if (e.key === 'F5') { e.preventDefault(); handlers.onTool?.('pen'); return; }
    if (e.key === 'F6') { e.preventDefault(); handlers.onTool?.('rect'); return; }
    if (e.key === 'F7') { e.preventDefault(); handlers.onTool?.('ellipse'); return; }
    if (e.key === 'F8') { e.preventDefault(); handlers.onTool?.('text'); return; }
    if (e.key === 'F10') { e.preventDefault(); handlers.onTool?.('node'); return; }
    if (e.key === ' ') { e.preventDefault(); handlers.onTool?.('select'); return; }

    // Ctrl combinations
    if (ctrl && key === 'q') { e.preventDefault(); handlers.onToCurves?.(); return; }
    if (ctrl && key === 'k') { e.preventDefault(); handlers.onBreakApart?.(); return; }
    if (ctrl && key === 'l') { e.preventDefault(); handlers.onCombine?.(); return; }
    if (ctrl && key === 'n') { e.preventDefault(); handlers.onNewDoc?.(); return; }
    if (ctrl && key === 'i') { e.preventDefault(); handlers.onTool?.('logo'); return; }
    if (ctrl && key === 'd') { e.preventDefault(); handlers.onDuplicate?.(); return; }
    if (ctrl && key === 'c') { e.preventDefault(); handlers.onCopy?.(); return; }
    if (ctrl && key === 'x') { e.preventDefault(); handlers.onCut?.(); return; }
    if (ctrl && key === 'v') { e.preventDefault(); handlers.onPaste?.(); return; }
    if (ctrl && key === 'a') { e.preventDefault(); handlers.onSelectAll?.(); return; }
    if (ctrl && key === 'u') { e.preventDefault(); handlers.onUngroup?.(); return; }
    if (ctrl && e.shiftKey && key === 'g') { e.preventDefault(); handlers.onUngroup?.(); return; }
    if (ctrl && key === 'g') { e.preventDefault(); handlers.onGroup?.(); return; }

    // Single-key tool shortcuts (when no Ctrl/Alt)
    if (!ctrl && !e.altKey) {
      if (key === 'v') { e.preventDefault(); handlers.onTool?.('select'); return; }
      if (key === 'm') { e.preventDefault(); handlers.onTool?.('move'); return; }
      if (key === 's') { e.preventDefault(); handlers.onTool?.('scale'); return; }
      if (key === 'h') { e.preventDefault(); handlers.onTool?.('pan'); return; }
      if (key === 'z') { e.preventDefault(); handlers.onTool?.('zoom'); return; }
      if (key === 'd') { e.preventDefault(); handlers.onTool?.('measure'); return; }
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      handlers.onDelete?.();
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
