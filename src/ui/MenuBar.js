/**
 * Region 1: Main Horizontal Menu Bar (Turkish CorelDRAW-inspired)
 * Every menu item connects directly to the real application commands.
 */

export function attachMenuBar(actions) {
  const bar = document.getElementById('mainMenuBar');
  const drop = document.getElementById('menuDropdown');
  if (!bar || !drop) return;

  const MENUS = {
    file: [
      { label: 'Yeni Proje Belgesi', kbd: 'Ctrl+N', fn: () => actions.newDoc() },
      { label: 'Proje JSON Aç...', kbd: 'Ctrl+O', fn: () => actions.openJson() },
      { label: 'Projeyi Kaydet', kbd: 'Ctrl+S', fn: () => actions.saveDoc() },
      { label: 'JSON Farklı Kaydet...', fn: () => actions.saveJsonFile() },
      { sep: true },
      { label: 'Dışa Aktar...', kbd: 'Ctrl+E', fn: () => actions.openExport() },
    ],
    edit: [
      { label: 'Geri Al', kbd: 'Ctrl+Z', fn: () => actions.undo() },
      { label: 'Yinele', kbd: 'Ctrl+Shift+Z', fn: () => actions.redo() },
      { sep: true },
      { label: 'Kes', kbd: 'Ctrl+X', fn: () => actions.cut() },
      { label: 'Kopyala', kbd: 'Ctrl+C', fn: () => actions.copy() },
      { label: 'Yapıştır', kbd: 'Ctrl+V', fn: () => actions.paste() },
      { label: 'Çoğalt', kbd: 'Ctrl+D', fn: () => actions.duplicate() },
      { label: 'Tümünü Seç', kbd: 'Ctrl+A', fn: () => actions.selectAll() },
      { label: 'Sil', kbd: 'Delete', fn: () => actions.del() },
    ],
    view: [
      { label: '2D Tasarım Görünümü', fn: () => actions.setMainWs('design2d') },
      { label: '3D Kutu Harf Görünümü', fn: () => actions.setMainWs('model3d') },
      { label: 'Ekrana Sığdır', kbd: 'F4', fn: () => actions.fitView() },
      { sep: true },
      { label: 'Izgarayı Göster / Gizle', fn: () => actions.toggleGrid('visible') },
      { label: 'Izgaraya Yasla (Snap)', fn: () => actions.toggleGrid('snapToGrid') },
      { label: 'Nesnelere Yasla (Snap)', fn: () => actions.toggleGrid('snapToObjects') },
      { label: 'Sayfa Çerçevesini Göster/Gizle', fn: () => actions.togglePageFrame() },
      { label: 'Tam Ekran', fn: () => actions.toggleFullscreen() },
    ],
    object: [
      { label: 'Eğriye Çevir (Convert to Curves)', kbd: 'Ctrl+Q', fn: () => actions.cadAction('toCurves') },
      { label: 'Harflere / Parçalara Ayır (Break Apart)', kbd: 'Ctrl+K', fn: () => actions.cadAction('breakApart') },
      { sep: true },
      { label: 'Grupla', kbd: 'Ctrl+G', fn: () => actions.cadAction('group') },
      { label: 'Grubu Çöz', kbd: 'Ctrl+U', fn: () => actions.cadAction('ungroup') },
      { label: 'Birleştir / Kaynak (Weld)', fn: () => actions.cadAction('union') },
      { label: 'Kırp / Çıkar (Trim)', fn: () => actions.cadAction('difference') },
      { label: 'Kesişim (Intersect)', fn: () => actions.cadAction('intersection') },
      { label: 'Bileşik Yol Yap (Combine)', fn: () => actions.cadAction('combine') },
      { sep: true },
      { label: 'Sayfaya Ortala', kbd: 'P', fn: () => actions.centerOnPage() },
      { label: 'Kilitle / Kilidi Aç', fn: () => actions.toggleLockSelected() },
    ],
    layout: [
      { label: 'Yeni Sayfa Ekle', fn: () => actions.addPage() },
      { label: 'Aktif Sayfayı Çoğalt', fn: () => actions.dupPage() },
      { label: 'Aktif Sayfayı Sil', fn: () => actions.delPage() },
    ],
    text: [
      { label: 'Yeni Yazı Ekle', kbd: 'F8', fn: () => actions.tool('text') },
      { label: 'Yazıyı Eğriye Çevir', kbd: 'Ctrl+Q', fn: () => actions.cadAction('toCurves') },
      { label: 'Harflere Ayır (Bağımsız Harfler)', kbd: 'Ctrl+K', fn: () => actions.cadAction('breakApart') },
    ],
    effects: [
      { label: 'Fileli Kutu Harf Yapısı', fn: () => actions.setConstruction('fileli') },
      { label: 'Önden Işıklı Mod', fn: () => actions.setLightingMode('front') },
      { label: 'Arkadan Halo Işıklı Mod', fn: () => actions.setLightingMode('halo') },
      { label: 'Gündüz / Gece Ortamını Değiştir', fn: () => actions.toggleNight() },
    ],
    production: [
      { label: 'Nesting Çalışma Alanı', fn: () => actions.setMainWs('nesting') },
      { label: 'Otomatik Plaka Nesting Hesapla', fn: () => actions.runNesting() },
      { label: 'Üretim / CNC Çalışma Alanı', fn: () => actions.setMainWs('cnc') },
      { label: 'Maliyet ve Teklif Çalışma Alanı', fn: () => actions.setMainWs('cost') },
    ],
    window: [
      { label: 'Nesneler Docker', fn: () => actions.setDocker('objects') },
      { label: 'Özellikler Docker', fn: () => actions.setDocker('properties') },
      { label: 'Katmanlar Docker', fn: () => actions.setDocker('layers') },
      { label: 'Malzemeler Docker', fn: () => actions.setDocker('materials') },
      { label: 'Cephe Ayarları', fn: () => actions.setDocker('background') },
    ],
    help: [
      { label: 'CorelDRAW & CAD Kısayolları', fn: () => actions.showShortcuts() },
      { label: 'Varsayılan Ayarlara Sıfırla', fn: () => actions.resetDefaults() },
    ],
  };

  let openKey = null;
  const closeMenu = () => {
    openKey = null;
    drop.classList.add('hidden');
    bar.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('on'));
  };

  bar.querySelectorAll('.menu-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const k = btn.dataset.menu;
      if (openKey === k) { closeMenu(); return; }
      openKey = k;
      bar.querySelectorAll('.menu-btn').forEach(b => b.classList.toggle('on', b.dataset.menu === k));
      const items = MENUS[k] || [];
      drop.innerHTML = items.map((it, idx) => it.sep
        ? '<div class="ctx-sep"></div>'
        : `<button type="button" class="ctx-item" data-m-idx="${idx}"><span>${it.label}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`
      ).join('');
      const r = btn.getBoundingClientRect();
      drop.style.left = `${Math.min(window.innerWidth - 240, r.left)}px`;
      drop.style.top = `${r.bottom + 2}px`;
      drop.classList.remove('hidden');
      drop.querySelectorAll('[data-m-idx]').forEach(ib => {
        ib.onclick = () => {
          const item = items[Number(ib.dataset.mIdx)];
          closeMenu();
          item?.fn?.();
        };
      });
    };
  });

  window.addEventListener('pointerdown', (e) => {
    if (!drop.contains(e.target) && !e.target.closest('.menu-btn')) closeMenu();
  });
}
