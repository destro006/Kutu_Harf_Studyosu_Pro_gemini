import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importSvgText } from '../src/manufacturing/VectorFileImport.js';
import { importLegacyPostScript } from '../src/manufacturing/LegacyPostScriptImport.js';
import { runNestingImportJob } from '../src/manufacturing/NestingImportWorker.js';
import {
  analyzeRasterLogoQuality,
  extractSvgPhysicalHeightMm,
  importedVectorToLogoData,
} from '../src/geometry/LogoTracer.js';
import { PostProcessor } from '../src/render/PostProcessor.js';
import { buildSceneLights } from '../src/render/LightingSystem.js';
import { createSignMaterial } from '../src/render/MaterialLibrary.js';
import { SignEngine } from '../src/render/SignEngine.js';

// ============================================================================
// MODULE 1: File Format Import & Tab Routing (.cdr, .ai, .svg)
// ============================================================================
{
  // 1a. Multi-part SVG preserves sourceOriginMm, layer hierarchy, fill colors, and auto-closes filled paths without trailing Z
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="100mm" viewBox="0 0 300 100">
    <g id="LogoLayer" fill="#d4af37">
      <path d="M10 10 L60 10 L60 90 L10 90"/>
      <path d="M200 10 L290 10 L290 90 L200 90 Z"/>
    </g>
    <path d="M0 0 L50 50" fill="none" stroke="#000"/>
  </svg>`;
  assert.equal(extractSvgPhysicalHeightMm(svg), 100);
  const parsed = importSvgText(svg, 'brand.svg', { unit: 'auto', scale: 1, tolerance: 0.5 });
  assert.equal(parsed.items.length, 2, 'Two closed shapes expected; open stroke skipped');
  assert.equal(parsed.items[0].layerName, 'LogoLayer');
  assert.equal(parsed.items[0].color, '#d4af37');
  const originsX = parsed.items.map(i => i.sourceOriginMm.x).sort((a, b) => a - b);
  assert.deepEqual(originsX, [10, 200], 'Shapes must keep their true horizontal origins');

  // Relative spacing preserved when converted to 3D LogoData
  const logoData = importedVectorToLogoData(parsed);
  assert(logoData && logoData.parts.length === 2);
  assert(Math.abs(logoData.physicalWidthMm - 280) < 0.5, `Expected width ~280mm, got ${logoData.physicalWidthMm}`);
  assert(Math.abs(logoData.physicalHeightMm - 80) < 0.5, `Expected height ~80mm, got ${logoData.physicalHeightMm}`);
  assert(logoData.aspect > 3.0, 'Separated letters must preserve aspect ratio instead of stacking at (0,0)');

  // 1b. Illustrator .ai parser handles (LayerName) Ln, RGB/CMYK color, f* even-odd paths & exact pt->mm scaling
  const aiText = `%!PS-Adobe-3.0
%%Creator: Adobe Illustrator
%%EndProlog
(HarfKatmani) Ln
1 0.5 0 Xa
72 72 m
144 72 l
144 144 l
72 144 l
f*
216 72 m
288 72 l
288 144 l
216 144 l
f
LB
%%EOF`;
  const aiImported = importLegacyPostScript(aiText, 'marka.ai', { unit: 'auto', scale: 1 });
  assert.equal(aiImported.format, 'ai');
  assert.equal(aiImported.items.length, 2);
  assert.equal(aiImported.items[0].layerName, 'HarfKatmani');
  assert.equal(aiImported.items[0].color, '#ff8000');
  const aiLogo = importedVectorToLogoData(aiImported);
  assert(Math.abs(aiLogo.physicalWidthMm - 3 * 25.4) < 0.5, `Expected 76.2mm width, got ${aiLogo.physicalWidthMm}`);
  assert(Math.abs(aiLogo.physicalHeightMm - 25.4) < 0.5, `Expected 25.4mm height, got ${aiLogo.physicalHeightMm}`);

  // 1c. NestingImportWorker parseOnly returns { imported, nesting: null } directly
  const parsedOnly = runNestingImportJob({
    jobId: 99,
    operation: 'importText',
    parseOnly: true,
    text: svg,
    filename: 'brand.svg',
    options: { unit: 'auto', scale: 1, tolerance: 0.5 },
  });
  assert.equal(parsedOnly.nesting, null);
  assert.equal(parsedOnly.imported.items.length, 2);

  // 1d. Main router routes active 3D/2D workspace imports to handleLogoUpload (not Nesting)
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(mainSrc.includes("if(ws==='nesting'){") && mainSrc.includes('handleLogoUpload(file)'));
  assert(mainSrc.includes("id=\"logoFileInput\"") && mainSrc.includes('.ai,.cdr,'));
}

// ============================================================================
// MODULE 2: Auto Image Quality Check & Image Tracer Bridge
// ============================================================================
{
  const makeSolid = (w, h, bg = [255, 255, 255, 255]) => {
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = bg[3];
    }
    return buf;
  };
  const drawRect = (buf, w, h, x0, y0, x1, y1, col) => {
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
        const idx = (y * w + x) * 4;
        buf[idx] = col[0]; buf[idx + 1] = col[1]; buf[idx + 2] = col[2]; buf[idx + 3] = col[3] ?? 255;
      }
    }
  };

  // 2a. Clean sharp high-res logo -> high quality (direct 3D trace)
  const cleanBuf = makeSolid(800, 400);
  drawRect(cleanBuf, 800, 400, 120, 80, 680, 320, [15, 15, 15, 255]);
  const cleanQ = analyzeRasterLogoQuality(cleanBuf, 800, 400, { naturalWidth: 800, naturalHeight: 400, fileName: 'atlas.png', mimeType: 'image/png' });
  assert.equal(cleanQ.isLowQuality, false, `Clean high-res PNG should pass: ${JSON.stringify(cleanQ)}`);

  // 2b. Low-resolution small pixel logo -> low quality, laser_cnc_contrast preset
  const tinyBuf = makeSolid(160, 80);
  drawRect(tinyBuf, 160, 80, 20, 15, 140, 65, [0, 0, 0, 255]);
  const tinyQ = analyzeRasterLogoQuality(tinyBuf, 160, 80, { naturalWidth: 160, naturalHeight: 80, fileName: 'tiny.png', mimeType: 'image/png' });
  assert.equal(tinyQ.isLowQuality, true);
  assert.equal(tinyQ.recommendedPreset, 'laser_cnc_contrast');
  assert(tinyQ.reasons.some(r => /çözünürlük/i.test(r)));

  // 2c. Blurry & noisy JPEG -> low quality
  const jpegBuf = makeSolid(480, 280);
  drawRect(jpegBuf, 480, 280, 80, 50, 400, 230, [20, 20, 20, 255]);
  // Soften edges (3px ramp) + JPEG noise
  for (let pass = 0; pass < 3; pass++) {
    const copy = new Uint8ClampedArray(jpegBuf);
    for (let y = 1; y < 279; y++) for (let x = 1; x < 479; x++) {
      const i = (y * 480 + x) * 4;
      const v = Math.round((copy[i - 4] + copy[i + 4] + copy[i - 480 * 4] + copy[i + 480 * 4] + copy[i] * 2) / 6);
      jpegBuf[i] = jpegBuf[i + 1] = jpegBuf[i + 2] = v;
    }
  }
  for (let y = 0; y < 280; y++) {
    for (let x = 0; x < 480; x++) {
      const idx = (y * 480 + x) * 4;
      const noise = ((x * 37 + y * 91) % 29) - 14;
      jpegBuf[idx] = Math.max(0, Math.min(255, jpegBuf[idx] + noise));
      jpegBuf[idx + 1] = Math.max(0, Math.min(255, jpegBuf[idx + 1] + noise));
      jpegBuf[idx + 2] = Math.max(0, Math.min(255, jpegBuf[idx + 2] + noise));
    }
  }
  const jpegQ = analyzeRasterLogoQuality(jpegBuf, 480, 280, { naturalWidth: 480, naturalHeight: 280, fileName: 'logo.jpg', mimeType: 'image/jpeg' });
  assert.equal(jpegQ.isLowQuality, true);

  // 2d. Complex multi-color textured photo background -> photo_text preset
  const photoBuf = new Uint8ClampedArray(600 * 400 * 4);
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 600; x++) {
      const idx = (y * 600 + x) * 4;
      photoBuf[idx] = (x * 13 + y * 7) % 255;
      photoBuf[idx + 1] = (x * 5 + y * 19) % 255;
      photoBuf[idx + 2] = (x * 23 + y * 11) % 255;
      photoBuf[idx + 3] = 255;
    }
  }
  const photoQ = analyzeRasterLogoQuality(photoBuf, 600, 400, { naturalWidth: 600, naturalHeight: 400, fileName: 'cephe.jpg', mimeType: 'image/jpeg' });
  assert.equal(photoQ.isLowQuality, true);
  assert.equal(photoQ.recommendedPreset, 'facade_hdr');

  // 2e. Prompt & Image Studio preset forwarding wired
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const tracerHtml = fs.readFileSync(new URL('../public/trace-studio/index.html', import.meta.url), 'utf8');
  assert(mainSrc.includes("Bu görsel düşük kaliteli, Image Studio'da iyileştirip vektöre çevirelim mi?"));
  assert(mainSrc.includes('presetId: pendingTracerImage.presetId'));
  assert(tracerHtml.includes('options.presetId && PRESETS.some'));
}

// ============================================================================
// MODULE 11: Critical Fix — 3D Day/Night Lighting, Exposure & Reflections
// ============================================================================
{
  const postState = { isWebGL2: false, samples: 0, width: 0, height: 0, quality: 'high' };
  PostProcessor.prototype.setState.call(postState, { night: false, lit: true, exposure: 0.84, transparentBg: false, quality: 'high' });
  assert(postState.bloomThreshold >= 1.7, `Day lit bloom threshold too low (${postState.bloomThreshold}), risks wall whiteout`);
  assert(postState.bloomIntensity <= 0.18, `Day lit bloom intensity too high (${postState.bloomIntensity})`);

  PostProcessor.prototype.setState.call(postState, { night: false, lit: false, exposure: 0.84, transparentBg: false, quality: 'high' });
  assert.equal(postState.bloomIntensity, 0, 'Day unlit bloom must be disabled');

  PostProcessor.prototype.setState.call(postState, { night: true, lit: true, exposure: 1.02, transparentBg: false, quality: 'high' });
  assert(postState.bloomThreshold <= 0.85 && postState.bloomIntensity >= 1.2, 'Night lit bloom must stay vivid');

  const dayLights = buildSceneLights(false, { w: 2.0, h: 0.4 });
  const nightLights = buildSceneLights(true, { w: 2.0, h: 0.4 });
  let dayDirs = [], dayHemis = [], nightDirs = [];
  dayLights.traverse(o => {
    assert(!o.isPointLight && !o.isSpotLight, 'No circular hotspot PointLight/SpotLight allowed');
    if (o.isDirectionalLight) dayDirs.push(o);
    if (o.isHemisphereLight) dayHemis.push(o);
  });
  nightLights.traverse(o => {
    assert(!o.isPointLight && !o.isSpotLight, 'No circular hotspot PointLight/SpotLight allowed');
    if (o.isDirectionalLight) nightDirs.push(o);
  });
  assert(dayHemis.length === 1 && dayHemis[0].intensity < 0.55, 'Day hemisphere must not blow out light walls');
  assert(dayDirs.some(l => l.castShadow && l.intensity < 1.8), 'Day key directional must be calibrated below overexposure');
  assert(nightDirs.length >= 3, 'Night mode needs key + dual rim/fill lights so dark angles stay legible');

  const opalDay = createSignMaterial('opalPleksi', {}, { lit: true, night: false, glowHex: '#eef4ff', lightIntensity: 1.0 });
  const opalNight = createSignMaterial('opalPleksi', {}, { lit: true, night: true, glowHex: '#eef4ff', lightIntensity: 1.0 });
  assert(opalDay.emissiveIntensity < 0.75, `Day acrylic emissive too bright: ${opalDay.emissiveIntensity}`);
  assert(opalNight.emissiveIntensity >= 1.5, `Night acrylic emissive too dim: ${opalNight.emissiveIntensity}`);

  const dayExp = SignEngine.prototype.computeEffectiveExposure({ render: { exposure: 1.0 }, scene: { night: false } });
  const nightExp = SignEngine.prototype.computeEffectiveExposure({ render: { exposure: 1.0 }, scene: { night: true } });
  assert(dayExp < nightExp && dayExp <= 0.9, `Day exposure (${dayExp}) must be lower than night (${nightExp})`);

  const envSrc = fs.readFileSync(new URL('../src/render/EnvironmentManager.js', import.meta.url), 'utf8');
  assert(envSrc.includes('`${id}_${night ?'), 'EnvironmentManager must cache Day and Night PMREM separately');
}

console.log('✓ Phase 1 Modules (1, 2 & 11) verified cleanly');
