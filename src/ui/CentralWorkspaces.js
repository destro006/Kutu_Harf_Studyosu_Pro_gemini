import { SHEET_PRESETS } from '../manufacturing/NestingEngine.js';
import { renderNestingSvg } from './NestingView.js';
import { MACHINE_PROFILES, validateNestedProduction } from '../export/CncGcodeExporter.js';
import { formatMoney } from '../manufacturing/CostEngine.js';
import { buildQuoteHtml } from '../manufacturing/QuoteGenerator.js';

/**
 * Central Full-Canvas Workspaces:
 *  - Nesting (Multi-sheet, left part list, center SVG canvas, right settings, bottom stats)
 *  - Üretim / CNC (Consumes actual nested layouts, machine profiles, validation, Nesting Dışa Aktar)
 *  - Maliyet ve Teklif (Live BOM, LED/PSU estimates, margin/taxes, printable PDF quote)
 */

export function renderNestingCenter(state, ctx) {
  const n = state.nesting;
  const sheets = n.sheets || [];
  const activeIdx = Math.min(Math.max(0, ctx.activeSheetIdx || 0), Math.max(0, sheets.length - 1));
  const activeSheet = sheets[activeIdx] || null;
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
  const totalCutLenMm = sheets.reduce((a, sh) => a + sh.placements.reduce((s, p) => s + (p.bounds ? (p.bounds.width + p.bounds.height) * 2 : 0), 0), 0);

  return `
    <div class="center-ws-grid">
      <!-- Left: Part List & Material Groups -->
      <div class="cws-side">
        <h3 class="sec-title">İmalat Parçaları (${totalParts})</h3>
        ${!sheets.length ? '<p style="font-size:12px;color:var(--muted)">Parça listesi için "Otomatik Yerleştir"e tıklayın.</p>' : `
          <div style="display:flex;flex-direction:column;gap:4px">
            ${(activeSheet?.placements || []).map(p => `
              <div class="layer-item ${ctx.selectedPlacementId === p.id ? 'on' : ''}" data-cws-pid="${p.id}">
                <span class="layer-name">${p.locked ? '🔒 ' : ''}${escapeHtml(p.label)}</span>
                <small style="color:var(--muted)">${Math.round(p.bounds?.width || 0)}×${Math.round(p.bounds?.height || 0)}</small>
              </div>
            `).join('')}
          </div>
        `}
        ${(n.unplaced || []).length ? `
          <h3 class="sec-title" style="margin-top:12px;color:var(--danger)">Yerleşmeyenler (${n.unplaced.length})</h3>
          <div style="font-size:11.5px;color:var(--danger)">
            ${n.unplaced.map(u => `<div>• ${escapeHtml(u.label)} (${escapeHtml(u.reason || 'Sığmadı')})</div>`).join('')}
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
            <button type="button" id="cwsRunNesting" class="cta-btn" style="padding:5px 12px">Otomatik Yerleştir</button>
            <button type="button" id="cwsReoptUnlocked" class="sec-btn">Kilitsizleri Optimize Et</button>
          </div>
        </div>
        <div id="cwsNestSvgBox" class="nesting-sheet-fit">
          ${renderNestingSvg(displayedSheet, ctx.selectedPlacementId)}
          <span class="nesting-sheet-dimensions">${displayedSheet.widthMm} × ${displayedSheet.heightMm} mm</span>
          ${!activeSheet ? '<span class="nesting-sheet-empty-note">Parçaları yerleştirmek için Otomatik Yerleştir seçin</span>' : ''}
        </div>
      </div>

      <!-- Right: Sheet & Optimization Settings -->
      <div class="cws-side-r">
        <h3 class="sec-title">Levha &amp; Optimizasyon</h3>
        <div class="field-row">
          <label>Plaka Önayarı</label>
          <select id="cwsNestPreset">
            ${SHEET_PRESETS.map(p => `<option value="${p.id}" ${presetId === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
            <option value="custom" ${presetId === 'custom' ? 'selected' : ''}>Özel Ölçü</option>
          </select>
        </div>
        <div class="field-row"><label>Levha Genişliği (mm)</label><input id="cwsNestW" type="number" value="${n.sheetWidthMm}"></div>
        <div class="field-row"><label>Levha Yüksekliği (mm)</label><input id="cwsNestH" type="number" value="${n.sheetHeightMm}"></div>
        <div class="field-row"><label>Parça Aralığı (mm)</label><input id="cwsNestSp" type="number" value="${n.spacingMm}"></div>
        <div class="field-row"><label>Kenar Payı (mm)</label><input id="cwsNestMg" type="number" value="${n.marginLeftMm}"></div>
        <div class="field-row"><label>Delik İçi Yerleştirme</label><input id="cwsNestHoles" type="checkbox" ${n.allowHoleNesting ? 'checked' : ''}></div>
        <div class="field-row"><label>Fırça Yönü Kısıtı</label><input id="cwsNestGrain" type="checkbox" ${n.enforceGrainDirection ? 'checked' : ''}></div>
        <div class="field-row">
          <label>Dönüş Açısı</label>
          <select id="cwsNestRot">
            <option value="0" ${n.rotationStepDeg === 0 ? 'selected' : ''}>Sabit (0°)</option>
            <option value="180" ${n.rotationStepDeg === 180 ? 'selected' : ''}>0° / 180°</option>
            <option value="90" ${n.rotationStepDeg === 90 ? 'selected' : ''}>90° Adımlı</option>
            <option value="45" ${n.rotationStepDeg === 45 ? 'selected' : ''}>45° Adımlı</option>
          </select>
        </div>
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
        <span><b>Tahmini Kesim Yolu:</b> ${(totalCutLenMm / 1000).toFixed(2)} m</span>
        <span><b>Yerleşmeyen:</b> ${(n.unplaced || []).length}</span>
      </div>
    </div>
  `;
}

export function renderCncCenter(state) {
  const sheets = state.nesting?.sheets || [];
  const cnc = state.cnc || {};
  const val = validateNestedProduction(sheets, cnc);

  return `
    <div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1180px;margin:0 auto">
      <div class="sec">
        <h3 class="sec-title">CNC / Lazer Post-Processor Ayarları</h3>
        <div class="field-row">
          <label>Makine Profili</label>
          <select id="cncProfile">
            ${MACHINE_PROFILES.map(p => `<option value="${p.id}" ${cnc.profile === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>Kesim Kerfi (mm)</label><input id="cncKerf" type="number" step="0.05" value="${cnc.kerfMm ?? 0.2}"></div>
        <div class="field-row"><label>Takım Çapı (mm)</label><input id="cncToolDia" type="number" step="0.5" value="${cnc.toolDiameterMm ?? 3.0}"></div>
        <div class="field-row">
          <label>Takım Telafisi</label>
          <select id="cncComp">
            <option value="outside" ${cnc.compensation === 'outside' ? 'selected' : ''}>Dıştan Telafi (Outside)</option>
            <option value="inside" ${cnc.compensation === 'inside' ? 'selected' : ''}>İçten Telafi (Inside)</option>
            <option value="center" ${cnc.compensation === 'center' ? 'selected' : ''}>Merkez (On-Line)</option>
          </select>
        </div>
        <div class="field-row">
          <label>Kesim Sırası</label>
          <select id="cncSeq">
            <option value="hole_first" ${cnc.sequence !== 'outer_first' ? 'selected' : ''}>Önce İç Delikler (Önerilen)</option>
            <option value="outer_first" ${cnc.sequence === 'outer_first' ? 'selected' : ''}>Önce Dış Kontur</option>
          </select>
        </div>
        <div class="field-row"><label>Giriş / Çıkış (Lead-in/out mm)</label><input id="cncLeadIn" type="number" step="0.5" value="${cnc.leadInMm ?? 3}"></div>
        <div class="field-row"><label>Mikro Köprü (Micro-tabs)</label><input id="cncTabs" type="checkbox" ${cnc.microTabs ? 'checked' : ''}></div>
        <div class="field-row"><label>Eğri Toleransı (mm)</label><input id="cncTol" type="number" step="0.05" value="${cnc.curveTolMm ?? 0.1}"></div>
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

export function renderCostCenter(state, lastMetrics, lastCosts) {
  const cur = lastCosts.currency || 'TRY';
  const quoteText = [
    `Proje: ${state.projectName || 'Yeni Tabela Projesi'}`,
    `Ölçü: ${lastMetrics.totalWidthMm} × ${lastMetrics.totalHeightMm} mm | Parça: ${lastMetrics.componentCount}`,
    `Aydınlatma: ${state.lighting?.mode || 'both'} | Yapı: ${state.constructionType || 'fileli'}`,
    `Metal: ${(lastMetrics.metalFaceAreaM2 ?? 0).toFixed(3)} m² | Pleksi: ${(lastMetrics.acrylicAreaM2 ?? 0).toFixed(3)} m² | Yan Bant: ${(lastMetrics.sidewallAreaM2 ?? 0).toFixed(3)} m²`,
    `LED: ${(lastMetrics.totalLedModules ?? 0)} modül`,
    `Genel Toplam (KDV Dahil): ${formatMoney((lastCosts.grandTotal ?? 0), cur)}`
  ].join('\n');
  return `
    <div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1180px;margin:0 auto">
      <div class="sec">
        <h3 class="sec-title">Üretim Metrajı &amp; Maliyet Dağılımı</h3>
        <div class="kpi-grid">
          <div class="kpi"><small>Ön / File Metal</small><strong>${(lastMetrics.metalFaceAreaM2 ?? 0).toFixed(3)} m²</strong></div>
          <div class="kpi"><small>Pleksi Alanı</small><strong>${(lastMetrics.acrylicAreaM2 ?? 0).toFixed(3)} m²</strong></div>
          <div class="kpi"><small>Yan Bant Alanı</small><strong>${(lastMetrics.sidewallAreaM2 ?? 0).toFixed(3)} m²</strong></div>
          <div class="kpi"><small>Tahmini LED / Trafo</small><strong>${(lastMetrics.totalLedModules ?? 0)} ad</strong></div>
        </div>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:12.5px">
          <div class="field-row"><span>Malzeme Maliyeti</span><b>${formatMoney((lastCosts.materialCost ?? 0), cur)}</b></div>
          <div class="field-row"><span>LED &amp; Güç Kaynağı</span><b>${formatMoney((lastCosts.ledCost ?? 0), cur)}</b></div>
          <div class="field-row"><span>İşçilik &amp; CNC Kesim</span><b>${formatMoney((lastCosts.laborCost ?? 0), cur)}</b></div>
          <div class="field-row"><span>Kâr Marjı (%${state.pricing?.profitValue ?? 35})</span><b>${formatMoney((lastCosts.profitAmount ?? 0), cur)}</b></div>
          <div class="field-row"><span>KDV (%${state.pricing?.vatRatePct ?? 20})</span><b>${formatMoney((lastCosts.vatAmount ?? 0), cur)}</b></div>
          <div class="field-row" style="font-size:15px;color:var(--accent)"><strong>GENEL TOPLAM</strong><strong>${formatMoney((lastCosts.grandTotal ?? 0), cur)}</strong></div>
        </div>
      </div>
      <div class="sec">
        <h3 class="sec-title">Müşteri Teklif Özeti &amp; Dışa Aktarım</h3>
        <pre style="white-space:pre-wrap;font-size:11.5px;background:var(--bg);padding:10px;border-radius:8px;border:1px solid var(--line);max-height:260px;overflow:auto">${escapeHtml(quoteText)}</pre>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button type="button" id="costCenterPdfBtn" class="cta-btn">Yazdır / PDF Teklif</button>
          <button type="button" id="costCenterCopyBtn" class="sec-btn">Teklif Metnini Kopyala</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
