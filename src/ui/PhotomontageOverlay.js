import { computeHomography, homographyToCssMatrix3d, renderPhotomontageComposite } from '../photomontage/PerspectiveFitter.js';
import { downloadDataUrl } from '../export/ExportService.js';

/**
 * Interactive 4-Corner Perspective Photomontage Overlay
 * Maps the full, transparent, halo-lit 3D sign render onto 4 draggable corner handles
 * over an uploaded facade/storefront photo, with Enter confirmation & edit toggle.
 */
export class PhotomontageOverlay {
  constructor(container, callbacks = {}) {
    this.container = container;
    if (typeof callbacks === 'function') {
      this.callbacks = { onCornersChange: callbacks };
    } else {
      this.callbacks = callbacks || {};
    }
    this.signPreviewUrl = null;
    this.dragIdx = -1;
    this._cleanupFns = [];
  }

  _cleanup() {
    while (this._cleanupFns.length) {
      const fn = this._cleanupFns.pop();
      try { fn(); } catch {}
    }
  }

  render(state, signDataUrl) {
    this._cleanup();
    const pm = state.photomontage;
    if (!pm?.photoUrl || pm.visible === false) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
      return;
    }

    this.container.classList.remove('hidden');
    if (signDataUrl) this.signPreviewUrl = signDataUrl;
    const confirmed = Boolean(pm.confirmed);

    this.container.innerHTML = `
      <div class="pm-stage" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#090a0d">
        <div class="pm-frame" style="position:relative;max-width:100%;max-height:100%;display:inline-block">
          <img id="pmBgImg" src="${pm.photoUrl}" alt="Mağaza Fotoğrafı" style="display:block;max-width:100%;max-height:100%;user-select:none;pointer-events:none">
          <img id="pmSignImg" src="${this.signPreviewUrl || ''}" alt="3D Tabela" style="position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,${pm.wallShadow ?? 0.45}))">
          ${!confirmed ? '<svg id="pmHandlesSvg" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none"></svg><div id="pmHandlesLayer" style="position:absolute;inset:0"></div>' : ''}
          ${!confirmed ? `
            <div class="pm-action-bar pm-action-bar--top-right" id="pmActionBar">
              <button type="button" id="pmConfirmBtn" class="cta-btn" title="Perspektifi onayla ve Image Tracer'a gönder (Enter)">✓ Onayla</button>
              <button type="button" id="pmResetCornersBtn" class="sec-btn" title="4 köşeyi varsayılan konuma döndür">↺ Sıfırla</button>
            </div>
            <div class="pm-hint-pill">4 sarı köşeyi sürükleyin · Enter veya sağ üstten Onayla</div>
          ` : `
            <div class="pm-confirmed-bar" id="pmConfirmedBar">
              <button type="button" id="pmSendTracerBtn" class="cta-btn" title="Perspektifli görüntüyü Image Tracer'a gönder">✦ Image Tracer'a Gönder</button>
              <button type="button" id="pmEditPerspBtn" class="sec-btn" title="4 köşe perspektif tutamaçlarını tekrar aç">⤢ Perspektifi Düzenle</button>
              <button type="button" id="pmQuickExportBtn" class="sec-btn" title="Cephe sunum PNG indir">⬇ Sunum PNG</button>
            </div>
          `}
        </div>
      </div>
    `;

    const bgImg = this.container.querySelector('#pmBgImg');
    const signImg = this.container.querySelector('#pmSignImg');
    const updateTransform = () => {
      const w = bgImg.clientWidth;
      const h = bgImg.clientHeight;
      if (!w || !h || !signImg) return;

      const sw = signImg.naturalWidth || 1200;
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

      if (!confirmed) {
        const svg = this.container.querySelector('#pmHandlesSvg');
        const handlesLayer = this.container.querySelector('#pmHandlesLayer');
        if (svg) {
          svg.innerHTML = `<polygon points="${dst.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#ffb547" stroke-width="1.5" stroke-dasharray="5 4" />`;
        }
        if (handlesLayer) {
          handlesLayer.innerHTML = '';
          dst.forEach((pt, idx) => {
            const hBtn = document.createElement('div');
            hBtn.style.cssText = `position:absolute;left:${pt.x - 8}px;top:${pt.y - 8}px;width:16px;height:16px;border-radius:50%;background:#ffb547;border:2px solid #111;cursor:grab;box-shadow:0 0 8px rgba(0,0,0,0.7)`;
            hBtn.title = `Köşe ${idx + 1}`;
            hBtn.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              document.activeElement?.blur?.();
              this.dragIdx = idx;
              hBtn.setPointerCapture?.(e.pointerId);
            });
            handlesLayer.appendChild(hBtn);
          });
        }
      }
    };

    if (bgImg.complete) updateTransform();
    bgImg.addEventListener('load', updateTransform);
    if (signImg.complete) updateTransform();
    signImg.addEventListener('load', updateTransform);

    const onResize = () => updateTransform();
    window.addEventListener('resize', onResize);
    this._cleanupFns.push(() => window.removeEventListener('resize', onResize));

    this.container.querySelector('#pmConfirmBtn')?.addEventListener('click', () => this.callbacks.onConfirm?.());
    this.container.querySelector('#pmResetCornersBtn')?.addEventListener('click', () => this.callbacks.onResetCorners?.());
    this.container.querySelector('#pmSendTracerBtn')?.addEventListener('click', () => this.callbacks.onSendToTracer?.());
    this.container.querySelector('#pmEditPerspBtn')?.addEventListener('click', () => this.callbacks.onEdit?.());
    this.container.querySelector('#pmQuickExportBtn')?.addEventListener('click', () => this.callbacks.onExport?.());

    if (!confirmed) {
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
          this.callbacks.onCornersChange?.(pm.cornersNorm);
        }
      };
      const onKey = (e) => {
        if (e.key !== 'Enter') return;
        const active = document.activeElement;
        if (active && (
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          (active.tagName === 'INPUT' && !['file', 'range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(active.type))
        )) return;
        if (document.querySelector('.modal:not(.hidden), dialog[open]')) return;
        e.preventDefault();
        e.stopImmediatePropagation?.();
        this.callbacks.onConfirm?.();
      };
      this.container.onpointermove = onMove;
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
      this._cleanupFns.push(() => {
        this.container.onpointermove = null;
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
      });
    } else {
      this.container.onpointermove = null;
    }
  }

  async buildCompositeDataUrl(state, signEngine) {
    const pm = state.photomontage;
    if (!pm?.photoUrl) return null;
    const sz = signEngine.lastSizeM || { w: 2.0, h: 0.45 };
    const capW = 1800;
    const capH = Math.max(520, Math.min(1250, Math.round(capW * ((sz.h + 0.30) / Math.max(0.5, sz.w + 0.36)))));
    const signUrl = signEngine.capturePng(capW, capH, { transparent: true, fitToSign: true });

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

    return renderPhotomontageComposite(pm.photoUrl, signCanvas, pm.cornersNorm, {
      wallShadow: pm.wallShadow ?? 0.45,
      ambientMatch: pm.ambientMatch ?? 0.15,
      ambientTint: state.lighting?.colorHex || '#ffffff',
    });
  }

  async exportComposite(state, signEngine) {
    const outUrl = await this.buildCompositeDataUrl(state, signEngine);
    if (!outUrl) return;
    downloadDataUrl(`${(state.projectName || 'fotomontaj').replace(/\s+/g, '_')}_sunum.png`, outUrl);
  }
}
