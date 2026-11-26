import THREE from '../vendor/three.js';

/**
 * Complete 4-Mode Illumination & Shape-Accurate Halo System
 * Modes:
 *  - 'front' : Önden Işıklı (yalnızca pleksi yüz parlar, arkadan halo çizilmez)
 *  - 'halo'  : Arkadan / Halo Işıklı (her harf ve logonun gerçek siluetini takip eden net arka duvar halosu)
 *  - 'both'  : Ön + Arka Çift Yönlü Işıklı
 *  - 'none'  : Işıksız
 */

export const LIGHT_COLOR_PRESETS = [
  { id: 'k6500', label: 'Soğuk Beyaz (6500K)', hex: '#eef4ff' },
  { id: 'k4000', label: 'Gün Işığı (4000K)', hex: '#fff1d6' },
  { id: 'k3000', label: 'Sıcak Beyaz (3000K)', hex: '#ffc982' },
  { id: 'kirmizi', label: 'Kırmızı', hex: '#ff2b2b' },
  { id: 'turuncu', label: 'Turuncu', hex: '#ff8a1f' },
  { id: 'sari', label: 'Sarı', hex: '#ffe12e' },
  { id: 'yesil', label: 'Yeşil', hex: '#2bff6b' },
  { id: 'buz', label: 'Buz Mavisi', hex: '#7fe8ff' },
  { id: 'mavi', label: 'Mavi', hex: '#2f7bff' },
  { id: 'mor', label: 'Mor', hex: '#a54bff' },
  { id: 'pembe', label: 'Pembe', hex: '#ff4fb9' },
];

export const LIGHTING_MODES = {
  front: { id: 'front', label: 'Önden Işıklı', multiplier: 1.0 },
  halo: { id: 'halo', label: 'Arkadan (Halo)', multiplier: 1.15 },
  both: { id: 'both', label: 'Ön + Arka (Çift)', multiplier: 1.28 },
  none: { id: 'none', label: 'Işıksız', multiplier: 1.0 },
};

/**
 * Creates a crisp, letter/logo-accurate wall halo texture.
 * Preserves recognizable letter & logo contours (e.g. M, A, R, K) while reflecting
 * wall distance, halo spread, and falloff.
 */
export function createHaloTexture(shapesM, boundsM, options = {}) {
  const {
    wallDistanceMm = 35,
    haloSpread = 1.0,
    falloff = 1.0,
    letterHeightM = 0.4,
  } = options;

  const distFactor = Math.max(0.35, Math.min(2.2, wallDistanceMm / 35));
  const padM = Math.max(0.06, letterHeightM * 0.45 * haloSpread * distFactor);

  const wM = Math.max(0.05, boundsM.maxX - boundsM.minX + padM * 2);
  const hM = Math.max(0.05, boundsM.maxY - boundsM.minY + padM * 2);
  const scale = Math.min(512 / wM, 512 / hM);
  const pw = Math.max(16, Math.round(wM * scale));
  const ph = Math.max(16, Math.round(hM * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = pw;
  srcCanvas.height = ph;
  const sCtx = srcCanvas.getContext('2d');
  const mapPt = p => [(p.x - boundsM.minX + padM) * scale, ph - (p.y - boundsM.minY + padM) * scale];

  sCtx.fillStyle = '#ffffff';
  for (const sh of shapesM) {
    sCtx.beginPath();
    const trace = pts => pts.forEach((pt, idx) => {
      const [x, y] = mapPt(pt);
      if (idx === 0) sCtx.moveTo(x, y);
      else sCtx.lineTo(x, y);
    });
    trace(sh.getPoints(10));
    sCtx.closePath();
    for (const hole of (sh.holes || [])) {
      trace(hole.getPoints(10));
      sCtx.closePath();
    }
    sCtx.fill('evenodd');
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = pw;
  outCanvas.height = ph;
  const oCtx = outCanvas.getContext('2d');

  // Lush two-pass Claude-calibrated halo: wide soft ambient wash + crisp contour core
  const baseBlur = Math.max(1.5, letterHeightM * 0.068 * haloSpread * distFactor * scale);
  oCtx.filter = `blur(${(baseBlur * (1.8 + falloff * 0.45)).toFixed(1)}px)`;
  oCtx.globalAlpha = 0.85;
  oCtx.drawImage(srcCanvas, 0, 0);

  oCtx.filter = `blur(${(baseBlur * 0.65).toFixed(1)}px)`;
  oCtx.globalAlpha = 1.0;
  oCtx.drawImage(srcCanvas, 0, 0);

  const tex = new THREE.CanvasTexture(outCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return {
    texture: tex,
    widthM: wM,
    heightM: hM,
    cxM: (boundsM.minX + boundsM.maxX) * 0.5,
    cyM: (boundsM.minY + boundsM.maxY) * 0.5,
  };
}

export function buildSceneLights(night, sizeM) {
  const group = new THREE.Group();
  const w = Math.max(1, sizeM.w || 2);
  const h = Math.max(0.4, sizeM.h || 0.4);

  if (night) {
    const hemi = new THREE.HemisphereLight('#8ea4c8', '#2a2420', 0.18);
    group.add(hemi);

    // Primary warm architectural gallery key light (directional: no circular spot hotspot)
    const dir = new THREE.DirectionalLight('#ffdcb0', 1.35);
    dir.position.set(0.15, h / 2 + 1.4 + w * 0.15, 2.4 + w * 0.3);
    dir.castShadow = true;
    const frustum = Math.max(1.8, w * 0.78, h * 1.4);
    dir.shadow.camera.left = -frustum;
    dir.shadow.camera.right = frustum;
    dir.shadow.camera.top = frustum;
    dir.shadow.camera.bottom = -frustum;
    dir.shadow.camera.near = 0.2;
    dir.shadow.camera.far = Math.max(16, w * 4 + 8);
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.00025;
    dir.shadow.normalBias = 0.008;
    dir.shadow.radius = 4;
    group.add(dir);

    // Dual edge rims keep dark metallic return angles legible without blowing out shadows
    const rimLeft = new THREE.DirectionalLight('#c4daff', 0.34);
    rimLeft.position.set(-w * 0.8 - 1.5, h * 0.5 + 1.0, 2.5);
    group.add(rimLeft);

    const rimRight = new THREE.DirectionalLight('#e8d8c4', 0.24);
    rimRight.position.set(w * 0.8 + 1.5, h * 0.2 + 0.6, 2.2);
    group.add(rimRight);
  } else {
    const hemi = new THREE.HemisphereLight('#f4f7fb', '#7a7066', 0.42);
    group.add(hemi);

    const frustum = Math.max(1.5, w * 0.72, h * 1.35);
    const dir = new THREE.DirectionalLight('#fff8ee', 1.45);
    dir.position.set(-w * 0.45 - 1.2, h / 2 + 2.4, 3.6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.00025;
    dir.shadow.normalBias = 0.008;
    dir.shadow.camera.left = -frustum;
    dir.shadow.camera.right = frustum;
    dir.shadow.camera.top = frustum;
    dir.shadow.camera.bottom = -frustum;
    dir.shadow.camera.near = 0.2;
    dir.shadow.camera.far = Math.max(16, w * 4 + 8);
    dir.shadow.radius = 2.5;
    group.add(dir);

    const fill = new THREE.DirectionalLight('#dce8ff', 0.28);
    fill.position.set(w * 0.6 + 1.5, -h * 0.15, 2.8);
    group.add(fill);
  }

  return group;
}
