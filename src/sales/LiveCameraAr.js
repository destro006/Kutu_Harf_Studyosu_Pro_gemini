/**
 * 2-Tier Instant Live Camera AR Controller
 * Tier 1 (Zero-Download Default, Xiaomi 12T / Android & iOS compatible):
 *   Opens rear camera directly inside browser with transparent Three.js 3D signage overlay,
 *   touch drag, pinch-to-scale, rotation, and live Day/Night LED toggle.
 * Tier 2 (Advanced Native AR):
 *   Launches Scene Viewer / Quick Look / WebXR overlay cleanly without hijacking Files app.
 */

export function clampArTransform(next = {}) {
  return {
    xPct: Math.max(8, Math.min(92, Number(next.xPct ?? 50))),
    yPct: Math.max(8, Math.min(92, Number(next.yPct ?? 42))),
    scale: Math.max(0.25, Math.min(3.0, Number(next.scale ?? 1.0))),
    rotDeg: Math.max(-45, Math.min(45, Number(next.rotDeg ?? 0))),
  };
}

export async function openLiveCameraArOverlay({
  captureTransparentPng,
  isNightInitial = true,
  onToggleDayNight,
  onOpenAdvancedAr,
  onClose,
}) {
  const existing = document.getElementById('liveCameraArOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'liveCameraArOverlay';
  overlay.className = 'live-ar-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Canlı Kamera AR Önizleme');

  let night = Boolean(isNightInitial);
  let tr = clampArTransform({ xPct: 50, yPct: 40, scale: 1.0, rotDeg: 0 });
  let stream = null;
  let closed = false;

  const signSrc = captureTransparentPng ? captureTransparentPng() : '';

  overlay.innerHTML = `
    <div class="live-ar-stage" id="liveArStage">
      <video id="liveArVideo" class="live-ar-video" autoplay playsinline muted></video>
      <div id="liveArFallbackBg" class="live-ar-fallback hidden">
        <span>📷 Kamera izni bekleniyor veya cihaz kamerası kullanılamıyor.<br>Tabelayı önizlemek için sürükleyip yakınlaştırabilirsiniz.</span>
      </div>
      <img id="liveArSignImg" class="live-ar-sign" src="${signSrc || ''}" alt="3D Tabela AR" draggable="false">
      <div class="live-ar-top">
        <span class="live-ar-pill">📷 Canlı Kamera AR · Parmağınızla Taşıyın &amp; Ölçekleyin</span>
        <button type="button" id="btnCloseLiveAr" class="sec-btn">✕ 3D Görünüme Dön</button>
      </div>
      <div class="live-ar-bottom">
        <div class="live-ar-sliders">
          <label>Boyut <input id="liveArScale" type="range" min="0.25" max="2.5" step="0.05" value="1"></label>
          <label>Açı <input id="liveArRot" type="range" min="-35" max="35" step="1" value="0"></label>
        </div>
        <div class="live-ar-actions">
          <button type="button" id="btnLiveArDayNight" class="sec-btn">${night ? '☀ Gündüz' : '🌙 Gece LED'}</button>
          <button type="button" id="btnLiveArAdvanced" class="cta-btn">📱 Gelişmiş 3D AR (Scene Viewer / Quick Look)</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('#liveArSignImg');
  const videoEl = overlay.querySelector('#liveArVideo');
  const fallbackEl = overlay.querySelector('#liveArFallbackBg');
  const stageEl = overlay.querySelector('#liveArStage');

  const syncImgTransform = () => {
    if (!imgEl) return;
    imgEl.style.left = `${tr.xPct}%`;
    imgEl.style.top = `${tr.yPct}%`;
    imgEl.style.transform = `translate(-50%, -50%) scale(${tr.scale.toFixed(3)}) rotate(${tr.rotDeg}deg)`;
  };
  syncImgTransform();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
    stream = null;
    overlay.remove();
    onClose?.();
  };

  const onPop = () => cleanup();
  window.addEventListener('popstate', onPop);
  try {
    if (typeof history !== 'undefined' && history.pushState) {
      history.pushState({ khsLiveAr: true }, '');
    }
  } catch {}

  overlay.querySelector('#btnCloseLiveAr')?.addEventListener('click', () => {
    if (typeof history !== 'undefined' && history.state?.khsLiveAr) {
      try { history.back(); } catch { cleanup(); }
    } else {
      cleanup();
    }
  });

  overlay.querySelector('#btnLiveArDayNight')?.addEventListener('click', e => {
    night = !night;
    onToggleDayNight?.(night);
    e.currentTarget.textContent = night ? '☀ Gündüz' : '🌙 Gece LED';
    const refreshed = captureTransparentPng?.();
    if (refreshed && imgEl) imgEl.src = refreshed;
  });

  overlay.querySelector('#btnLiveArAdvanced')?.addEventListener('click', () => {
    cleanup();
    onOpenAdvancedAr?.();
  });

  overlay.querySelector('#liveArScale')?.addEventListener('input', e => {
    tr = clampArTransform({ ...tr, scale: Number(e.target.value) });
    syncImgTransform();
  });
  overlay.querySelector('#liveArRot')?.addEventListener('input', e => {
    tr = clampArTransform({ ...tr, rotDeg: Number(e.target.value) });
    syncImgTransform();
  });

  // 1-finger drag + 2-finger pinch zoom directly on stage
  const pointers = new Map();
  let pinchBaseDist = null;
  let pinchBaseScale = tr.scale;
  let lastPt = null;

  stageEl?.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, label')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stageEl.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) {
      lastPt = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchBaseDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchBaseScale = tr.scale;
    }
  });

  stageEl?.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = stageEl.getBoundingClientRect();
    if (pointers.size === 1 && lastPt && rect.width && rect.height) {
      const dx = ((e.clientX - lastPt.x) / rect.width) * 100;
      const dy = ((e.clientY - lastPt.y) / rect.height) * 100;
      lastPt = { x: e.clientX, y: e.clientY };
      tr = clampArTransform({ ...tr, xPct: tr.xPct + dx, yPct: tr.yPct + dy });
      syncImgTransform();
    } else if (pointers.size === 2 && pinchBaseDist) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      tr = clampArTransform({ ...tr, scale: pinchBaseScale * (d / pinchBaseDist) });
      const scaleIn = overlay.querySelector('#liveArScale');
      if (scaleIn) scaleIn.value = tr.scale.toFixed(2);
      syncImgTransform();
    }
  });

  const endPointer = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchBaseDist = null;
    if (pointers.size === 1) {
      const only = [...pointers.values()][0];
      lastPt = { x: only.x, y: only.y };
    } else {
      lastPt = null;
    }
  };
  stageEl?.addEventListener('pointerup', endPointer);
  stageEl?.addEventListener('pointercancel', endPointer);

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (closed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
      }
    } catch {
      fallbackEl?.classList.remove('hidden');
    }
  } else {
    fallbackEl?.classList.remove('hidden');
  }
}
