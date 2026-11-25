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
    baseColor: '#0a0a0b',
    panels: [
      { form: 'rect', pos: [0, 5, 2], scale: [10, 3, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.0 },
      { form: 'rect', pos: [-6, 1, 3], scale: [3, 8, 1], rot: [0, Math.PI / 2, 0], color: '#ffffff', intensity: 2.0 },
      { form: 'rect', pos: [6, 0.5, 3], scale: [2, 7, 1], rot: [0, -Math.PI / 2, 0], color: '#ffffff', intensity: 1.4 },
      { form: 'rect', pos: [0, -3, 5], scale: [12, 1.5, 1], rot: [0, 0, 0], color: '#ffd9a8', intensity: 0.8 },
      { form: 'ring', pos: [2.5, 2.5, 6], scale: [1.2, 1.2, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 2.5 },
      { form: 'rect', pos: [-1, 2.2, 7], scale: [9, 4, 1], rot: [0, 0, 0], color: '#fff4e4', intensity: 1.6 },
      { form: 'rect', pos: [1, -1.5, 7], scale: [9, 2, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 0.5 },
    ],
  },
  softbox: {
    id: 'softbox',
    label: 'Softbox Stüdyo',
    bgDay: '#d6d4cf',
    bgNight: '#0a0b0e',
    baseColor: '#101216',
    panels: [
      { form: 'rect', pos: [0, 6, 2], scale: [14, 5, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.8 },
      { form: 'rect', pos: [-7, 1, 4], scale: [5, 10, 1], rot: [0, Math.PI / 2, 0], color: '#f2f6ff', intensity: 2.6 },
      { form: 'rect', pos: [7, 1, 4], scale: [5, 10, 1], rot: [0, -Math.PI / 2, 0], color: '#fff7ee', intensity: 2.4 },
      { form: 'rect', pos: [0, 2, 8], scale: [10, 5, 1], rot: [0, 0, 0], color: '#ffffff', intensity: 1.8 },
    ],
  },
  industrial: {
    id: 'industrial',
    label: 'Endüstriyel Atölye',
    bgDay: '#b8bec4',
    bgNight: '#090b0d',
    baseColor: '#0c0e11',
    panels: [
      { form: 'rect', pos: [-4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#d8ebff', intensity: 4.5 },
      { form: 'rect', pos: [4, 6, 3], scale: [3, 10, 1], rot: [Math.PI / 2, 0, 0], color: '#ffe3c4', intensity: 3.5 },
      { form: 'rect', pos: [-8, 0, 2], scale: [3, 7, 1], rot: [0, Math.PI / 2, 0], color: '#8ab4e8', intensity: 1.9 },
      { form: 'rect', pos: [8, 0, 2], scale: [3, 7, 1], rot: [0, -Math.PI / 2, 0], color: '#ffbd7a', intensity: 1.7 },
    ],
  },
  darkShowroom: {
    id: 'darkShowroom',
    label: 'Karanlık Premium Showroom',
    bgDay: '#26282e',
    bgNight: '#040406',
    baseColor: '#040406',
    panels: [
      { form: 'rect', pos: [0, 7, 3], scale: [10, 2, 1], rot: [Math.PI / 2, 0, 0], color: '#fff1d6', intensity: 5.0 },
      { form: 'rect', pos: [-6, 2, 5], scale: [1.5, 8, 1], rot: [0, Math.PI / 2, 0], color: '#ffd89c', intensity: 3.2 },
      { form: 'rect', pos: [6, 2, 5], scale: [1.5, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#dce8ff', intensity: 2.8 },
    ],
  },
  outdoorDaylight: {
    id: 'outdoorDaylight',
    label: 'Açık Hava Gün Işığı',
    bgDay: '#cad6e0',
    bgNight: '#0b1018',
    baseColor: '#364a60',
    panels: [
      { form: 'rect', pos: [0, 8, 0], scale: [20, 20, 1], rot: [Math.PI / 2, 0, 0], color: '#bfe0ff', intensity: 2.6 },
      { form: 'rect', pos: [-5, 6, 6], scale: [4, 4, 1], rot: [0.4, 0.5, 0], color: '#fff5d9', intensity: 6.0 },
      { form: 'rect', pos: [0, -5, 4], scale: [18, 18, 1], rot: [-Math.PI / 2, 0, 0], color: '#8a7e6e', intensity: 1.1 },
    ],
  },
  neutralStudio: {
    id: 'neutralStudio',
    label: 'Nötr Ürün Stüdyosu',
    bgDay: '#d2d2d2',
    bgNight: '#0c0c0c',
    baseColor: '#151517',
    panels: [
      { form: 'rect', pos: [0, 6, 2], scale: [12, 6, 1], rot: [Math.PI / 2, 0, 0], color: '#ffffff', intensity: 3.2 },
      { form: 'rect', pos: [-6, 1, 4], scale: [4, 8, 1], rot: [0, Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { form: 'rect', pos: [6, 1, 4], scale: [4, 8, 1], rot: [0, -Math.PI / 2, 0], color: '#f5f5f5', intensity: 2.2 },
      { form: 'rect', pos: [0, -5, 4], scale: [12, 4, 1], rot: [-Math.PI / 2, 0, 0], color: '#cccccc', intensity: 0.9 },
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
    const id = ENVIRONMENT_PRESETS[presetId] ? presetId : 'luxuryGold';
    if (this.cache.has(id)) return this.cache.get(id);

    const preset = ENVIRONMENT_PRESETS[id];
    const envScene = new THREE.Scene();
    const baseColor = preset.baseColor || '#0a0a0b';
    envScene.background = new THREE.Color(baseColor);

    const disposables = [];
    const boxGeo = new THREE.BoxGeometry(30, 22, 30);
    const boxMat = new THREE.MeshBasicMaterial({ color: baseColor, side: THREE.BackSide, toneMapped: false });
    envScene.add(new THREE.Mesh(boxGeo, boxMat));
    disposables.push(boxGeo, boxMat);

    for (const p of preset.panels || []) {
      const geo = p.form === 'ring' ? new THREE.RingGeometry(0.5, 1.0, 48) : new THREE.PlaneGeometry(1, 1);
      const col = new THREE.Color(p.color || '#ffffff').multiplyScalar(p.intensity ?? 1);
      const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p.pos);
      if (p.rot) mesh.rotation.set(...p.rot);
      if (p.scale) mesh.scale.set(...p.scale);
      envScene.add(mesh);
      disposables.push(geo, mat);
    }

    const rt = this.pmrem.fromScene(envScene, 0);
    for (const d of disposables) d.dispose();
    this.cache.set(id, rt);
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
    const boxMat = new THREE.MeshBasicMaterial({ color: '#0a0a0c', side: THREE.BackSide, toneMapped: false });
    envScene.add(new THREE.Mesh(boxGeo, boxMat));

    const aspect = (this.customImageTex.image?.width || 16) / Math.max(1, this.customImageTex.image?.height || 9);
    const h = 7.5 * Math.max(0.3, Math.min(2.5, areaScale));
    const w = h * aspect;

    const cardGeo = new THREE.PlaneGeometry(w, h);
    const cardMat = new THREE.MeshBasicMaterial({
      map: this.customImageTex,
      color: new THREE.Color('#ffffff').multiplyScalar(cardBrightness),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const card = new THREE.Mesh(cardGeo, cardMat);
    card.position.set(0, 0.5, 6.5);
    envScene.add(card);

    // Subtle overhead rim so metallic bevels still catch crisp highlights
    const topGeo = new THREE.PlaneGeometry(10, 2.5);
    const topMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), side: THREE.DoubleSide, toneMapped: false });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(0, 6, 2);
    topMesh.rotation.set(Math.PI / 2, 0, 0);
    envScene.add(topMesh);

    if (this.customTarget) this.customTarget.dispose();
    this.customTarget = this.pmrem.fromScene(envScene, 0);
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
