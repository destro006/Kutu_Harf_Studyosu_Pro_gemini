/**
 * Professional Manufacturing Cost Estimation Engine
 * Supports all 19 cost categories, multi-currency (TRY, USD, EUR),
 * overhead, distinct Markup % vs Profit Margin % formulas, discount, and VAT.
 */

export const CURRENCY_SYMBOLS = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

export function toTargetCurrency(amount, fromCurr, targetCurr, rates) {
  const rFrom = Number(rates[fromCurr] || 1);
  const rTo = Number(rates[targetCurr] || 1);
  const inTry = amount * rFrom;
  return inTry / rTo;
}

export function formatMoney(amount, currency = 'TRY') {
  const locale = currency === 'TRY' ? 'tr-TR' : currency === 'EUR' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * Calculates full itemized manufacturing cost & customer pricing from real geometry metrics.
 */
export function calculateProjectCosts(metrics, state) {
  const cfg = state.costConfig;
  const targetCurr = cfg.currency || 'TRY';
  const rates = cfg.rates || { TRY: 1, USD: 34.5, EUR: 37.2 };
  const u = cfg.unitCosts;

  const conv = (item) => {
    if (typeof item === 'number') return toTargetCurrency(item, 'TRY', targetCurr, rates);
    return toTargetCurrency(Number(item?.value || 0), item?.currency || 'TRY', targetCurr, rates);
  };

  const hasParts = metrics.componentCount > 0;
  const isPainted = state.materials?.faceId === 'boyaliAluminyum' || state.materials?.sideId === 'boyaliAluminyum';
  const isPolished = ['aynaAltin', 'aynaKrom', 'siyahKrom', 'roseGold'].includes(state.materials?.faceId);
  const isLit = (state.lighting?.enabled ?? true) && metrics.totalLedModules > 0;
  const mountingId = cfg.mountingId || 'duvar';

  const lines = [
    { key: 'acrylic', label: 'Ön Pleksi Malzeme', qty: `${metrics.acrylicAreaM2.toFixed(3)} m²`, amount: metrics.acrylicAreaM2 * conv(u.acrylicPerM2) },
    { key: 'metalFace', label: 'Metal Ön Yüzey', qty: `${metrics.metalFaceAreaM2.toFixed(3)} m²`, amount: metrics.metalFaceAreaM2 * conv(u.metalFacePerM2) },
    { key: 'fileBorder', label: 'File Çerçeve Malzemesi', qty: `${metrics.fileAreaM2.toFixed(3)} m²`, amount: metrics.fileAreaM2 * conv(u.fileBorderPerM2) },
    { key: 'sidewall', label: 'Yan Bant (Dönüş) Malzemesi', qty: `${metrics.sidewallAreaM2.toFixed(3)} m²`, amount: metrics.sidewallAreaM2 * conv(u.sidewallPerM2) },
    { key: 'cutting', label: 'CNC / Lazer Kesim', qty: `${metrics.cuttingLengthM.toFixed(2)} m`, amount: metrics.cuttingLengthM * conv(u.cuttingPerM) },
    { key: 'bending', label: 'Harf Büküm / Şekillendirme', qty: `${metrics.perimeterM.toFixed(2)} m`, amount: metrics.perimeterM * conv(u.bendingPerM) },
    { key: 'welding', label: 'Lazer / Argon Kaynak', qty: `${metrics.perimeterM.toFixed(2)} m`, amount: metrics.perimeterM * conv(u.weldingPerM) },
    { key: 'finishing', label: 'Yüzey İşlem & Tesviye', qty: hasParts ? '1 set' : '0', amount: hasParts ? conv(u.surfaceFinishing) : 0 },
    { key: 'polishing', label: 'Polisaj / Parlatma', qty: isPolished && hasParts ? '1 set' : '0', amount: isPolished && hasParts ? conv(u.polishing) : 0 },
    { key: 'painting', label: 'Elektrostatik Toz Boya', qty: isPainted ? `${metrics.sidewallAreaM2.toFixed(2)} m²` : '0', amount: isPainted ? metrics.sidewallAreaM2 * conv(u.paintingPerM2) : 0 },
    { key: 'leds', label: 'LED Modüller', qty: `${metrics.totalLedModules} adet`, amount: metrics.totalLedModules * conv(u.ledModuleUnit) },
    { key: 'psu', label: 'LED Trafoları', qty: `${metrics.powerSupplies} adet`, amount: metrics.powerSupplies * conv(u.powerSupplyUnit) },
    { key: 'electrical', label: 'Elektrik Tesisat & Kablolama', qty: isLit ? '1 set' : '0', amount: isLit ? conv(u.electricalInstall) : 0 },
    { key: 'labor', label: 'Atölye İşçiliği', qty: `${u.estimatedHours || 0} saat`, amount: hasParts ? (Number(u.estimatedHours || 0) * conv(u.laborHourly)) : 0 },
    { key: 'machine', label: 'Makine Kullanım Payı', qty: hasParts ? '1 proje' : '0', amount: hasParts ? conv(u.machineUsage) : 0 },
    { key: 'transport', label: 'Nakliye', qty: mountingId !== 'yok' && hasParts ? '1 sefer' : '0', amount: mountingId !== 'yok' && hasParts ? conv(u.transport) : 0 },
    { key: 'install', label: 'Yerinde Montaj', qty: mountingId !== 'yok' && hasParts ? (mountingId === 'profil' ? 'Profilli' : 'Duvara') : 'Montajsız', amount: mountingId !== 'yok' && hasParts ? conv(u.siteInstall) * (mountingId === 'profil' ? 1.25 : 1) : 0 },
    { key: 'other', label: 'Diğer Giderler', qty: 'Sabit', amount: conv(u.otherExpenses) },
  ];

  const directCost = lines.reduce((sum, l) => sum + l.amount, 0);
  const overheadAmount = directCost * ((Number(cfg.overheadPct) || 0) / 100);
  const totalCost = directCost + overheadAmount;

  // Distinct Markup vs Profit Margin formulas:
  // Markup: Price = Cost * (1 + markupPct / 100)
  // Profit Margin: Price = Cost / (1 - marginPct / 100)
  let preDiscountPrice = totalCost;
  if (cfg.pricingMode === 'margin') {
    const m = Math.min(95, Math.max(0, Number(cfg.marginPct) || 0)) / 100;
    preDiscountPrice = totalCost / Math.max(0.05, 1 - m);
  } else {
    const mk = Math.max(0, Number(cfg.markupPct) || 0) / 100;
    preDiscountPrice = totalCost * (1 + mk);
  }

  const profitAmount = preDiscountPrice - totalCost;
  const discountAmount = preDiscountPrice * (Math.max(0, Math.min(90, Number(cfg.discountPct) || 0)) / 100);
  const manualAdj = Number(cfg.manualAdjustment || 0);
  const subtotal = Math.max(0, preDiscountPrice - discountAmount + manualAdj);
  const vatAmount = subtotal * (Number(cfg.vatRate) || 0.2);
  const grandTotal = subtotal + vatAmount;

  return {
    currency: targetCurr,
    lines,
    directCost,
    overheadAmount,
    totalCost,
    profitAmount,
    discountAmount,
    manualAdj,
    subtotal,
    vatAmount,
    grandTotal,
  };
}
