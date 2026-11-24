/** Dedicated imported-vector source tabs inside the existing Nesting workspace. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderNestingSourceTabs(n={}) {
 const current=n.activeTabId||'design';
 return `<nav class="nesting-source-tabs" aria-label="Nesting dosyaları">
   <span class="nesting-source-tabs-label">NESTING DOSYALARI</span>
   <button type="button" class="nesting-source-tab ${current==='design'?'on':''}" data-nest-tab="design">◈ Bu Proje</button>
   ${(n.importedTabs||[]).map(t=>`<span class="nesting-source-filetab ${t.id===current?'on':''}">
     <button type="button" class="nesting-source-tab ${t.id===current?'on':''}" data-nest-tab="${esc(t.id)}" title="${esc(t.name)}">▤ ${esc(t.name)}</button>
     <button type="button" class="nesting-source-close" data-nest-close="${esc(t.id)}" title="Nesting sekmesini kapat" aria-label="${esc(t.name)} sekmesini kapat">×</button>
   </span>`).join('')}
   <button type="button" class="nesting-import-trigger ${current==='import'?'on':''}" data-nest-import="true" title="Vektör dosyasını yeni Nesting sekmesine içe aktar (Nesting'de Ctrl+E)">＋ İçe Aktar</button>
 </nav>`;
}
export function renderNestingImportPane() {
 return `<div class="nesting-import-panel">
   <div class="nesting-import-hero"><div class="nesting-import-mark">▧</div>
     <div><h2>Vektör Dosyası İçe Aktar</h2><p>SVG, PDF, AutoCAD ASCII DXF ve HPGL/PLT dosyalarını cihazında aç. Büyük dosyalar ayrı iş parçacığında işlenir. Önce hızlı güvenli yerleşim, sonra isteğe bağlı optimizasyon.</p></div>
   </div>
   <div class="nesting-import-controls">
     <label>Dosya ölçek birimi<select id="nestImportUnit"><option value="auto">Otomatik · dosyadan oku</option><option value="mm">Milimetre (mm)</option><option value="cm">Santimetre (cm)</option><option value="m">Metre (m)</option><option value="in">İnç (in)</option><option value="px">Piksel · 96 DPI</option></select></label>
     <label>Ölçek katsayısı<input type="number" id="nestImportScale" min="0.001" max="1000" value="1" step="0.01"></label>
     <label>Bezier eğri hassasiyeti (mm)<input type="number" id="nestImportTolerance" min="0.2" max="8" value="1" step="0.1"></label>
   </div>
   <label class="nesting-file-drop" id="nestVectorDropZone" for="nestVectorFileInput">
      <span class="nesting-drop-icon">⇪</span><strong>Dosya seç veya buraya sürükle</strong>
      <span>SVG · SVGZ · PDF · PDF uyumlu AI · DXF (ASCII) · HPGL / PLT</span><span>Birden fazla dosya seçebilirsin; her dosya ayrı sekmede açılır.</span>
   </label>
   <input hidden type="file" id="nestVectorFileInput" accept=".svg,.dxf,.plt,.hpgl,.pdf,.eps,.ps,.ai,.cdr,.dwg,.wmf,.emf,.cgm,.cmx,.svgz" multiple>
   <div class="nesting-import-progress"><p id="nestImportMessage" class="nesting-import-message" role="status" aria-live="polite">Sabit 12 MB sınırı kaldırıldı. Dosyalar yerel olarak işlenir.</p><button type="button" hidden id="nestImportCancel" class="nesting-import-cancel">✕ İptal Et</button></div>
   <details class="nesting-import-converters"><summary>Özel dosya formatları: CDR, AI, EPS, DWG, WMF, EMF ve diğerleri</summary><p><b>PDF yerel PDF.js ile doğrudan açılır.</b> PDF uyumlu AI dosyaları da açılabilir. CDR, EPS, DWG, WMF ve EMF için doğrulanmış yerel dönüştürme motorları henüz hazır değil; geçerli SVG veya ASCII DXF kullanın. Dosya uzantısını değiştirmek dönüştürmez.</p></details>
   <p class="nesting-import-caution">Üretim güvenliği: Dosya içe aktarıldığında kapalı konturlar, iç boşluklar ve fiziksel ölçüler kontrol edilir. CNC çıkışından önce makine, malzeme ve ölçüleri onaylayın.</p>
 </div>`;
}
