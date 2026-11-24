const CONSTRUCTION_TYPES = [
  { id: 'fileli', label: 'Fileli Kutu Harf' },
  { id: 'pleksi', label: 'Pleksi Kutu Harf' },
  { id: 'metal', label: 'Krom / Metal Kutu Harf' },
  { id: 'halo', label: 'Arkadan Işıklı (Halo)' },
  { id: 'isiksiz', label: 'Işıksız Kutu Harf' },
];
import { MATERIAL_PRESETS } from '../render/MaterialLibrary.js';
import { LIGHTING_MODES } from '../render/LightingSystem.js';

/**
 * Context-Sensitive Property Bar (CorelDRAW-style)
 * Adapts dynamically to: Nothing selected (Page), Multiple selected, Text,
 * Rectangle, Vector Curve/Node, 3D Channel Letter, or Nesting Part.
 */
export function renderPropertyBar(state, ctx = {}) {
  const bar = document.getElementById('numericPropBar');
  if (!bar) return;

  const mainWs = state.mainWorkspace || 'model3d';
  const selObjs = (state.objects || []).filter(o => (state.selectedIds || []).includes(o.id));
  const sel = selObjs[0] || null;
  const page = (state.pages || []).find(p => p.id === state.activePageId) || state.pages?.[0];

  // 1. Nesting Part Selected
  if (mainWs === 'nesting') {
    const sheets = state.nesting?.sheets || [];
    const activeSheet = sheets[ctx.activeSheetIdx || 0] || sheets[0];
    const part = activeSheet?.placements?.find(p => p.id === ctx.selectedPlacementId);
    if (part) {
      bar.innerHTML = `
        <span class="chip on" style="cursor:default">Parça: ${escapeHtml(part.label)}</span>
        <div class="prop-field"><label>X</label><input id="npPartX" type="number" step="5" value="${Math.round(part.x || 0)}"></div>
        <div class="prop-field"><label>Y</label><input id="npPartY" type="number" step="5" value="${Math.round(part.y || 0)}"></div>
        <div class="prop-field"><label>Açı</label><input id="npPartRot" type="number" step="15" value="${Math.round(part.rotationDeg || 0)}"></div>
        <span class="chip" style="cursor:default">${escapeHtml(activeSheet?.materialLabel || '')} (${activeSheet?.thicknessMm || 1.2} mm)</span>
        <button type="button" id="npPartLock" class="tb-btn ${part.locked ? 'on' : ''}">${part.locked ? '🔒 Kilitli' : '🔓 Kilitle'}</button>
        ${sheets.length > 1 ? `
          <select id="npMoveSheet" class="prop-select" title="Başka levhaya taşı">
            <option value="">Levhaya taşı...</option>
            ${sheets.map((sh, i) => i !== (ctx.activeSheetIdx || 0) ? `<option value="${i}">Levha ${i + 1} (${escapeHtml(sh.materialLabel)})</option>` : '').join('')}
          </select>
        ` : ''}
      `;
      bindNestingPartBar(bar, ctx);
      return;
    }
  }

  // 2. Multiple Objects Selected
  if (selObjs.length > 1) {
    bar.innerHTML = `
      <span class="chip on" style="cursor:default">${selObjs.length} Nesne Seçili</span>
      <button type="button" class="tb-btn" data-pb-act="group" title="Grupla (Ctrl+G)">Grupla</button>
      <button type="button" class="tb-btn" data-pb-act="ungroup" title="Grubu Çöz (Ctrl+U)">Grubu Çöz</button>
      <div class="prop-sep"></div>
      <div class="prop-align">
        <button type="button" data-align="left" title="Sola Hizala">◧</button>
        <button type="button" data-align="centerX" title="Yatay Ortala">◫</button>
        <button type="button" data-align="right" title="Sağa Hizala">◨</button>
        <button type="button" data-align="top" title="Üste Hizala">⊤</button>
        <button type="button" data-align="centerY" title="Dikey Ortala">⊟</button>
        <button type="button" data-align="bottom" title="Alta Hizala">⊥</button>
        <button type="button" data-dist="x" title="Yatay Dağıt">⋯</button>
      </div>
      <div class="prop-sep"></div>
      <button type="button" class="tb-btn" data-pb-act="union">⊕ Birleştir</button>
      <button type="button" class="tb-btn" data-pb-act="difference">⊖ Çıkar</button>
      <button type="button" class="tb-btn" data-pb-act="intersection">⊗ Kesişim</button>
      <button type="button" class="tb-btn" data-pb-act="combine">⧉ Bileştir</button>
    `;
    bindCommonBarActions(bar, ctx);
    return;
  }

  // 3. Nothing Selected -> Page & Grid & Snap Settings
  if (!sel) {
    const pw = page?.widthMm || state.pageLayout?.widthMm || 2000;
    const ph = page?.heightMm || state.pageLayout?.heightMm || 1000;
    const g = state.grid || {};
    bar.innerHTML = `
      <span class="chip" style="cursor:default">Sayfa: ${escapeHtml(page?.name || 'Sayfa 1')}</span>
      <div class="prop-field"><label>Genişlik (mm)</label><input id="pageW" type="number" min="100" max="10000" step="50" value="${pw}"></div>
      <div class="prop-field"><label>Yükseklik (mm)</label><input id="pageH" type="number" min="100" max="10000" step="50" value="${ph}"></div>
      <button type="button" id="pbPageOrient" class="tb-btn">${pw >= ph ? '▭ Yatay' : '▯ Dikey'}</button>
      <div class="prop-sep"></div>
      <button type="button" id="pbGridVis" class="tb-btn ${g.visible !== false ? 'on' : ''}"># Izgara</button>
      <button type="button" id="pbSnapGrid" class="tb-btn ${g.snapToGrid ? 'on' : ''}">🧲 Izgaraya Yasla</button>
      <button type="button" id="pbSnapObj" class="tb-btn ${g.snapToObjects !== false ? 'on' : ''}">🧲 Nesneye Yasla</button>
      <button type="button" id="btnTogglePageFrame" class="tb-btn ${state.pageLayout?.visible ? 'on' : ''}">▭ Çerçeve</button>
      <button type="button" id="pbFitView" class="tb-btn">🔍 Sığdır</button>
    `;
    bindPageBarActions(bar, ctx);
    return;
  }

  // 4. Single Object Selected (adapt to 3D vs 2D / kind)
  const locked = sel.proportionalLock !== false;
  const scaledH = Math.round((sel.heightMm || 400) * (sel.scaleY ?? 1));
  const baseCommon = `
    <div class="prop-field"><label for="numX">X</label><input id="numX" type="number" step="5" value="${Math.round(sel.xMm || 0)}"></div>
    <div class="prop-field"><label for="numY">Y</label><input id="numY" type="number" step="5" value="${Math.round(sel.yMm || 0)}"></div>
    <div class="prop-field"><label for="numH">Yükseklik</label><input id="numH" type="number" min="20" max="3000" step="10" value="${scaledH}"></div>
    <div class="prop-field"><label for="numScale">Ölçek</label><input id="numScale" type="number" min="0.1" max="10" step="0.05" value="${Number((sel.scaleX ?? 1).toFixed(2))}"><button type="button" id="btnPropLock" class="tb-btn ${locked ? 'on' : ''}" style="padding:2px 6px" title="Oranı Kilitle">${locked ? '🔒' : '🔓'}</button></div>
    <div class="prop-field"><label for="numRot">Açı</label><input id="numRot" type="number" min="-360" max="360" step="5" value="${Math.round(sel.rotationDeg || 0)}"></div>
  `;

  if (mainWs === 'model3d' || mainWs === 'materials') {
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep"></div>
      <div class="prop-field"><label for="numD">Kenar Çıta</label><input id="numD" type="number" min="10" max="400" step="5" value="${Math.round(sel.depthMm ?? 80)}"></div>
      <div class="prop-field"><label for="pbFileW">File (mm)</label><input id="pbFileW" type="number" min="0" max="40" step="1" value="${sel.fileWidthMm ?? 5}"></div>
      <div class="prop-field">
        <label>Yapı</label>
        <select id="pbCtype" class="prop-select">${CONSTRUCTION_TYPES.map(t => `<option value="${t.id}" ${(sel.constructionType || state.constructionType) === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
      </div>
      <div class="prop-field">
        <label>Işık</label>
        <select id="pbLmode" class="prop-select">${Object.values(LIGHTING_MODES).map(m => `<option value="${m.id}" ${(sel.lightingMode || state.lighting.mode) === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
      </div>
      <button type="button" id="btnCenterOnPage" class="tb-btn" title="Sayfaya Ortala (P)">⌖ Ortala</button>
    `;
  } else if (sel.kind === 'text') {
    const fonts = ctx.fonts || [];
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep"></div>
      <div class="prop-field">
        <label>Font</label>
        <select id="pbFont" class="prop-select">${fonts.map(f => `<option value="${f.id}" ${(sel.fontId || 'cinzel') === f.id ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}</select>
      </div>
      <div class="prop-field"><label for="numSpacing">Aralık</label><input id="numSpacing" type="number" min="-50" max="200" step="1" value="${Math.round(sel.letterSpacingMm ?? 8)}"></div>
      <button type="button" class="tb-btn" data-pb-act="toCurves" title="Eğriye Çevir (Ctrl+Q)">∿ Eğriye Çevir</button>
      <button type="button" class="tb-btn" data-pb-act="breakApart" title="Harflere Ayır (Ctrl+K)">✂ Harflere Ayır</button>
    `;
  } else if (sel.kind === 'rect') {
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep"></div>
      <div class="prop-field"><label>Genişlik</label><input id="pbRectW" type="number" min="10" max="5000" step="10" value="${Math.round((sel.widthMm || 320) * (sel.scaleX ?? 1))}"></div>
      <div class="prop-field"><label>Köşe Radyüs</label><input id="pbCornerR" type="number" min="0" max="200" step="2" value="${Math.round(sel.cornerRadiusMm || 0)}"></div>
      <button type="button" class="tb-btn" data-pb-act="toCurves">∿ Eğriye Çevir</button>
    `;
  } else if (sel.kind === 'polygon') {
    const hasMulti = (sel.polygonsMm?.length || 0) > 1;
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep"></div>
      <button type="button" class="tb-btn ${state.activeTool === 'node' ? 'on' : ''}" data-pb-tool="node" title="Düğüm Düzenleme (F10)">◈ Düğüm</button>
      <button type="button" class="tb-btn" data-pb-act="addNode">+ Düğüm Ekle</button>
      <button type="button" class="tb-btn" data-pb-act="delNode">- Düğüm Sil</button>
      <button type="button" class="tb-btn" data-pb-act="reversePath">⇄ Yönü Çevir</button>
      ${hasMulti ? `<button type="button" class="tb-btn" data-pb-act="breakApart">✂ Parçalara Ayır</button>` : ''}
    `;
  } else {
    bar.innerHTML = `
      ${baseCommon}
      <button type="button" id="btnCenterOnPage" class="tb-btn">⌖ Ortala</button>
    `;
  }

  bindObjectBarEvents(bar, sel, ctx);
}

function bindCommonBarActions(bar, ctx) {
  bar.querySelectorAll('[data-pb-act]').forEach(b => b.onclick = () => ctx.onCadAction?.(b.dataset.pbAct));
  bar.querySelectorAll('[data-align]').forEach(b => b.onclick = () => ctx.onAlign?.(b.dataset.align));
  bar.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => ctx.onDistribute?.(b.dataset.dist));
}

function bindPageBarActions(bar, ctx) {
  bar.querySelector('#pageW')?.addEventListener('change', e => ctx.onPageSize?.(Number(e.target.value), null));
  bar.querySelector('#pageH')?.addEventListener('change', e => ctx.onPageSize?.(null, Number(e.target.value)));
  bar.querySelector('#pbPageOrient')?.addEventListener('click', () => ctx.onTogglePageOrient?.());
  bar.querySelector('#pbGridVis')?.addEventListener('click', () => ctx.onToggleGrid?.('visible'));
  bar.querySelector('#pbSnapGrid')?.addEventListener('click', () => ctx.onToggleGrid?.('snapToGrid'));
  bar.querySelector('#pbSnapObj')?.addEventListener('click', () => ctx.onToggleGrid?.('snapToObjects'));
  bar.querySelector('#btnTogglePageFrame')?.addEventListener('click', () => ctx.onTogglePageFrame?.());
  bar.querySelector('#pbFitView')?.addEventListener('click', () => ctx.onFitView?.());
}

function bindNestingPartBar(bar, ctx) {
  bar.querySelector('#npPartX')?.addEventListener('change', e => ctx.onNestingPartEdit?.('x', Number(e.target.value)));
  bar.querySelector('#npPartY')?.addEventListener('change', e => ctx.onNestingPartEdit?.('y', Number(e.target.value)));
  bar.querySelector('#npPartRot')?.addEventListener('change', e => ctx.onNestingPartEdit?.('rot', Number(e.target.value)));
  bar.querySelector('#npPartLock')?.addEventListener('click', () => ctx.onNestingPartEdit?.('toggleLock'));
  bar.querySelector('#npMoveSheet')?.addEventListener('change', e => {
    if (e.target.value !== '') ctx.onNestingPartEdit?.('moveSheet', Number(e.target.value));
  });
}

function bindObjectBarEvents(bar, sel, ctx) {
  const num = (id, fn) => bar.querySelector('#' + id)?.addEventListener('change', e => ctx.onEditSelected?.(o => fn(o, Number(e.target.value))));
  num('numX', (o, v) => { o.xMm = v; });
  num('numY', (o, v) => { o.yMm = v; });
  num('numD', (o, v) => { o.depthMm = Math.max(10, v); });
  num('numRot', (o, v) => { o.rotationDeg = v; });
  num('numSpacing', (o, v) => { o.letterSpacingMm = v; });
  num('pbFileW', (o, v) => { o.fileWidthMm = Math.max(0, Math.min(40, v)); });
  num('pbCornerR', (o, v) => { o.cornerRadiusMm = Math.max(0, v); });
  num('pbRectW', (o, v) => {
    const baseW = Math.max(10, o.widthMm || 320);
    const sx = Math.max(0.05, v / baseW);
    o.scaleX = sx;
    if (o.proportionalLock !== false) o.scaleY = sx;
  });
  num('numScale', (o, v) => {
    const val = Math.max(0.05, v);
    o.scaleX = val;
    if (o.proportionalLock !== false) o.scaleY = val;
  });
  num('numH', (o, v) => {
    const newH = Math.max(20, v);
    const sy = o.scaleY ?? 1;
    const baseH = Math.max(10, o.heightMm || 400);
    if (o.proportionalLock !== false) {
      const f = newH / (baseH * sy);
      o.scaleX = Math.max(0.05, (o.scaleX ?? 1) * f);
      o.scaleY = Math.max(0.05, sy * f);
    } else {
      o.scaleY = Math.max(0.05, newH / baseH);
    }
  });

  bar.querySelector('#btnPropLock')?.addEventListener('click', () => ctx.onEditSelected?.(o => { o.proportionalLock = !(o.proportionalLock !== false); }));
  bar.querySelector('#btnCenterOnPage')?.addEventListener('click', () => ctx.onEditSelected?.(o => { o.xMm = 0; o.yMm = 0; }));
  bar.querySelector('#pbFont')?.addEventListener('change', e => ctx.onEditSelected?.(o => { o.fontId = e.target.value; }));
  bar.querySelector('#pbCtype')?.addEventListener('change', e => ctx.onEditSelected?.(o => { o.constructionType = e.target.value; }));
  bar.querySelector('#pbLmode')?.addEventListener('change', e => ctx.onEditSelected?.(o => { o.lightingMode = e.target.value; }));
  bar.querySelectorAll('[data-pb-act]').forEach(b => b.onclick = () => ctx.onCadAction?.(b.dataset.pbAct));
  bar.querySelectorAll('[data-pb-tool]').forEach(b => b.onclick = () => ctx.onTool?.(b.dataset.pbTool));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
