import { EXPERT_QUICK_PRESETS } from '../ai/AppExpertAssistant.js';
import { estimateSignageCostParams } from '../ai/SignageAiEngine.js';

/**
 * Flagship Dedicated Workspace: AI Stüdyo
 * - Dark-gold glassmorphism header with interactive golden-amber neural particle canvas
 * - Left: Signage Prompt Architect, Collapsible Structured Master Prompt, Smart Cost Auto-Fill
 * - Center: Crisp Before/After Slider Stage & Strict High-Res Result Download
 * - Right: Integrated Non-Overlapping "Uygulama Uzmanı" with Categorized Quick Presets & Full-Width Input
 */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const AI_STUDIO_PRESETS = [
  { id: 'night_halo', label: '🌙 Gece Halo Işıklı', brief: 'Gece görünümü, sıcak 3000K gün ışığı arkadan halo parlama, lüks koyu mermer cephede gerçekçi ışık saçılımı' },
  { id: 'rainy_street', label: '🌧 Yağmurlu Cadde', brief: 'Yağmurlu akşam cadde atmosferi, ıslak kaldırım ve cam vitrinlerde sıcak neon/metal tabela yansımaları' },
  { id: 'luxury_marble', label: '🏛 Lüks Mermer Cephe', brief: 'Doğal damarlı traverten ve nero mermer kaplı lüks mağaza cephesinde keskin 3D derinlik ve temas gölgesi' },
  { id: 'day_arch', label: '☀ Gündüz Mimari Çekim', brief: 'Bulutsuz altın saat doğal güneş ışığı, keskin 3D harf yansıması ve yüksek çözünürlüklü mimari fotoğraf kalitesi' },
  { id: 'interior_reception', label: '🏢 İç Mekan Resepsiyon', brief: 'Lüks kurumsal ofis / klinik resepsiyon arka duvarı, tavandan sıcak spot vurgulu kurumsal kutu harf sunumu' },
];

