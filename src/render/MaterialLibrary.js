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
    roughness: 0.035,
    envMapIntensity: 1.35,
    clearcoat: 0.65,
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
    metalness: 0.98,
    roughness: 0.22,
    envMapIntensity: 1.2,
    clearcoat: 0.15,
    clearcoatRoughness: 0.2,
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
    roughness: 0.29,
    envMapIntensity: 1.2,
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
    metalness: 0.98,
    roughness: 0.18,
    envMapIntensity: 1.25,
    clearcoat: 0.2,
    clearcoatRoughness: 0.15,
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
    roughness: 0.09,
    envMapIntensity: 1.25,
    clearcoat: 0.45,
    clearcoatRoughness: 0.06,
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
    metalness: 0.96,
    roughness: 0.34,
    envMapIntensity: 1.15,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    brushed: true,
    anisotropy: 0.82,
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
    envMapIntensity: 1.3,
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
    metalness: 0.98,
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
    roughness: 0.3,
    envMapIntensity: 1.18,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    brushed: true,
    anisotropy: 0.88,
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
    roughness: 0.07,
    envMapIntensity: 1.35,
    clearcoat: 0.65,
    clearcoatRoughness: 0.05,
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
    metalness: 0.12,
    roughness: 0.72,
    envMapIntensity: 0.85,
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
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
    metalness: 0.08,
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
    color: '#f8f8f6',
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
    roughness: 0.12,
    envMapIntensity: 1.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
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

/**
 * Generates directional brushed metal roughness & bump texture.
 * @param {number} scale
 * @param {number} intensity
 * @param {number} directionDeg
 */
export function getBrushedTexture(scale = 5, intensity = 0.65, directionDeg = 0) {
  const key = `${scale.toFixed(1)}_${intensity.toFixed(2)}_${Math.round(directionDeg)}`;
  if (brushCache.has(key)) return brushCache.get(key);

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);

  // Fine directional grain with subtle lengthwise variation, not cloudy 2D noise.
  const strength = Math.max(0, Math.min(1, intensity));
  for (let y = 0; y < size; y++) {
    const fineBand = valueNoise(0, y / 2.2, 77) - 0.5;
    const hairline = hash2d(0, y, 113) - 0.5;
    const scratch = Math.pow(hash2d(0, y, 131), 18);
    for (let x = 0; x < size; x++) {
      const alongGrain = valueNoise(x / 160, y / 3, 79) - 0.5;
      const microNoise = hash2d(x, y, 83) - 0.5;
      const base = 0.73 + strength * (
        fineBand * 0.36 + hairline * 0.18 - scratch * 0.07 +
        alongGrain * 0.045 + microNoise * 0.018
      );
      const val = Math.max(20, Math.min(255, Math.round(base * 255)));
      const idx = (y * size + x) * 4;
      img.data[idx] = val;
      img.data[idx + 1] = val;
      img.data[idx + 2] = val;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale, scale);
  tex.center.set(0.5, 0.5);
  tex.rotation = (directionDeg * Math.PI) / 180;
  tex.anisotropy = 16;
  tex.needsUpdate = true;

  brushCache.set(key, tex);
  return tex;
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
  const brushScale = overrides.brushScale ?? 5;
  const brushIntensity = overrides.brushIntensity ?? 0.7;
  const brushDirection = overrides.brushDirection ?? 0;
  const textureStrength = overrides.textureStrength ?? 0.22;

  if (preset.kind === 'metal' || isOpaqueMetal) {
    const brushMap = brushed ? getBrushedTexture(brushScale, brushIntensity, brushDirection) : null;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      metalness: Math.max(0, Math.min(1, metalness)),
      roughness: Math.max(0.015, Math.min(1, roughness)),
      roughnessMap: brushMap,
      bumpMap: brushMap,
      bumpScale: brushed ? 0.012 * textureStrength * brushIntensity : 0,
      anisotropy: brushed ? Math.min(1, 0.72 + 0.18 * brushIntensity) : (preset.anisotropy || 0),
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
    clearcoatRoughness: 0.05,
    sheen: 0.25,
    transparent: opacity < 0.99 || transmission > 0.05,
    opacity: lit ? Math.max(0.95, opacity) : opacity,
    transmission: lit ? 0 : transmission * 0.45,
    ior: 1.49,
    envMapIntensity,
  });

  if (lit) {
    const emissiveHex = isOpal ? glowHex : mixHex(colorHex, glowHex, 0.55);
    // Tint diffuse face toward the LED color so colored light (red, blue, green, etc.) stays rich & saturated
    mat.color = new THREE.Color(isOpal ? mixHex('#ffffff', glowHex, 0.75) : mixHex(colorHex, glowHex, 0.45));
    mat.emissive = new THREE.Color(emissiveHex);
    const baseEmissive = isOpal ? (night ? 0.92 : 0.52) : (night ? 0.82 : 0.42);
    mat.emissiveIntensity = baseEmissive * Math.max(0.1, lightIntensity);
  }

  return mat;
}
