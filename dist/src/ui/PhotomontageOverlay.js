import {
  buildPerspectiveQuadFromAngles,
  computeHomography,
  fitAspectLockedQuad,
  homographyToCssMatrix3d,
  pointInQuadNorm,
  renderPhotomontageComposite,
  snapCornerWithGuides,
} from '../photomontage/PerspectiveFitter.js?v=20261126-v40';
import { downloadDataUrl } from '../export/ExportService.js';

/**
 * Interactive 4-Corner Perspective Photomontage Overlay
 * - Architectural grid lines & horizontal/vertical corner snap guides inside fascia quad
 * - Intuitive floating sliders: Yaw (Yatay Açı), Pitch (Dikey Açı), Roll (Eğim), Ölçek (%), Konum X/Y & G/Y mm
 * - Smooth drag inside the quad to reposition the whole sign, or drag corners for 4-point / uniform scaling
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
    this.haloPreviewUrl = null;
    this.dragIdx = -1;
    this.dragMode = null;
    this.dragStartPt = null;
    this.dragStartCorners = null;
    this.snapGuides = [];
    this.pose = { yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1, cx: 0.5, cy: 0.45 };
    this._cleanupFns = [];
  }

  _cleanup() {
    while (this._cleanupFns.length) {
      const fn = this._cleanupFns.pop();
      try { fn(); } catch {}
    }
  }

  _syncPoseFromCorners(corners) {
    if (!Array.isArray(corners) || corners.length !== 4) return;
    const cx = corners.reduce((a, p) => a + p.x, 0) / 4;
    const cy = corners.reduce((a, p) => a + p.y, 0) / 4;
    this.pose.cx = cx;
    this.pose.cy = cy;
  }

  render(state, signDataUrl, haloDataUrl = undefined) {
    this._cleanup();
    const pm = state.photomontage;
    if (!pm?.photoUrl || pm.visible === false) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
      return;
    }

    this.container.classList.remove('hidden');
    if (signDataUrl !== undefined && signDataUrl !== null) this.signPreviewUrl = signDataUrl;
    if (haloDataUrl !== undefined) this.haloPreviewUrl = haloDataUrl;
    const confirmed = Boolean(pm.confirmed);
    this._syncPoseFromCorners(pm.cornersNorm);

    this.container.innerHTML = `
      <div class="pm-stage" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#090a0d">
        <div class="pm-frame" style="position:relative;max-width:100%;max-height:100%;display:inline-block">
          <img id="pmBgImg" src="${pm.photoUrl}" alt="Mağaza Fotoğrafı" style="display:block;max-width:100%;max-height:100%;user-select:none;pointer-events:none">
          <img id="pmHaloImg" src="${this.haloPreviewUrl || ''}" alt="" style="position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;mix-blend-mode:screen;filter:brightness(1.25);display:${this.haloPreviewUrl ? 'block' : 'none'}">
          <img id="pmSignImg" src="${this.signPreviewUrl || ''}" alt="3D Tabela" style="position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;${this.haloPreviewUrl ? '' : `filter:drop-shadow(0 6px 14px rgba(0,0,0,${pm.wallShadow ?? 0.45}))`}">
          ${!confirmed ? '<svg id="pmHandlesSvg" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none"></svg><div id="pmHandlesLayer" style="position:absolute;inset:0"></div>' : ''}
          ${!confirmed ? `
            <div class="pm-action-bar pm-action-bar--top-right" id="pmActionBar">
              <button type="button" id="pmConfirmBtn" class="cta-btn" title="Cephe yerleşimini 3D sahneye uygula (Enter)">✓ Onayla</button>
              <button type="button" id="pmResetCornersBtn" class="sec-btn" title="4 köşeyi ve açıları sıfırla">↺ Sıfırla</button>
              <button type="button" id="pmCloseBtn" class="sec-btn pm-close-btn" title="Fotomontaj ekranından çık ve 3D sahneye dön (Esc)">✕ Çıkış</button>
            </div>
            <div class="pm-resize-dock pm-resize-dock--pro" id="pmResizeDock">
              <button type="button" id="pmModeToggle" class="sec-btn" data-mode="${this.resizeUniform ? 'scale' : 'perspective'}">${this.resizeUniform ? '⤢ Mod: Orantılı Ölçek' : '⬡ Mod: 4 Köşe Perspektif'}</button>
              <label>Yatay Açı (Yaw) <input id="pmYawRange" type="range" min="-35" max="35" step="1" value="${this.pose.yawDeg}"> <b id="pmYawVal">${this.pose.yawDeg}°</b></label>
              <label>Dikey Açı (Pitch) <input id="pmPitchRange" type="range" min="-25" max="25" step="1" value="${this.pose.pitchDeg}"> <b id="pmPitchVal">${this.pose.pitchDeg}°</b></label>
              <label>Eğim (Roll) <input id="pmRollRange" type="range" min="-20" max="20" step="1" value="${this.pose.rollDeg}"> <b id="pmRollVal">${this.pose.rollDeg}°</b></label>
              <label>Ölçek <input id="pmScaleRange" type="range" min="35" max="200" step="5" value="${Math.round(this.pose.scale * 100)}"> <b id="pmScaleVal">${Math.round(this.pose.scale * 100)}%</b></label>
              <label>Konum X <input id="pmPosX" type="range" min="10" max="90" step="1" value="${Math.round(this.pose.cx * 100)}"></label>
              <label>Konum Y <input id="pmPosY" type="range" min="10" max="90" step="1" value="${Math.round(this.pose.cy * 100)}"></label>
              <label>G (mm)<input id="pmSignW" type="number" min="100" max="10000" step="20" value="${Math.round(this.signWidthMm || 1500)}" style="width:62px"></label>
              <label>Y (mm)<input id="pmSignH" type="number" min="40" max="4000" step="10" value="${Math.round(this.signHeightMm || 400)}" style="width:58px"></label>
            </div>
            <div class="pm-hint-pill">Tabelayı sürükleyin · 4 köşeyi veya Yaw/Pitch/Roll sürgülerini kullanın · Enter: Uygula · Esc: Çıkış</div>
          ` : `
            <div class="pm-confirmed-bar" id="pmConfirmedBar">
              <button type="button" id="pmSendTracerBtn" class="cta-btn" title="Perspektifli görüntüyü Image Studio'ya gönder">✦ Image Studio'ya Gönder</button>
              <button type="button" id="pmEditPerspBtn" class="sec-btn" title="4 köşe perspektif ve boyut tutamaçlarını tekrar aç">⤢ Perspektifi Düzenle</button>
              <button type="button" id="pmQuickExportBtn" class="sec-btn" title="Cephe sunum PNG indir">⬇ Sunum PNG</button>
              <button type="button" id="pmCloseBtn" class="sec-btn pm-close-btn" title="Fotomontaj ekranından çık ve 3D sahneye dön (Esc)">✕ Çıkış</button>
            </div>
          `}
        </div>
      </div>
    `;

    const bgImg = this.container.querySelector('#pmBgImg');
    const haloImg = this.container.querySelector('#pmHaloImg');
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
      const rawDst = pm.cornersNorm.map(c => ({ x: c.x * w, y: c.y * h }));
      const dst = fitAspectLockedQuad(rawDst, sw, sh);
      const H = computeHomography(src, dst);
      const cssMatrix = homographyToCssMatrix3d(H);
      signImg.style.transform = cssMatrix;
      if (haloImg) {
        haloImg.style.width = sw + 'px';
        haloImg.style.height = sh + 'px';
        haloImg.style.transform = cssMatrix;
      }

      if (!confirmed) {
        const svg = this.container.querySelector('#pmHandlesSvg');
        const handlesLayer = this.container.querySelector('#pmHandlesLayer');
        if (svg) {
          const bilerp = (u, v) => ({
            x: (1 - u) * (1 - v) * rawDst[0].x + u * (1 - v) * rawDst[1].x + u * v * rawDst[2].x + (1 - u) * v * rawDst[3].x,
            y: (1 - u) * (1 - v) * rawDst[0].y + u * (1 - v) * rawDst[1].y + u * v * rawDst[2].y + (1 - u) * v * rawDst[3].y,
          });
          const gridLines = [0.25, 0.5, 0.75].map(u => {
            const p0 = bilerp(u, 0), p1 = bilerp(u, 1);
            return `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="rgba(255,181,71,0.34)" stroke-width="1" />`;
          }).concat([0.5].map(v => {
            const p0 = bilerp(0, v), p1 = bilerp(1, v);
            return `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="rgba(255,181,71,0.34)" stroke-width="1" />`;
          })).join('');
          const snapSvg = (this.snapGuides || []).map(g =>
            `<line x1="${g.x1 * w}" y1="${g.y1 * h}" x2="${g.x2 * w}" y2="${g.y2 * h}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 3" />`
          ).join('');
          svg.innerHTML = `${gridLines}${snapSvg}<polygon points="${rawDst.map(p => `${p.x},${p.y}`).join(' ')}" fill="rgba(255,181,71,0.04)" stroke="#ffb547" stroke-width="1.6" stroke-dasharray="5 4" />`;
        }
        if (handlesLayer) {
          handlesLayer.innerHTML = '';
          rawDst.forEach((pt, idx) => {
            const hBtn = document.createElement('div');
            hBtn.style.cssText = `position:absolute;left:${pt.x - 8}px;top:${pt.y - 8}px;width:16px;height:16px;border-radius:50%;background:#ffb547;border:2px solid #111;cursor:grab;box-shadow:0 0 8px rgba(0,0,0,0.7)`;
            hBtn.title = `Köşe ${idx + 1}`;
            hBtn.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              document.activeElement?.blur?.();
              this.dragIdx = idx;
              this.dragMode = 'corner';
              this.snapGuides = [];
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
    if (haloImg?.complete) updateTransform();
    haloImg?.addEventListener('load', updateTransform);

    const onResize = () => updateTransform();
    window.addEventListener('resize', onResize);
    this._cleanupFns.push(() => window.removeEventListener('resize', onResize));

    this.container.querySelector('#pmConfirmBtn')?.addEventListener('click', () => this.callbacks.onConfirm?.());
    this.container.querySelector('#pmResetCornersBtn')?.addEventListener('click', () => {
      this.pose = { yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1, cx: 0.5, cy: 0.45 };
      this.callbacks.onResetCorners?.();
    });
    this.container.querySelector('#pmSendTracerBtn')?.addEventListener('click', () => this.callbacks.onSendToTracer?.());
    this.container.querySelector('#pmEditPerspBtn')?.addEventListener('click', () => this.callbacks.onEdit?.());
    this.container.querySelector('#pmQuickExportBtn')?.addEventListener('click', () => this.callbacks.onExport?.());
    this.container.querySelector('#pmCloseBtn')?.addEventListener('click', () => this.callbacks.onClose?.());
    this.container.querySelector('#pmModeToggle')?.addEventListener('click', e => {
      this.resizeUniform = !this.resizeUniform;
      e.currentTarget.dataset.mode = this.resizeUniform ? 'scale' : 'perspective';
      e.currentTarget.textContent = this.resizeUniform ? '⤢ Mod: Orantılı Ölçek' : '⬡ Mod: 4 Köşe Perspektif';
      this.callbacks.onModeChange?.(this.resizeUniform ? 'scale' : 'perspective');
    });

    const applyPoseFromSliders = () => {
      const next = buildPerspectiveQuadFromAngles({
        cx: this.pose.cx,
        cy: this.pose.cy,
        halfW: 0.28,
        halfH: 0.17,
        yawDeg: this.pose.yawDeg,
        pitchDeg: this.pose.pitchDeg,
        rollDeg: this.pose.rollDeg,
        scale: this.pose.scale,
      });
      pm.cornersNorm = next;
      updateTransform();
    };
    const bindSlider = (sel, valSel, suffix, prop, transformFn = v => v) => {
      this.container.querySelector(sel)?.addEventListener('input', e => {
        const raw = Number(e.target.value) || 0;
        const valEl = valSel ? this.container.querySelector(valSel) : null;
        if (valEl) valEl.textContent = `${raw}${suffix}`;
        this.pose[prop] = transformFn(raw);
        applyPoseFromSliders();
      });
      this.container.querySelector(sel)?.addEventListener('change', () => {
        this.callbacks.onCornersChange?.(pm.cornersNorm);
      });
    };
    bindSlider('#pmYawRange', '#pmYawVal', '°', 'yawDeg');
    bindSlider('#pmPitchRange', '#pmPitchVal', '°', 'pitchDeg');
    bindSlider('#pmRollRange', '#pmRollVal', '°', 'rollDeg');
    bindSlider('#pmScaleRange', '#pmScaleVal', '%', 'scale', v => Math.max(0.35, Math.min(2.0, v / 100)));
    bindSlider('#pmPosX', null, '', 'cx', v => Math.max(0.1, Math.min(0.9, v / 100)));
    bindSlider('#pmPosY', null, '', 'cy', v => Math.max(0.1, Math.min(0.9, v / 100)));

    this.container.querySelector('#pmSignW')?.addEventListener('change', e => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= 50) this.callbacks.onResizeSignMm?.('w', v);
    });
    this.container.querySelector('#pmSignH')?.addEventListener('change', e => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= 20) this.callbacks.onResizeSignMm?.('h', v);
    });

    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.modal:not(.hidden), dialog[open]')) return;
      e.preventDefault();
      e.stopImmediatePropagation?.();
      this.callbacks.onClose?.();
    };
    window.addEventListener('keydown', onEsc, true);
    this._cleanupFns.push(() => window.removeEventListener('keydown', onEsc, true));

    if (!confirmed) {
      const frameEl = this.container.querySelector('.pm-frame');
      frameEl?.addEventListener('pointerdown', (e) => {
        if (this.dragIdx >= 0 || e.target.closest('button, input, select, label, .pm-resize-dock, .pm-action-bar, .pm-confirmed-bar') || e.target.closest('[title^="Köşe"]')) return;
        const rect = bgImg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
        if (pointInQuadNorm({ x: nx, y: ny }, pm.cornersNorm)) {
          this.dragMode = 'body';
          this.dragStartPt = { x: nx, y: ny };
          this.dragStartCorners = pm.cornersNorm.map(c => ({ x: c.x, y: c.y }));
          return;
        }
        const sw = signImg.naturalWidth || 1200;
        const sh = signImg.naturalHeight || 400;
        const halfW = 0.22;
        const imgRatio = rect.width / Math.max(1, rect.height);
        const halfH = Math.max(0.06, Math.min(0.28, halfW * (sh / Math.max(1, sw)) * imgRatio));
        const cxClamped = Math.max(0.18, Math.min(0.82, nx));
        const cyClamped = Math.max(0.12, Math.min(0.85, ny));
        pm.cornersNorm = [
          { x: Math.max(0.02, cxClamped - halfW), y: Math.max(0.02, cyClamped - halfH) },
          { x: Math.min(0.98, cxClamped + halfW), y: Math.max(0.02, cyClamped - halfH) },
          { x: Math.min(0.98, cxClamped + halfW), y: Math.min(0.98, cyClamped + halfH) },
          { x: Math.max(0.02, cxClamped - halfW), y: Math.min(0.98, cyClamped + halfH) },
        ];
        this._syncPoseFromCorners(pm.cornersNorm);
        updateTransform();
        this.callbacks.onCornersChange?.(pm.cornersNorm);
      });
      const onMove = (e) => {
        if (this.dragIdx < 0 && this.dragMode !== 'body') return;
        const rect = bgImg.getBoundingClientRect();
        const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / Math.max(1, rect.width)));
        const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / Math.max(1, rect.height)));
        if (this.dragMode === 'body' && this.dragStartPt && this.dragStartCorners) {
          const dx = nx - this.dragStartPt.x;
          const dy = ny - this.dragStartPt.y;
          pm.cornersNorm = this.dragStartCorners.map(c => ({
            x: Math.max(0.02, Math.min(0.98, c.x + dx)),
            y: Math.max(0.02, Math.min(0.98, c.y + dy)),
          }));
          this.snapGuides = [];
          this._syncPoseFromCorners(pm.cornersNorm);
        } else if (this.resizeUniform) {
          const cx = pm.cornersNorm.reduce((a, p) => a + p.x, 0) / 4;
          const cy = pm.cornersNorm.reduce((a, p) => a + p.y, 0) / 4;
          const oldP = pm.cornersNorm[this.dragIdx];
          const oldDist = Math.max(0.02, Math.hypot(oldP.x - cx, oldP.y - cy));
          const newDist = Math.max(0.04, Math.hypot(nx - cx, ny - cy));
          const factor = Math.max(0.3, Math.min(2.5, newDist / oldDist));
          pm.cornersNorm = pm.cornersNorm.map(p => ({
            x: Math.max(0.02, Math.min(0.98, cx + (p.x - cx) * factor)),
            y: Math.max(0.02, Math.min(0.98, cy + (p.y - cy) * factor)),
          }));
          this.snapGuides = [];
        } else {
          const snapped = snapCornerWithGuides(pm.cornersNorm, this.dragIdx, { x: nx, y: ny });
          pm.cornersNorm[this.dragIdx] = snapped.point;
          this.snapGuides = snapped.guides;
        }
        updateTransform();
      };
      const onUp = () => {
        if (this.dragIdx >= 0 || this.dragMode === 'body') {
          this.dragIdx = -1;
          this.dragMode = null;
          this.dragStartPt = null;
          this.dragStartCorners = null;
          this.snapGuides = [];
          updateTransform();
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

  async _rasterizeDataUrl(dataUrl) {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = im.naturalWidth;
    canvas.height = im.naturalHeight;
    canvas.getContext('2d').drawImage(im, 0, 0);
    return canvas;
  }

  async buildCompositeDataUrl(state, signEngine) {
    const pm = state.photomontage;
    if (!pm?.photoUrl) return null;
    const sz = signEngine.lastSizeM || { w: 2.0, h: 0.45 };
    const capW = 1800;
    const capH = Math.max(520, Math.min(1250, Math.round(capW * ((sz.h + 0.30) / Math.max(0.5, sz.w + 0.36)))));
    const hasActiveHalo = Boolean(signEngine?.signGroup?.children?.some(c => c.userData?.isHalo && c.visible && c.material?.opacity > 0));
    const signUrl = signEngine.capturePng(capW, capH, {
      transparent: true,
      fitToSign: true,
      architecturalFov: 28,
      haloMode: hasActiveHalo ? 'exclude' : 'include',
    });
    const haloUrl = hasActiveHalo
      ? signEngine.capturePng(capW, capH, { transparent: true, fitToSign: true, architecturalFov: 28, haloMode: 'only' })
      : null;

    const signCanvas = await this._rasterizeDataUrl(signUrl);
    const haloCanvas = haloUrl ? await this._rasterizeDataUrl(haloUrl) : null;

    return renderPhotomontageComposite(pm.photoUrl, signCanvas, pm.cornersNorm, {
      haloCanvas,
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
