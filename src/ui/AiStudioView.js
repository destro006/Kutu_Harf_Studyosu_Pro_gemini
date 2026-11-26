/**
 * Flagship Dedicated Workspace: AI Stüdyo
 * Left: Signage Prompt Architect (3D Pull, Facade Upload / Pool, Master Prompt Enhancer)
 * Center: High-Res Visual Stage with Before/After Slider + Send to 3D Scene / Quote
 * Right: Integrated Non-Overlapping "Uygulama Uzmanı" Side Drawer with Full-Width Input
 */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const AI_STUDIO_PRESETS = [
  { id: 'night_halo', label: '🌙 Gece Halo Işıklı', brief: 'Gece görünümü, sıcak 3000K gün ışığı arkadan halo parlama, lüks koyu mermer cephede gerçekçi ışık saçılımı' },
  { id: 'rainy_street', label: '🌧 Yağmurlu Cadde', brief: 'Yağmurlu akşam cadde atmosferi, ıslak kaldırım ve cam vitrinlerde sıcak neon/metal tabela yansımaları' },
  { id: 'luxury_marble', label: '🏛 Lüks Mermer Cephe', brief: 'Doğal damarlı traverten ve nero mermer kaplı lüks mağaza cephesinde keskin 3D derinlik ve temas gölgesi' },
  { id: 'day_arch', label: '☀ Gündüz Mimari Çekim', brief: 'Bulutsuz altın saat doğal güneş ışığı, keskin 3D harf yansıması ve yüksek çözünürlüklü mimari fotoğraf kalitesi' },
  { id: 'interior_reception', label: '🏢 İç Mekan Resepsiyon', brief: 'Lüks kurumsal ofis / klinik resepsiyon arka duvarı, tavandan sıcak spot vurgulu kurumsal kutu harf sunumu' },
];

