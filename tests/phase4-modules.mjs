import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultState } from '../src/core/state.js';
import { parseFont } from '../src/vendor/opentype.mjs';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import { calculateManufacturingMetrics } from '../src/manufacturing/MetricsCalculator.js';
import { calculateProjectCosts } from '../src/manufacturing/CostEngine.js';
import { buildQuoteHtml } from '../src/manufacturing/QuoteGenerator.js';
import { generateQrMatrix, generateQrSvg } from '../src/sales/QrCodeGenerator.js';
import { buildClientApprovalUrl, buildWhatsAppShareUrl, decodeClientShareState, encodeClientShareState } from '../src/sales/ClientShareApproval.js';
import { writeUsdz } from '../src/export/Professional3DExport.js';
import {
  calculateReturnCoilPlan,
  calculateSmartLedAndPsu,
  computeMountingStuds,
  generateMountingTemplateDxf,
  generateMountingTemplateSvg,
} from '../src/manufacturing/WorkshopAutomation.js';
import { INDUSTRY_SCENE_PRESETS, applyIndustryScenePreset, renderKioskPanel } from '../src/ui/KioskAndPresets.js';

// 1. Module 7: QR Code & Client Share Link & USDZ AR & QR Quote
const mat = generateQrMatrix('https://kutuharf.local/?clientPreview=abc123');
assert(mat.length >= 21 && mat.length === mat[0].length);
const qrSvg = generateQrSvg('https://kutuharf.local/?test=1', 120);
assert(qrSvg.includes('<svg') && qrSvg.includes('shape-rendering="crispEdges"'));

const st = createDefaultState();
const token = encodeClientShareState(st, { grandTotal: 14500, currency: 'TRY' });
const decoded = decodeClientShareState(token);
assert.equal(decoded.p, st.projectName);
assert.equal(decoded.pr.total, 14500);
const url = buildClientApprovalUrl(st, { grandTotal: 14500, currency: 'TRY' }, 'https://example.com/');
assert(url.startsWith('https://example.com/?clientPreview='));
assert(buildWhatsAppShareUrl(url, 'ATLAS').startsWith('https://wa.me/?text='));

// USDZ ZIP archive validation
const usdz = writeUsdz([{ name: 'A', color: '#f5c66a', triangles: [{ verts: [[0, 0, 0], [0.1, 0, 0], [0, 0.1, 0]], normal: [0, 0, 1] }] }]);
assert.equal(usdz[0], 0x50);
assert.equal(usdz[1], 0x4b);
assert(Buffer.from(usdz).toString('utf8').includes('signage.usda'));

// 2. Module 8: Workshop Automations (Stud Template, Smart LED/PSU, Side Return Coil)
const loadWoff = fn => {
  const b = fs.readFileSync(new URL(`../public/fonts/${fn}`, import.meta.url));
  return parseFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const cinzel = [
  loadWoff('cinzel-latin-700-normal-C-gK7hA8.woff'),
  loadWoff('cinzel-latin-ext-700-normal-CORa-yIv.woff'),
];
const lay = layoutTextMm(cinzel, 'AK', 400, 8);
const metricsList = lay.glyphs.map((g, i) => {
  const built = buildChannelComponent(g.shapes, { constructionType: 'metal', depthMm: 80 });
  const m = {
    objectId: 'obj_' + i,
    label: g.char,
    ...built.metrics,
    depthMm: 80,
    constructionType: 'metal',
    lightingMode: 'halo',
    polygonsMm: built.polygonsMm,
    offsetXMm: i * 350,
    offsetYMm: 0,
  };
  for (const geo of [...built.outerGeos, ...built.fileGeos, ...built.acrylicGeos]) geo.dispose();
  return m;
});

const studPlan = computeMountingStuds(metricsList);
assert(studPlan.letters.length >= 2 && studPlan.totalStuds >= 4, 'Must compute balanced mounting studs');
const studDxf = generateMountingTemplateDxf(studPlan);
assert(studDxf.includes('LETTER_OUTLINE') && studDxf.includes('MOUNTING_STUD_HOLES'));
const studSvg = generateMountingTemplateSvg(studPlan);
assert(studSvg.includes('mm') && studSvg.includes('<circle'));

const ledPlan = calculateSmartLedAndPsu(metricsList, st);
assert(ledPlan.totalModules >= 4 && ledPlan.safetyMarginPct === 20);
assert(ledPlan.requiredWatt > ledPlan.totalWatt);
assert(ledPlan.psuWatt * ledPlan.psuCount >= ledPlan.requiredWatt);
assert(ledPlan.psuLabel.includes('IP67 Trafo'));

const coilPlan = calculateReturnCoilPlan(metricsList, st);
assert(coilPlan.netPerimeterM > 0.5 && coilPlan.grossPerimeterM > coilPlan.netPerimeterM);
assert.equal(coilPlan.coilWidthMm, 80);

const metrics = calculateManufacturingMetrics(metricsList, st);
assert(metrics.ledPsuPlan && metrics.coilPlan);
const costs = calculateProjectCosts(metrics, st);
const quoteHtml = buildQuoteHtml(st, metrics, costs, null, { shareUrl: url });
assert(quoteHtml.includes('<svg') && quoteHtml.includes('CANLI 3D ÖNİZLEME'));
assert(!quoteHtml.includes('Alış / Birim') && !quoteHtml.includes('Gerçek Kâr'));

// 3. Module 9: Industry Scene Presets & Client Kiosk Mode
assert(INDUSTRY_SCENE_PRESETS.length >= 5);
const presetCopy = createDefaultState();
assert.equal(applyIndustryScenePreset(presetCopy, 'clinic_pharmacy'), true);
assert.equal(presetCopy.scene.wallId, 'beyazSiva');
assert.equal(presetCopy.scene.night, false);
assert.equal(presetCopy.lighting.mode, 'front');
const kioskHtml = renderKioskPanel(presetCopy, metrics, costs);
assert(kioskHtml.includes('MÜŞTERİ MODU') && kioskHtml.includes('kioskLogoInput') && kioskHtml.includes('kioskShareBtn'));

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(rootHtml.includes('id="btnKioskMode"') && rootHtml.includes('id="btnSplitCompare"') && rootHtml.includes('id="btnClientShareAr"'));

console.log('✓ Phase 4 Modules (7, 8 & 9: Share/AR/QR Quote, Workshop Automations & Kiosk Presets) verified cleanly');
