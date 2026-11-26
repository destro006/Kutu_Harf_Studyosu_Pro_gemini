import {normalizeDisplayUnit,formatMmAsUnit,formatDimensions,formatPresetLabel} from '../core/units.js';
import { renderDetailedCostCenter } from './CostCenterView.js?v=qa8';
import { ringLength, SHEET_PRESETS } from '../manufacturing/NestingEngine.js';
import { renderNestingSvg } from './NestingView.js?v=20261126-v31';
import { renderNestingSourceTabs, renderNestingImportPane } from './NestingImportView.js?v=units6';
import { MACHINE_PROFILES, MACHINE_PROFILE_CATEGORIES, getMachineProfile, validateNestedProduction } from '../export/CncGcodeExporter.js';
import { formatMoney } from '../manufacturing/CostEngine.js';
import { buildQuoteHtml } from '../manufacturing/QuoteGenerator.js';
import { renderBendingSimulatorPane } from './BendingSimulatorView.js';
import { calculateReturnCoilPlan, calculateSmartLedAndPsu, computeMountingStuds } from '../manufacturing/WorkshopAutomation.js';

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
  const groupColors = n.previewColors?.groups || {};
  const partGroupsMap = new Map();
  for (const p of activeSheet?.placements || []) {
    const gid = p.partGroup || 'body';
    if (!partGroupsMap.has(gid)) {
      partGroupsMap.set(gid, {
        id: gid,
        label: p.partGroupLabel || (gid === 'body' ? 'Gövde Parçaları' : gid),
        color: /^#[0-9a-f]{6}$/i.test(groupColors[gid] || '') ? groupColors[gid] : (p.partColor || '#d4a24c'),
        items: [],
      });
    }
    partGroupsMap.get(gid).items.push(p);
  }
  const partGroups = [...partGroupsMap.values()];
  const activeGroup = (ctx.activePartGroup && partGroupsMap.has(ctx.activePartGroup)) ? ctx.activePartGroup : null;
  const leftCollapsed = Boolean(ctx.leftPanelCollapsed);
  const rightCollapsed = Boolean(ctx.rightPanelCollapsed);
  const rightOpenSet = ctx.rightPanels?.open instanceof Set
    ? ctx.rightPanels.open
    : new Set(Array.isArray(ctx.rightPanels?.open) ? ctx.rightPanels.open : ['sheet']);
  const rightFloatingMap = (ctx.rightPanels?.floating && typeof ctx.rightPanels.floating === 'object') ? ctx.rightPanels.floating : {};
  const anyRightOpen = ['sheet', 'colors', 'cnc', 'export'].some(id => rightOpenSet.has(id));
  const wrapRightPanel = (id, order, title, bodyHtml) => {
    const isOpen = rightOpenSet.has(id);
    const isFloating = Boolean(rightFloatingMap[id]);
    return `
      <section class="cws-r-panel ${isOpen ? '' : 'is-collapsed'}" data-nest-panel="${id}" data-nest-panel-order="${order}">
        <header class="cws-r-panel-head" data-nest-panel-drag="${id}" title="Aç/kapat için tıklayın, serbest taşımak için sürükleyin">
          <button type="button" class="cws-r-panel-toggle" data-nest-panel-toggle="${id}" aria-expanded="${isOpen}" title="${isOpen ? 'Bölümü küçült' : 'Bölümü aç'}">
            <span class="cws-r-caret" aria-hidden="true">▸</span>
            <span class="cws-r-panel-title">${title}</span>
          </button>
          <button type="button" class="cws-r-panel-float-btn" data-nest-panel-float="${id}" title="${isFloating ? 'Eski yerine yerleştir' : 'Serbest pencereye ayır (taşı)'}">${isFloating ? '↙' : '↗'}</button>
        </header>
        <div class="cws-r-panel-body">${bodyHtml}</div>
      </section>
    `;
  };
  const activeLeftTab = ctx.leftTab === 'fileli' ? 'fileli' : 'parts';
  const fileliObjWidth = (state.objects || []).find(o => (o.constructionType || state.constructionType) === 'fileli')?.fileWidthMm ?? state.fileli?.fileWidthMm ?? 5;
  const acOverlapMm = state.fileli?.acrylicOverlapMm ?? 3;
  const dekInsetMm = state.fileli?.dekotaInsetMm ?? 2;
  const dekThickMm = state.fileli?.dekotaThicknessMm ?? 5;
  const bandOverlapMm = state.fileli?.sidewallOverlapMm ?? 6;
  const bandDepthMm = state.fileli?.bandDepthMm;
  const includeSidewallStrips = Boolean(state.nesting?.includeSidewallStrips);
  const openGroupsSet = ctx.openGroups instanceof Set
    ? ctx.openGroups
    : new Set(Array.isArray(ctx.openGroups) ? ctx.openGroups : []);
  const anyGroupOpen = partGroups.length > 1
    ? partGroups.some(g => openGroupsSet.has(g.id))
    : (partGroups[0] ? (openGroupsSet.has(partGroups[0].id) || openGroupsSet.has('all')) : openGroupsSet.has('all'));
  const isSidewallMode = (n.targetPart || 'all') === 'sidewalls';
  const totalStripLenMm = sheets.reduce((sum, sh) => sum + sh.placements.filter(p => p.partGroup === 'sidewall_strip').reduce((a, p) => a + (p.bounds?.width || 0), 0), 0);
  const rotateMode = Boolean(ctx.rotateMode && selectedIds.size > 0);
  const primaryPart = (activeSheet?.placements || []).find(p => p.id === (ctx.selectedPlacementId || [...selectedIds].at(-1))) || (activeSheet?.placements || []).find(p => selectedIds.has(p.id));
  const curRotDeg = primaryPart ? Number((primaryPart.angleDeg || 0).toFixed(1)) : 0;
  const renderPartRow = (p, colorDot = null) => `
    <div class="layer-item nesting-part-row ${selectedIds.has(p.id) ? 'on' : ''}" draggable="true" data-cws-pid="${escapeHtml(p.id)}" aria-selected="${selectedIds.has(p.id)}">
      <input type="checkbox" data-cws-check aria-label="${escapeHtml(p.label)} seç" ${selectedIds.has(p.id)?'checked':''}>
      ${colorDot ? `<i class="nest-part-dot" style="background:${colorDot}"></i>` : ''}
      <span class="layer-name" title="${escapeHtml(p.label)}">${p.locked ? '🔒 ' : ''}${escapeHtml(p.label)}</span>
      <small class="nesting-part-size">${formatMmAsUnit(p.bounds?.width||0,unit,2)}×${formatMmAsUnit(p.bounds?.height||0,unit,2)} ${unit}</small>
      <button type="button" class="nesting-part-delete" data-cws-delete aria-label="${escapeHtml(p.label)} sil" title="${p.locked?'Kilitli parça':'Parçayı sil'}" ${p.locked?'disabled':''}>×</button>
    </div>
  `;

  return `
    <div class="nesting-workspace" data-nesting-tab="${n.activeTabId || 'design'}" data-display-unit="${unit}">
    ${renderNestingSourceTabs(n)}
    <div class="center-ws-grid ${leftCollapsed ? 'cws-left-collapsed' : ''} ${rightCollapsed ? 'cws-right-collapsed' : ''}">
      <!-- Left: Part List & Fileli Material Settings Tabs (Collapsible) -->
      <div class="cws-side">
        <div class="cws-side-header">
          <h3 class="sec-title">${activeLeftTab === 'fileli' ? 'File Malzeme Ayarları' : `İmalat Parçaları (${totalParts})`} <small id="nestingSelectedCount">${activeLeftTab === 'parts' && selectedIds.size ? selectedIds.size + ' seçili' : ''}</small></h3>
          ${!leftCollapsed && activeLeftTab === 'parts' && sheets.length ? `<button type="button" id="cwsToggleAllGroups" class="cws-side-mini-btn" title="${anyGroupOpen ? 'Tüm parça gruplarını daralt' : 'Tüm parça gruplarını aç'}">${anyGroupOpen ? 'Tümünü Kapat' : 'Tümünü Aç'}</button>` : ''}
          <button type="button" id="cwsToggleLeftPanel" class="cws-side-mini-btn" aria-expanded="${!leftCollapsed}" title="${leftCollapsed ? 'Sol paneli aç' : 'Sol paneli daralt (tuvali genişlet)'}">${leftCollapsed ? '»' : '«'}</button>
        </div>
        <div class="cws-left-tabs" role="group" aria-label="Sol Panel Sekmeleri">
          <button type="button" aria-pressed="${activeLeftTab === 'parts'}" class="cws-left-tab ${activeLeftTab === 'parts' ? 'on' : ''}" data-cws-left-tab="parts">Parçalar (${totalParts})</button>
          <button type="button" aria-pressed="${activeLeftTab === 'fileli'}" class="cws-left-tab ${activeLeftTab === 'fileli' ? 'on' : ''}" data-cws-left-tab="fileli">File Malzeme Ayarları</button>
        </div>
        ${activeLeftTab === 'fileli' ? `
          <div id="cwsFileliSettingsPanel" class="cws-fileli-panel">
            <div class="cws-fileli-card">
              <div class="cws-fileli-card-head"><i class="nest-part-dot" style="background:#d4a24c"></i><span>Ön File Çerçeve (Metal)</span></div>
              <div class="field-row"><label for="cwsFileliWidth">File Genişliği (${unit})</label><input id="cwsFileliWidth" type="number" min="0" max="${show(60)}" step="${show(0.5)}" value="${show(fileliObjWidth)}"></div>
              <div class="field-row"><label for="cwsFileliThick">File Metal Kalınlığı (${unit})</label><input id="cwsFileliThick" type="number" min="${show(0.5)}" max="${show(10)}" step="${show(0.2)}" value="${show(state.fileli?.fileThicknessMm ?? 2)}"></div>
              <div class="field-row"><label for="cwsFileliWallThick">Yanak Sac Kalınlığı (${unit})</label><input id="cwsFileliWallThick" type="number" min="${show(0.2)}" max="${show(3)}" step="${show(0.1)}" value="${show(state.fileli?.metalThicknessMm ?? 1)}"></div>
            </div>
            <div class="cws-fileli-card">
              <div class="cws-fileli-card-head"><i class="nest-part-dot" style="background:#38bdf8"></i><span>Pleksi (Akrilik) Kesim</span></div>
              <div class="field-row"><label for="cwsFileliAcrylicInset">Pleksi / Akrilik İçe Küçültme (${unit})</label><input id="cwsFileliAcrylicInset" type="number" min="0" max="${show(25)}" step="${show(0.5)}" value="${state.fileli?.acrylicCutInsetMm != null ? show(state.fileli.acrylicCutInsetMm) : ''}" placeholder="${show(2)} (Otomatik)"></div>
              <div class="field-row"><label for="cwsFileliAcrylicOverlap">Pleksi Binme Payı (${unit})</label><input id="cwsFileliAcrylicOverlap" type="number" min="0" max="${show(25)}" step="${show(0.5)}" value="${show(acOverlapMm)}"></div>
              <small class="nest-overlap-hint">İçe küçültme girilirse harf dışından doğrudan küçültür; boşsa file içine +binme payı uygulanır.</small>
              <div class="field-row"><label for="cwsFileliAcrylicThick">Pleksi Kalınlığı (${unit})</label><input id="cwsFileliAcrylicThick" type="number" min="${show(1)}" max="${show(20)}" step="${show(0.5)}" value="${show(state.fileli?.acrylicThicknessMm ?? 3)}"></div>
            </div>
            <div class="cws-fileli-card">
              <div class="cws-fileli-card-head"><i class="nest-part-dot" style="background:#34d399"></i><span>Arka Dekota / Foreks Kesim</span></div>
              <div class="field-row"><label for="cwsFileliDekotaInset">Dekota / Foreks İçe Küçültme (${unit})</label><input id="cwsFileliDekotaInset" type="number" min="0" max="${show(25)}" step="${show(0.5)}" value="${show(dekInsetMm)}"></div>
              <small class="nest-overlap-hint">Harf dış hattından her kenarda kaç ${unit} içe doğru küçük kesileceği (yanak içine oturması için).</small>
              <div class="field-row"><label for="cwsFileliDekotaThick">Dekota Kalınlığı (${unit})</label><input id="cwsFileliDekotaThick" type="number" min="${show(1)}" max="${show(30)}" step="${show(0.5)}" value="${show(dekThickMm)}"></div>
            </div>
            <div class="cws-fileli-card">
              <div class="cws-fileli-card-head"><i class="nest-part-dot" style="background:#f59e0b"></i><span>Kenar / Yan Bant (Şerit Kesim)</span></div>
              <div class="field-row"><label for="cwsFileliBandOverlap">File / Kenar Bandı Payı (${unit})</label><input id="cwsFileliBandOverlap" type="number" min="0" max="${show(50)}" step="${show(1)}" value="${show(bandOverlapMm)}"></div>
              <div class="field-row"><label for="cwsFileliBandDepth">Bant Yüksekliği / Derinlik (${unit})</label><input id="cwsFileliBandDepth" type="number" min="${show(10)}" max="${show(400)}" step="${show(5)}" value="${bandDepthMm != null ? show(bandDepthMm) : ''}" placeholder="${show(state.dimensions?.depthMm ?? 80)} (Harf Derinliği)"></div>
              <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-top:4px;cursor:pointer">
                <input id="cwsIncludeSidewallSheet" type="checkbox" ${includeSidewallStrips ? 'checked' : ''}>
                <span>Kenar / Yan Bant (Şerit Kesim) levhasını otomatik ekle</span>
              </label>
              <button type="button" id="cwsBuildSidewallSheetBtn" class="sec-btn" style="width:100%;margin-top:6px">✂ Kenar / Yan Bant Levhası Üret</button>
            </div>
            <div class="cws-fileli-summary">
              <div class="cws-fileli-summary-row"><i class="nest-part-dot" style="background:#d4a24c"></i><span>File Çerçeve: ${show(fileliObjWidth)} ${unit} kenar</span></div>
              <div class="cws-fileli-summary-row"><i class="nest-part-dot" style="background:#38bdf8"></i><span>Pleksi: ${state.fileli?.acrylicCutInsetMm != null ? `-${show(state.fileli.acrylicCutInsetMm)} ${unit} küçültme` : `+${show(acOverlapMm)} ${unit} binme`}</span></div>
              <div class="cws-fileli-summary-row"><i class="nest-part-dot" style="background:#34d399"></i><span>Dekota: -${show(dekInsetMm)} ${unit} küçültme</span></div>
              <div class="cws-fileli-summary-row"><i class="nest-part-dot" style="background:#f59e0b"></i><span>Yan Bant: +${show(bandOverlapMm)} ${unit} bindirme payı</span></div>
            </div>
            <button type="button" id="cwsFileliApplyRepack" class="cta-btn" style="width:100%">Levhaları Güncelle</button>
          </div>
        ` : `
        <button type="button" id="cwsOpenFileliTabQuick" class="sec-btn" style="width:100%;margin-bottom:6px;font-size:11.5px">⚙ File / Pleksi / Yan Bant Payları Ayarla</button>
        ${isSidewallMode ? `
          <div class="cws-sidewall-banner">
            <div>
              <strong>Kenar Çıtaları Modu Aktif</strong>
              <small>${totalParts} şerit · Toplam ${(totalStripLenMm / 1000).toFixed(2)} m kesim</small>
            </div>
            <button type="button" id="cwsBackToFaces" class="sec-btn">← Harf Yüzeylerine Dön</button>
          </div>
        ` : ''}
        ${(n.importedTabs||[]).find(t=>t.id===n.activeTabId)?.warnings?.length?`<details class="nesting-import-converters"><summary>İçe aktarma notları</summary>${(n.importedTabs.find(t=>t.id===n.activeTabId).warnings||[]).map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</details>`:''}
        ${!sheets.length ? '<p style="font-size:12px;color:var(--muted)">Parça listesi için "Otomatik Yerleştir"e tıklayın.</p>' : `
          ${selectedIds.size > 0 ? `
            <div class="cws-sheet-transfer-bar" id="cwsSheetTransferBar" title="Seçili parçaları seçtiğiniz levhaya taşıyın veya kopyalayın (veya parça satırını levha sekmesine sürükleyin)">
              <label class="cws-transfer-lbl" for="cwsTransferTargetSheet">Seçili (${selectedIds.size}) → Hedef Levha:</label>
              <select id="cwsTransferTargetSheet" aria-label="Hedef levha seç">
                ${sheets.map((sh, idx) => idx === activeIdx ? '' : `<option value="${idx}">${escapeHtml(sh.name || `Levha ${idx + 1}`)} • ${escapeHtml(sh.materialLabel || sh.materialGroup || 'Genel')}</option>`).join('')}
                <option value="new">+ Yeni Levha Oluştur</option>
              </select>
              <div class="cws-transfer-btns">
                <button type="button" id="cwsMoveToSheetBtn" class="sec-btn" ${removableCount ? '' : 'disabled'} title="Seçili parçaları hedef levhaya taşı">→ Taşı</button>
                <button type="button" id="cwsCopyToSheetBtn" class="sec-btn" title="Seçili parçaları hedef levhaya kopyala">⧉ Kopyala</button>
              </div>
            </div>
          ` : ''}
          ${partGroups.length > 1 ? `
            <div class="nest-group-filter">
              <button type="button" class="nest-grp-chip ${!activeGroup ? 'on' : ''}" data-nest-group-all>Tümü (${activeSheet?.placements?.length || 0})</button>
              ${partGroups.map(g => `
                <button type="button" class="nest-grp-chip ${activeGroup === g.id ? 'on' : ''}" data-nest-group-focus="${escapeHtml(g.id)}" title="Yalnızca ${escapeHtml(g.label)} grubunu düzenle"><i style="background:${g.color}"></i>${escapeHtml(g.label)} (${g.items.length})</button>
              `).join('')}
            </div>
            <div class="nest-group-list">
              ${partGroups.map(g => `
                <details class="nest-group-box ${activeGroup === g.id ? 'focused' : ''}" data-nest-group="${escapeHtml(g.id)}"${openGroupsSet.has(g.id) ? ' open' : ''}>
                  <summary class="nest-group-head">
                    <span class="nest-group-caret" aria-hidden="true">▸</span>
                    <input type="color" class="nest-group-color-pick" data-nest-group-color="${escapeHtml(g.id)}" value="${g.color}" title="${escapeHtml(g.label)} grup rengini seç">
                    <span class="nest-group-title">${escapeHtml(g.label)} <small>(${g.items.length})</small></span>
                    <button type="button" class="nest-group-act" data-nest-group-select="${escapeHtml(g.id)}" title="Bu gruptaki tüm parçaları seç">Seç</button>
                    <button type="button" class="nest-group-act ${activeGroup === g.id ? 'on' : ''}" data-nest-group-focus="${escapeHtml(g.id)}" title="Sadece bu rengi düzenle">${activeGroup === g.id ? '✓ Aktif' : 'Düzenle'}</button>
                  </summary>
                  <div class="nest-group-rows">
                    ${g.items.map(p => renderPartRow(p, g.color)).join('')}
                  </div>
                </details>
              `).join('')}
            </div>
          ` : (() => {
            const sg = partGroups[0];
            const isTyped = Boolean(sg && sg.id !== 'body');
            const boxId = isTyped ? sg.id : 'all';
            const isOpen = openGroupsSet.has(boxId) || openGroupsSet.has('all');
            return `
            <details class="nest-group-box" data-nest-group="${escapeHtml(boxId)}"${isOpen ? ' open' : ''}>
              <summary class="nest-group-head">
                <span class="nest-group-caret" aria-hidden="true">▸</span>
                ${isTyped ? `<input type="color" class="nest-group-color-pick" data-nest-group-color="${escapeHtml(sg.id)}" value="${sg.color}" title="${escapeHtml(sg.label)} grup rengini seç">` : ''}
                <span class="nest-group-title">${isTyped ? escapeHtml(sg.label) : 'Parça Listesi'} <small>(${activeSheet?.placements?.length || 0})</small></span>
                <button type="button" class="nest-group-act" data-nest-select-all-btn title="Tümünü seç (Ctrl+A)">Tümünü Seç</button>
              </summary>
              <div class="nest-group-rows">
                ${(activeSheet?.placements || []).map(p => renderPartRow(p, isTyped ? sg.color : null)).join('')}
              </div>
            </details>
          `; })()}
        `}
        ${(n.unplaced || []).length ? `
          <h3 class="sec-title" style="margin-top:12px;color:var(--danger)">Yerleşmeyenler (${n.unplaced.length})</h3>
          <div style="font-size:11.5px;color:var(--danger)">
            ${n.unplaced.map(u => `<div>• ${escapeHtml(u.item?.label||u.label)} (${escapeHtml(u.reason || 'Sığmadı')})</div>`).join('')}
          </div>
        ` : ''}
        `}
      </div>

      <!-- Center: Sheet Tabs + True-Shape SVG Canvas -->
      <div class="cws-main">
        <div class="cws-nesting-topbar">
          <div class="sheet-tabs">
            ${sheets.map((sh, idx) => {
              const firstGrp = sh.placements?.[0]?.partGroup;
              const dotColor = (firstGrp && /^#[0-9a-f]{6}$/i.test(groupColors[firstGrp] || ''))
                ? groupColors[firstGrp]
                : (sh.placements?.[0]?.partColor || null);
              return `
              <span class="sheet-tab-wrap">
                <button type="button" class="sheet-tab-close" data-cws-sheet-close="${idx}" title="${escapeHtml(sh.name || `Levha ${idx + 1}`)} sekmesini kapat" aria-label="${escapeHtml(sh.name || `Levha ${idx + 1}`)} sekmesini kapat">×</button>
                <button type="button" class="sheet-tab ${idx === activeIdx ? 'on' : ''}" data-cws-sheet="${idx}">
                  ${dotColor ? `<i class="sheet-tab-dot" style="background:${dotColor}"></i>` : ''}${escapeHtml(sh.name || `Levha ${idx + 1}`)} • ${escapeHtml(sh.materialLabel||sh.materialGroup||"Genel")} (${sh.placements.length})
                </button>
              </span>`;
            }).join('')}
            <button type="button" id="cwsAddSheet" class="sheet-tab">+ Yeni Levha</button>
          </div>
          <div class="cws-nesting-actions">
            <button type="button" id="cwsSendCorel" class="corel-btn" title="Nesting parçalarını, plaka ebatını ve seçili renkleri tek tıkla CorelDRAW'a aktar">✦ Corel'e Aktar</button>
            <button type="button" id="cwsSendCncQuick" class="cnc-send-btn" title="Aktif makine profili, kerf ve kesim sırasıyla hızlı CNC/DXF çıktısı al">⚡ CNC'ye Aktar</button>
            <button type="button" id="cwsRunNesting" class="cta-btn" title="İçe aktarmadan sonra hassas true-shape optimizasyonu; işlem sürerken tekrar tıklayarak iptal edin">Otomatik Yerleştir</button>
            <button type="button" id="cwsSidewallStrips" class="sec-btn cws-strips-btn ${isSidewallMode ? 'on' : ''}" title="Yalnızca kutu harflerin kenar dönüş çıtalarını (yanak şeritlerini) kesime hazırla">${isSidewallMode ? '✓ Kenar Çıtaları (Aktif)' : '▭ Kenar Çıtaları'}</button>
            <span class="cws-action-sep" aria-hidden="true"></span>
            <button type="button" id="cwsReoptUnlocked" class="sec-btn">Kilitsizleri Optimize Et</button>
            <button type="button" id="cwsDeletePart" class="sec-btn cws-del-btn" ${removableCount?'':'disabled'} title="Seçilen parçaları yalnızca bu nesting işinden sil">${removableCount>1?'Seçilenleri Sil ('+removableCount+')':'Parçayı Sil'}</button>
          </div>
        </div>
        <div id="cwsNestSvgBox" class="nesting-sheet-fit">
          ${renderNestingSvg(displayedSheet, selectedIds, n.previewColors, unit, { activeGroup, groupColors, rotateMode })}
          ${rotateMode ? `
            <div id="nestingRotateBar" class="nest-rotate-bar" role="toolbar" aria-label="Döndürme Kontrolleri">
              <span class="nest-rot-title">↻ Döndür</span>
              <input id="nestRotAngleInput" type="number" step="1" value="${curRotDeg}" title="Açı (derece)">
              <span class="nest-rot-deg">°</span>
              <button type="button" data-nest-rot-delta="-90" title="Sola 90° döndür">-90°</button>
              <button type="button" data-nest-rot-delta="90" title="Sağa 90° döndür">+90°</button>
              <button type="button" data-nest-rot-delta="180" title="180° çevir">180°</button>
              <button type="button" data-nest-rot-abs="0" title="Açıyı sıfırla (0°)">0°</button>
              <button type="button" id="nestRotDoneBtn" class="nest-rot-done" title="Döndürme modundan çık (Esc)">✓</button>
            </div>
          ` : ''}
          <span class="nesting-sheet-dimensions">${formatDimensions(displayedSheet.widthMm,displayedSheet.heightMm,unit)}</span>
          <div id="nestZoomHud" class="nest-zoom-hud" title="Ctrl + Tekerlek ile yakınlaştır/uzaklaştır">
            <button type="button" id="nestZoomOut" aria-label="Uzaklaştır">−</button>
            <span id="nestZoomVal">100%</span>
            <button type="button" id="nestZoomIn" aria-label="Yakınlaştır">+</button>
            <button type="button" id="nestZoomReset" title="Görünümü sıfırla">↺</button>
          </div>
          ${!activeSheet ? '<span class="nesting-sheet-empty-note">Parçaları yerleştirmek için Otomatik Yerleştir seçin</span>' : ''}
        </div>
      </div>

      <!-- Right: Collapsible & Floatable Corel-Style Settings Panels -->
      <div class="cws-side-r">
        <div class="cws-side-r-header">
          <h3 class="sec-title">Ayarlar</h3>
          <button type="button" id="cwsResetRightPanels" class="cws-side-mini-btn" title="Serbest panelleri eski yerine yerleştir">↺</button>
          <button type="button" id="cwsToggleAllRightPanels" class="cws-side-mini-btn" title="${anyRightOpen ? 'Tüm bölümleri kapat' : 'Tüm bölümleri aç'}">${anyRightOpen ? 'Kapat' : 'Aç'}</button>
          <button type="button" id="cwsToggleRightPanel" class="cws-side-mini-btn" aria-expanded="${!rightCollapsed}" title="${rightCollapsed ? 'Sağ ayar panelini aç' : 'Sağ ayar panelini daralt'}">${rightCollapsed ? '«' : '»'}</button>
        </div>
        ${wrapRightPanel('sheet', 0, 'Levha &amp; Optimizasyon', `
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
          <div class="field-row"><label>Fırça Yönü Kısıtı (0° Sabit)</label><input id="cwsNestGrain" type="checkbox" ${n.enforceGrainDirection ? 'checked' : ''}></div>
          <details class="nesting-advanced-details" id="cwsNestAdvanced" ${ctx.advancedOpen ? 'open' : ''}>
            <summary class="nesting-advanced-summary">
              <span>Gelişmiş Yerleşim Ayarları</span>
              <small id="cwsNestAdvancedBadge">${n.enforceGrainDirection ? '0° Sabit · Otomatik' : (n.rotationStepDeg === 'auto' || n.rotationStepDeg == null ? 'Otomatik · En İyi Geçirme' : `${n.rotationStepDeg}° Adım`)}</small>
            </summary>
            <div class="nesting-advanced-body">
              <div class="field-row">
                <label for="cwsNestHoles" title="O, A, D gibi yuvarlak veya kapalı iç boşluğu olan objelerin içine küçük parçaları yerleştir">Objelerin İçine Ekle (Delik İçi)</label>
                <input id="cwsNestHoles" type="checkbox" ${n.allowHoleNesting !== false ? 'checked' : ''}>
              </div>
              <div class="field-row">
                <label>Dönüş Açısı</label>
                <select id="cwsNestRot" ${n.enforceGrainDirection ? 'disabled title="Fırça yönü kısıtı açıkken parçalar 0° sabit kalır"' : ''}>
                  <option value="auto" ${(n.rotationStepDeg == null || n.rotationStepDeg === 'auto') ? 'selected' : ''}>Otomatik · En İyi Geçirme</option>
                  <option value="0" ${n.rotationStepDeg === 0 ? 'selected' : ''}>Sabit (0°)</option>
                  <option value="180" ${n.rotationStepDeg === 180 ? 'selected' : ''}>0° / 180°</option>
                  <option value="90" ${n.rotationStepDeg === 90 ? 'selected' : ''}>90° Adımlı</option>
                  <option value="45" ${n.rotationStepDeg === 45 ? 'selected' : ''}>45° Adımlı</option>
                  <option value="30" ${n.rotationStepDeg === 30 ? 'selected' : ''}>30° Adımlı</option>
                  <option value="15" ${n.rotationStepDeg === 15 ? 'selected' : ''}>15° Adımlı</option>
                  <option value="5" ${n.rotationStepDeg === 5 ? 'selected' : ''}>5° Adımlı · detaylı</option>
                </select>
              </div>
              <h3 class="sec-title" style="margin-top:10px">Yerleşim Tercihi</h3>
              <div class="field-row" id="nestingEngineVersion"><label>Yerleşim motoru</label><strong style="font-size:12px;color:var(--text)">Nesting v3 Pro · Exact NFP</strong></div>
              <div class="field-row"><label>Optimizasyon yönü</label>
                <select id="cwsNestStrategy">
                  <option value="auto" ${(!n.placementStrategy || n.placementStrategy === 'auto') ? 'selected' : ''}>Otomatik · Tabakaya En İyi</option>
                  <option value="compact" ${n.placementStrategy === 'compact' ? 'selected' : ''}>Kompakt · daha az fire</option>
                  <option value="vertical" ${n.placementStrategy === 'vertical' ? 'selected' : ''}>Dikey · üst alanı kullan</option>
                  <option value="bottomLeft" ${n.placementStrategy === 'bottomLeft' ? 'selected' : ''}>Alt-sol · klasik</option>
                </select>
              </div>
            </div>
          </details>
        `)}
        ${wrapRightPanel('colors', 1, 'Önizleme Renkleri', `
          <div class="nesting-preview-palette">
            <label class="nesting-palette-option"><span>Dış çizgi rengi (Gövde)</span><input id="cwsNestBodyColor" type="color" value="${/^#[a-f0-9]{6}$/i.test(n.previewColors?.body || '') ? n.previewColors.body : '#c89343'}" title="Tüm harf dış çizgileri için tek renk"></label>
            <label class="nesting-palette-option"><span>İç boşluk çizgi rengi (A / O / R)</span><input id="cwsNestHoleColor" type="color" value="${/^#[a-f0-9]{6}$/i.test(n.previewColors?.holes || '') ? n.previewColors.holes : '#c89343'}" title="Bütün iç boşluk çizgileri için tek renk"></label>
            <button type="button" id="cwsNestResetColors" class="sec-btn">Renkleri Sıfırla</button>
            <small>Bu renkler yalnızca dış ve iç çizgi renkleridir (iç dolgu uygulanmaz); CorelDRAW aktarımında da çizgi rengi olarak gider.</small>
          </div>
        `)}
        ${wrapRightPanel('cnc', 2, 'CNC Makine ve Ayarları', renderNestedCncPanel(state, activeSheet))}
        ${wrapRightPanel('export', 3, 'Nesting Dışa Aktar', `
          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" id="cwsExpCorel" class="corel-btn" ${totalParts?'':'disabled'}>✦ CorelDRAW'a Aktar</button>
            <button type="button" id="cwsCorelSetup" class="sec-btn">CorelDRAW Köprüsü &amp; Seçenekler</button>
            <button type="button" id="cwsExpSvg" class="sec-btn" ${activeSheet?.placements?.length?'':'disabled'}>Aktif Levhayı SVG İndir</button>
            <button type="button" id="cwsExpDxf" class="sec-btn" ${totalParts?'':'disabled'}>Tüm Levhaları DXF (1:1 mm) İndir</button>
            <button type="button" id="cwsExpCsv" class="sec-btn" ${totalParts?'':'disabled'}>Parça Listesi (CSV) İndir</button>
          </div>
        `)}
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
    <div id="cwsNestFloatLayer" class="cws-nest-float-layer" aria-label="Serbest Nesting Panelleri"></div>
    </div>
  `;
}

