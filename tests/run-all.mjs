import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFont } from '../src/vendor/opentype.mjs';
import { computeFileliContours, minDistanceBetweenPolygons, polygonArea, polygonBounds } from '../src/geometry/PolygonOffset.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { runTrueShapeNesting } from '../src/manufacturing/NestingEngine.js';
import { calculateManufacturingMetrics } from '../src/manufacturing/MetricsCalculator.js';
import { calculateProjectCosts } from '../src/manufacturing/CostEngine.js';
import { createDefaultState } from '../src/core/state.js';
import { deserializeProject, serializeProject } from '../src/core/projectSerializer.js';
import { generateManufacturingDxf, generateManufacturingSvg } from '../src/export/ExportService.js';
import { computeHomography } from '../src/photomontage/PerspectiveFitter.js';
import THREE from '../src/vendor/three.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}:`, err);
    process.exitCode = 1;
  }
}

// 1. Test B — Fileli inward offset preserves outer dimensions (100 mm)
test('Test B: Fileli 5 mm ve 12 mm içe ofset dış ölçüyü 100 mm olarak korur', () => {
  const outer100 = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const r5 = computeFileliContours(outer100, [], 5);
  assert.strictEqual(r5.ok, true);
  const ob5 = polygonBounds(r5.outer);
  const ab5 = polygonBounds(r5.acrylicOuter);
  assert.strictEqual(Math.round(ob5.width), 100);
  assert.strictEqual(Math.round(ob5.height), 100);
  assert.strictEqual(Math.round(ab5.width), 90);
  assert.strictEqual(Math.round(ab5.height), 90);

  const r12 = computeFileliContours(outer100, [], 12);
  assert.strictEqual(r12.ok, true);
  const ab12 = polygonBounds(r12.acrylicOuter);
  assert.strictEqual(Math.round(ab12.width), 76);
  assert.strictEqual(Math.round(ab12.height), 76);
  assert(polygonArea(r12.acrylicOuter) < polygonArea(r5.acrylicOuter));

  // Excessive file width triggers Turkish warning
  const rBad = computeFileliContours(outer100, [], 55);
  assert.strictEqual(rBad.ok, false);
  assert(rBad.warning && rBad.warning.length > 10);
});

// 2. Test F — True-Shape Nesting interlocks E-shaped components
test('Test F: Gerçek Şekil Nesting E-harflerini iç içe geçirerek yerleştirir', () => {
  const makeE = (w = 200, h = 300, t = 45) => [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: t },
    { x: t, y: t },
    { x: t, y: (h - t) / 2 },
    { x: w * 0.85, y: (h - t) / 2 },
    { x: w * 0.85, y: (h + t) / 2 },
    { x: t, y: (h + t) / 2 },
    { x: t, y: h - t },
    { x: w, y: h - t },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const ePoly = makeE();
  const items = Array.from({ length: 6 }, (_, i) => ({
    id: `E_${i}`,
    label: `E-${i}`,
    partType: 'Gövde',
    materialGroup: 'Altın · 80 mm',
    outer: ePoly,
    holes: [],
    areaMm2: polygonArea(ePoly),
  }));

  const res = runTrueShapeNesting(items, {
    sheetWidthMm: 700,
    sheetHeightMm: 700,
    marginMm: 10,
    clearanceMm: 5,
    kerfMm: 0.4,
    allowedAngles: [0, 90, 180, 270],
  });

  assert.strictEqual(res.sheetCount, 1);
  assert.strictEqual(res.sheets[0].placements.length, 6);
  // Verify minimum clearance between every placed polygon pair
  const pls = res.sheets[0].placements;
  for (let i = 0; i < pls.length; i++) {
    for (let j = i + 1; j < pls.length; j++) {
      const d = minDistanceBetweenPolygons(pls[i].outer, pls[j].outer);
      assert(d >= 5.39, `Clearance violated: ${d}`);
    }
  }
});

