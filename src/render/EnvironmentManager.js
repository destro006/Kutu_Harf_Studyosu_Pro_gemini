import THREE from '../vendor/three.js';

/**
 * High-Contrast Studio HDR/PMREM Reflection Environments + Custom Reflection Card/HDRI
 * Restores and enhances the crisp metallic gold & chrome contrast from the reference studio,
 * and allows users to upload their own front reflection image and adjust angle, pitch, and area.
 */

export const ENVIRONMENT_PRESETS = {
  luxuryGold: {
    id: 'luxuryGold',
    label: 'Lüks Altın Stüdyo',
    bgDay: '#cfc8bc',
    bgNight: '#060607',
    baseColor: '#1c1813',
    panels: [
      { pos: [0, 5, 2], scale: [10, 3, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.2 },
      { pos: [-6, 1, 3], scale: [3, 8, 1], rot: [0, Math.PI / 2, 0], color: '#ffffff', intensity: 2.2 },
      { pos: [6, 0.5, 3], scale: [2, 7, 1], rot: [0, -Math.PI / 2, 0], color: '#ffffff', intensity: 1.5 },
      { pos: [0, -3, 5], scale: [12, 1.5, 1], rot: [0, 0, 0], color: '#ffd9a8', intensity: 0.9 },
      { pos: [2.5, 2.5, 6], scale: [2.2, 2.2, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 2.6 },
      { pos: [-1, 2.2, 7], scale: [12, 5, 1], rot: [0, 0, 0], color: '#fff4e4', intensity: 1.85 },
      { pos: [-5.5, 1.5, 6.5], scale: [7, 6, 1], rot: [0, 0.35, 0], color: '#ffe9c4', intensity: 1.65 },
      { pos: [1, -1.5, 7], scale: [9, 2, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 0.55 },
    ],
  },
  softbox: {
    id: 'softbox',
    label: 'Softbox Stüdyo',
    bgDay: '#d6d4cf',
    bgNight: '#0a0b0e',
    baseColor: '#101216',
    panels: [
      { pos: [0, 6, 2], scale: [14, 5, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.8 },
      { pos: [-7, 1, 4], scale: [5, 10, 1], rot: [0, Math.PI / 2, 0], color: '#f2f6ff', intensity: 2.6 },
      { pos: [7, 1, 4], scale: [5, 10, 1], rot: [0, -Math.PI / 2, 0], color: '#fff7ee', intensity: 2.4 },
      { pos: [0, 2, 8], scale: [10, 5, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 1.8 },
    ],
  },
  industrial: {
    id: 'industrial',
    label: 'Endüstriyel Atölye',
    bgDay: '#b8bec4',
    bgNight: '#090b0d',
    baseColor: '#0c0e11',
    panels: [
      { pos: [-4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#d8ebff', intensity: 4.5 },
      { pos: [4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#ffe3c4', intensity: 3.5 },
      { pos: [-8, 0, 2], scale: [3, 7, 1], rot: [0, Math.PI / 2, 0], color: '#8ab4e8', intensity: 1.9 },
      { pos: [8, 0, 2], scale: [3, 7, 1], rot: [0, -Math.PI / 2, 0], color: '#ffbd7a', intensity: 1.7 },
    ],
  },
  darkShowroom: {
    id: 'darkShowroom',
    label: 'Karanlık Premium Showroom',
    bgDay: '#26282e',
    bgNight: '#040406',
    baseColor: '#040406',
    panels: [
      { pos: [0, 7, 3], scale: [10, 2, 1], rot: [Math.PI / 2, 0, 0], color: '#fff1d6', intensity: 5.0 },
      { pos: [-6, 2, 5], scale: [1.5, 8, 1], rot: [0, Math.PI / 2, 0], color: '#ffd89c', intensity: 3.2 },
      { pos: [6, 2, 5], scale: [1.5, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#dce8ff', intensity: 2.8 },
    ],
  },
  outdoorDaylight: {
    id: 'outdoorDaylight',
    label: 'Açık Hava Gün Işığı',
    bgDay: '#cad6e0',
    bgNight: '#0b1018',
    baseColor: '#364a60',
    panels: [
      { pos: [0, 8, 0], scale: [20, 20, 1], rot: [Math.PI / 2, 0, 0], color: '#bfe0ff', intensity: 2.6 },
      { pos: [-5, 6, 6], scale: [4, 4, 1], rot: [0.4, 0.5, 0], color: '#fff5d9', intensity: 6.0 },
      { pos: [0, -5, 4], scale: [18, 18, 1], rot: [-Math.PI / 2, 0, 0], color: '#8a7e6e', intensity: 1.1 },
    ],
  },
  neutralStudio: {
    id: 'neutralStudio',
    label: 'Nötr Ürün Stüdyosu',
    bgDay: '#d2d2d2',
    bgNight: '#0c0c0c',
    baseColor: '#151517',
    panels: [
      { pos: [0, 6, 2], scale: [12, 6, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.2 },
      { pos: [-6, 1, 4], scale: [4, 8, 1], rot: [0, Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { pos: [6, 1, 4], scale: [4, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { pos: [0, -5, 4], scale: [12, 4, 1], rot: [-Math.PI / 2, 0, 0], color: '#cccccc', intensity: 0.9 },
    ],
  },
};

export class EnvironmentManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.cache = new Map();
    this.customTarget = null;
    this.customImageTex = null;
    this.customIsHdr = false;
  }

  getEnvironment(presetId, night = true) {
    const key = `${presetId}_${night ? 'n' : 'd'}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const preset = ENVIRONMENT_PRESETS[presetId] || ENVIRONMENT_PRESETS.luxuryGold;
    const w = 1024, h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Smooth sweeping luxury studio gradient (zenith -> horizon -> floor)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (presetId === 'luxuryGold') {
      skyGrad.addColorStop(0.0, night ? '#2b2113' : '#fff4dd');
      skyGrad.addColorStop(0.24, night ? '#ffd998' : '#ffffff');
      skyGrad.addColorStop(0.46, night ? '#3c2b16' : '#d6c3a5');
      skyGrad.addColorStop(0.54, night ? '#120e09' : '#6e5c47');
      skyGrad.addColorStop(0.74, night ? '#c6934a' : '#f3dfc0');
      skyGrad.addColorStop(1.0, night ? '#14100a' : '#3d3123');
    } else if (presetId === 'darkShowroom') {
      skyGrad.addColorStop(0.0, '#090a0d');
      skyGrad.addColorStop(0.22, '#ffe9c2');
      skyGrad.addColorStop(0.45, '#12151d');
      skyGrad.addColorStop(0.68, '#050608');
      skyGrad.addColorStop(0.82, '#8fa6c9');
      skyGrad.addColorStop(1.0, '#040406');
    } else if (presetId === 'outdoorDaylight') {
      skyGrad.addColorStop(0.0, '#6ba4db');
      skyGrad.addColorStop(0.32, '#d8ecff');
      skyGrad.addColorStop(0.50, '#ffffff');
      skyGrad.addColorStop(0.56, '#7b7163');
      skyGrad.addColorStop(1.0, '#3a342c');
    } else if (presetId === 'industrial') {
      skyGrad.addColorStop(0.0, '#0f141c');
      skyGrad.addColorStop(0.25, '#cce2ff');
      skyGrad.addColorStop(0.48, '#1a2029');
      skyGrad.addColorStop(0.70, '#ffcb91');
      skyGrad.addColorStop(1.0, '#0b0d11');
    } else {
      // Softbox / Neutral Silk Gradient
      skyGrad.addColorStop(0.0, night ? '#1b1f28' : '#e6ebf2');
      skyGrad.addColorStop(0.25, '#ffffff');
      skyGrad.addColorStop(0.48, night ? '#252933' : '#b7bec9');
      skyGrad.addColorStop(0.56, night ? '#0e1015' : '#676d78');
      skyGrad.addColorStop(0.78, night ? '#9aa5b8' : '#eaedf2');
      skyGrad.addColorStop(1.0, night ? '#0b0c10' : '#4a4e57');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Sweeping horizontal diagonal softbox light ribbons for eye-catching metallic specular gradients
    const ribbons = [
      { x: w * 0.25, y: h * 0.28, rx: w * 0.22, ry: h * 0.14, c0: 'rgba(255,250,235,0.92)', c1: 'rgba(255,250,235,0)' },
      { x: w * 0.72, y: h * 0.34, rx: w * 0.20, ry: h * 0.12, c0: 'rgba(255,236,200,0.78)', c1: 'rgba(255,236,200,0)' },
      { x: w * 0.50, y: h * 0.72, rx: w * 0.35, ry: h * 0.10, c0: 'rgba(255,220,165,0.55)', c1: 'rgba(255,220,165,0)' },
    ];
    for (const rb of ribbons) {
      ctx.save();
      ctx.translate(rb.x, rb.y);
      ctx.scale(1, rb.ry / rb.rx);
      const rg = ctx.createRadialGradient(0, 0, rb.rx * 0.08, 0, 0, rb.rx);
      rg.addColorStop(0, rb.c0);
      rg.addColorStop(1, rb.c1);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, rb.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const rt = this.pmrem.fromEquirectangular(tex);
    tex.dispose();
    this.cache.set(key, rt);
    return rt;
  }

  /**
   * Loads a custom reflection image (PNG/JPG/WEBP) or Radiance .hdr file.
   * For standard images, mounts them onto an adjustable front reflection card in a studio PMREM scene
   * so the user can control the reflected area/scale and angle!
   */
  async loadCustomEnvironment(file, options = {}) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'hdr') {
      const buf = await file.arrayBuffer();
      const tex = parseRGBE(buf);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      if (this.customTarget) this.customTarget.dispose();
      this.customTarget = this.pmrem.fromEquirectangular(tex);
      this.customIsHdr = true;
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
      if (this.customImageTex) this.customImageTex.dispose();
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.customImageTex = tex;
      this.customIsHdr = false;
      return this.rebuildCustomCardEnvironment(options);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Rebuilds the PMREM environment from the uploaded reflection image with user-controlled
   * area/scale, distance, and brightness.
   */
  rebuildCustomCardEnvironment(options = {}) {
    if (!this.customImageTex || this.customIsHdr) return this.customTarget;
    const { areaScale = 1.0, cardBrightness = 1.8 } = options;

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#0a0a0c');
    const boxGeo = new THREE.BoxGeometry(24, 18, 24);
    const boxMat = new THREE.MeshBasicMaterial({ color: '#0a0a0c', side: THREE.BackSide });
    envScene.add(new THREE.Mesh(boxGeo, boxMat));

    const aspect = (this.customImageTex.image?.width || 16) / Math.max(1, this.customImageTex.image?.height || 9);
    const h = 7.5 * Math.max(0.3, Math.min(2.5, areaScale));
    const w = h * aspect;

    const cardGeo = new THREE.PlaneGeometry(w, h);
    const cardMat = new THREE.MeshBasicMaterial({
      map: this.customImageTex,
      color: new THREE.Color('#ffffff').multiplyScalar(cardBrightness),
      side: THREE.DoubleSide,
    });
    const card = new THREE.Mesh(cardGeo, cardMat);
    card.position.set(0, 0.5, 6.5);
    envScene.add(card);

    // Subtle overhead rim so metallic bevels still catch crisp highlights
    const topGeo = new THREE.PlaneGeometry(10, 2.5);
    const topMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), side: THREE.DoubleSide });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(0, 6, 2);
    topMesh.rotation.set(Math.PI / 2, 0, 0);
    envScene.add(topMesh);

    if (this.customTarget) this.customTarget.dispose();
    this.customTarget = this.pmrem.fromScene(envScene, 0.025);
    boxGeo.dispose(); boxMat.dispose();
    cardGeo.dispose(); cardMat.dispose();
    topGeo.dispose(); topMat.dispose();
    return this.customTarget;
  }

  dispose() {
    for (const rt of this.cache.values()) rt.dispose();
    this.cache.clear();
    if (this.customTarget) this.customTarget.dispose();
    if (this.customImageTex) this.customImageTex.dispose();
    this.pmrem.dispose();
  }
}

function parseRGBE(buffer) {
  const bytes = new Uint8Array(buffer);
  let pos = 0, line = '', width = 0, height = 0;
  while (pos < bytes.length) {
    const ch = String.fromCharCode(bytes[pos++]);
    if (ch === '\n') {
      const m = line.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
      if (m) { height = parseInt(m[1], 10); width = parseInt(m[2], 10); break; }
      line = '';
    } else line += ch;
  }
  if (!width || !height) throw new Error('Geçersiz HDR dosya başlığı.');

  const data = new Float32Array(width * height * 4);
  const scanline = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const a = bytes[pos++], b = bytes[pos++], c = bytes[pos++], d = bytes[pos++];
    if (a === 2 && b === 2 && ((c << 8) | d) === width) {
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          const code = bytes[pos++];
          if (code > 128) {
            const count = code - 128, val = bytes[pos++];
            for (let k = 0; k < count; k++) scanline[ch * width + x++] = val;
          } else {
            for (let k = 0; k < code; k++) scanline[ch * width + x++] = bytes[pos++];
          }
        }
      }
    } else {
      pos -= 4;
      for (let x = 0; x < width; x++) {
        scanline[x] = bytes[pos++]; scanline[width + x] = bytes[pos++];
        scanline[2 * width + x] = bytes[pos++]; scanline[3 * width + x] = bytes[pos++];
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
