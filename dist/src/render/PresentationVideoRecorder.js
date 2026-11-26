import { computeSignageDimensionData, renderDimensions2DOverlay } from './Dimensions3DOverlay.js';

/**
 * Local Zero-API-Cost Cinematic Client Presentation Video Recorder
 * Uses Three.js offscreen canvas + optional CAD dimension fade-in + MediaRecorder.
 */
export const CHOREOGRAPHY_STAGES = [
  { id: 'bevel_pan', label: 'Yakın Pah & Derinlik Taraması', start: 0.0, end: 0.25 },
  { id: 'orbital_sweep', label: 'Metalik Yansıma Yörünge Turu', start: 0.25, end: 0.55 },
  { id: 'day_to_night_reveal', label: 'Gündüzden Geceye LED Açılışı', start: 0.55, end: 0.80 },
  { id: 'hero_dimensions', label: 'Merkezi Sunum & Ölçü Gösterimi', start: 0.80, end: 1.0 },
];

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function sampleChoreographyKeyframe(tNorm, options = {}) {
  const t = Math.max(0, Math.min(1, Number(tNorm) || 0));
  const showDimensions = options.showDimensions !== false;

  if (t < 0.25) {
    const u = easeInOutCubic(t / 0.25);
    return {
      stage: CHOREOGRAPHY_STAGES[0],
      azimuth: lerp(-0.88, -0.45, u),
      polar: lerp(Math.PI / 2 - 0.02, Math.PI / 2 - 0.10, u),
      radiusMult: lerp(0.62, 0.72, u),
      targetOffsetX: lerp(-0.22, 0.16, u),
      targetOffsetY: 0,
      night: false,
      lightingEnabled: false,
      dimsOpacity: 0,
    };
  }
  if (t < 0.55) {
    const u = easeInOutCubic((t - 0.25) / 0.30);
    return {
      stage: CHOREOGRAPHY_STAGES[1],
      azimuth: lerp(-0.45, 0.68, u),
      polar: lerp(Math.PI / 2 - 0.10, Math.PI / 2 - 0.06, u),
      radiusMult: lerp(0.72, 0.96, u),
      targetOffsetX: lerp(0.16, 0, u),
      targetOffsetY: 0,
      night: false,
      lightingEnabled: false,
      dimsOpacity: 0,
    };
  }
  if (t < 0.80) {
    const u = easeInOutCubic((t - 0.55) / 0.25);
    return {
      stage: CHOREOGRAPHY_STAGES[2],
      azimuth: lerp(0.68, 0.28, u),
      polar: lerp(Math.PI / 2 - 0.06, Math.PI / 2 - 0.08, u),
      radiusMult: lerp(0.96, 1.02, u),
      targetOffsetX: 0,
      targetOffsetY: 0,
      night: u >= 0.30,
      lightingEnabled: u >= 0.30,
      dimsOpacity: 0,
    };
  }
  const u = easeInOutCubic((t - 0.80) / 0.20);
  return {
    stage: CHOREOGRAPHY_STAGES[3],
    azimuth: lerp(0.28, 0.14, u),
    polar: lerp(Math.PI / 2 - 0.08, Math.PI / 2 - 0.05, u),
    radiusMult: lerp(1.02, 1.08, u),
    targetOffsetX: 0,
    targetOffsetY: 0,
    night: true,
    lightingEnabled: true,
    dimsOpacity: showDimensions ? Math.min(1, u * 1.6) : 0,
  };
}

