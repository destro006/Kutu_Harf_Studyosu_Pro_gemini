import { computeHomography, homographyToCssMatrix3d, renderPhotomontageComposite } from '../photomontage/PerspectiveFitter.js';
import { downloadDataUrl } from '../export/ExportService.js';

/**
 * Interactive 4-Corner Perspective Photomontage Overlay
 * Maps the transparent 3D sign render onto 4 draggable corner handles over a storefront photo.
 */
export class PhotomontageOverlay {
  constructor(container, onCornersChange) {
    this.container = container;
    this.onCornersChange = onCornersChange;
    this.signPreviewUrl = null;
    this.signWidth = 800;
    this.signHeight = 500;
    this.dragIdx = -1;
  }

  render(state, signDataUrl) {
    const pm = state.photomontage;
    if (!pm?.photoUrl) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
      return;
    }

    this.container.classList.remove('hidden');
    if (signDataUrl) this.signPreviewUrl = signDataUrl;

    this.container.innerHTML = `
      <div class="pm-stage" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#090a0d">
        <div class="pm-frame" style="position:relative;max-width:100%;max-height:100%;display:inline-block">
          <img id="pmBgImg" src="${pm.photoUrl}" alt="Mağaza Fotoğrafı" style="display:block;max-width:100%;max-height:100%;user-select:none;pointer-events:none">
          <img id="pmSignImg" src="${this.signPreviewUrl || ''}" alt="3D Tabela" style="position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,${pm.wallShadow ?? 0.45}))">
          <svg id="pmHandlesSvg" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none"></svg>
          <div id="pmHandlesLayer" style="position:absolute;inset:0"></div>
        </div>
      </div>
    `;

    const bgImg = this.container.querySelector('#pmBgImg');
    const updateTransform = () => {
      const w = bgImg.clientWidth;
      const h = bgImg.clientHeight;
      if (!w || !h) return;

      const signImg = this.container.querySelector('#pmSignImg');
      const sw = signImg.naturalWidth || 800;
      const sh = signImg.naturalHeight || 500;
      signImg.style.width = sw + 'px';
      signImg.style.height = sh + 'px';

      const src = [
        { x: 0, y: 0 },
        { x: sw, y: 0 },
        { x: sw, y: sh },
        { x: 0, y: sh },
      ];
      const dst = pm.cornersNorm.map(c => ({ x: c.x * w, y: c.y * h }));
      const H = computeHomography(src, dst);
      signImg.style.transform = homographyToCssMatrix3d(H);

      const svg = this.container.querySelector('#pmHandlesSvg');
      svg.innerHTML = `<polygon points="${dst.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#ffb547" stroke-width="1.5" stroke-dasharray="5 4" />`;

      const handlesLayer = this.container.querySelector('#pmHandlesLayer');
      handlesLayer.innerHTML = '';
      dst.forEach((pt, idx) => {
        const hBtn = document.createElement('div');
        hBtn.style.cssText = `position:absolute;left:${pt.x - 8}px;top:${pt.y - 8}px;width:16px;height:16px;border-radius:50%;background:#ffb547;border:2px solid #111;cursor:grab;box-shadow:0 0 8px rgba(0,0,0,0.7)`;
        hBtn.title = `Köşe ${idx + 1}`;
        hBtn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.dragIdx = idx;
          hBtn.setPointerCapture?.(e.pointerId);
        });
        handlesLayer.appendChild(hBtn);
      });
    };

    if (bgImg.complete) updateTransform();
    else bgImg.onload = updateTransform;

    const onMove = (e) => {
      if (this.dragIdx < 0) return;
      const rect = bgImg.getBoundingClientRect();
      const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / Math.max(1, rect.height)));
      pm.cornersNorm[this.dragIdx] = { x: nx, y: ny };
      updateTransform();
    };
    const onUp = () => {
      if (this.dragIdx >= 0) {
        this.dragIdx = -1;
        this.onCornersChange?.(pm.cornersNorm);
      }
    };

    this.container.onpointermove = onMove;
    window.addEventListener('pointerup', onUp, { once: false });
  }

  async exportComposite(state, signEngine) {
    const pm = state.photomontage;
    if (!pm?.photoUrl) return;
    const prevTransparent = state.scene.transparentBg;
    state.scene.transparentBg = true;
    signEngine.updateScene(state, window.__khsFontMap || new Map());
    const signUrl = signEngine.capturePng(1600, 1000);
    state.scene.transparentBg = prevTransparent;
    signEngine.updateScene(state, window.__khsFontMap || new Map());

    const signCanvas = document.createElement('canvas');
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = signUrl;
    });
    signCanvas.width = im.naturalWidth;
    signCanvas.height = im.naturalHeight;
    signCanvas.getContext('2d').drawImage(im, 0, 0);

    const outUrl = await renderPhotomontageComposite(pm.photoUrl, signCanvas, pm.cornersNorm, {
      wallShadow: pm.wallShadow ?? 0.45,
      ambientMatch: pm.ambientMatch ?? 0.15,
      ambientTint: state.lighting?.colorHex || '#ffffff',
    });
    downloadDataUrl(`${(state.projectName || 'fotomontaj').replace(/\s+/g, '_')}_sunum.png`, outUrl);
  }
}
