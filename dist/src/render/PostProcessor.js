import THREE from '../vendor/three.js';

/**
 * Pure Three.js HDR Post-Processing Pipeline
 * Implements multisampled HalfFloat scene target, 5-level progressive mipmap bloom
 * (luminanceThreshold 1.0, smoothing 0.25, radius 0.75), ACES Filmic tone mapping,
 * radial cinematic vignette, and linear->sRGB output encoding.
 */

const FULLSCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PREFILTER_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 texelSize;
uniform float threshold;
uniform float smoothing;
varying vec2 vUv;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 clampFireflies(vec3 c) {
  return min(c, vec3(16.0));
}

void main() {
  vec3 c0 = clampFireflies(texture2D(tDiffuse, vUv + vec2(-0.5, -0.5) * texelSize).rgb);
  vec3 c1 = clampFireflies(texture2D(tDiffuse, vUv + vec2( 0.5, -0.5) * texelSize).rgb);
  vec3 c2 = clampFireflies(texture2D(tDiffuse, vUv + vec2(-0.5,  0.5) * texelSize).rgb);
  vec3 c3 = clampFireflies(texture2D(tDiffuse, vUv + vec2( 0.5,  0.5) * texelSize).rgb);

  // Karis weighted average to prevent specular firefly flickering
  float w0 = 1.0 / (1.0 + luminance(c0));
  float w1 = 1.0 / (1.0 + luminance(c1));
  float w2 = 1.0 / (1.0 + luminance(c2));
  float w3 = 1.0 / (1.0 + luminance(c3));
  vec3 col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);

  float br = max(col.r, max(col.g, col.b));
  float knee = threshold * smoothing + 1e-5;
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 1e-5);
  float contrib = max(soft, br - threshold) / max(br, 1e-5);
  gl_FragColor = vec4(col * max(contrib, 0.0), 1.0);
}
`;

const DOWNSAMPLE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 texelSize;
varying vec2 vUv;

void main() {
  vec2 d = texelSize;
  vec3 a = texture2D(tDiffuse, vUv + vec2(-2.0, -2.0) * d).rgb;
  vec3 b = texture2D(tDiffuse, vUv + vec2( 0.0, -2.0) * d).rgb;
  vec3 c = texture2D(tDiffuse, vUv + vec2( 2.0, -2.0) * d).rgb;
  vec3 e = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * d).rgb;
  vec3 f = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * d).rgb;
  vec3 g = texture2D(tDiffuse, vUv + vec2(-2.0,  0.0) * d).rgb;
  vec3 h = texture2D(tDiffuse, vUv).rgb;
  vec3 i = texture2D(tDiffuse, vUv + vec2( 2.0,  0.0) * d).rgb;
  vec3 j = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * d).rgb;
  vec3 k = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * d).rgb;
  vec3 l = texture2D(tDiffuse, vUv + vec2(-2.0,  2.0) * d).rgb;
  vec3 m = texture2D(tDiffuse, vUv + vec2( 0.0,  2.0) * d).rgb;
  vec3 n = texture2D(tDiffuse, vUv + vec2( 2.0,  2.0) * d).rgb;

  vec3 sum = h * 0.125;
  sum += (e + f + j + k) * 0.125;
  sum += (a + c + l + n) * 0.03125;
  sum += (b + g + i + m) * 0.0625;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const UPSAMPLE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSource;
uniform sampler2D tAdd;
uniform vec2 texelSize;
uniform float radius;
varying vec2 vUv;

void main() {
  vec2 d = texelSize * radius;
  vec3 s = texture2D(tSource, vUv + vec2(-1.0, -1.0) * d).rgb * 1.0;
  s += texture2D(tSource, vUv + vec2( 0.0, -1.0) * d).rgb * 2.0;
  s += texture2D(tSource, vUv + vec2( 1.0, -1.0) * d).rgb * 1.0;
  s += texture2D(tSource, vUv + vec2(-1.0,  0.0) * d).rgb * 2.0;
  s += texture2D(tSource, vUv).rgb * 4.0;
  s += texture2D(tSource, vUv + vec2( 1.0,  0.0) * d).rgb * 2.0;
  s += texture2D(tSource, vUv + vec2(-1.0,  1.0) * d).rgb * 1.0;
  s += texture2D(tSource, vUv + vec2( 0.0,  1.0) * d).rgb * 2.0;
  s += texture2D(tSource, vUv + vec2( 1.0,  1.0) * d).rgb * 1.0;
  s /= 16.0;

  vec3 base = texture2D(tAdd, vUv).rgb;
  gl_FragColor = vec4(base + s, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float bloomIntensity;
uniform float exposure;
uniform float vignetteOffset;
uniform float vignetteDarkness;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  const mat3 ACESOutputMat = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
  );
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec4 sceneSample = texture2D(tScene, vUv);
  vec3 bloomSample = texture2D(tBloom, vUv).rgb;
  vec3 hdr = sceneSample.rgb + bloomSample * bloomIntensity;
  hdr *= exposure / 0.6;

  vec3 mapped = ACESFilmic(hdr);
  vec2 centered = (vUv - 0.5) * 2.0;
  float dist = length(centered);
  float vig = smoothstep(vignetteOffset, vignetteOffset + 1.15, dist);
  mapped *= mix(1.0, 1.0 - vignetteDarkness, vig);

  gl_FragColor = vec4(linearToSrgb(mapped), sceneSample.a);
}
`;

