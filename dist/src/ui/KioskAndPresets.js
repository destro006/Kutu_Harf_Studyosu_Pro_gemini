/**
 * Module 9: 1-Click Industry Scene Presets & Simplified Client Kiosk Mode (Müşteri Modu)
 */
import { formatMoney } from '../manufacturing/CostEngine.js';
import { formatDimensions } from '../core/units.js';

export const INDUSTRY_SCENE_PRESETS = [
  {
    id: 'luxury_cafe',
    label: 'Lüks Kafe & Pastane',
    desc: 'Ceviz / Taş cephe + Sıcak gün ışığı arkadan halo',
    wallId: 'cevizPanel',
    night: true,
    constructionType: 'halo',
    faceId: 'fircaliAltin',
    faceColor: '#dcaa52',
    sideId: 'fircaliAltin',
    sideColor: '#dcaa52',
    lightingMode: 'halo',
    lightHex: '#ffc982',
  },
  {
    id: 'clinic_pharmacy',
    label: 'Klinik & Eczane',
    desc: 'Venedik beyaz cephe + Önden net soğuk beyaz pleksi',
    wallId: 'beyazSiva',
    night: false,
    constructionType: 'fileli',
    faceId: 'aynaKrom',
    faceColor: '#f4f6f8',
    sideId: 'aynaKrom',
    sideColor: '#f4f6f8',
    lightingMode: 'front',
    lightHex: '#eef4ff',
  },
  {
    id: 'plaza_office',
    label: 'Plaza & Kurumsal Ofis',
    desc: 'Antrasit kompozit cephe + Ayna krom çift yönlü ışık',
    wallId: 'kompozit',
    night: true,
    constructionType: 'metal',
    faceId: 'aynaKrom',
    faceColor: '#f4f6f8',
    sideId: 'aynaKrom',
    sideColor: '#f4f6f8',
    lightingMode: 'halo',
    lightHex: '#eef4ff',
  },
  {
    id: 'jewelry_boutique',
    label: 'Butik & Mücevherat',
    desc: 'Nero siyah mermer + Ayna altın sıcak halo',
    wallId: 'siyahMermer',
    night: true,
    constructionType: 'metal',
    faceId: 'aynaAltin',
    faceColor: '#f5c66a',
    sideId: 'aynaAltin',
    sideColor: '#f5c66a',
    lightingMode: 'halo',
    lightHex: '#ffc982',
  },
  {
    id: 'travertine_villa',
    label: 'Traverten Rezidans',
    desc: 'Bej traverten duvar + Siyah krom gün ışığı vurgu',
    wallId: 'traverten',
    night: false,
    constructionType: 'metal',
    faceId: 'siyahKrom',
    faceColor: '#2c3036',
    sideId: 'siyahKrom',
    sideColor: '#2c3036',
    lightingMode: 'halo',
    lightHex: '#fff1d6',
  },
];

export function applyIndustryScenePreset(state, presetId) {
  const p = INDUSTRY_SCENE_PRESETS.find(x => x.id === presetId);
  if (!p) return false;
  state.scene.wallId = p.wallId;
  state.scene.night = p.night;
  state.constructionType = p.constructionType;
  state.materials.faceId = p.faceId;
  state.materials.faceColor = p.faceColor;
  state.materials.sideId = p.sideId;
  state.materials.sideColor = p.sideColor;
  state.lighting.enabled = p.lightingMode !== 'none';
  state.lighting.mode = p.lightingMode;
  state.lighting.colorHex = p.lightHex;
  for (const o of state.objects || []) {
    if (o.locked) continue;
    o.constructionType = p.constructionType;
    o.faceMaterial = p.faceId;
    o.faceColor = p.faceColor;
    o.sideMaterial = p.sideId;
    o.sideColor = p.sideColor;
    o.lightingMode = p.lightingMode;
  }
  return true;
}

export function renderKioskPanel(state, metrics, costs) {
  const cur = costs?.currency || 'TRY';
  const totalTxt = formatMoney(costs?.grandTotal || 0, cur);
  const dimsTxt = formatDimensions(metrics?.totalWidthMm || 0, metrics?.totalHeightMm || 0, state.pageLayout?.displayUnit);
  const mainText = (state.objects || []).find(o => o.kind === 'text')?.text || '';
  return `
    <div class="kiosk-shell">
      <div class="kiosk-head">
        <div>
          <span class="kiosk-badge">MÜŞTERİ MODU</span>
          <strong>3 Adımda Kutu Harf Tasarla &amp; Fiyat Gör</strong>
        </div>
        <button type="button" id="btnKioskExit" class="sec-btn">← Stüdyo Moduna Dön</button>
      </div>
      <div class="kiosk-steps">
        <section class="kiosk-step">
          <div class="kiosk-step-num">1. Logo veya Yazı</div>
          <div style="display:flex;gap:6px">
            <input id="kioskTextInput" type="text" value="${String(mainText).replace(/"/g, '&quot;')}" placeholder="Tabela yazınızı yazın..." style="flex:1">
            <label class="sec-btn" style="cursor:pointer;white-space:nowrap">🖼 Logo Yükle<input id="kioskLogoInput" type="file" accept=".svg,.ai,.cdr,.png,.jpg,.jpeg,.webp" hidden></label>
          </div>
        </section>
        <section class="kiosk-step">
          <div class="kiosk-step-num">2. Sektör &amp; Malzeme Seç</div>
          <div class="kiosk-preset-row">
            ${INDUSTRY_SCENE_PRESETS.map(p => `<button type="button" class="kiosk-preset-btn" data-kiosk-preset="${p.id}">${p.label}</button>`).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button type="button" class="sec-btn" data-kiosk-mat="aynaAltin">Ayna Altın</button>
            <button type="button" class="sec-btn" data-kiosk-mat="aynaKrom">Ayna Krom</button>
            <button type="button" class="sec-btn" data-kiosk-mat="siyahKrom">Siyah Krom</button>
            <button type="button" class="sec-btn" id="kioskToggleNight">${state.scene?.night !== false ? '🌙 Gece' : '☀ Gündüz'}</button>
          </div>
        </section>
        <section class="kiosk-step kiosk-step-price">
          <div class="kiosk-step-num">3. 3D Önizleme &amp; Tahmini Tutar</div>
          <div class="kiosk-price-box">
            <div><small><span id="kioskDimsVal">${dimsTxt}</span> · KDV Dahil</small><strong id="kioskPriceVal">${totalTxt}</strong></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" id="kioskVideoBtn" class="sec-btn">🎬 Sunum Videosu</button>
              <button type="button" id="kioskShareBtn" class="cta-btn">🔗 Onay Linki / WhatsApp</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;
}
