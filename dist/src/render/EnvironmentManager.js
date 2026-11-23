import THREE from '../vendor/three.js';

/**
 * Procedural HDR-like PMREM Reflection Environments + Custom Equirectangular HDR/Image Import
 * Produces crisp, realistic specular reflections on polished gold, chrome, and brushed steel.
 */

export const ENVIRONMENT_PRESETS = {
  luxuryGold: {
    id: 'luxuryGold',
    label: 'Lüks Altın Stüdyo',
    bgDay: '#cfc8bc',
    bgNight: '#060608',
    panels: [
      { pos: [0, 6, 2], scale: [12, 4, 1], rot: [Math.PI / 2, 0, 0], color: '#fff8ea', intensity: 4.2 },
      { pos: [-7, 1.5, 3], scale: [4, 9, 1], rot: [0, Math.PI / 2, 0], color: '#ffe5b8', intensity: 2.8 },
      { pos: [7, 1.0, 3], scale: [3, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#ffffff', intensity: 2.2 },
      { pos: [0, -4, 5], scale: [14, 2, 1], rot: [-Math.PI / 3, 0, 0], color: '#ffd99a', intensity: 1.4 },
      { pos: [-2.5, 2.5, 7], scale: [9, 4, 1], rot: [0, 0, 0], color: '#fff5e4', intensity: 2.1 },
      { pos: [2.8, 2.8, 6.5], scale: [4.5, 4.5, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 3.8 },
      { pos: [0, 0.5, 10], scale: [18, 12, 1], rot: [0, 0, 0], color: '#ffe7be', intensity: 1.9 },
    ],
    baseColor: '#3b2e1e',
  },
  softbox: {
    id: 'softbox',
    label: 'Softbox Stüdyo',
    bgDay: '#d6d4cf',
    bgNight: '#0a0b0e',
    panels: [
      { pos: [0, 6, 2], scale: [14, 5, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.8 },
      { pos: [-7, 1, 4], scale: [5, 10, 1], rot: [0, Math.PI / 2, 0], color: '#f2f6ff', intensity: 2.6 },
      { pos: [7, 1, 4], scale: [5, 10, 1], rot: [0, -Math.PI / 2, 0], color: '#fff7ee', intensity: 2.4 },
      { pos: [0, 2, 8], scale: [10, 5, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 1.8 },
    ],
    baseColor: '#14161a',
  },
  industrial: {
    id: 'industrial',
    label: 'Endüstriyel Atölye',
    bgDay: '#b8bec4',
    bgNight: '#090b0d',
    panels: [
      { pos: [-4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#d8ebff', intensity: 4.5 },
      { pos: [4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#ffe3c4', intensity: 3.5 },
      { pos: [-8, 0, 2], scale: [3, 7, 1], rot: [0, Math.PI / 2, 0], color: '#8ab4e8', intensity: 1.9 },
      { pos: [8, 0, 2], scale: [3, 7, 1], rot: [0, -Math.PI / 2, 0], color: '#ffbd7a', intensity: 1.7 },
    ],
    baseColor: '#0e1114',
  },
  darkShowroom: {
    id: 'darkShowroom',
    label: 'Karanlık Premium Showroom',
    bgDay: '#26282e',
    bgNight: '#040406',
    panels: [
      { pos: [0, 7, 3], scale: [10, 2, 1], rot: [Math.PI / 2, 0, 0], color: '#fff1d6', intensity: 5.0 },
      { pos: [-6, 2, 5], scale: [1.5, 8, 1], rot: [0, Math.PI / 2, 0], color: '#ffd89c', intensity: 3.2 },
      { pos: [6, 2, 5], scale: [1.5, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#dce8ff', intensity: 2.8 },
    ],
    baseColor: '#050507',
  },
  outdoorDaylight: {
    id: 'outdoorDaylight',
    label: 'Açık Hava Gün Işığı',
    bgDay: '#cad6e0',
    bgNight: '#0b1018',
    panels: [
      { pos: [0, 8, 0], scale: [20, 20, 1], rot: [Math.PI / 2, 0, 0], color: '#bfe0ff', intensity: 2.6 },
      { pos: [-5, 6, 6], scale: [4, 4, 1], rot: [0.4, 0.5, 0], color: '#fff5d9', intensity: 6.0 },
      { pos: [0, -5, 4], scale: [18, 18, 1], rot: [-Math.PI / 2, 0, 0], color: '#8a7e6e', intensity: 1.1 },
    ],
    baseColor: '#4d6580',
  },
  neutralStudio: {
    id: 'neutralStudio',
    label: 'Nötr Ürün Stüdyosu',
    bgDay: '#d2d2d2',
    bgNight: '#0c0c0c',
    panels: [
      { pos: [0, 6, 2], scale: [12, 6, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.2 },
      { pos: [-6, 1, 4], scale: [4, 8, 1], rot: [0, Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { pos: [6, 1, 4], scale: [4, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { pos: [0, -5, 4], scale: [12, 4, 1], rot: [-Math.PI / 2, 0, 0], color: '#cccccc', intensity: 0.9 },
    ],
    baseColor: '#1a1a1a',
  },
};

export class EnvironmentManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.cache = new Map();
    this.customTarget = null;
  }

  getEnvironment(presetId, night = true) {
    const key = `${presetId}_${night ? 'n' : 'd'}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const preset = ENVIRONMENT_PRESETS[presetId] || ENVIRONMENT_PRESETS.luxuryGold;
    const envScene = new THREE.Scene();
    const baseCol = new THREE.Color(preset.baseColor);
    if (!night) baseCol.multiplyScalar(1.45);
    envScene.background = baseCol;

    // Room enclosure for realistic dark contrast bands on mirror gold/chrome
    const boxGeo = new THREE.BoxGeometry(24, 18, 24);
    const boxMat = new THREE.MeshBasicMaterial({
      color: baseCol,
      side: THREE.BackSide,
    });
    envScene.add(new THREE.Mesh(boxGeo, boxMat));

    const mult = night ? 0.85 : 1.15;
    for (const p of preset.panels) {
      const geo = new THREE.PlaneGeometry(p.scale[0], p.scale[1]);
      const col = new THREE.Color(p.color).multiplyScalar(p.intensity * mult);
      const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      envScene.add(mesh);
    }

    const rt = this.pmrem.fromScene(envScene, 0.035);
    boxGeo.dispose();
    boxMat.dispose();
    this.cache.set(key, rt);
    return rt;
  }

  /**
   * Loads a custom equirectangular reflection image (PNG/JPG/WEBP) or RGBE .hdr file.
   */
  async loadCustomEnvironment(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'hdr') {
      const buf = await file.arrayBuffer();
      const tex = parseRGBE(buf);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      if (this.customTarget) this.customTarget.dispose();
      this.customTarget = this.pmrem.fromEquirectangular(tex);
      tex.dispose();
      return this.customTarget;
    }

    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.needsUpdate = true;
      if (this.customTarget) this.customTarget.dispose();
      this.customTarget = this.pmrem.fromEquirectangular(tex);
      tex.dispose();
      return this.customTarget;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  dispose() {
    for (const rt of this.cache.values()) rt.dispose();
    this.cache.clear();
    if (this.customTarget) this.customTarget.dispose();
    this.pmrem.dispose();
  }
}

/**
 * Lightweight Radiance RGBE (.hdr) parser for browser-based HDR environment import.
 */
function parseRGBE(buffer) {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  let line = '';
  let width = 0, height = 0;
  while (pos < bytes.length) {
    const ch = String.fromCharCode(bytes[pos++]);
    if (ch === '\n') {
      const m = line.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
      if (m) {
        height = parseInt(m[1], 10);
        width = parseInt(m[2], 10);
        break;
      }
      line = '';
    } else {
      line += ch;
    }
  }
  if (!width || !height) throw new Error('Geçersiz HDR dosya başlığı.');

  const data = new Float32Array(width * height * 4);
  const scanline = new Uint8Array(width * 4);

  for (let y = 0; y < height; y++) {
    const a = bytes[pos++], b = bytes[pos++], c = bytes[pos++], d = bytes[pos++];
    if (a === 2 && b === 2 && ((c << 8) | d) === width) {
      // RLE scanline
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          const code = bytes[pos++];
          if (code > 128) {
            const count = code - 128;
            const val = bytes[pos++];
            for (let k = 0; k < count; k++) scanline[ch * width + x++] = val;
          } else {
            for (let k = 0; k < code; k++) scanline[ch * width + x++] = bytes[pos++];
          }
        }
      }
    } else {
      pos -= 4;
      for (let x = 0; x < width; x++) {
        scanline[x] = bytes[pos++];
        scanline[width + x] = bytes[pos++];
        scanline[2 * width + x] = bytes[pos++];
        scanline[3 * width + x] = bytes[pos++];
      }
    }

    const rowOffset = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const e = scanline[3 * width + x];
      const f = e ? Math.pow(2.0, e - 128 - 8) : 0;
      const idx = rowOffset + x * 4;
      data[idx] = scanline[x] * f;
      data[idx + 1] = scanline[width + x] * f;
      data[idx + 2] = scanline[2 * width + x] * f;
      data[idx + 3] = 1.0;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
