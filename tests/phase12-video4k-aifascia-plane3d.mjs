import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_FACADES,
  getActiveFacades,
  getFacadeFasciaPreset,
} from '../src/photomontage/FacadeLibrary.js';
import {
  detectUpperFasciaBand,
  parseLocalTurkishSignageIntent,
} from '../src/ai/SignageAiEngine.js';
import { solvePlanePoseFromQuad } from '../src/photomontage/PerspectiveFitter.js';
import {
  computeSequenceTimeline,
  recordPresentationVideo,
  resolveVideoRecordingSpec,
} from '../src/render/PresentationVideoRecorder.js';

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url), 'utf8');
const signEngineSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
const pmOverlaySrc = fs.readFileSync(new URL('../src/ui/PhotomontageOverlay.js', import.meta.url), 'utf8');

// ============================================================================
// BUG 1: Fix Overlapping Süre (sn) & Geçiş Controls in Video Stüdyosu
// ============================================================================
{
  assert(rootHtml.includes('class="vid-builder-bar vid-builder-grid"'));
  assert(rootHtml.includes('class="vid-builder-row2"'));
  assert(cssSrc.includes('.vid-builder-grid{display:grid!important') && cssSrc.includes('grid-template-columns:96px minmax(0,1fr)'));
}

// ============================================================================
// BUG 2: Fix 4K Video Corruption, Freezing & Wrong Duration (1080p & 4K e2e test)
// ============================================================================
{
  const s1080 = resolveVideoRecordingSpec({ width: 1920, height: 1080, fps: 60, deviceDpr: 2, maxTextureSize: 4096 });
  assert.equal(s1080.renderW, 1920);
  assert.equal(s1080.renderH, 1080);
  assert.equal(s1080.effectiveFps, 60);

  const s4k = resolveVideoRecordingSpec({ width: 3840, height: 2160, fps: 60, deviceDpr: 2, maxTextureSize: 4096 });
  assert.equal(s4k.is4k, true);
  assert.equal(s4k.effectiveFps, 30, '4K recording must cap cleanly at 30 FPS to avoid encoder choking');
  assert.equal(s4k.recDpr, 1, '4K DPR must stay 1 to avoid 8K texture clipping & right-side gray corruption');
  assert.equal(s4k.renderW, 3840);
  assert.equal(s4k.renderH, 2160);
  assert.equal(s4k.bitrate, 18_000_000);

  const s4kLowMax = resolveVideoRecordingSpec({ width: 3840, height: 2160, fps: 30, deviceDpr: 2, maxTextureSize: 2048 });
  assert(s4kLowMax.renderW <= 2048 && Math.abs((s4kLowMax.renderW / s4kLowMax.renderH) - (16 / 9)) < 0.02);

  // Mock browser canvas + MediaRecorder end-to-end for BOTH single-clip 1080p and multi-clip 4K
  const makeFakeCanvas = () => {
    const drawCalls = [];
    const reqFrames = [];
    return {
      width: 0,
      height: 0,
      drawCalls,
      reqFrames,
      getContext: () => ({
        clearRect() {},
        drawImage(...args) { drawCalls.push(args); },
        save() {},
        restore() {},
        fillRect() {},
        set globalAlpha(v) {},
        set fillStyle(v) {},
      }),
      captureStream: () => ({
        getVideoTracks: () => [{ requestFrame() { reqFrames.push(Date.now()); } }],
      }),
    };
  };

  const origDoc = globalThis.document;
  const origMR = globalThis.MediaRecorder;
  const origMS = globalThis.MediaStream;
  const origURL = globalThis.URL;

  try {
    const canvases = [];
    globalThis.document = {
      createElement: () => {
        const c = makeFakeCanvas();
        canvases.push(c);
        return c;
      },
      getElementById: () => null,
    };
    globalThis.MediaStream = class MediaStream { constructor(t) { this.tracks = t; } };
    globalThis.URL = { ...origURL, createObjectURL: () => 'blob:mock-video' };
    globalThis.MediaRecorder = class MediaRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      requestData() { this.ondataavailable?.({ data: { size: 4096 } }); }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    };

    const makeFakeEngine = () => {
      const dom = { width: 0, height: 0 };
      return {
        isDisposed: false,
        _paused: false,
        lastSizeM: { w: 3.2, h: 0.45 },
        orbit: { azimuth: 0, polar: 1.5, radius: 3, targetAzimuth: 0, targetPolar: 1.5, targetRadius: 3, fitRadius: 3, target: { clone: () => ({}), copy() {} } },
        camera: { fov: 32, aspect: 16 / 9, position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} },
        scene: {},
        postProcessor: { render() {}, setSize() {} },
        renderer: {
          capabilities: { maxTextureSize: 4096 },
          domElement: dom,
          shadowMap: { needsUpdate: false },
          setPixelRatio(r) { this._dpr = r; },
          setSize(w, h) { dom.width = Math.round(w * (this._dpr || 1)); dom.height = Math.round(h * (this._dpr || 1)); },
          render() {},
        },
        setActive() {},
        updateScene() {},
        _resize() {},
      };
    };

    // 2a. Single-clip 1080p export (2s clip -> ~2.0s exact duration & full 1920x1080 backing blit)
    const eng1080 = makeFakeEngine();
    const res1080 = await recordPresentationVideo({
      signEngine: eng1080,
      state: { scene: { night: true }, lighting: { enabled: true } },
      width: 1920,
      height: 1080,
      fps: 60,
      clips: [{ id: 's1', role: 'luxury_arch', durationSec: 2, transition: 'cut' }],
    });
    assert.equal(res1080.spec.renderW, 1920);
    assert(res1080.actualDurationSec >= 1.9 && res1080.actualDurationSec <= 3.0, `1080p 2s export duration drifted: ${res1080.actualDurationSec}s`);
    const outC1080 = canvases[0];
    assert(outC1080.drawCalls.some(args => args.length === 9 && args[3] === eng1080.renderer.domElement.width && args[7] === 1920 && args[8] === 1080), 'Expected exact backing buffer drawImage blit at 1080p');

    // 2b. Multi-clip 4K UHD export (2 + 2 = 4s timeline -> 30 FPS capped, DPR 1, exact ~4.0s duration)
    canvases.length = 0;
    const eng4k = makeFakeEngine();
    const res4k = await recordPresentationVideo({
      signEngine: eng4k,
      state: { scene: { night: true }, lighting: { enabled: true } },
      width: 3840,
      height: 2160,
      fps: 60,
      clips: [
        { id: 'm1', role: 'detail_closeup', durationSec: 2, transition: 'crossfade' },
        { id: 'm2', role: 'night_led', durationSec: 2, transition: 'cut' },
      ],
    });
    assert.equal(res4k.spec.is4k, true);
    assert.equal(res4k.spec.effectiveFps, 30);
    assert.equal(res4k.spec.recDpr, 1);
    assert(res4k.actualDurationSec >= 3.8 && res4k.actualDurationSec <= 5.2, `4K 4s multi-clip export drifted: ${res4k.actualDurationSec}s`);
    const outC4k = canvases[0];
    assert(outC4k.reqFrames.length >= 20, `Expected manual requestFrame cadence for 4K, got ${outC4k.reqFrames.length}`);
    assert(outC4k.drawCalls.some(args => args.length === 9 && args[3] === 3840 && args[4] === 2160 && args[7] === 3840 && args[8] === 2160), 'Expected exact 3840x2160 backing buffer blit for 4K');
  } finally {
    globalThis.document = origDoc;
    globalThis.MediaRecorder = origMR;
    globalThis.MediaStream = origMS;
    globalThis.URL = origURL;
  }
}

