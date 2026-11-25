import {resolveObjectLighting} from '../core/ObjectLighting.js';
import { nominalSize, roundMm, resizeObjectToMm } from '../core/ObjectDimensions.js';
import { DISPLAY_UNITS, PAGE_SIZE_PRESETS, normalizeDisplayUnit, displayUnitLabel, mmToDisplay, displayToMm, formatMmAsUnit, formatPresetLabel } from '../core/units.js';
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
  const light=resolveObjectLighting(sel,state);

  // Preserve the actual DOM node of an open select or active numeric input.
  // Replacing innerHTML on a scene update closes native menus, loses typed
  // numbers and can swallow the click that was about to commit a selection.
  const contextKey = [mainWs, normalizeDisplayUnit(state.pageLayout?.displayUnit), ...selObjs.map(o => o.id), light.mode, mainWs === 'nesting' ? (ctx.selectedPlacementId || '') : ''].join('|');
  // The minimal DOM stubs used by unit tests omit focus APIs; the production
  // HTMLElement always provides dataset, contains and addEventListener.
  if (!bar.dataset) bar.dataset = {};
  bar._refreshAfterFocus = ctx.onRefreshBar;
  if (!bar._focusPreservationBound && typeof bar.addEventListener === 'function') {
    bar._focusPreservationBound = true;
    bar.addEventListener('focusout', () => {
      setTimeout(() => {
        if (bar.dataset.pendingRefresh === '1' &&
            (typeof bar.contains !== 'function' || !bar.contains(document.activeElement))) {
          bar.dataset.pendingRefresh = '0';
          bar._refreshAfterFocus?.();
        }
      }, 0);
    });
  }
  const activeControl = document.activeElement;
  if (bar.dataset.lastContextKey === contextKey &&
      typeof bar.contains === 'function' &&
      bar.contains(activeControl) && /^(INPUT|SELECT|TEXTAREA)$/i.test(activeControl?.tagName || '')) {
    bar.dataset.pendingRefresh = '1';
    return;
  }
  bar.dataset.lastContextKey = contextKey;
  bar.classList?.toggle("compact-property-line",["model3d","materials","design2d"].includes(mainWs));
  bar.dataset.pendingRefresh = '0';
  const page = (state.pages || []).find(p => p.id === state.activePageId) || state.pages?.[0];
  const unit = normalizeDisplayUnit(state.pageLayout?.displayUnit);
  const u = displayUnitLabel(unit);
  const show = mm => formatMmAsUnit(mm, unit);
  const unitSelect = `<div class="prop-field unit-picker"><label for="pbDisplayUnit">Birim</label><select id="pbDisplayUnit" class="prop-select" aria-label="Ölçü birimi">${DISPLAY_UNITS.map(item => `<option value="${item.id}" ${item.id === unit ? 'selected' : ''}>${item.label}</option>`).join('')}</select></div>`;


  // 1. Nesting Part Selected
  if (mainWs === 'nesting') {
    const sheets = state.nesting?.sheets || [];
    const activeSheet = sheets[ctx.activeSheetIdx || 0] || sheets[0];
    const part = activeSheet?.placements?.find(p => p.id === ctx.selectedPlacementId);
    if (part) {
      bar.innerHTML = `
        ${unitSelect}
        <span class="chip on" style="cursor:default">Parça: ${escapeHtml(part.label)}</span>
        <div class="prop-field"><label>X (${u})</label><input id="npPartX" type="number" step="any" value="${show(part.xMm ?? part.bounds?.minX ?? 0)}"></div>
        <div class="prop-field"><label>Y (${u})</label><input id="npPartY" type="number" step="any" value="${show(part.yMm ?? part.bounds?.minY ?? 0)}"></div>
        <div class="prop-field"><label>G (${u})</label><input id="npPartW" type="number" step="any" min="0.001" value="${show(part.bounds.width)}"></div>
        <div class="prop-field"><label>Y (${u})</label><input id="npPartH" type="number" step="any" min="0.001" value="${show(part.bounds.height)}"></div>
        <div class="prop-field"><label>Açı</label><input id="npPartRot" type="number" step="15" value="${Math.round(part.angleDeg || 0)}"></div>
        <span class="chip" style="cursor:default">${escapeHtml(activeSheet?.materialLabel || '')} (${show(activeSheet?.thicknessMm || 1.2)} ${u})</span>
        <button type="button" id="npPartLock" class="tb-btn ${part.locked ? 'on' : ''}">${part.locked ? '🔒 Kilitli' : '🔓 Kilitle'}</button>
        ${sheets.length > 1 ? `
          <select id="npMoveSheet" class="prop-select" title="Başka levhaya taşı">
            <option value="">Levhaya taşı...</option>
            ${sheets.map((sh, i) => i !== (ctx.activeSheetIdx || 0) ? `<option value="${i}">Levha ${i + 1} (${escapeHtml(sh.materialLabel)})</option>` : '').join('')}
          </select>
        ` : ''}
      `;
      bindNestingPartBar(bar, ctx, unit);
      return;
    }
    bar.innerHTML=`${unitSelect}<span class="chip">Nesting · Parça seçin</span>`;
    bindUnitControl(bar,ctx);return;
  }

  // 2. Multiple Objects Selected
  if (selObjs.length > 1) {
    bar.innerHTML = `
      ${unitSelect}
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
      <span class="chip page-layout-title" style="cursor:default">Sayfa ve Yerleşim · ${escapeHtml(page?.name || 'Sayfa 1')}</span>
      ${unitSelect}
      <div class="prop-field"><label for="pbPagePreset">Ebat</label><select id="pbPagePreset" class="prop-select" aria-label="Hazır sayfa boyutu">${PAGE_SIZE_PRESETS.map(p => `<option value="${p.id}" ${(state.pageLayout?.preset || 'custom') === p.id ? 'selected' : ''}>${formatPresetLabel(p,unit)}</option>`).join('')}</select></div>
      <div class="prop-field"><label for="pageW">Genişlik (${u})</label><input id="pageW" type="number" min="${show(1)}" step="any" value="${show(pw)}" aria-label="Sayfa genişliği"></div>
      <div class="prop-field"><label for="pageH">Yükseklik (${u})</label><input id="pageH" type="number" min="${show(1)}" step="any" value="${show(ph)}" aria-label="Sayfa yüksekliği"></div>
      <button type="button" id="pbPageOrient" class="tb-btn">${pw >= ph ? '▭ Yatay' : '▯ Dikey'}</button>
      <div class="prop-sep"></div>
      <button type="button" id="pbGridVis" class="tb-btn ${g.visible !== false ? 'on' : ''}"># Izgara</button>
      <button type="button" id="pbSnapGrid" class="tb-btn ${g.snapToGrid ? 'on' : ''}">🧲 Izgaraya Yasla</button>
      <button type="button" id="pbSnapObj" class="tb-btn ${g.snapToObjects !== false ? 'on' : ''}">🧲 Nesneye Yasla</button>
      <button type="button" id="btnTogglePageFrame" class="tb-btn ${state.pageLayout?.visible ? 'on' : ''}">▭ Çerçeve</button>
      <button type="button" id="pbFitView" class="tb-btn">🔍 Sığdır</button>
    `;
    bindPageBarActions(bar, ctx, unit);
    return;
  }

  // 4. Single Object Selected (adapt to 3D vs 2D / kind)
  const locked = sel.proportionalLock !== false;
  const size=ctx.getObjectSize?.(sel)||nominalSize(sel);
  const scaledH=roundMm(size.heightMm),scaledW=roundMm(size.widthMm);
  const baseCommon = `
    ${unitSelect}
    <div class="prop-field"><label for="numX">X (${u})</label><input id="numX" type="number" step="any" value="${show(sel.xMm || 0)}"></div>
    <div class="prop-field"><label for="numY">Y (${u})</label><input id="numY" type="number" step="any" value="${show(sel.yMm || 0)}"></div>
    <div class="prop-field"><label for="numW">Genişlik (${u})</label><input id="numW" type="number" min="${show(0.01)}" step="any" value="${show(scaledW)}"></div>
    <div class="prop-field"><label for="numH">Yükseklik (${u})</label><input id="numH" type="number" min="${show(0.5)}" step="any" value="${show(scaledH)}"></div>
    <div class="prop-field"><label for="numScale">Ölçek</label><input id="numScale" type="number" min="0.1" max="10" step="0.05" value="${Number((sel.scaleX ?? 1).toFixed(2))}"><button type="button" id="btnPropLock" class="tb-btn ${locked ? 'on' : ''}" style="padding:2px 6px" title="Oranı Kilitle">${locked ? '🔒' : '🔓'}</button></div>
    <div class="prop-field"><label for="numRot">Açı</label><input id="numRot" type="number" min="-360" max="360" step="5" value="${Math.round(sel.rotationDeg || 0)}"></div>
  `;

  if (mainWs === 'model3d' || mainWs === 'materials') {
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep" aria-hidden="true"></div>
      <div class="prop-field"><label for="numD">Derinlik (${u})</label><input id="numD" type="number" min="${show(1)}" step="any" value="${show(sel.depthMm ?? 80)}"></div>
      <div class="prop-field"><label for="pbFileW">File (${u})</label><input id="pbFileW" type="number" min="0" step="any" value="${show(sel.fileWidthMm ?? 5)}"></div>
      <div class="prop-field">
        <label>Yapı</label>
        <select id="pbCtype" class="prop-select">${CONSTRUCTION_TYPES.map(t => `<option value="${t.id}" ${(sel.constructionType || state.constructionType) === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
      </div>
      <div class="prop-field">
        <label>Işık</label>
        <select id="pbLmode" class="prop-select">${Object.values(LIGHTING_MODES).map(m => `<option value="${m.id}" ${(sel.lightingMode || state.lighting.mode) === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
      </div>
      ${quickLightFields(light,sel.locked)}
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
      <div class="prop-field"><label for="numSpacing">Aralık (${u})</label><input id="numSpacing" type="number" step="any" value="${show(sel.letterSpacingMm ?? 8)}"></div>
      <button type="button" class="tb-btn" data-pb-act="toCurves" title="Eğriye Çevir (Ctrl+Q)">∿ Eğriye Çevir</button>
      <button type="button" class="tb-btn" data-pb-act="breakApart" title="Harflere Ayır (Ctrl+K)">✂ Harflere Ayır</button>
    `;
  } else if (sel.kind === 'rect') {
    bar.innerHTML = `
      ${baseCommon}
      <div class="prop-sep"></div>
      <div class="prop-field"><label>Köşe Radyüs (${u})</label><input id="pbCornerR" type="number" min="0" step="any" value="${show(sel.cornerRadiusMm || 0)}"></div>
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

  bindObjectBarEvents(bar, sel, ctx, unit);
}

function bindUnitControl(bar, ctx) {
  bar.querySelector('#pbDisplayUnit')?.addEventListener('change', e => ctx.onDisplayUnit?.(normalizeDisplayUnit(e.target.value)));
}

function bindCommonBarActions(bar, ctx) {
  bindUnitControl(bar, ctx);
  bar.querySelectorAll('[data-pb-act]').forEach(b => b.onclick = () => ctx.onCadAction?.(b.dataset.pbAct));
  bar.querySelectorAll('[data-align]').forEach(b => b.onclick = () => ctx.onAlign?.(b.dataset.align));
  bar.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => ctx.onDistribute?.(b.dataset.dist));
}

function bindPageBarActions(bar, ctx, unit) {
  bindUnitControl(bar, ctx);
  bar.querySelector('#pbPagePreset')?.addEventListener('change', e => ctx.onPagePreset?.(e.target.value));
  bar.querySelector('#pageW')?.addEventListener('change', e => {
    const mm = displayToMm(e.target.value, unit);
    if (Number.isFinite(mm) && mm > 0) ctx.onPageSize?.(mm, null);
  });
  bar.querySelector('#pageH')?.addEventListener('change', e => {
    const mm = displayToMm(e.target.value, unit);
    if (Number.isFinite(mm) && mm > 0) ctx.onPageSize?.(null, mm);
  });
  bar.querySelector('#pbPageOrient')?.addEventListener('click', () => ctx.onTogglePageOrient?.());
  bar.querySelector('#pbGridVis')?.addEventListener('click', () => ctx.onToggleGrid?.('visible'));
  bar.querySelector('#pbSnapGrid')?.addEventListener('click', () => ctx.onToggleGrid?.('snapToGrid'));
  bar.querySelector('#pbSnapObj')?.addEventListener('click', () => ctx.onToggleGrid?.('snapToObjects'));
  bar.querySelector('#btnTogglePageFrame')?.addEventListener('click', () => ctx.onTogglePageFrame?.());
  bar.querySelector('#pbFitView')?.addEventListener('click', () => ctx.onFitView?.());
}

function bindNestingPartBar(bar, ctx, unit) {
  bindUnitControl(bar, ctx);
  bar.querySelector('#npPartX')?.addEventListener('change', e => ctx.onNestingPartEdit?.('x', displayToMm(e.target.value, unit)));
  bar.querySelector('#npPartY')?.addEventListener('change', e => ctx.onNestingPartEdit?.('y', displayToMm(e.target.value, unit)));
  bar.querySelector('#npPartW')?.addEventListener('change',e=>ctx.onNestingPartEdit?.('width',displayToMm(e.target.value,unit)));
  bar.querySelector('#npPartH')?.addEventListener('change',e=>ctx.onNestingPartEdit?.('height',displayToMm(e.target.value,unit)));
  bar.querySelector('#npPartRot')?.addEventListener('change', e => ctx.onNestingPartEdit?.('rot', Number(e.target.value)));
  bar.querySelector('#npPartLock')?.addEventListener('click', () => ctx.onNestingPartEdit?.('toggleLock'));
  bar.querySelector('#npMoveSheet')?.addEventListener('change', e => {
    if (e.target.value !== '') ctx.onNestingPartEdit?.('moveSheet', Number(e.target.value));
  });
}

function quickLightFields(light,disabled=false){
 const d=disabled?'disabled':'';
 const fields=(prefix,label)=>`<div class="prop-field quick-light-field"><label for="pb${prefix}Color">${label}</label><input id="pb${prefix}Color" type="color" value="${light[prefix.toLowerCase()+'Color']}" title="${label} ışık rengi" aria-label="${label} ışık rengi" ${d}><input id="pb${prefix}Intensity" type="number" min="0" max="3" step="0.1" value="${light[prefix.toLowerCase()+'Intensity']}" title="${label} ışık yoğunluğu (0–3)" aria-label="${label} ışık yoğunluğu" ${d}></div>`;
 return (['front','both'].includes(light.mode)?fields('Front','Ön ışık'):'')+(['halo','both'].includes(light.mode)?fields('Back','Arka ışık'):'');
}
function bindObjectBarEvents(bar, sel, ctx, unit) {
  for(const [id,key] of [['pbFrontColor','frontColor'],['pbBackColor','backColor'],['pbFrontIntensity','frontIntensity'],['pbBackIntensity','backIntensity']]){
    bar.querySelector('#'+id)?.addEventListener('change',e=>ctx.onLightingEdit?.(key,key.endsWith('Intensity')?Number(e.target.value):e.target.value));
  }
  bindUnitControl(bar, ctx);
  const dimensionIds = new Set(['numX','numY','numW','numH','numD','numSpacing','pbFileW','pbCornerR','pbRectW']);
  const num = (id, fn) => bar.querySelector('#' + id)?.addEventListener('change', e => {
    const parsed = Number(e.target.value);
    if (!Number.isFinite(parsed)) return;
    ctx.onEditSelected?.(o => fn(o, dimensionIds.has(id) ? displayToMm(parsed, unit) : parsed));
  });
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
  num('numW',(o,v)=>resizeObjectToMm(o,'w',v,ctx.getObjectSize?.(o)||nominalSize(o)));
  num('numH',(o,v)=>resizeObjectToMm(o,'h',v,ctx.getObjectSize?.(o)||nominalSize(o)));

  bar.querySelector('#btnPropLock')?.addEventListener('click', () => ctx.onEditSelected?.(o => { o.proportionalLock = !(o.proportionalLock !== false); }));
  bar.querySelector('#btnCenterOnPage')?.addEventListener('click', () => ctx.onEditSelected?.(o => { o.xMm = 0; o.yMm = 0; }));
  bar.querySelector('#pbFont')?.addEventListener('change', e => ctx.onEditSelected?.(o => { o.fontId = e.target.value; }));
  bar.querySelector('#pbCtype')?.addEventListener('change', e => ctx.onEditSelected?.(o => { o.constructionType = e.target.value; }));
  bar.querySelector('#pbLmode')?.addEventListener('change', e => {if(ctx.onLightingEdit)ctx.onLightingEdit('mode',e.target.value);else ctx.onEditSelected?.(o=>{o.lightingMode=e.target.value;});});
  bar.querySelectorAll('[data-pb-act]').forEach(b => b.onclick = () => ctx.onCadAction?.(b.dataset.pbAct));
  bar.querySelectorAll('[data-pb-tool]').forEach(b => b.onclick = () => ctx.onTool?.(b.dataset.pbTool));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
