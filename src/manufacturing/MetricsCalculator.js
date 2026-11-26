import { calculateReturnCoilPlan, calculateSmartLedAndPsu } from './WorkshopAutomation.js';

/**
 * Manufacturing Metrics Calculator (Strictly driven by real millimeter geometry)
 * Computes surface areas, cutting perimeters, LED module counts, and power supply requirements.
 */

export function calculateManufacturingMetrics(metricsList, state) {
  const lightingEnabled = state.lighting?.enabled ?? true;
  let totalAcrylicMm2 = 0;
  let totalFileMm2 = 0;
  let totalOuterMm2 = 0;
  let totalSidewallMm2 = 0;
  let totalPerimeterMm = 0;
  let totalCuttingMm = 0;
  let totalLedModules = 0;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const components = metricsList.map((m, idx) => {
    const b = m.boundsMm || { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    const wxMin = b.minX + (m.offsetXMm || 0);
    const wxMax = b.maxX + (m.offsetXMm || 0);
    const wyMin = b.minY + (m.offsetYMm || 0);
    const wyMax = b.maxY + (m.offsetYMm || 0);
    if (b.width > 0 || b.height > 0) {
      minX = Math.min(minX, wxMin);
      maxX = Math.max(maxX, wxMax);
      minY = Math.min(minY, wyMin);
      maxY = Math.max(maxY, wyMax);
    }

    const acrylicMm2 = m.acrylicAreaMm2 || 0;
    const fileMm2 = m.fileAreaMm2 || 0;
    const outerMm2 = m.outerAreaMm2 || 0;
    const sidewallMm2 = m.sidewallAreaMm2 || 0;
    const perimMm = m.perimeterMm || 0;
    const cutMm = m.cuttingLengthMm || perimMm;

    totalAcrylicMm2 += acrylicMm2;
    totalFileMm2 += fileMm2;
    totalOuterMm2 += outerMm2;
    totalSidewallMm2 += sidewallMm2;
    totalPerimeterMm += perimMm;
    totalCuttingMm += cutMm;

    // LED estimation: ~1 module per 45 cm2 of illuminated area (min 2 per lit glyph)
    const isLit = lightingEnabled && m.lightingMode && m.lightingMode !== 'none';
    const litAreaCm2 = (acrylicMm2 > 0 ? acrylicMm2 : outerMm2) / 100;
    const ledCount = isLit ? Math.max(2, Math.ceil(litAreaCm2 / 45) * (m.lightingMode === 'both' ? 2 : 1)) : 0;
    totalLedModules += ledCount;

    return {
      index: idx + 1,
      objectId: m.objectId,
      label: m.label,
      widthMm: Math.round(b.width * 10) / 10,
      heightMm: Math.round(b.height * 10) / 10,
      depthMm: m.depthMm || 80,
      outerAreaCm2: outerMm2 / 100,
      acrylicAreaCm2: acrylicMm2 / 100,
      fileAreaCm2: fileMm2 / 100,
      sidewallAreaCm2: sidewallMm2 / 100,
      perimeterMm: Math.round(perimMm),
      cuttingLengthMm: Math.round(cutMm),
      ledCount,
      constructionType: m.constructionType,
    };
  });

  const totalWidthMm = Number.isFinite(minX) ? Math.round(maxX - minX) : 0;
  const totalHeightMm = Number.isFinite(minY) ? Math.round(maxY - minY) : 0;

  // 12V LED module ~1.2W each; 150W PSU safely drives ~100 modules (80% load)
  const powerSupplies = totalLedModules > 0 ? Math.max(1, Math.ceil(totalLedModules / 95)) : 0;

  const ledPsuPlan = calculateSmartLedAndPsu(metricsList, state);
  const coilPlan = calculateReturnCoilPlan(metricsList, state);

  return {
    componentCount: components.length,
    totalWidthMm,
    totalHeightMm,
    outerAreaM2: totalOuterMm2 / 1_000_000,
    acrylicAreaM2: totalAcrylicMm2 / 1_000_000,
    fileAreaM2: totalFileMm2 / 1_000_000,
    metalFaceAreaM2: Math.max(0, totalOuterMm2 - totalAcrylicMm2) / 1_000_000,
    sidewallAreaM2: totalSidewallMm2 / 1_000_000,
    perimeterM: totalPerimeterMm / 1000,
    cuttingLengthM: totalCuttingMm / 1000,
    totalLedModules,
    powerSupplies,
    ledPsuPlan,
    coilPlan,
    components,
  };
}
