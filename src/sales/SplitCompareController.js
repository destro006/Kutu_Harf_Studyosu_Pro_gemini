/**
 * A/B Split-Screen Material & Lighting Comparison Mode inside 3D Viewport
 */

export const COMPARE_PRESETS = [
  { id: 'aynaAltin_halo', label: 'Ayna Altın Krom · Sıcak Halo', faceId: 'aynaAltin', faceColor: '#f5c66a', sideId: 'aynaAltin', sideColor: '#f5c66a', mode: 'halo', colorHex: '#ffc982', night: true },
  { id: 'aynaKrom_halo', label: 'Ayna Paslanmaz Krom · Soğuk Halo', faceId: 'aynaKrom', faceColor: '#f4f6f8', sideId: 'aynaKrom', sideColor: '#f4f6f8', mode: 'halo', colorHex: '#eef4ff', night: true },
  { id: 'fircaliAltin_front', label: 'Fırçalı Altın · Önden Gün Işığı', faceId: 'fircaliAltin', faceColor: '#dcaa52', sideId: 'fircaliAltin', sideColor: '#dcaa52', mode: 'front', colorHex: '#fff1d6', night: true },
  { id: 'roseGold_halo', label: 'Rose Gold · Sıcak Halo', faceId: 'roseGold', faceColor: '#eaa58b', sideId: 'roseGold', sideColor: '#eaa58b', mode: 'halo', colorHex: '#ffc982', night: true },
  { id: 'siyahKrom_halo', label: 'Siyah Krom · Beyaz Halo', faceId: 'siyahKrom', faceColor: '#2c3036', sideId: 'siyahKrom', sideColor: '#2c3036', mode: 'halo', colorHex: '#eef4ff', night: true },
  { id: 'gunduz_altin', label: 'Gündüz · Ayna Altın Doğal', faceId: 'aynaAltin', faceColor: '#f5c66a', sideId: 'aynaAltin', sideColor: '#f5c66a', mode: 'none', colorHex: '#eef4ff', night: false },
];

export class SplitCompareController {
  constructor({ hostEl, getSignEngine, getState, getFontMap, onClose }) {
    this.hostEl = hostEl;
    this.getSignEngine = getSignEngine;
    this.getState = getState;
    this.getFontMap = getFontMap;
    this.onClose = onClose;
    this.presetA = COMPARE_PRESETS[0].id;
    this.presetB = COMPARE_PRESETS[1].id;
    this.splitPct = 50;
    this.overlay = null;
  }

  async open() {
    if (!this.hostEl) return;
    this.close();
    this.overlay = document.createElement('div');
    this.overlay.id = 'abSplitCompareOverlay';
    this.overlay.className = 'ab-split-overlay';
    const opts = id => COMPARE_PRESETS.map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${p.label}</option>`).join('');
    this.overlay.innerHTML = `
      <div class="ab-split-toolbar">
        <label>Sol (A): <select id="abSelA">${opts(this.presetA)}</select></label>
        <label>Sağ (B): <select id="abSelB">${opts(this.presetB)}</select></label>
        <button type="button" id="abBtnRefresh" class="sec-btn">↻ Yenile</button>
        <button type="button" id="abBtnClose" class="cta-btn">✕ Karşılaştırmayı Kapat</button>
      </div>
      <div class="ab-split-stage" id="abSplitStage">
        <img id="abImgB" class="ab-img" alt="Seçenek B">
        <img id="abImgA" class="ab-img ab-img-a" alt="Seçenek A">
        <div id="abDivider" class="ab-divider" style="left:50%"><span>⇄</span></div>
      </div>`;
    this.hostEl.appendChild(this.overlay);

    const applySplit = pct => {
      this.splitPct = Math.max(5, Math.min(95, pct));
      const imgA = this.overlay?.querySelector('#abImgA');
      const div = this.overlay?.querySelector('#abDivider');
      if (imgA) imgA.style.clipPath = `inset(0 ${(100 - this.splitPct).toFixed(1)}% 0 0)`;
      if (div) div.style.left = `${this.splitPct}%`;
    };
    applySplit(50);

    const stage = this.overlay.querySelector('#abSplitStage');
    let dragging = false;
    const onMove = e => {
      if (!dragging || !stage) return;
      const r = stage.getBoundingClientRect();
      applySplit(((e.clientX - r.left) / Math.max(1, r.width)) * 100);
    };
    this.overlay.querySelector('#abDivider')?.addEventListener('pointerdown', e => { e.preventDefault(); dragging = true; });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => { dragging = false; });

    this.overlay.querySelector('#abSelA')?.addEventListener('change', e => { this.presetA = e.target.value; this.capturePair(); });
    this.overlay.querySelector('#abSelB')?.addEventListener('change', e => { this.presetB = e.target.value; this.capturePair(); });
    this.overlay.querySelector('#abBtnRefresh')?.addEventListener('click', () => this.capturePair());
    this.overlay.querySelector('#abBtnClose')?.addEventListener('click', () => { this.close(); this.onClose?.(); });

    await this.capturePair();
  }

  async capturePair() {
    const engine = this.getSignEngine();
    const state = this.getState();
    const fontMap = this.getFontMap();
    if (!engine || engine.isDisposed || !this.overlay) return;
    const pA = COMPARE_PRESETS.find(x => x.id === this.presetA) || COMPARE_PRESETS[0];
    const pB = COMPARE_PRESETS.find(x => x.id === this.presetB) || COMPARE_PRESETS[1];
    const w = Math.max(800, Math.min(1600, this.hostEl.clientWidth || 1200));
    const h = Math.max(480, Math.min(900, this.hostEl.clientHeight || 720));

    const renderPreset = preset => {
      const temp = {
        ...state,
        materials: { ...state.materials, faceId: preset.faceId, faceColor: preset.faceColor, sideId: preset.sideId, sideColor: preset.sideColor },
        lighting: { ...state.lighting, enabled: preset.mode !== 'none', mode: preset.mode, colorHex: preset.colorHex },
        scene: { ...state.scene, night: preset.night },
        objects: (state.objects || []).map(o => ({
          ...o,
          faceMaterial: preset.faceId,
          faceColor: preset.faceColor,
          sideMaterial: preset.sideId,
          sideColor: preset.sideColor,
          lightingMode: preset.mode,
        })),
      };
      engine.updateScene(temp, fontMap);
      return engine.capturePng(w, h, { transparent: false });
    };

    try {
      const urlA = renderPreset(pA);
      const urlB = renderPreset(pB);
      const imgA = this.overlay.querySelector('#abImgA');
      const imgB = this.overlay.querySelector('#abImgB');
      if (imgA) imgA.src = urlA;
      if (imgB) imgB.src = urlB;
    } finally {
      engine.updateScene(state, fontMap);
    }
  }

  close() {
    this.overlay?.remove();
    this.overlay = null;
  }
}