export function renderAiStudioWorkspace(ctx = {}) {
  const compositeUrl = ctx.compositeUrl || '';
  const resultUrl = ctx.resultUrl || '';
  const brief = ctx.brief || '';
  const masterPrompt = ctx.masterPrompt || '';
  const facades = ctx.facades || [];
  const config = ctx.config || { provider: 'gemini', apiKey: '' };
  const comparePct = Number.isFinite(ctx.comparePct) ? ctx.comparePct : 50;
  const statusText = ctx.statusText || '';
  const expertMsgs = ctx.expertMessages || [
    { role: 'bot', text: 'Merhaba! Tüm sekme, cephe havuzu, video ve büküm araçlarını doğrudan yönetebilirim.' },
  ];
  const expertCollapsed = Boolean(ctx.expertCollapsed);

  return `
    <div class="ai-studio-layout ${expertCollapsed ? 'expert-collapsed' : ''}">
      <section class="sec ai-studio-left">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 class="sec-title" style="margin:0">✦ Tabela Prompt Mimarı</h3>
          <span class="ai-studio-badge">GEOMETRİ KİLİTLİ</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <button type="button" id="aiStudioPull3D" class="sec-btn">📐 3D Sahneyi Çek</button>
          <label class="sec-btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
            📷 Cephe Yükle
            <input id="aiStudioUploadFacade" type="file" accept="image/png,image/jpeg,image/webp" class="hidden">
          </label>
        </div>
        <div class="field-row" style="margin-bottom:8px">
          <label for="aiStudioFacadeSelect">Hazır Cephe Havuzundan Seç (${facades.length})</label>
          <select id="aiStudioFacadeSelect" class="bend-select">
            <option value="">-- Mevcut 3D / Yüklü Cephe --</option>
            ${facades.map(f => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}
          </select>
        </div>
        <div class="ai-studio-chips">
          ${AI_STUDIO_PRESETS.map(p => `<button type="button" class="kiosk-preset-btn" data-aistudio-preset="${esc(p.brief)}">${p.label}</button>`).join('')}
        </div>
        <div class="bend-field-group" style="margin-top:8px">
          <label for="aiStudioBrief">Kısa Talebiniz (Türkçe)</label>
          <input id="aiStudioBrief" type="text" value="${esc(brief)}" placeholder="Örn: Bunu karanlıkta altın gibi parlatıp mermer duvara tak...">
        </div>
        <button type="button" id="aiStudioEnhanceBtn" class="sec-btn" style="width:100%;margin-bottom:8px">1. Master Prompt Geliştir (Geometri Kilitli)</button>
        <div class="bend-field-group">
          <label for="aiStudioMasterPrompt">Teknik Master Prompt (Önizleme &amp; Düzenleme)</label>
          <textarea id="aiStudioMasterPrompt" rows="5" style="width:100%;box-sizing:border-box;font-size:11.5px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:8px">${esc(masterPrompt)}</textarea>
        </div>
        <details style="font-size:11.5px;margin-bottom:8px">
          <summary style="cursor:pointer;color:var(--muted)">⚙ Ekonomik API Ayarları (Gemini Flash / GPT-4o-mini)</summary>
          <div style="display:grid;grid-template-columns:1fr 1.8fr;gap:6px;margin-top:6px">
            <select id="aiStudioProviderSel"><option value="gemini" ${config.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option><option value="openai" ${config.provider === 'openai' ? 'selected' : ''}>OpenAI</option></select>
            <input id="aiStudioApiKeyInp" type="password" value="${esc(config.apiKey)}" placeholder="API Anahtarı (boşsa ücretsiz yerel motor)">
          </div>
        </details>
        <button type="button" id="aiStudioGenerateBtn" class="cta-btn" style="width:100%;min-height:40px">2. Görsel Oluştur (Fotorealistik Harman)</button>
        ${statusText ? `<div id="aiStudioStatus" style="margin-top:6px;font-size:11.5px;color:var(--accent)">${esc(statusText)}</div>` : '<div id="aiStudioStatus" style="margin-top:6px;font-size:11.5px;color:var(--muted)"></div>'}
      </section>

      <section class="sec ai-studio-center">
        <div class="bend-center-head">
          <h3 class="sec-title" style="margin:0">Görsel Önizleme &amp; Öncesi / Sonrası Karşılaştırma</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" id="aiStudioToggleExpertBtn" class="sec-btn">${expertCollapsed ? '✦ Uzmanı Aç' : '✦ Uzmanı Gizle'}</button>
            <button type="button" id="aiStudioDownloadBtn" class="sec-btn" ${!resultUrl && !compositeUrl ? 'disabled' : ''}>⬇ Yüksek Çözünürlük İndir</button>
            <button type="button" id="aiStudioSendToSceneBtn" class="cta-btn" ${!resultUrl && !compositeUrl ? 'disabled' : ''}>↗ 3D Sahneye / Teklife Gönder</button>
          </div>
        </div>
        <div class="ai-studio-stage">
          ${compositeUrl ? `
            <img src="${esc(compositeUrl)}" alt="3D Ön Yerleşim" class="ai-stage-img">
            ${resultUrl ? `
              <div id="aiStudioAfterClip" class="ai-stage-after" style="clip-path:inset(0 ${100 - comparePct}% 0 0)">
                <img src="${esc(resultUrl)}" alt="AI Render Sonucu" class="ai-stage-img">
              </div>
              <div id="aiStudioDivider" class="ai-stage-divider" style="left:${comparePct}%"></div>
            ` : ''}
          ` : '<div class="ai-stage-empty">Başlamak için sol panelden <b>📐 3D Sahneyi Çek</b> veya bir <b>Cephe</b> seçin.</div>'}
        </div>
        ${resultUrl ? `
          <div class="ai-studio-slider-row">
            <span>Öncesi (3D Yerleşim)</span>
            <input id="aiStudioCompareRange" type="range" min="0" max="100" value="${comparePct}" style="flex:1;accent-color:var(--accent)">
            <span>Sonrası (AI Render)</span>
          </div>
        ` : ''}
      </section>

      <aside class="sec ai-studio-right ${expertCollapsed ? 'hidden' : ''}">
        <h3 class="sec-title">✦ Uygulama Uzmanı (Tam Kontrol)</h3>
        <div id="aiStudioExpertLog" class="ai-studio-expert-log">
          ${expertMsgs.map(m => `<div class="ai-msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.text)}</div>`).join('')}
        </div>
        <div class="ai-expert-chips" style="padding:6px 0">
          <button type="button" data-aistudio-expert-q="Büküm simülatörünü aç ve paslanmaz 0.8mm seç">Büküm SS 0.8mm</button>
          <button type="button" data-aistudio-expert-q="Videoya 360 tur ekle">Video +360°</button>
          <button type="button" data-aistudio-expert-q="Cepheyi otel girişi yap">Otel Girişi Cephe</button>
          <button type="button" data-aistudio-expert-q="Ölçüleri kapat">Ölçüleri Kapat</button>
        </div>
        <form id="aiStudioExpertForm" class="ai-studio-expert-form">
          <input id="aiStudioExpertInput" type="text" placeholder="Komut veya soru yazın..." autocomplete="off">
          <button type="submit" class="cta-btn">Gönder</button>
        </form>
      </aside>
    </div>
  `;
}
