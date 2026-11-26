import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { applyTextEdit } from '../src/cad/TextEditing.js';
import { extractNestingItems } from '../src/manufacturing/NestingEngine.js';

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url), 'utf8');
const pmSrc = fs.readFileSync(new URL('../src/ui/PhotomontageOverlay.js', import.meta.url), 'utf8');
const cwsSrc = fs.readFileSync(new URL('../src/ui/CentralWorkspaces.js', import.meta.url), 'utf8');
const geomSrc = fs.readFileSync(new URL('../src/geometry/ChannelLetterGeometry.js', import.meta.url), 'utf8');
const fontSrc = fs.readFileSync(new URL('../src/geometry/FontManager.js', import.meta.url), 'utf8');
const tracerHtml = fs.readFileSync(new URL('../public/trace-studio/index.html', import.meta.url), 'utf8');
const expertSrc = fs.readFileSync(new URL('../src/ai/AppExpertAssistant.js', import.meta.url), 'utf8');

// ============================================================================
// MODULE 1: Rich Typographic Text Editor & Photomontage Unlock / Perspective
// ============================================================================
{
  const state = createDefaultState();
  const objId = state.objects[0].id;

  // 1a. Backward compatible string edit
  assert.equal(applyTextEdit(state, objId, 'ATELIER'), true);
  assert.equal(state.objects[0].text, 'ATELIER');

  // 1b. Rich typographic edit
  assert.equal(applyTextEdit(state, objId, {
    text: 'NOVA KAFE',
    fontId: 'poppins',
    heightMm: 450,
    letterSpacingMm: 14,
    lineSpacingMult: 1.4,
    textAlign: 'right',
    fontWeight: 'bold',
    fontItalic: true,
  }), true);
  assert.equal(state.objects[0].text, 'NOVA KAFE');
  assert.equal(state.objects[0].fontId, 'poppins');
  assert.equal(state.objects[0].heightMm, 450);
  assert.equal(state.objects[0].letterSpacingMm, 14);
  assert.equal(state.objects[0].lineSpacingMult, 1.4);
  assert.equal(state.objects[0].textAlign, 'right');
  assert.equal(state.objects[0].fontWeight, 'bold');
  assert.equal(state.objects[0].fontItalic, true);

  assert(fontSrc.includes('export const FONT_ASSETS'));
  for (const id of ['textEditFont', 'textEditFontUpload', 'textEditBold', 'textEditItalic', 'textEditCase', 'textEditSize', 'textEditSpacing', 'textEditLineHeight', 'textEditLivePreview']) {
    assert(rootHtml.includes(`id="${id}"`), `Missing #${id} in textEditDialog`);
  }
  assert(cssSrc.includes('.text-edit-dialog--pro'));

  // 1c. Perspective tool & photomontage uniform scale / stay-in-3D confirm
  assert(rootHtml.includes('data-tool="perspective"'), 'Missing Perspektif tool in #cadRail');
  assert(pmSrc.includes('id="pmModeToggle"') && pmSrc.includes('id="pmScaleRange"') && pmSrc.includes('id="pmSignW"') && pmSrc.includes('id="pmSignH"'));
  assert(mainSrc.includes("if (tool === 'perspective')"));
  assert(mainSrc.includes("onConfirm: () => {"));
  assert(mainSrc.includes("Cephe yerleşimi 3D sahneye uygulandı."));
  assert(!mainSrc.match(/onConfirm:\s*(?:async\s*)?\(\)\s*=>\s*\{[\s\S]{0,220}sendPhotomontageToTracer/), 'onConfirm must not redirect into Image Studio');
}

// ============================================================================
// MODULE 2: Global Rename Image Tracer -> Image Studio + 5 Pro Presets
// ============================================================================
{
  assert(rootHtml.includes('data-main-ws="tracer">✦ Image Studio</button>'));
  assert(!rootHtml.includes('✦ Image Tracer'));
  assert(!expertSrc.includes('Image Tracer'));
  assert(expertSrc.includes("label: 'Image Studio'"));
  assert(!tracerHtml.includes('Image Tracer'));
  assert(!pmSrc.includes('Image Tracer'));
  for (const pid of ['ultra_logo_clean', 'super_res_4k', 'facade_hdr', 'arch_denoise', 'laser_cnc_contrast']) {
    assert(tracerHtml.includes(`id: '${pid}'`), `Missing pro preset ${pid}`);
  }
  assert(!tracerHtml.includes("'photo_3d_nr'") && !tracerHtml.includes("'photo_3d_soft'"));
}

// ============================================================================
// MODULE 4: Fileli Front Trim Proportion & Independent Acrylic Cut Inset
// ============================================================================
{
  const state = createDefaultState();
  assert.equal(state.fileli.acrylicOverlapMm, 3);
  assert.equal(state.fileli.dekotaInsetMm, 2);
  assert.equal(state.fileli.acrylicCutInsetMm, null);

  assert(geomSrc.includes('bevelSizeRatio = 0.8'));
  assert(geomSrc.includes('extrudeShapeMm(rimShape, rimThick, safeBevel, 1, 14, 0.2)'));
  assert(geomSrc.includes('Math.min(borderBevelMm * 0.35, rimThick * 0.15, fileWidthMm * 0.035)'));
  assert(cwsSrc.includes('id="cwsFileliAcrylicInset"'));
  assert(mainSrc.includes("querySelector('#cwsFileliAcrylicInset')"));

  // Verify extractNestingItems applies inward acrylicCutInsetMm cleanly
  const squareOuter = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
  state.objects[0].constructionType = 'fileli';
  state.fileli.acrylicCutInsetMm = 5;
  const parts = extractNestingItems(
    [{ objectId: state.objects[0].id, label: 'M', constructionType: 'fileli', polygonsMm: [{ outer: squareOuter, holes: [] }] }],
    state
  );
  const acrylicPart = parts.find(p => p.partType === 'Pleksi' || p.partGroup === 'fileli_acrylic');
  assert(acrylicPart, 'Expected extracted Fileli acrylic part');
  const xs = acrylicPart.outer.map(p => p.x);
  const ys = acrylicPart.outer.map(p => p.y);
  const spanW = Math.max(...xs) - Math.min(...xs);
  const spanH = Math.max(...ys) - Math.min(...ys);
  assert(Math.abs(spanW - 190) < 1 && Math.abs(spanH - 190) < 1, `Expected 200mm square shrunk by 5mm inset to ~190mm, got ${spanW.toFixed(1)}x${spanH.toFixed(1)}`);
}

console.log('✓ Phase 1 (Modules 1, 2 & 4) UI, typography, photomontage, Image Studio, and Fileli precision verified');