function renderCncFields(state,prefix){
 const cnc=state.cnc||{},unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
 const activeProfile=getMachineProfile(cnc.profile);
 const profileGroups=MACHINE_PROFILE_CATEGORIES.map(cat=>{
  const opts=MACHINE_PROFILES.filter(p=>p.category===cat).map(p=>`<option value="${p.id}" ${activeProfile.id===p.id?'selected':''}>${escapeHtml(p.label)}</option>`).join('');
  return `<optgroup label="${escapeHtml(cat)}">${opts}</optgroup>`;
 }).join('');
 return `
        <div class="field-row">
          <label>Makine Profili (${MACHINE_PROFILES.length})</label>
          <select id="${prefix}Profile">
            ${profileGroups}
          </select>
        </div>
        <div class="field-hint" id="${prefix}ProfileHint" style="font-size:11px;color:var(--muted);margin:-2px 0 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <span>${escapeHtml(activeProfile.notes || '')} · Önerilen kerf: <b>${show(activeProfile.defaultKerfMm ?? 0.2)} ${unit}</b>, takım: <b>${show(activeProfile.defaultToolDiaMm ?? 3)} ${unit}</b></span>
          <button type="button" id="${prefix}ApplyDefaults" class="sec-btn" style="padding:3px 8px;font-size:11px">Varsayılanları Uygula</button>
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
 const cnc=state.cnc||{},profile=getMachineProfile(cnc.profile);
 const val=validateNestedProduction(activeSheet?[activeSheet]:[],cnc);
 return `<div id="nestCncPanel">
 ${renderCncFields(state,'nestCnc')}
 <div id="nestCncStatus" style="font-size:11px;margin:6px 0;color:var(--muted)">${val.valid?'Konturlar doğrulandı · aktif levha':escapeHtml(val.issues[0]?.msg||'Üretim kontrolü gerekli.')}
 ${profile.kind==='gcode'?'<p>G-code taslağı: hız, güç ve Z değerleri sabittir; telafi, lead-in ve mikro köprüler CAM programında doğrulanıp uygulanmalıdır.</p>':''}</div>
 <button type="button" id="nestCncExport" class="sec-btn" style="width:100%" ${val.valid?'':'disabled'}>Aktif Levha · ${profile.kind==='gcode'?'G-code Taslağı (.'+profile.ext+')':profile.ext.toUpperCase()} İndir</button>
 <div style="display:flex;gap:6px;margin-top:6px">
   <button type="button" id="nestCncSendMachine" class="cnc-send-btn" style="flex:1" ${val.valid?'':'disabled'} title="Seçili CNC/Lazer makinesine gönder">⚡ Makineye Yükle</button>
   <button type="button" id="nestCncMachineConfig" class="sec-btn" title="Makine bağlantı ayarları (USB / Klasör / LightBurn / FTP / TCP / COM)">⚙</button>
 </div>
 </div>`;
}

function renderWorkshopPane(state, metricsList = []) {
  const studPlan = computeMountingStuds(metricsList);
  const ledPlan = calculateSmartLedAndPsu(metricsList, state);
  const coilPlan = calculateReturnCoilPlan(metricsList, state);
  const hasLetters = (metricsList || []).length > 0;

  return `
    <div class="workshop-grid">
      <div class="sec">
        <h3 class="sec-title">1:1 Montaj (Saplama) Şablonu</h3>
        <p style="font-size:12px;color:var(--muted);margin:0 0 10px">Harflerin dış konturunu ve dengeli arka saplama deliklerini 1:1 mm ölçeğinde plotter çıktısına hazır üretir.</p>
        <div class="workshop-kpi"><span>Harf / Kontur Sayısı</span><strong>${studPlan.letters.length}</strong></div>
        <div class="workshop-kpi"><span>Toplam Saplama Deliği</span><strong>${studPlan.totalStuds} adet</strong></div>
        <div class="workshop-kpi"><span>Delik Çapı</span><strong>6 mm (Standart)</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          <button type="button" id="wsExportStudDxf" class="cta-btn" ${!hasLetters ? 'disabled' : ''}>1:1 Şablon DXF İndir</button>
          <button type="button" id="wsExportStudSvg" class="sec-btn" ${!hasLetters ? 'disabled' : ''}>1:1 Şablon SVG İndir</button>
        </div>
      </div>

      <div class="sec">
        <h3 class="sec-title">Akıllı LED &amp; IP67 Trafo Hesabı</h3>
        <p style="font-size:12px;color:var(--muted);margin:0 0 10px">İç alana göre modül dağılımı ve %20 güvenlik payı dahil otomatik dış mekan IP67 güç kaynağı seçimi.</p>
        <div class="workshop-kpi"><span>Toplam LED Modül</span><strong>${ledPlan.totalModules} modül</strong></div>
        <div class="workshop-kpi"><span>Net Güç Tüketimi</span><strong>${ledPlan.totalWatt} W</strong></div>
        <div class="workshop-kpi"><span>+%${ledPlan.safetyMarginPct} Paylı Gereksinim</span><strong>${ledPlan.requiredWatt} W</strong></div>
        <div class="workshop-kpi"><span>Önerilen Güç Kaynağı</span><strong style="color:#4ade80">${escapeHtml(ledPlan.psuLabel)}</strong></div>
      </div>

      <div class="sec">
        <h3 class="sec-title">Yan Bant Bobin &amp; Fire Hesabı</h3>
        <p style="font-size:12px;color:var(--muted);margin:0 0 10px">Kutu harf derinliğine göre gerekli toplam yan bant metrajı ve bobin rulo kullanımı.</p>
        <div class="workshop-kpi"><span>Yan Bant Yüksekliği (Bobin Eni)</span><strong>${coilPlan.coilWidthMm} mm</strong></div>
        <div class="workshop-kpi"><span>Net Harf Çevresi</span><strong>${coilPlan.netPerimeterM} m</strong></div>
        <div class="workshop-kpi"><span>Fire &amp; Bindirme Payı (%${coilPlan.wastePct})</span><strong>+${coilPlan.wasteAllowanceM} m</strong></div>
        <div class="workshop-kpi"><span>Toplam Bobin İhtiyacı</span><strong>${coilPlan.grossPerimeterM} m (${coilPlan.estimatedRolls} rulo)</strong></div>
      </div>
    </div>
  `;
}

export function renderCncCenter(state, ctx = {}) {
  const sheets = state.nesting?.sheets || [];
  const cnc = state.cnc || {};
  const subTab = ctx.subTab || 'cnc';
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const val = validateNestedProduction(sheets, cnc);
  const activeProfile = getMachineProfile(cnc.profile);
  const gcodeExt = activeProfile.kind === 'gcode' ? activeProfile.ext : 'nc';

  const tabsHtml = `
    <div class="cnc-subtabs">
      <button type="button" class="cnc-subtab-btn ${subTab === 'cnc' ? 'active' : ''}" data-cnc-subtab="cnc">⚙ CNC / Lazer Kesim</button>
      <button type="button" class="cnc-subtab-btn ${subTab === 'workshop' ? 'active' : ''}" data-cnc-subtab="workshop">🛠 Atölye Otomasyon (Şablon &amp; Bobin)</button>
      <button type="button" class="cnc-subtab-btn ${subTab === 'bending' ? 'active' : ''}" data-cnc-subtab="bending">🔄 Yan Bant Büküm Simülatörü</button>
    </div>
  `;

  if (subTab === 'workshop') {
    return `${tabsHtml}${renderWorkshopPane(state, ctx.metricsList || [])}`;
  }
  if (subTab === 'bending') {
    return `${tabsHtml}${renderBendingSimulatorPane(ctx.bendingJob, ctx.bendingConfig, ctx.bendingSimState)}`;
  }

  return `
    ${tabsHtml}
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
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <button type="button" id="cncBtnSendMachine" class="cnc-send-btn" style="flex:1" ${!val.valid ? 'disabled' : ''}>⚡ ${escapeHtml(activeProfile.label.split('(')[0].trim())} · Makineye Yükle</button>
          <button type="button" id="cncBtnMachineConfig" class="sec-btn">⚙ Bağlantı Ayarları</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" id="cncBtnNestNow" class="sec-btn">Nesting Hesapla / Yenile</button>
          <button type="button" id="cncBtnExportDxf" class="cta-btn" ${!val.valid ? 'disabled' : ''}>Nesting DXF (1:1 mm) İndir</button>
          <button type="button" id="cncBtnExportGcode" class="cta-btn" ${!val.valid ? 'disabled' : ''}>Makine G-Code (.${gcodeExt}) İndir</button>
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
