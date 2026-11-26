import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { EXPERT_QUICK_PRESETS } from '../src/ai/AppExpertAssistant.js';
import { estimateSignageCostParams } from '../src/ai/SignageAiEngine.js';
import { renderAiStudioWorkspace, mountAiStudioParticles } from '../src/ui/AiStudioView.js';
import { clampArTransform } from '../src/sales/LiveCameraAr.js';
import {
  VIDEO_ROLES,
  VIDEO_TRANSITIONS,
  computeSequenceTimeline,
  sampleChoreographyKeyframe,
  sampleSequenceKeyframe,
} from '../src/render/PresentationVideoRecorder.js';
import { BUILTIN_AUDIO_TRACKS } from '../src/render/VideoAudioEngine.js';

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url), 'utf8');
const signEngineSrc = fs.readFileSync(new URL('../src/render/SignEngine.js', import.meta.url), 'utf8');
const liveArSrc = fs.readFileSync(new URL('../src/sales/LiveCameraAr.js', import.meta.url), 'utf8');

// ============================================================================
// MODULE 3: Flagship AI Stüdyo UI, Particles, Chat Fix, Split & Cost Auto-Fill
// ============================================================================
{
  assert(EXPERT_QUICK_PRESETS.length >= 15, 'Expected at least 15 categorized AI assistant quick presets');
  assert.equal(typeof mountAiStudioParticles, 'function');
  assert(rootHtml.includes('id="btnHeaderAiExpert"') && rootHtml.includes('✦ Uzman Asistan'));

  // Permanent crushed chat input CSS fix
  assert(cssSrc.includes('min-width:180px!important') && cssSrc.includes('white-space:nowrap!important'));

  // Without resultUrl: download button must stay disabled (strictly prevents exporting blurry compositeUrl)
  const preRenderHtml = renderAiStudioWorkspace({ compositeUrl: 'data:image/png;base64,before', resultUrl: '' });
  assert(preRenderHtml.includes('id="aiStudioParticleCanvas"'));
  assert(preRenderHtml.includes('id="aiStudioDownloadBtn" class="sec-btn" disabled'));
  assert(preRenderHtml.includes('id="aiStudioSyncCostBtn"'));
  assert(preRenderHtml.includes('class="ai-mp-card"'));

  // With resultUrl: clip-path hides left half so left=Öncesi, right=Sonrası & download unlocks
  const postRenderHtml = renderAiStudioWorkspace({ compositeUrl: 'data:image/png;base64,before', resultUrl: 'data:image/png;base64,after', comparePct: 45 });
  assert(postRenderHtml.includes('clip-path:inset(0 0 0 45%)'));
  assert(!postRenderHtml.includes('id="aiStudioDownloadBtn" class="sec-btn" disabled'));

  // Strict resultUrl download + corner reset on facade select in main.js
  assert(mainSrc.includes('if (!aiStudioState.resultUrl)') && mainSrc.includes('s.photomontage.cornersNorm = ['));

  // Cost estimate generator
  const st = createDefaultState();
  const est = estimateSignageCostParams(st, { fileName: 'fileli_altin_tabela.jpg', width: 1920, height: 1080 });
  assert.equal(est.constructionType, 'fileli');
  assert.equal(est.faceMaterial, 'aynaAltin');
  assert(est.widthMm >= 400 && est.heightMm >= 200);
}

// ============================================================================
// MODULE 5: Lag-Free Client Approval & 2-Tier Live Camera AR (Xiaomi 12T Fix)
// ============================================================================
{
  assert(signEngineSrc.includes('Math.min(dpr, 1.25)') && signEngineSrc.includes('Math.min(dpr, 1.5)'));
  assert(signEngineSrc.includes('this._bypassPostProcess = Boolean(next && mobile)'));
  assert(signEngineSrc.includes('(next && mobile) ? 512 : null'));
  assert(mainSrc.includes('setClientModePerformance?.(true, { mobile: true })'));

  // Tier-1 Live Camera AR uses environment rear camera & history popstate overlay close
  assert(liveArSrc.includes('getUserMedia') && liveArSrc.includes("facingMode: { ideal: 'environment' }"));
  assert(liveArSrc.includes('pushState') && liveArSrc.includes('popstate'));
  assert(liveArSrc.includes('Gelişmiş 3D AR (Scene Viewer / Quick Look)'));
  assert(!mainSrc.includes('Android .GLB İndir'), 'Mobile AR modal must not trigger raw GLB file downloads hijacking MIUI Files');

  const tr = clampArTransform({ xPct: 120, yPct: -10, scale: 9, rotDeg: 90 });
  assert.equal(tr.xPct, 92);
  assert.equal(tr.yPct, 8);
  assert.equal(tr.scale, 3.0);
  assert.equal(tr.rotDeg, 45);
}

// ============================================================================
// MODULE 6: Full-Screen CapCut Video Studio (15 Scenarios, Audio, Transitions)
// ============================================================================
{
  assert.equal(VIDEO_ROLES.length, 15, 'Expected all 15 cinematic scenarios');
  assert.equal(VIDEO_TRANSITIONS.length, 4);
  for (const r of VIDEO_ROLES) {
    const k0 = sampleChoreographyKeyframe(0, { role: r.id });
    const k1 = sampleChoreographyKeyframe(1, { role: r.id });
    assert(Number.isFinite(k0.azimuth) && Number.isFinite(k1.polar));
  }

  const tl = computeSequenceTimeline([
    { id: 'c1', role: 'drone_approach', durationSec: 4, transition: 'crossfade' },
    { id: 'c2', role: 'halo_pulse', durationSec: 4, transition: 'dip_black' },
    { id: 'c3', role: 'dolly_track', durationSec: 4, transition: 'spline_blend' },
    { id: 'c4', role: 'studio_outro', durationSec: 4, transition: 'cut' },
  ]);
  assert.equal(tl.totalDurationSec, 16);

  const kCross = sampleSequenceKeyframe(4.2, tl);
  assert(kCross.crossFadeAlpha > 0 && kCross.crossFadeAlpha < 1, 'Expected active cross-dissolve alpha');

  const kDip = sampleSequenceKeyframe(7.95, tl);
  assert(kDip.dipBlackAlpha > 0.5, 'Expected dip-to-black ramp near clip boundary');

  const kBlend = sampleSequenceKeyframe(12.01, tl);
  const kPrevEnd = sampleChoreographyKeyframe(1.0, { role: 'dolly_track' });
  assert(Math.abs(kBlend.azimuth - kPrevEnd.azimuth) < 0.08, 'Expected spline_blend smooth continuity across clip cut');

  assert(BUILTIN_AUDIO_TRACKS.length >= 5);
  assert(cssSrc.includes('.video-studio-card'));
  for (const id of ['vidModeSingle', 'vidModeMulti', 'vidScenarioCards', 'vidAudioTrackSel', 'vidAudioUpload', 'vidAudioTrackBar']) {
    assert(rootHtml.includes(`id="${id}"`), `Missing #${id} in CapCut Video Studio UI`);
  }
}

console.log('✓ Phase 2 & 3 (Modules 3, 5 & 6: Flagship AI Stüdyo, Live Camera AR & 15-Scenario CapCut Video Studio) verified cleanly');