export class PostProcessor {
  constructor(renderer) {
    this.renderer = renderer;
    this.isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
    this.enabled = true;
    this.exposure = 1.0;
    this.bloomIntensity = 0.4;
    this.bloomThreshold = 1.0;
    this.bloomRadius = 0.75;
    this.vignetteDarkness = 0.72;
    this.transparentBg = false;
    this.quality = 'high';
    this.width = 0;
    this.height = 0;
    this.samples = this.isWebGL2 ? 4 : 0;

    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadScene = new THREE.Scene();

    this.prefilterMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: PREFILTER_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        threshold: { value: 1.0 },
        smoothing: { value: 0.25 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.downsampleMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DOWNSAMPLE_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.upsampleMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: UPSAMPLE_FRAG,
      uniforms: {
        tSource: { value: null },
        tAdd: { value: null },
        texelSize: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        radius: { value: 0.75 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        bloomIntensity: { value: 0.4 },
        exposure: { value: 1.0 },
        vignetteOffset: { value: 0.28 },
        vignetteDarkness: { value: 0.72 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quadMesh = new THREE.Mesh(this.quadGeo, this.compositeMat);
    this.quadScene.add(this.quadMesh);

    this.sceneTarget = null;
    this.mipDown = [];
    this.mipUp = [];
  }

  _allocTargets(w, h) {
    this._disposeTargets();
    const targetOpts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, {
      ...targetOpts,
      depthBuffer: true,
      samples: this.samples,
    });
    let mw = Math.max(2, Math.floor(w / 2));
    let mh = Math.max(2, Math.floor(h / 2));
    for (let i = 0; i < 5; i++) {
      this.mipDown.push(new THREE.WebGLRenderTarget(mw, mh, targetOpts));
      if (i < 4) this.mipUp.push(new THREE.WebGLRenderTarget(mw, mh, targetOpts));
      mw = Math.max(2, Math.floor(mw / 2));
      mh = Math.max(2, Math.floor(mh / 2));
    }
  }

  setState({ night = true, lit = false, exposure = 1.0, transparentBg = false, quality = 'high' } = {}) {
    this.exposure = Number.isFinite(exposure) ? exposure : 1.0;
    this.transparentBg = Boolean(transparentBg);
    this.quality = quality || 'high';
    // Day mode suppresses wall/travertine whiteout by raising bloom threshold above wall luminance.
    this.bloomThreshold = lit ? (night ? 0.78 : 1.85) : (night ? 1.15 : 2.4);
    this.bloomIntensity = night ? (lit ? 1.35 : 0.30) : (lit ? 0.12 : 0.0);
    this.bloomRadius = lit ? (night ? 0.84 : 0.55) : (night ? 0.72 : 0.50);
    this.vignetteDarkness = this.transparentBg ? 0.0 : (night ? 0.60 : 0.16);
    this.enabled = this.quality !== 'performance' && !this.transparentBg;

    const nextSamples = (this.isWebGL2 && this.quality !== 'performance') ? 4 : 0;
    if (nextSamples !== this.samples) {
      this.samples = nextSamples;
      if (this.width > 0 && this.height > 0) this._allocTargets(this.width, this.height);
    }
  }

  setSize(pixelWidth, pixelHeight) {
    const w = Math.max(16, Math.round(pixelWidth || 16));
    const h = Math.max(16, Math.round(pixelHeight || 16));
    if (w === this.width && h === this.height && this.sceneTarget) return;
    this.width = w;
    this.height = h;
    this._allocTargets(w, h);
  }

  _runPass(material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.orthoCamera);
  }

  render(scene, camera) {
    const canHdr = this.enabled && this.sceneTarget && this.mipDown.length === 5;
    if (!canHdr) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.exposure;
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    const prevTone = this.renderer.toneMapping;
    const prevExp = this.renderer.toneMappingExposure;
    const prevAutoClear = this.renderer.autoClear;
    try {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // 1. Render full HDR scene into multisampled HalfFloat buffer
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.clear();
      this.renderer.render(scene, camera);

      // 2. Threshold + Karis firefly-clamped prefilter to mip 0
      this.prefilterMat.uniforms.threshold.value = this.bloomThreshold;
      this.prefilterMat.uniforms.tDiffuse.value = this.sceneTarget.texture;
      this.prefilterMat.uniforms.texelSize.value.set(1 / this.width, 1 / this.height);
      this._runPass(this.prefilterMat, this.mipDown[0]);

      // 3. Downsample chain (mip 0 -> mip 4)
      for (let i = 1; i < 5; i++) {
        const src = this.mipDown[i - 1];
        this.downsampleMat.uniforms.tDiffuse.value = src.texture;
        this.downsampleMat.uniforms.texelSize.value.set(1 / src.width, 1 / src.height);
        this._runPass(this.downsampleMat, this.mipDown[i]);
      }

      // 4. Progressive additive tent upsample (mip 4 -> mipUp[0])
      this.upsampleMat.uniforms.radius.value = this.bloomRadius;
      let higherTex = this.mipDown[4].texture;
      let higherW = this.mipDown[4].width;
      let higherH = this.mipDown[4].height;
      for (let i = 3; i >= 0; i--) {
        const dst = this.mipUp[i];
        this.upsampleMat.uniforms.tSource.value = higherTex;
        this.upsampleMat.uniforms.tAdd.value = this.mipDown[i].texture;
        this.upsampleMat.uniforms.texelSize.value.set(1 / higherW, 1 / higherH);
        this._runPass(this.upsampleMat, dst);
        higherTex = dst.texture;
        higherW = dst.width;
        higherH = dst.height;
      }

      // 5. Final ACES Filmic + Vignette + sRGB composite to screen
      this.compositeMat.uniforms.tScene.value = this.sceneTarget.texture;
      this.compositeMat.uniforms.tBloom.value = this.mipUp[0].texture;
      this.compositeMat.uniforms.bloomIntensity.value = this.bloomIntensity;
      this.compositeMat.uniforms.exposure.value = this.exposure;
      this.compositeMat.uniforms.vignetteDarkness.value = this.vignetteDarkness;
      this._runPass(this.compositeMat, null);
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.toneMapping = prevTone;
      this.renderer.toneMappingExposure = prevExp;
      this.renderer.autoClear = prevAutoClear;
    }
  }

  _disposeTargets() {
    this.sceneTarget?.dispose();
    this.sceneTarget = null;
    for (const rt of this.mipDown) rt.dispose();
    for (const rt of this.mipUp) rt.dispose();
    this.mipDown.length = 0;
    this.mipUp.length = 0;
  }

  dispose() {
    this._disposeTargets();
    this.quadGeo.dispose();
    this.prefilterMat.dispose();
    this.downsampleMat.dispose();
    this.upsampleMat.dispose();
    this.compositeMat.dispose();
  }
}