export function pickSupportedVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export async function recordPresentationVideo({
  signEngine,
  state,
  fontMap,
  metrics,
  width = 1280,
  height = 720,
  durationSec = 8,
  fps = 30,
  showDimensions = true,
  onProgress = () => {},
  signal = null,
}) {
  if (!signEngine || signEngine.isDisposed || !signEngine.renderer) {
    throw new Error('Video kaydı için 3D WebGL görünümü açık olmalıdır.');
  }
  const picked = pickSupportedVideoMimeType();
  if (!picked) {
    throw new Error('Tarayıcı MediaRecorder video kaydını desteklemiyor.');
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d');

  const stream = outCanvas.captureStream(fps);
  const recorder = picked.mimeType
    ? new MediaRecorder(stream, { mimeType: picked.mimeType, videoBitsPerSecond: 6_000_000 })
    : new MediaRecorder(stream, { videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const stoppedPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = e => reject(e?.error || new Error('Video kaydı başarısız.'));
  });

  // Snapshot original camera & scene flags so we always restore them cleanly.
  const origOrbit = {
    az: signEngine.orbit.azimuth,
    pol: signEngine.orbit.polar,
    rad: signEngine.orbit.radius,
    taz: signEngine.orbit.targetAzimuth,
    tpol: signEngine.orbit.targetPolar,
    trad: signEngine.orbit.targetRadius,
    target: signEngine.orbit.target.clone(),
  };
  const origNight = state.scene?.night ?? true;
  const origLit = state.lighting?.enabled ?? true;
  const prevPaused = signEngine._paused;

  const applySceneLightingState = (night, lit) => {
    const tempState = {
      ...state,
      scene: { ...state.scene, night },
      lighting: { ...state.lighting, enabled: lit },
    };
    signEngine.updateScene(tempState, fontMap);
  };

  let curNight = null;
  let curLit = null;

  try {
    signEngine.setActive(false);
    signEngine.renderer.setPixelRatio(1);
    signEngine.renderer.setSize(width, height, false);
    signEngine.postProcessor?.setSize(width, height);
    signEngine.camera.aspect = width / height;
    signEngine.camera.updateProjectionMatrix();

    const baseRadius = signEngine.orbit.fitRadius || signEngine.orbit.radius || 3.5;
    const totalFrames = Math.max(30, Math.round(durationSec * fps));
    const frameIntervalMs = 1000 / fps;
    recorder.start(250);

    for (let f = 0; f <= totalFrames; f++) {
      if (signal?.aborted) throw new DOMException('Video kaydı iptal edildi.', 'AbortError');
      const tNorm = f / totalFrames;
      const kf = sampleChoreographyKeyframe(tNorm, { showDimensions });

      if (kf.night !== curNight || kf.lightingEnabled !== curLit) {
        curNight = kf.night;
        curLit = kf.lightingEnabled;
        applySceneLightingState(curNight, curLit);
      }

      const r = baseRadius * kf.radiusMult;
      const tx = kf.targetOffsetX * Math.max(0.5, signEngine.lastSizeM?.w || 1.5);
      const ty = kf.targetOffsetY;
      signEngine.camera.position.set(
        tx + r * Math.sin(kf.polar) * Math.sin(kf.azimuth),
        ty + r * Math.cos(kf.polar),
        r * Math.sin(kf.polar) * Math.cos(kf.azimuth)
      );
      signEngine.camera.lookAt(tx, ty, 0);
      signEngine.renderer.shadowMap.needsUpdate = true;

      if (signEngine.postProcessor) signEngine.postProcessor.render(signEngine.scene, signEngine.camera);
      else signEngine.renderer.render(signEngine.scene, signEngine.camera);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(signEngine.renderer.domElement, 0, 0, width, height);

      if (kf.dimsOpacity > 0.01) {
        const dimData = computeSignageDimensionData(signEngine, state, metrics);
        renderDimensions2DOverlay(ctx, width, height, signEngine.camera, dimData, {
          opacity: kf.dimsOpacity,
          showDepth: true,
        });
      }

      onProgress({ percent: Math.round(tNorm * 100), stageLabel: kf.stage.label });
      await new Promise(res => setTimeout(res, Math.max(8, Math.min(34, frameIntervalMs * 0.5))));
    }

    recorder.stop();
    await stoppedPromise;
    const blob = new Blob(chunks, { type: picked.mimeType || 'video/webm' });
    return {
      blob,
      mimeType: blob.type || picked.mimeType || 'video/webm',
      ext: picked.ext,
      url: URL.createObjectURL(blob),
    };
  } finally {
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    signEngine.orbit.azimuth = origOrbit.az;
    signEngine.orbit.polar = origOrbit.pol;
    signEngine.orbit.radius = origOrbit.rad;
    signEngine.orbit.targetAzimuth = origOrbit.taz;
    signEngine.orbit.targetPolar = origOrbit.tpol;
    signEngine.orbit.targetRadius = origOrbit.trad;
    signEngine.orbit.target.copy(origOrbit.target);
    applySceneLightingState(origNight, origLit);
    signEngine._resize(true);
    if (!prevPaused) signEngine.setActive(true);
  }
}