export function mountAiStudioParticles(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let raf = 0;
  let stopped = false;
  const particles = Array.from({ length: 28 }, (_, i) => ({
    x: ((i * 73) % 100) / 100,
    y: ((i * 41) % 100) / 100,
    vx: (((i % 7) - 3) || 1) * 0.00028,
    vy: (((i % 5) - 2) || -1) * 0.00024,
    r: 1.2 + (i % 3) * 0.75,
  }));

  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = Math.max(200, parent.clientWidth || 800);
    const h = Math.max(48, parent.clientHeight || 68);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  resize();

  const tick = () => {
    if (stopped) return;
    resize();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
      p.x = Math.max(0, Math.min(1, p.x));
      p.y = Math.max(0, Math.min(1, p.y));
    }

    ctx.lineWidth = 0.75;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      const ax = a.x * w;
      const ay = a.y * h;
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const bx = b.x * w;
        const by = b.y * h;
        const d = Math.hypot(ax - bx, ay - by);
        if (d < 115) {
          ctx.strokeStyle = `rgba(245, 198, 106, ${((1 - d / 115) * 0.22).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255, 209, 122, 0.58)';
      ctx.beginPath();
      ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  };

  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
  };
}

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
  const costEst = ctx.costEstimate || estimateSignageCostParams(ctx.state || {}, { brief });

  const categories = [...new Set(EXPERT_QUICK_PRESETS.map(p => p.cat))];

  return `
    <div class="ai-studio-shell">
      <div class="ai-studio-hero">
        <canvas id="aiStudioParticleCanvas" class="ai-particle-canvas" aria-hidden="true"></canvas>
        <div class="ai-studio-hero-content">
          <div class="ai-studio-hero-title">
            <span class="ai-studio-badge">✦ FLAGSHIP AI STÜDYO</span>
            <strong>Fotorealistik Cephe &amp; 3D Kutu Harf Harmanlama Motoru</strong>
          </div>
          <div class="ai-studio-hero-pills">
            <span class="ai-lock-chip">🔒 Geometri Kilitli</span>
            <span class="ai-lock-chip">✦ PBR Yansıma</span>
            <span class="ai-lock-chip">⤢ Perspektif Uyumlu</span>
          </div>
        </div>
      </div>

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

          <details open class="ai-mp-card">
            <summary class="ai-mp-summary">
              <span>Teknik Master Prompt</span>
              <span class="ai-mp-badges">
                <span class="ai-lock-chip">Geometri Kilitli</span>
                <span class="ai-lock-chip">PBR</span>
              </span>
            </summary>
            <textarea id="aiStudioMasterPrompt" rows="4" class="ai-mp-textarea">${esc(masterPrompt)}</textarea>
          </details>

          <div class="ai-cost-sync-card">
            <div class="ai-cost-sync-head">
              <strong>Akıllı Maliyet Analizi</strong>
              <button type="button" id="aiStudioSyncCostBtn" class="sec-btn" style="font-size:11px;padding:4px 9px">₺ Maliyete Aktar</button>
            </div>
            <div id="aiStudioCostSummary" class="ai-cost-sync-summary">${esc(costEst.summaryLabel)}</div>
          </div>

          <details style="font-size:11.5px;margin-bottom:8px">
            <summary style="cursor:pointer;color:var(--muted)">⚙ Ekonomik API Ayarları (Gemini Flash / GPT-4o-mini)</summary>
            <div style="display:grid;grid-template-columns:1fr 1.8fr;gap:6px;margin-top:6px">
              <select id="aiStudioProviderSel"><option value="gemini" ${config.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option><option value="openai" ${config.provider === 'openai' ? 'selected' : ''}>OpenAI</option></select>
              <input id="aiStudioApiKeyInp" type="password" value="${esc(config.apiKey)}" placeholder="API Anahtarı (boşsa ücretsiz yerel motor)">
            </div>
          </details>
          <button type="button" id="aiStudioGenerateBtn" class="cta-btn" style="width:100%;min-height:40px">2. Görsel Oluştur (Fotorealistik Harman)</button>
          <div id="aiStudioStatus" style="margin-top:6px;font-size:11.5px;color:${statusText ? 'var(--accent)' : 'var(--muted)'}">${esc(statusText)}</div>
        </section>

        <section class="sec ai-studio-center">
          <div class="bend-center-head">
            <h3 class="sec-title" style="margin:0">Görsel Önizleme &amp; Öncesi / Sonrası Karşılaştırma</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" id="aiStudioAdjustPlacementBtn" class="sec-btn" ${!compositeUrl ? 'disabled' : ''} title="3D sahnede 4 köşe perspektif ve konumu ince ayarla">⤢ Konum / 4 Köşe Ayarla</button>
              <button type="button" id="aiStudioToggleExpertBtn" class="sec-btn">${expertCollapsed ? '✦ Uzmanı Aç' : '✦ Uzmanı Gizle'}</button>
              <button type="button" id="aiStudioDownloadBtn" class="sec-btn" ${!resultUrl ? 'disabled title="Önce 2. Görsel Oluştur ile net AI çıktısını üretin"' : 'title="Sonuç AI görselini tam çözünürlükte indir"'}>⬇ Yüksek Çözünürlük İndir</button>
              <button type="button" id="aiStudioSendToSceneBtn" class="cta-btn" ${!resultUrl && !compositeUrl ? 'disabled' : ''}>↗ 3D Sahneye / Teklife Gönder</button>
            </div>
          </div>
          <div class="ai-studio-stage">
            ${compositeUrl ? `
              <img src="${esc(compositeUrl)}" alt="3D Ön Yerleşim (Öncesi)" class="ai-stage-img">
              ${resultUrl ? `
                <div id="aiStudioAfterClip" class="ai-stage-after" style="clip-path:inset(0 0 0 ${comparePct}%)">
                  <img src="${esc(resultUrl)}" alt="AI Render Sonucu (Sonrası)" class="ai-stage-img">
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
          <div class="ai-expert-preset-groups">
            ${categories.map(cat => `
              <div class="ai-preset-cat">
                <span class="ai-preset-cat-lbl">${esc(cat)}</span>
                <div class="ai-expert-chips">
                  ${EXPERT_QUICK_PRESETS.filter(p => p.cat === cat).map(p => `<button type="button" data-aistudio-expert-q="${esc(p.q)}">${esc(p.label)}</button>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
          <form id="aiStudioExpertForm" class="ai-studio-expert-form">
            <input id="aiStudioExpertInput" type="text" placeholder="Komut veya soru yazın..." autocomplete="off">
            <button type="submit" class="cta-btn">Gönder</button>
          </form>
        </aside>
      </div>
    </div>
  `;
}