// ============================================================================
// BUG 3: Smart Local AI Placement (35 Calibrated Facades + Auto-Fascia + Intent)
// ============================================================================
{
  assert.equal(DEFAULT_FACADES.length, 35);
  for (const f of DEFAULT_FACADES) {
    const preset = getFacadeFasciaPreset(f.id);
    assert.equal(preset.fasciaCorners.length, 4);
    const cy = preset.fasciaCorners.reduce((a, p) => a + p.y, 0) / 4;
    assert(cy >= 0.14 && cy <= 0.36, `Facade ${f.id} fascia center Y must sit in upper storefront band (got ${cy.toFixed(2)})`);
  }
  const active = getActiveFacades();
  assert(active[0].fasciaCorners?.length === 4);

  // Synthetic uploaded storefront photo: smooth dark stone fascia at top (y=18%..34%), noisy bright glass below
  const w = 200, h = 120;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inFascia = y >= 22 && y <= 40;
      const v = inFascia ? 58 : (((x * 37 + y * 91) % 210) + 30);
      rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
    }
  }
  const detected = detectUpperFasciaBand(rgba, w, h);
  const detCy = detected.reduce((a, p) => a + p.y, 0) / 4;
  assert(detCy >= 0.18 && detCy <= 0.38, `Auto-detected fascia must target upper smooth band, got Y=${detCy.toFixed(3)}`);

  const intent1 = parseLocalTurkishSignageIntent('Ekli dosyadaki mekana tabelayı yerleştir');
  assert.equal(intent1.shouldPlaceOnFascia, true);

  const intent2 = parseLocalTurkishSignageIntent('Gece yağmurlu caddede sıcak altın halo ışıklı yap');
  assert.equal(intent2.night, true);
  assert.equal(intent2.rainy, true);
  assert.equal(intent2.warm, true);
  assert.equal(intent2.faceMaterial, 'aynaAltin');
  assert.equal(intent2.lightingMode, 'halo');
}

// ============================================================================
// BUG 4: True 4-Corner 3D Plane Projection (solvePlanePoseFromQuad + SignEngine)
// ============================================================================
{
  const flatPose = solvePlanePoseFromQuad([
    { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.35 }, { x: 0.2, y: 0.35 },
  ], 28);
  assert.equal(flatPose.yawDeg, 0);
  assert.equal(flatPose.pitchDeg, 0);

  // Angled right-side corner storefront quad (right vertical edge taller & sloped up)
  const angledPose = solvePlanePoseFromQuad([
    { x: 0.20, y: 0.22 }, { x: 0.78, y: 0.15 }, { x: 0.78, y: 0.36 }, { x: 0.20, y: 0.35 },
  ], 28);
  assert(angledPose.yawDeg > 10, `Expected positive yaw for taller right edge, got ${angledPose.yawDeg}`);
  assert(Math.abs(angledPose.rollDeg) > 1, `Expected non-zero baseline roll, got ${angledPose.rollDeg}`);

  assert(pmOverlaySrc.includes('solvePlanePoseFromQuad') && pmOverlaySrc.includes('planePose'));
  assert(signEngineSrc.includes('opts.planePose') && signEngineSrc.includes('yawRad'));
}

console.log('✓ Phase 12 (Video Sidebar Grid, 4K Pacing & Exact Duration, 35 Calibrated Facades & Auto-Fascia AI, 3D Plane Projection) verified');
