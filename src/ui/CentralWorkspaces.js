import {normalizeDisplayUnit,formatMmAsUnit,formatDimensions,formatPresetLabel} from '../core/units.js';
import { renderDetailedCostCenter } from './CostCenterView.js?v=units6';
import { ringLength, SHEET_PRESETS } from '../manufacturing/NestingEngine.js';
import { renderNestingSvg } from './NestingView.js?v=units6';
import { renderNestingSourceTabs, renderNestingImportPane } from './NestingImportView.js?v=units6';
import { MACHINE_PROFILES, validateNestedProduction } from '../export/CncGcodeExporter.js';
import { formatMoney } from '../manufacturing/CostEngine.js';
import { buildQuoteHtml } from '../manufacturing/QuoteGenerator.js';

/**
 * Central Full-Canvas Workspaces:
 *  - Nesting (Multi-sheet, left part list, center SVG canvas, right settings, bottom stats)
 *  - Üretim / CNC (Consumes actual nested layouts, machine profiles, validation, Nesting Dışa Aktar)
 *  - Maliyet ve Teklif (Live BOM, LED/PSU estimates, margin/taxes, printable PDF quote)
 */

const ringLengths=new WeakMap();
function cachedRingLength(ring){if(Object.isFrozen(ring)){if(ringLengths.has(ring))return ringLengths.get(ring);const n=ringLength(ring);ringLengths.set(ring,n);return n;}return ringLength(ring);}
export function renderNestingCenter(state, ctx) {
  const n = state.nesting;
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  if ((n.activeTabId || 'design') === 'import') {
    return `<div class="nesting-workspace" data-nesting-tab="import">${renderNestingSourceTabs(n)}${renderNestingImportPane(unit)}</div>`;
  }
  const sheets = n.sheets || [];
  const activeIdx = Math.min(Math.max(0, ctx.activeSheetIdx || 0), Math.max(0, sheets.length - 1));
  const activeSheet = sheets[activeIdx] || null;
  const selectedIds=new Set(ctx.selectedPlacementIds??(ctx.selectedPlacementId?[ctx.selectedPlacementId]:[]));
  const removableCount=(activeSheet?.placements||[]).filter(p=>selectedIds.has(p.id)&&!p.locked).length;
  const displayedSheet = activeSheet || {
    widthMm: n.sheetWidthMm || 3000, heightMm: n.sheetHeightMm || 1500,
    marginLeftMm: n.marginLeftMm ?? n.marginMm ?? 15,
    marginRightMm: n.marginRightMm ?? n.marginMm ?? 15,
    marginTopMm: n.marginTopMm ?? n.marginMm ?? 15,
    marginBottomMm: n.marginBottomMm ?? n.marginMm ?? 15, placements: [],
  };
  const presetId = SHEET_PRESETS.find(p => p.w === n.sheetWidthMm && p.h === n.sheetHeightMm)?.id || 'custom';
  const totalParts = sheets.reduce((a, sh) => a + sh.placements.length, 0);
  const avgUtil = sheets.length ? sheets.reduce((a, sh) => a + (sh.utilizationPct ?? sh.utilization ?? 0), 0) / sheets.length : 0;
  const totalCutLenMm = sheets.reduce((a, sh) => a + sh.placements.reduce((s, p) => s + (cachedRingLength(p.outer)+(p.holes||[]).reduce((a,h)=>a+cachedRingLength(h),0)), 0), 0);

  return `
    <div class="nesting-workspace" data-nesting-tab="${n.activeTabId || 'design'}" data-display-unit="${unit}">
    ${renderNestingSourceTabs(n)}
    <div class="center-ws-grid">
      <!-- Left: Part List & Material Groups -->
      <div class="cws-side">
        <h3 class="sec-title">İmalat Parçaları (${totalParts}) <small id="nestingSelectedCount">${selectedIds.size?selectedIds.size+' seçili':''}</small></h3>
        ${(n.importedTabs||[]).find(t=>t.id===n.activeTabId)?.warnings?.length?`<details class="nesting-import-converters"><summary>İçe aktarma notları</summary>${(n.importedTabs.find(t=>t.id===n.activeTabId).warnings||[]).map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</details>`:''}
        ${!sheets.length ? '<p style="font-size:12px;color:var(--muted)">Parça listesi için "Otomatik Yerleştir"e tıklayın.</p>' : `
          <div style="display:flex;flex-direction:column;gap:4px">
            ${(activeSheet?.placements || []).map(p => `
              <div class="layer-item nesting-part-row ${selectedIds.has(p.id) ? 'on' : ''}" data-cws-pid="${escapeHtml(p.id)}" aria-selected="${selectedIds.has(p.id)}">
                <input type="checkbox" data-cws-check aria-label="${escapeHtml(p.label)} seç" ${selectedIds.has(p.id)?'checked':''}>
                <span class="layer-name">${p.locked ? '🔒 ' : ''}${escapeHtml(p.label)}</span>
                <small class="nesting-part-size">${show(p.bounds?.width || 0)}×${show(p.bounds?.height || 0)} ${unit}</small>
                <button type="button" class="nesting-part-delete" data-cws-delete aria-label="${escapeHtml(p.label)} sil" title="${p.locked?'Kilitli parça':'Parçayı sil'}" ${p.locked?'disabled':''}>×</button>
              </div>
            `).join('')}
          </div>
        `}
        ${(n.unplaced || []).length ? `
          <h3 class="sec-title" style="margin-top:12px;color:var(--danger)">Yerleşmeyenler (${n.unplaced.length})</h3>
          <div style="font-size:11.5px;color:var(--danger)">
            ${n.unplaced.map(u => `<div>• ${escapeHtml(u.item?.label||u.label)} (${escapeHtml(u.reason || 'Sığmadı')})</div>`).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Center: Sheet Tabs + True-Shape SVG Canvas -->
      <div class="cws-main">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div class="sheet-tabs">
            ${sheets.map((sh, idx) => `
              <button type="button" class="sheet-tab ${idx === activeIdx ? 'on' : ''}" data-cws-sheet="${idx}">
                ${escapeHtml(sh.name || `Levha ${idx + 1}`)} • ${escapeHtml(sh.materialLabel)} (${sh.placements.length})
              </button>
            `).join('')}
            <button type="button" id="cwsAddSheet" class="sheet-tab">+ Yeni Levha</button>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" id="cwsRunNesting" class="cta-btn" style="padding:5px 12px" title="İçe aktarmadan sonra hassas true-shape optimizasyonu; işlem sürerken tekrar tıklayarak iptal edin">Otomatik Yerleştir</button>
            <button type="button" id="cwsReoptUnlocked" class="sec-btn">Kilitsizleri Optimize Et</button>
            <button type="button" id="cwsDeletePart" class="sec-btn" ${removableCount?'':'disabled'} title="Seçilen parçaları yalnızca bu nesting işinden sil">${removableCount>1?'Seçilenleri Sil ('+removableCount+')':'Parçayı Sil'}</button>
          </div>
        </div>
        <div id="cwsNestSvgBox" class="nesting-sheet-fit">
          ${renderNestingSvg(displayedSheet, selectedIds, n.previewColors,unit)}
          <span class="nesting-sheet-dimensions">${formatDimensions(displayedSheet.widthMm,displayedSheet.heightMm,unit)}</span>
          ${!activeSheet ? '<span class="nesting-sheet-empty-note">Parçaları yerleştirmek için Otomatik Yerleştir seçin</span>' : ''}
        </div>
      </div>

      <!-- Right: Sheet & Optimization Settings -->
      <div class="cws-side-r">
        <h3 class="sec-title">Levha &amp; Optimizasyon</h3>
        <div class="field-row">
          <label>Plaka Önayarı</label>
          <select id="cwsNestPreset">
            ${SHEET_PRESETS.map(p => `<option value="${p.id}" ${presetId === p.id ? 'selected' : ''}>${formatPresetLabel(p,unit)}</option>`).join('')}
            <option value="custom" ${presetId === 'custom' ? 'selected' : ''}>Özel Ölçü</option>
          </select>
        </div>
        <div class="field-row"><label>Levha Genişliği (${unit})</label><input id="cwsNestW" type="number" step="any" value="${show(n.sheetWidthMm)}"></div>
        <div class="field-row"><label>Levha Yüksekliği (${unit})</label><input id="cwsNestH" type="number" step="any" value="${show(n.sheetHeightMm)}"></div>
        <div class="field-row"><label>Parça Aralığı (${unit})</label><input id="cwsNestSp" type="number" step="any" value="${show(n.clearanceMm??5)}"></div>
        <div class="field-row"><label>Kenar Payı (${unit})</label><input id="cwsNestMg" type="number" step="any" value="${show(n.marginLeftMm)}"></div>
        <div class="field-row"><label>Delik İçi Yerleştirme</label><input id="cwsNestHoles" type="checkbox" ${n.allowHoleNesting ? 'checked' : ''}></div>
        <div class="field-row"><label>Fırça Yönü Kısıtı</label><input id="cwsNestGrain" type="checkbox" ${n.enforceGrainDirection ? 'checked' : ''}></div>
        <div class="field-row">
          <label>Dönüş Açısı</label>
          <select id="cwsNestRot">
            <option value="0" ${n.rotationStepDeg === 0 ? 'selected' : ''}>Sabit (0°)</option>
            <option value="180" ${n.rotationStepDeg === 180 ? 'selected' : ''}>0° / 180°</option>
            <option value="90" ${(n.rotationStepDeg ?? 90) === 90 ? 'selected' : ''}>90° Adımlı</option>
            <option value="45" ${n.rotationStepDeg === 45 ? 'selected' : ''}>45° Adımlı</option>
            <option value="30" ${n.rotationStepDeg === 30 ? 'selected' : ''}>30° Adımlı</option>
            <option value="15" ${n.rotationStepDeg === 15 ? 'selected' : ''}>15° Adımlı</option>
            <option value="5" ${n.rotationStepDeg === 5 ? 'selected' : ''}>5° Adımlı · detaylı</option>
          </select>
        </div>
        <h3 class="sec-title" style="margin-top:14px">Yerleşim Tercihi</h3>
        <div class="field-row" id="nestingEngineVersion"><label>Yerleşim motoru</label><strong style="font-size:12px;color:var(--text)">Nesting v3 Pro</strong></div>
        <div class="field-row"><label>Optimizasyon yönü</label>
          <select id="cwsNestStrategy">
            <option value="compact" ${(n.placementStrategy || 'compact') === 'compact' ? 'selected' : ''}>Kompakt · daha az fire</option>
            <option value="vertical" ${n.placementStrategy === 'vertical' ? 'selected' : ''}>Dikey · üst alanı kullan</option>
            <option value="bottomLeft" ${n.placementStrategy === 'bottomLeft' ? 'selected' : ''}>Alt-sol · klasik</option>
          </select>
        </div>
        <h3 class="sec-title" style="margin-top:14px">Önizleme Renkleri</h3>
        <div class="nesting-preview-palette">
          <label class="nesting-palette-option"><span>Tüm harf gövdeleri</span><input id="cwsNestBodyColor" type="color" value="${/^#[a-f0-9]{6}$/i.test(n.previewColors?.body || '') ? n.previewColors.body : '#c89343'}" title="Tüm harfler için tek renk"></label>
          <label class="nesting-palette-option"><span>A / O / R iç boşlukları</span><input id="cwsNestHoleColor" type="color" value="${/^#[a-f0-9]{6}$/i.test(n.previewColors?.holes || '') ? n.previewColors.holes : '#c89343'}" title="Bütün iç boşluklar için tek renk"></label>
          <button type="button" id="cwsNestResetColors" class="sec-btn">Renkleri Sıfırla</button>
          <small>Bu renkler yalnızca nesting önizlemesidir; CNC, DXF ve SVG kesim konturları değişmez.</small>
        </div>
        ${renderNestedCncPanel(state,activeSheet)}
        <h3 class="sec-title" style="margin-top:12px">Nesting Dışa Aktar</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button type="button" id="cwsExpSvg" class="sec-btn">Aktif Levhayı SVG İndir</button>
          <button type="button" id="cwsExpDxf" class="sec-btn">Tüm Levhaları DXF (1:1 mm) İndir</button>
          <button type="button" id="cwsExpCsv" class="sec-btn">Parça Listesi (CSV) İndir</button>
        </div>
      </div>

      <!-- Bottom Status Summary -->
      <div class="cws-bottom">
        <span><b>Levha Sayısı:</b> ${sheets.length}</span>
        <span><b>Ortalama Verim:</b> %${avgUtil.toFixed(1)}</span>
        <span><b>Fire Oranı:</b> %${sheets.length ? (100 - avgUtil).toFixed(1) : '0.0'}</span>
        <span><b>Tahmini Kesim Yolu:</b> ${show(totalCutLenMm)} ${unit}</span>
        <span><b>Yerleşmeyen:</b> ${(n.unplaced || []).length}</span>
        ${n.optimizationInfo?.engineVersion==='3.0-pro'?`<span id="nestingLastEngine"><b>Son yerleşim:</b> ${n.optimizationInfo.selectedEngine==='v3-pro'?'v3 Pro':n.optimizationInfo.selectedEngine==='clipper-nfp'?'Clipper NFP (daha iyi doğrulanmış sonuç)':'Hızlı güvenli dizgi'}${n.optimizationInfo.proAttempts?` · Pro: ${n.optimizationInfo.proCompleted??0}/${n.optimizationInfo.proAttempts} tamamlanan deneme`:''} · ${n.optimizationInfo.attempts??0} deneme · ${((n.optimizationInfo.elapsedMs??0)/1000).toFixed(1)} sn</span>`:'<span id="nestingLastEngine">Son yerleşim: v3 Pro sürümünde henüz hesaplanmadı</span>'}
      </div>
    </div>
    </div>
  `;
}

function renderCncFields(state,prefix){
 const cnc=state.cnc||{},unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
 return `
        <div class="field-row">
          <label>Makine Profili</label>
          <select id="${prefix}Profile">
            ${MACHINE_PROFILES.map(p => `<option value="${p.id}" ${cnc.profile === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>Kesim Kerfi (${unit})</label><input id="${prefix}Kerf" type="number" step="${show(0.05)}" value="${show(cnc.kerfMm ?? 0.2)}"></div>
        <div class="field-row"><label>Takım Çapı (${unit})</label><input id="${prefix}ToolDia" type="number" step="${show(0.5)}" value="${show(cnc.toolDiameterMm ?? 3.0)}"></div>
        <div class="field-row">
          <label>Takım Telafisi</label>
          <select id="${prefix}Comp">
            <option value="outside" ${cnc.compensation === 'outside' ? 'selected' : ''}>Dıştan Telafi (Outside)</option>
            <option value="inside" ${cnc.compensation === 'inside' ? 'selected' : ''}>İçten Telafi (Inside)</option>
            <option value="center" ${cnc.compensation === 'center' ? 'selected' : ''}>Merkez (On-Line)</option>
          </select>
        </div>
        <div class="field-row">
          <label>Kesim Sırası</label>
          <select id="${prefix}Seq">
            <option value="hole_first" ${cnc.sequence !== 'outer_first' ? 'selected' : ''}>Önce İç Delikler (Önerilen)</option>
            <option value="outer_first" ${cnc.sequence === 'outer_first' ? 'selected' : ''}>Önce Dış Kontur</option>
          </select>
        </div>
        <div class="field-row"><label>Giriş / Çıkış (Lead-in/out ${unit})</label><input id="${prefix}LeadIn" type="number" step="${show(0.5)}" value="${show(cnc.leadInMm ?? 3)}"></div>
        <div class="field-row"><label>Mikro Köprü (Micro-tabs)</label><input id="${prefix}Tabs" type="checkbox" ${cnc.microTabs ? 'checked' : ''}></div>
        <div class="field-row"><label>Eğri Toleransı (${unit})</label><input id="${prefix}Tol" type="number" step="${show(0.05)}" value="${show(cnc.curveTolMm ?? 0.1)}"></div>
`;
}
function renderNestedCncPanel(state,activeSheet){
 const cnc=state.cnc||{},profile=MACHINE_PROFILES.find(p=>p.id===cnc.profile)||MACHINE_PROFILES[0];
 const val=validateNestedProduction(activeSheet?[activeSheet]:[],cnc);
 return `<div id="nestCncPanel">
 <h3 class="sec-title" style="margin-top:14px">CNC Makine ve Ayarları</h3>
 ${renderCncFields(state,'nestCnc')}
 <div id="nestCncStatus" style="font-size:11px;margin:6px 0;color:var(--muted)">${val.valid?'Konturlar doğrulandı · aktif levha':escapeHtml(val.issues[0]?.msg||'Üretim kontrolü gerekli.')}
 ${profile.kind==='gcode'?'<p>G-code taslağı: hız, güç ve Z değerleri sabittir; telafi, lead-in ve mikro köprüler CAM programında doğrulanıp uygulanmalıdır.</p>':''}</div>
 <button type="button" id="nestCncExport" class="sec-btn" style="width:100%" ${val.valid?'':'disabled'}>Aktif Levha · ${profile.kind==='gcode'?'G-code Taslağı':profile.ext.toUpperCase()} İndir</button>
 </div>`;
}

export function renderCncCenter(state) {
  const sheets = state.nesting?.sheets || [];
  const cnc = state.cnc || {};
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const val = validateNestedProduction(sheets, cnc);

  return `
    <div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1180px;margin:0 auto">
      <div class="sec">
        <h3 class="sec-title">CNC / Lazer Post-Processor Ayarları</h3>
        ${renderCncFields(state,'cnc') }
      </div>

      <div class="sec">
        <h3 class="sec-title">Üretim Doğrulama &amp; Nesting Dışa Aktar</h3>
        <div style="margin-bottom:10px;padding:8px;border-radius:7px;background:${val.valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.12)'};border:1px solid ${val.valid ? 'var(--ok)' : 'var(--danger)'}">
          <strong>${val.valid ? `✓ Üretime Hazır (${val.totalParts} yerleşmiş parça)` : '⚠ Kritik Üretim Hatası'}</strong>
          ${val.issues.map(i => `<div style="font-size:11.5px;margin-top:4px;color:${i.level === 'critical' ? '#fca5a5' : '#fde047'}">• ${escapeHtml(i.msg)}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" id="cncBtnNestNow" class="sec-btn">Nesting Hesapla / Yenile</button>
          <button type="button" id="cncBtnExportDxf" class="cta-btn" ${!val.valid ? 'disabled' : ''}>Nesting DXF (1:1 mm) İndir</button>
          <button type="button" id="cncBtnExportGcode" class="cta-btn" ${!val.valid ? 'disabled' : ''}>Makine G-Code (.nc) İndir</button>
          <button type="button" id="cncBtnExportSvg" class="sec-btn" ${!val.valid ? 'disabled' : ''}>Nesting SVG İndir</button>
          <button type="button" id="cncBtnExportPlt" class="sec-btn" ${!val.valid ? 'disabled' : ''}>Plotter HPGL (.plt) İndir</button>
          <button type="button" id="cncBtnExportCsv" class="sec-btn">Parça Listesi (CSV) İndir</button>
        </div>
      </div>
    </div>
  `;
}

export function renderCostCenter(state, lastMetrics, lastCosts, ctx={}) {
  return renderDetailedCostCenter(state, lastMetrics, lastCosts, ctx);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
