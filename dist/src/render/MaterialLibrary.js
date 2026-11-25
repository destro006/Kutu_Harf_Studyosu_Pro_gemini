import THREE from '../vendor/three.js';

/**
 * Physically Based Material Library for 3D Signage Manufacturing
 * Preserves and upgrades all reference Claude materials with calibrated PBR values,
 * directional brushed metal anisotropy, and full numeric parameter control.
 */

export const MATERIAL_PRESETS = {
  aynaAltin: {
    id: 'aynaAltin',
    label: 'Ayna Altın Krom',
    shortLabel: 'Ayna altın',
    kind: 'metal',
    color: '#f5c66a',
    metalness: 1.0,
    roughness: 0.04,
    envMapIntensity: 1.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(120deg,#8a5d14,#fff1b8 35%,#b07d22 55%,#f6d77a 75%,#8a5d14)',
    multiplier: 1.3,
  },
  satenAltin: {
    id: 'satenAltin',
    label: 'Saten Altın',
    shortLabel: 'Saten altın',
    kind: 'metal',
    color: '#e5b963',
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: 1.15,
    clearcoat: 0.12,
    clearcoatRoughness: 0.18,
    brushed: false,
    anisotropy: 0.2,
    swatch: 'linear-gradient(120deg,#a67d2e,#f3d792 45%,#c29642 75%,#9c7429)',
    multiplier: 1.25,
  },
  fircaliAltin: {
    id: 'fircaliAltin',
    label: 'Fırçalı Altın',
    shortLabel: 'Fırçalı altın',
    kind: 'metal',
    color: '#dcaa52',
    metalness: 1.0,
    roughness: 0.28,
    envMapIntensity: 1.25,
    clearcoat: 0.0,
    clearcoatRoughness: 0.1,
    brushed: true,
    anisotropy: 0.88,
    swatch: 'repeating-linear-gradient(0deg,#cfa457 0 2px,#b98f45 2px 3px,#dcb465 3px 5px)',
    multiplier: 1.25,
  },
  sampanyaAltin: {
    id: 'sampanyaAltin',
    label: 'Şampanya Altın',
    shortLabel: 'Şampanya',
    kind: 'metal',
    color: '#e8d2a6',
    metalness: 1.0,
    roughness: 0.16,
    envMapIntensity: 1.15,
    clearcoat: 0.22,
    clearcoatRoughness: 0.12,
    brushed: false,
    anisotropy: 0.15,
    swatch: 'linear-gradient(120deg,#b49b6c,#f7ebd2 45%,#cbb384 75%,#9f8759)',
    multiplier: 1.28,
  },
  roseGold: {
    id: 'roseGold',
    label: 'Rose Gold',
    shortLabel: 'Rose gold',
    kind: 'metal',
    color: '#eaa58b',
    metalness: 1.0,
    roughness: 0.10,
    envMapIntensity: 1.15,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(120deg,#9c5f4c,#ffd9c8 35%,#c0806a 60%,#f2b9a2 80%)',
    multiplier: 1.3,
  },
  bronz: {
    id: 'bronz',
    label: 'Fırçalı Bronz',
    shortLabel: 'Bronz',
    kind: 'metal',
    color: '#8c5c3c',
    metalness: 1.0,
    roughness: 0.34,
    envMapIntensity: 1.15,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    brushed: true,
    anisotropy: 0.85,
    swatch: 'repeating-linear-gradient(0deg,#8f5b37 0 2px,#7a4b2d 2px 3px,#a36b42 3px 5px)',
    multiplier: 1.3,
  },
  aynaKrom: {
    id: 'aynaKrom',
    label: 'Ayna Paslanmaz Krom',
    shortLabel: 'Ayna krom',
    kind: 'metal',
    color: '#f4f6f8',
    metalness: 1.0,
    roughness: 0.03,
    envMapIntensity: 1.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(120deg,#5d636a,#ffffff 35%,#8a9198 55%,#f6f8fa 75%,#6b7178)',
    multiplier: 1.15,
  },
  matKrom: {
    id: 'matKrom',
    label: 'Saten Paslanmaz',
    shortLabel: 'Mat krom',
    kind: 'metal',
    color: '#d6dade',
    metalness: 1.0,
    roughness: 0.34,
    envMapIntensity: 1.15,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    brushed: false,
    anisotropy: 0.25,
    swatch: 'linear-gradient(120deg,#9aa0a6,#d9dde1 45%,#b3b8bd 75%,#a3a8ad)',
    multiplier: 1.1,
  },
  fircali304: {
    id: 'fircali304',
    label: 'Fırçalı 304 Paslanmaz',
    shortLabel: 'Fırçalı 304',
    kind: 'metal',
    color: '#cfd2d5',
    metalness: 1.0,
    roughness: 0.30,
    envMapIntensity: 1.15,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    brushed: true,
    anisotropy: 0.85,
    swatch: 'repeating-linear-gradient(0deg,#c7cacd 0 2px,#b2b6ba 2px 3px,#d3d6d8 3px 5px),linear-gradient(120deg,#9fa4a9,#e1e3e5)',
    multiplier: 1.08,
  },
  siyahKrom: {
    id: 'siyahKrom',
    label: 'Siyah Krom',
    shortLabel: 'Siyah krom',
    kind: 'metal',
    color: '#2c3036',
    metalness: 1.0,
    roughness: 0.06,
    envMapIntensity: 1.25,
    clearcoat: 0.65,
    clearcoatRoughness: 0.04,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(120deg,#101214,#555b63 35%,#1a1c20 60%,#43484f 85%)',
    multiplier: 1.28,
  },
  matSiyah: {
    id: 'matSiyah',
    label: 'Mat Siyah Metal',
    shortLabel: 'Mat siyah',
    kind: 'paint',
    color: '#161618',
    metalness: 0.05,
    roughness: 0.72,
    envMapIntensity: 0.9,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    brushed: false,
    anisotropy: 0,
    swatch: '#18181a',
    multiplier: 1.0,
  },
  boyaliAluminyum: {
    id: 'boyaliAluminyum',
    label: 'Boyalı Alüminyum',
    shortLabel: 'Boyalı',
    kind: 'paint',
    color: '#34373b',
    colorable: true,
    palette: 'paint',
    metalness: 0.05,
    roughness: 0.42,
    envMapIntensity: 0.95,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(135deg,#4f545c,#272a2e)',
    multiplier: 1.0,
  },
  opalPleksi: {
    id: 'opalPleksi',
    label: 'Beyaz Opal Pleksi',
    shortLabel: 'Opal pleksi',
    kind: 'acrylic',
    color: '#f3f3ee',
    metalness: 0.0,
    roughness: 0.14,
    envMapIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    opacity: 0.94,
    transmission: 0.18,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(135deg,#ffffff,#e9e9e4)',
    multiplier: 1.0,
  },
  renkliPleksi: {
    id: 'renkliPleksi',
    label: 'Renkli Yarı Saydam Pleksi',
    shortLabel: 'Renkli pleksi',
    kind: 'acrylic',
    color: '#d3222c',
    colorable: true,
    palette: 'pleksi',
    metalness: 0.0,
    roughness: 0.14,
    envMapIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    opacity: 0.9,
    transmission: 0.24,
    brushed: false,
    anisotropy: 0,
    swatch: 'linear-gradient(135deg,#ff4d57,#a31119)',
    multiplier: 1.1,
  },
};

export const PAINT_PALETTE = [
  { label: 'Beyaz', hex: '#f2f2ee' },
  { label: 'Antrasit', hex: '#34373b' },
  { label: 'Kırmızı', hex: '#b81d26' },
  { label: 'Bordo', hex: '#5e1520' },
  { label: 'Lacivert', hex: '#18234a' },
  { label: 'Mavi', hex: '#1d58b3' },
  { label: 'Zümrüt', hex: '#145c3b' },
  { label: 'Hardal', hex: '#c9961c' },
  { label: 'Turuncu', hex: '#e0601a' },
  { label: 'Kahve', hex: '#4a2f1f' },
];

export const ACRYLIC_PALETTE = [
  { label: 'Kırmızı', hex: '#d3222c' },
  { label: 'Mavi', hex: '#1f63d6' },
  { label: 'Yeşil', hex: '#1d9a52' },
  { label: 'Sarı', hex: '#f6cc1d' },
  { label: 'Turuncu', hex: '#f0701d' },
  { label: 'Mor', hex: '#6b34c2' },
  { label: 'Turkuaz', hex: '#18a7b5' },
  { label: 'Pembe', hex: '#e8458f' },
];

function hash2d(x, y, seed) {
  let s = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi, seed);
  const b = hash2d(xi + 1, yi, seed);
  const c = hash2d(xi, yi + 1, seed);
  const d = hash2d(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const brushCache = new Map();
const BRUSH_CACHE_LIMIT = 12;

function periodicNoiseX(x, y, cycles, seed) {
  const angle = (x / 512) * Math.PI * 2 * cycles;
  const cx = Math.cos(angle) * cycles * 0.45 + 100;
  const sx = Math.sin(angle) * cycles * 0.45 + 100;
  return valueNoise(cx * 0.5 + y * 0.01, y * 0.65, seed) * 0.5 +
         valueNoise(sx * 0.5 + x * 0.03, y * 0.35, seed + 19) * 0.5;
}

/**
 * Generates seamless 512x512 horizontal brushed-metal PBR maps (color, roughness, bump).
 * Periodic along X so tile edges never show seams on wide signage faces.
 * @param {number} scale
 * @param {number} intensity
 * @param {number} directionDeg
 */
export function getBrushedTextureSet(scale = 6, intensity = 1.0, directionDeg = 0) {
  const clampedScale = Math.max(1, Math.min(24, Number(scale) || 6));
  const clampedInt = Math.max(0, Math.min(2.0, Number(intensity) ?? 1.0));
  const key = `${clampedScale.toFixed(1)}_${clampedInt.toFixed(2)}_${Math.round(directionDeg)}`;
  if (brushCache.has(key)) {
    const cached = brushCache.get(key);
    brushCache.delete(key);
    brushCache.set(key, cached);
    return cached;
  }

  const size = 512;
  const makeCanvas = () => {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      return c;
    }
    return {
      width: size,
      height: size,
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
      }),
    };
  };

  const cCanvas = makeCanvas();
  const rCanvas = makeCanvas();
  const bCanvas = makeCanvas();
  const cCtx = cCanvas.getContext('2d', { willReadFrequently: true });
  const rCtx = rCanvas.getContext('2d', { willReadFrequently: true });
  const bCtx = bCanvas.getContext('2d', { willReadFrequently: true });
  const cImg = cCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  const rowFine = new Float32Array(size);
  const rowBand = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    rowFine[y] = hash2d(0, y, 77);
    const band = Math.sin((y / size) * Math.PI * 2 * 6) * 0.5 + 0.5;
    rowBand[y] = band * 0.55 + hash2d(1, Math.floor(y / 3), 91) * 0.45;
  }

  for (let y = 0; y < size; y++) {
    const rf = rowFine[y];
    const rb = rowBand[y];
    const rowPrev = rowFine[(y - 1 + size) % size];
    const microEdge = rf - rowPrev;
    for (let x = 0; x < size; x++) {
      const streak = periodicNoiseX(x, y, 6, 79) * 0.65 + periodicNoiseX(x, y, 16, 83) * 0.35;
      // Centered grain in [-0.5, +0.5]
      const grain = (rf * 0.48 + rb * 0.24 + streak * 0.28) - 0.5 + microEdge * 0.14;

      // Color multiplier: keeps true metal hue while visibly etching parallel hairlines
      const cNorm = Math.max(0.45, Math.min(1.0, 0.90 + grain * 0.34 * clampedInt));
      const cVal = Math.round(cNorm * 255);

      // Roughness map: strong micro-roughness variation across brush grooves
      const rNorm = Math.max(0.32, Math.min(1.0, 0.72 + grain * 0.55 * clampedInt));
      const rVal = Math.round(rNorm * 255);

      // Bump map: crisp micro-groove height field
      const bNorm = Math.max(0.0, Math.min(1.0, 0.5 + grain * 0.95 * Math.min(1.6, clampedInt)));
      const bVal = Math.round(bNorm * 255);

      const idx = (y * size + x) * 4;
      cImg.data[idx] = cVal; cImg.data[idx + 1] = cVal; cImg.data[idx + 2] = cVal; cImg.data[idx + 3] = 255;
      rImg.data[idx] = rVal; rImg.data[idx + 1] = rVal; rImg.data[idx + 2] = rVal; rImg.data[idx + 3] = 255;
      bImg.data[idx] = bVal; bImg.data[idx + 1] = bVal; bImg.data[idx + 2] = bVal; bImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const setupTex = (canvas, isColor) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // ExtrudeGeometry UVs are in meters (~0.4m letter height), so boost Y repeat
    // to produce realistic densely spaced metallic hairlines at viewing distance.
    tex.repeat.set(clampedScale * 1.1, clampedScale * 2.4);
    tex.center.set(0.5, 0.5);
    tex.rotation = (directionDeg * Math.PI) / 180;
    tex.anisotropy = 16;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const set = {
    colorMap: setupTex(cCanvas, true),
    roughnessMap: setupTex(rCanvas, false),
    bumpMap: setupTex(bCanvas, false),
  };

  brushCache.set(key, set);
  while (brushCache.size > BRUSH_CACHE_LIMIT) {
    const oldKey = brushCache.keys().next().value;
    const oldSet = brushCache.get(oldKey);
    brushCache.delete(oldKey);
    oldSet?.colorMap?.dispose?.();
    oldSet?.roughnessMap?.dispose?.();
    oldSet?.bumpMap?.dispose?.();
  }
  return set;
}

export function getBrushedTexture(scale = 6, intensity = 1.0, directionDeg = 0) {
  return getBrushedTextureSet(scale, intensity, directionDeg).roughnessMap;
}

export function mixHex(hexA, hexB, t) {
  const cA = new THREE.Color(hexA);
  const cB = new THREE.Color(hexB);
  return '#' + cA.lerp(cB, t).getHexString();
}

/**
 * Builds a calibrated MeshPhysicalMaterial from preset + user numeric overrides.
 */
export function createSignMaterial(presetId, overrides = {}, lightContext = {}) {
  const preset = MATERIAL_PRESETS[presetId] || MATERIAL_PRESETS.aynaAltin;
  const {
    lit = false,
    night = true,
    glowHex = '#ffc982',
    lightIntensity = 1.0,
    isOpaqueMetal = false,
  } = lightContext;

  const colorHex = overrides.color || preset.color;
  const metalness = overrides.metalness ?? preset.metalness;
  const roughness = overrides.roughness ?? preset.roughness;
  const envMapIntensity = overrides.envMapIntensity ?? preset.envMapIntensity;
  const brushed = overrides.brushed ?? preset.brushed;
  const brushScale = overrides.brushScale ?? 6;
  const brushIntensity = Math.max(0, Math.min(2.0, overrides.brushIntensity ?? 1.0));
  const brushDirection = overrides.brushDirection ?? 0;

  if (preset.kind === 'metal' || isOpaqueMetal) {
    const useGrain = brushed && brushIntensity > 0.01;
    const maps = useGrain ? getBrushedTextureSet(brushScale, brushIntensity, brushDirection) : null;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      map: maps?.colorMap || null,
      metalness: Math.max(0, Math.min(1, metalness)),
      roughness: Math.max(0.015, Math.min(1, roughness)),
      roughnessMap: maps?.roughnessMap || null,
      bumpMap: maps?.bumpMap || null,
      bumpScale: useGrain ? 0.0024 * Math.min(2.0, brushIntensity) : 0,
      anisotropy: brushed ? Math.min(1, 0.72 + 0.14 * brushIntensity) : (preset.anisotropy || 0),
      anisotropyRotation: (brushDirection * Math.PI) / 180,
      clearcoat: roughness < 0.1 ? (preset.clearcoat ?? 0.6) : (preset.clearcoat ?? 0),
      clearcoatRoughness: preset.clearcoatRoughness ?? 0.04,
      envMapIntensity,
    });
    return mat;
  }

  if (preset.kind === 'paint') {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      metalness: Math.max(0, Math.min(1, metalness)),
      roughness: Math.max(0.05, Math.min(1, roughness)),
      clearcoat: preset.clearcoat ?? 0.25,
      clearcoatRoughness: preset.clearcoatRoughness ?? 0.35,
      envMapIntensity,
    });
  }

  // Acrylic (Opal or Colored Translucent)
  const opacity = overrides.acrylicOpacity ?? preset.opacity ?? 0.92;
  const transmission = overrides.acrylicTransmission ?? preset.transmission ?? 0.18;
  const isOpal = presetId === 'opalPleksi';

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    metalness: 0,
    roughness: Math.max(0.04, Math.min(0.8, roughness)),
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    sheen: 0.2,
    transparent: opacity < 0.99 || transmission > 0.05,
    opacity: lit ? Math.max(0.95, opacity) : opacity,
    transmission: lit ? 0 : transmission * 0.45,
    ior: 1.49,
    envMapIntensity,
  });

  if (lit) {
    const baseEmissive = isOpal ? (night ? 3.2 : 1.35) : (night ? 1.25 : 0.5);
    mat.userData.updateLed = (hex, intensity) => {
      mat.color.set(intensity <= 0 ? colorHex : isOpal ? mixHex('#ffffff', hex, 0.35) : colorHex);
      mat.emissive.set(isOpal ? hex : mixHex(colorHex, hex, 0.12));
      mat.emissiveIntensity = baseEmissive * Math.max(0, intensity);
    };
    mat.userData.updateLed(glowHex, lightIntensity);
  }

  return mat;
}