// 3. Test G — Turkish characters ŞİĞÜÇÖ ALİ DEVA
test('Test G: Türkçe karakterler (ŞİĞÜÇÖ ALİ DEVA) geometri, metraj ve DXF/SVG çıktısı', () => {
  const latin = parseFont(fs.readFileSync(path.join(ROOT, 'public/fonts/montserrat-latin-800-normal-C3dfDxXV.woff')).buffer);
  const ext = parseFont(fs.readFileSync(path.join(ROOT, 'public/fonts/montserrat-latin-ext-800-normal-Wjq_OapB.woff')).buffer);
  const layout = layoutTextMm([latin, ext], 'ŞİĞÜÇÖ ALİ DEVA', 300, 8);

  // 13 non-space characters
  assert.strictEqual(layout.glyphs.length, 13);
  const built = layout.glyphs.map(g => {
    const res = buildChannelComponent(g.shapes, {
      constructionType: 'fileli',
      depthMm: 80,
      fileWidthMm: 6,
    });
    return {
      objectId: 't1',
      label: g.char,
      ...res.metrics,
      depthMm: 80,
      constructionType: 'fileli',
      lightingMode: 'both',
      exportContours: res.exportContours,
      offsetXMm: 0,
      offsetYMm: 0,
    };
  });

  const state = createDefaultState();
  const metrics = calculateManufacturingMetrics(built, state);
  assert.strictEqual(metrics.componentCount, 13);
  assert(metrics.acrylicAreaM2 > 0);
  assert(metrics.fileAreaM2 > 0);
  assert(metrics.cuttingLengthM > 5);

  const svg = generateManufacturingSvg(built);
  assert(svg.includes('ACRYLIC_FACE') && svg.includes('FILE_BORDER'));

  const { dxfText, cncWarning } = generateManufacturingDxf(built);
  assert(dxfText.includes('FILE_BORDER') && dxfText.includes('ACRYLIC') && dxfText.includes('LWPOLYLINE'));
  assert(cncWarning.includes('kerf'));
});

// 4. Cost Engine Markup vs Profit Margin formula distinction
test('Maliyet Motoru: Markup vs Profit Margin formülleri ve kur dönüşümü', () => {
  const state = createDefaultState();
  const metrics = {
    componentCount: 5,
    totalWidthMm: 1200,
    totalHeightMm: 400,
    outerAreaM2: 0.25,
    acrylicAreaM2: 0.18,
    fileAreaM2: 0.07,
    metalFaceAreaM2: 0.07,
    sidewallAreaM2: 0.65,
    perimeterM: 8.1,
    cuttingLengthM: 12.0,
    totalLedModules: 40,
    powerSupplies: 1,
    components: [],
  };

  state.costConfig.pricingMode = 'markup';
  state.costConfig.markupPct = 50;
  state.costConfig.discountPct = 0;
  const cMarkup = calculateProjectCosts(metrics, state);

  state.costConfig.pricingMode = 'margin';
  state.costConfig.marginPct = 50;
  const cMargin = calculateProjectCosts(metrics, state);

  // 50% markup = 1.5x cost; 50% margin = 2.0x cost
  assert(Math.abs(cMargin.subtotal / cMarkup.subtotal - (2.0 / 1.5)) < 0.01);
});

// 5. Project Serialization & Migration
test('Proje Serileştirme: v1 -> v2 göçü ve bilinmeyen alanların korunması', () => {
  const legacy = JSON.stringify({ schemaVersion: 1, text: 'DENEME', customField: 'koru_bunu' });
  const migrated = deserializeProject(legacy);
  assert.strictEqual(migrated.schemaVersion, 2);
  assert.strictEqual(migrated.objects[0].text, 'DENEME');
  assert.strictEqual(migrated.customField, 'koru_bunu');

  const json = serializeProject(migrated);
  const reloaded = deserializeProject(json);
  assert.strictEqual(reloaded.customField, 'koru_bunu');
});

// 6. 4-Point Projective Homography
test('Test H: 4 nokta projektif homografi matrisi doğruluğu', () => {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  const dst = [{ x: 20, y: 10 }, { x: 140, y: 20 }, { x: 130, y: 80 }, { x: 10, y: 70 }];
  const H = computeHomography(src, dst);
  assert.strictEqual(H.length, 9);
  for (let i = 0; i < 4; i++) {
    const s = src[i];
    const d = H[6] * s.x + H[7] * s.y + H[8];
    const px = (H[0] * s.x + H[1] * s.y + H[2]) / d;
    const py = (H[3] * s.x + H[4] * s.y + H[5]) / d;
    assert(Math.hypot(px - dst[i].x, py - dst[i].y) < 1e-4);
  }
});

console.log(`\nToplam ${passed} test başarıyla geçti.`);
