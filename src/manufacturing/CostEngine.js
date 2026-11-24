/**
 * Tabela üretimi için çift taraflı fiyat motoru.
 * İç maliyet ve müşteriye satış fiyatı birbirinden bağımsızdır.
 * Tüm fiziksel metrajlar mm tabanlı geometri hesaplarından türetilir.
 */
import { MATERIAL_PRESETS } from '../render/MaterialLibrary.js';

export const CURRENCY_SYMBOLS = { TRY: '₺', USD: '$', EUR: '€' };
const finite = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const nonNegative = x => Math.max(0, finite(x));
const round6 = n => Math.round(n * 1e6) / 1e6;
const CAD_CURRENCIES = ['TRY', 'USD', 'EUR'];

export function toTargetCurrency(amount, fromCurr = 'TRY', targetCurr = 'TRY', rates = {}) {
  if (fromCurr === targetCurr) return finite(amount);
  const from = fromCurr === 'TRY' ? 1 : finite(rates[fromCurr], 0);
  const to = targetCurr === 'TRY' ? 1 : finite(rates[targetCurr], 0);
  // Never silently convert with a fabricated live FX rate.
  if (!(from > 0) || !(to > 0)) return 0;
  return finite(amount) * from / to;
}

export function changeRateCurrency(rate,currency,rates){
  if(!CAD_CURRENCIES.includes(currency)||!rate)return null;
  if(rate.currency===currency)return {...rate};
  if((rate.currency!=='TRY'&&!(Number(rates?.[rate.currency])>0))||(currency!=='TRY'&&!(Number(rates?.[currency])>0)))return null;
  return {value:round6(toTargetCurrency(rate.value,rate.currency,currency,rates)),currency};
}
export function formatMoney(amount, currency = 'TRY') {
  const locale = currency === 'TRY' ? 'tr-TR' : currency === 'EUR' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: CAD_CURRENCIES.includes(currency) ? currency : 'TRY',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(finite(amount));
}

export const COST_ROLE_LABELS = {
  face: 'Metal Ön Yüz', side: 'Metal Yanak', file: 'Ön File', acrylic: 'Pleksi', process: 'İmalat / Hizmet',
};
export const COST_ROLE_UNITS = { face: 'm²', side: 'm²', file: 'm²', acrylic: 'm²' };
const PROCESS_CATALOG = [
  ['cutting', 'CNC / Lazer Kesim', 'm', 'cuttingPerM', 'kesim'],
  ['bending', 'Harf Büküm', 'm', 'bendingPerM', 'isçilik'],
  ['welding', 'Kaynak / Birleştirme', 'm', 'weldingPerM', 'isçilik'],
  ['finishing', 'Yüzey İşlem / Tesviye', 'set', 'surfaceFinishing', 'isçilik'],
  ['polishing', 'Polisaj', 'set', 'polishing', 'isçilik'],
  ['painting', 'Elektrostatik Toz Boya', 'm²', 'paintingPerM2', 'isçilik'],
  ['leds', 'LED Modüller', 'adet', 'ledModuleUnit', 'aydınlatma'],
  ['psu', 'LED Güç Kaynağı', 'adet', 'powerSupplyUnit', 'aydınlatma'],
  ['electrical', 'Elektrik / Kablolama', 'set', 'electricalInstall', 'aydınlatma'],
  ['labor', 'Atölye İşçiliği', 'saat', 'laborHourly', 'isçilik'],
  ['machine', 'Makine Payı', 'proje', 'machineUsage', 'isçilik'],
  ['transport', 'Nakliye', 'sefer', 'transport', 'nakliye'],
  ['install', 'Yerinde Montaj', 'iş', 'siteInstall', 'montaj'],
  ['other', 'Diğer Giderler', 'proje', 'otherExpenses', 'diğer'],
];
export const PROCESS_PRICE_ROWS = PROCESS_CATALOG.map(([key,label,unit,costKey,group]) => ({
  key: `process:${key}`, label, unit, costKey, group, role:'process',
}));
const ROLE_BASE_COST_KEYS = {
  face: 'metalFacePerM2', side: 'sidewallPerM2', file: 'fileBorderPerM2', acrylic: 'acrylicPerM2',
};
const PROCESS_DEFAULT_BUY = {
  cutting:38, bending:65, welding:85, finishing:450, polishing:380, painting:620,
  leds:18, psu:650, electrical:550, labor:350, machine:480, transport:600, install:1200, other:0,
};
const METAL_MULTIPLIERS = Object.fromEntries(Object.entries(MATERIAL_PRESETS).map(([id,m]) => [id, Number(m.multiplier || 1)]));
export const MATERIAL_PRICE_PRESETS = Object.entries(MATERIAL_PRESETS).map(([id,m])=>({id, label:m.label || id}));
export const ACRYLIC_PRICE_PRESETS = [
  {id:'opalPleksi',label:'Opal Pleksi'}, {id:'beyazPleksi',label:'Beyaz Pleksi'},
  {id:'siyahPleksi',label:'Siyah Pleksi'}, {id:'seffafPleksi',label:'Şeffaf Pleksi'},
  {id:'renkliPleksi',label:'Renkli Pleksi'},
];
function legacyBuy(cfg, legacyKey, fallback) {
  const entry = cfg?.unitCosts?.[legacyKey];
  if (entry && typeof entry === 'object') return {value:nonNegative(entry.value),currency:entry.currency || 'TRY'};
  if (typeof entry === 'number') return {value:nonNegative(entry),currency:'TRY'};
  return {value:fallback,currency:'TRY'};
}
function materialName(id) {
  return MATERIAL_PRESETS[id]?.label || ACRYLIC_PRICE_PRESETS.find(a=>a.id===id)?.label || id;
}
function normalizeRate(rate, fallback, currency) {
  if (rate != null && typeof rate === 'object') return {value:nonNegative(rate.value),currency:CAD_CURRENCIES.includes(rate.currency) ? rate.currency : (currency || 'TRY')};
  if (rate != null && rate !== '') return {value:nonNegative(rate),currency:currency || 'TRY'};
  return { ...fallback };
}
/** Get editable cost / sale rate without mutating saved state. */
export function getPriceCard(state, priceKey) {
  const cfg = state.costConfig || {};
  const [role,id] = priceKey.split(':');
  let fallback = {value:0,currency:'TRY'};
  let label = priceKey, unit = 'm²', group = 'malzeme';
  if (role === 'process') {
    const p = PROCESS_PRICE_ROWS.find(p=>p.key===priceKey);
    fallback = legacyBuy(cfg, p?.costKey, PROCESS_DEFAULT_BUY[id] ?? 0);
    label = p?.label || id; unit = p?.unit || 'set';group = p?.group || 'isçilik';
  } else {
    const legacyKey = ROLE_BASE_COST_KEYS[role] || 'metalFacePerM2';
    fallback = legacyBuy(cfg,legacyKey,0);
    if (role !== 'acrylic') fallback.value = round6(fallback.value * (METAL_MULTIPLIERS[id] || 1));
    label = `${COST_ROLE_LABELS[role] || role} · ${materialName(id)}`;
  }
  const stored = cfg.priceBook?.[priceKey] || {};
  const buy = normalizeRate(stored.buy, fallback, fallback.currency);
  // Each customer-facing sale rate is independent and individually editable.
  const sell = normalizeRate(stored.sell, {value:round6(fallback.value * 1.55),currency:fallback.currency},fallback.currency);
  return {key:priceKey,label,unit,group,buy,sell};
}
export function listPriceCatalog(state) {
  const rates=[];
  for(const role of ['face','side','file']) for(const item of MATERIAL_PRICE_PRESETS)
    rates.push(getPriceCard(state,`${role}:${item.id}`));
  for(const item of ACRYLIC_PRICE_PRESETS) rates.push(getPriceCard(state,`acrylic:${item.id}`));
  for(const p of PROCESS_PRICE_ROWS) rates.push(getPriceCard(state,p.key));
  // Preserve user-defined custom material tariffs in saved projects.
  for(const key of Object.keys(state.costConfig?.priceBook || {})) {
    if(!rates.some(r=>r.key===key))rates.push(getPriceCard(state,key));
  }
  return rates;
}

/**
 * @param {object} metrics result of calculateManufacturingMetrics()
 * @returns {object} full internal ledger; DO NOT pass this object into customer HTML.
 */
export function calculateProjectCosts(metrics, state) {
  const cfg = state.costConfig || {};
  const curr = CAD_CURRENCIES.includes(cfg.currency) ? cfg.currency : 'TRY';
  const rates = cfg.rates || {TRY:1};
  const components = Array.isArray(metrics?.components) ? metrics.components : [];
  const byId = new Map((state.objects || []).map(o=>[o.id,o]));
  const lineMap = new Map();
  const add = (key, qty, displayName) => {
    const amount = nonNegative(qty);
    if (amount <= 0.00000001) return;
    const card = getPriceCard(state,key);
    const existing=lineMap.get(key);
    if(existing){existing.quantity+=amount;return;}
    lineMap.set(key,{key,label:displayName||card.label,group:card.group,unit:card.unit,quantity:amount,card});
  };

  if(components.length){
    for(const c of components){
      const o=byId.get(c.objectId)||{};
      const type=c.constructionType || o.constructionType || state.constructionType || 'metal';
      const outer=nonNegative(c.outerAreaCm2)/10000;
      const acrylicArea=nonNegative(c.acrylicAreaCm2)/10000;
      const fileArea=nonNegative(c.fileAreaCm2)/10000;
      const sideArea=nonNegative(c.sidewallAreaCm2)/10000;
      const faceId=o.faceMaterial || state.materials?.faceId || 'aynaKrom';
      const sideId=(o.sideFollowsFace ?? state.materials?.sideFollowsFace) ? faceId : (o.sideMaterial || state.materials?.sideId || faceId);
      const fileId=o.fileMaterial || state.fileli?.fileMaterial || faceId;
      const acrylicId=o.acrylicMaterial || 'opalPleksi';
      const usedAcrylic=type==='pleksi' ? Math.max(acrylicArea,outer) : acrylicArea;
      if(usedAcrylic) add(`acrylic:${acrylicId}`,usedAcrylic);
      if(type==='fileli'){
        if(fileArea) add(`file:${fileId}`,fileArea);
        const otherFace=Math.max(0,outer-usedAcrylic-fileArea);
        if(otherFace>1e-6)add(`face:${faceId}`,otherFace);
      } else if(type!=='pleksi') add(`face:${faceId}`, Math.max(0,outer-usedAcrylic));
      add(`side:${sideId}`,sideArea);
    }
  } else {
    // Older projects/tests still expose only aggregate geometric metrics.
    const m=state.materials || {};
    const front=nonNegative(metrics?.metalFaceAreaM2);
    const file=nonNegative(metrics?.fileAreaM2);
    add(`face:${m.faceId||'aynaKrom'}`,Math.max(0,front-file));
    add(`file:${state.fileli?.fileMaterial||m.faceId||'aynaKrom'}`,file);
    add(`side:${m.sideId||m.faceId||'aynaKrom'}`,metrics?.sidewallAreaM2);
    add('acrylic:opalPleksi',metrics?.acrylicAreaM2);
  }
  const hasParts=nonNegative(metrics?.componentCount)>0;
  const isLit=nonNegative(metrics?.totalLedModules)>0;
  const mountingId=cfg.mountingId||'duvar';
  const painted=(state.objects||[]).some(o=>o.faceMaterial==='boyaliAluminyum'||o.sideMaterial==='boyaliAluminyum')
    || state.materials?.faceId==='boyaliAluminyum'||state.materials?.sideId==='boyaliAluminyum';
  const polished=(state.objects||[]).some(o=>['aynaAltin','aynaKrom','siyahKrom','roseGold'].includes(o.faceMaterial))
    || ['aynaAltin','aynaKrom','siyahKrom','roseGold'].includes(state.materials?.faceId);
  const costUnitHours=finite(cfg.unitCosts?.estimatedHours,6);
  const processQuantities = {
    cutting:metrics?.cuttingLengthM,bending:metrics?.perimeterM,welding:metrics?.perimeterM,
    finishing:hasParts?1:0,polishing:hasParts&&polished?1:0,
    painting:painted?metrics?.sidewallAreaM2:0,
    leds:metrics?.totalLedModules,psu:metrics?.powerSupplies,
    electrical:isLit?1:0,labor:hasParts?costUnitHours:0,
    machine:hasParts?1:0,transport:hasParts&&mountingId!=='yok'?1:0,
    install:hasParts&&mountingId!=='yok'?(mountingId==='profil'?1.25:1):0,
    other:hasParts?1:0,
  };
  for(const p of PROCESS_PRICE_ROWS)add(p.key,processQuantities[p.key.split(':')[1]]);
  for(const extra of cfg.extraItems || []){
    if(!extra?.id || extra.disabled)continue;
    const key=`extra:${extra.id}`;
    const qty=nonNegative(extra.qty);
    if(!qty)continue;
    const buy=normalizeRate(extra.buy,{value:0,currency:'TRY'},'TRY');
    const sell=normalizeRate(extra.sell,{value:0,currency:'TRY'},'TRY');
    lineMap.set(key,{key,label:String(extra.label||'Ek Kalem'),group:'diğer',unit:String(extra.unit||'adet'),quantity:qty,card:{buy,sell}});
  }
  const lines=[...lineMap.values()].map(row=>{
    const qty=round6(row.quantity);
    const included=cfg.excludedCostKeys?.[row.key]!==true;
    const buyUnit=toTargetCurrency(row.card.buy.value,row.card.buy.currency,curr,rates);
    const saleUnit=toTargetCurrency(row.card.sell.value,row.card.sell.currency,curr,rates);
    return {
      key:row.key,label:row.label,group:row.group,unit:row.unit,quantity:qty,
      qty:`${Number(qty.toFixed(qty>=10?2:4))} ${row.unit}`,
      buyRate:row.card.buy,sellRate:row.card.sell,buyUnit,saleUnit,
      included,costAmount:included?qty*buyUnit:0,sellAmount:included?qty*saleUnit:0,amount:included?qty*buyUnit:0,
    };
  });
  const directCost=lines.reduce((a,l)=>a+l.costAmount,0);
  const overheadAmount=directCost*Math.max(0,finite(cfg.overheadPct))/100;
  const totalCost=directCost+overheadAmount;
  const baseSales=lines.reduce((a,l)=>a+l.sellAmount,0);
  let preDiscountPrice=baseSales;
  if(cfg.pricingMode==='margin'){
    const m=Math.min(95,Math.max(0,finite(cfg.marginPct)))/100;
    preDiscountPrice=totalCost/Math.max(.05,1-m);
  } else if(cfg.pricingMode==='markup'){
    preDiscountPrice=totalCost*(1+Math.max(0,finite(cfg.markupPct))/100);
  }
  const discountAmount=preDiscountPrice*Math.min(100,Math.max(0,finite(cfg.discountPct)))/100;
  const manualAdj=finite(cfg.manualAdjustment);
  const subtotal=Math.max(0,preDiscountPrice-discountAmount+manualAdj);
  const vatRate=Math.max(0,finite(cfg.vatRate,0.2));
  const vatAmount=subtotal*vatRate;
  const grandTotal=subtotal+vatAmount;
  const profitAmount=subtotal-totalCost;
  const profitMarginPct=subtotal?profitAmount/subtotal*100:0;
  return {
    currency:curr,lines,directCost,overheadAmount,totalCost,baseSales,preDiscountPrice,
    discountAmount,manualAdj,subtotal,vatRate,vatAmount,grandTotal,
    profitAmount,netProfit:profitAmount,profitMarginPct,
    materialCost:lines.filter(l=>l.key.startsWith('face:')||l.key.startsWith('side:')||l.key.startsWith('file:')||l.key.startsWith('acrylic:')).reduce((a,l)=>a+l.costAmount,0),
    ledCost:lines.filter(l=>['process:leds','process:psu','process:electrical'].includes(l.key)).reduce((a,l)=>a+l.costAmount,0),
    laborCost:lines.filter(l=>['process:cutting','process:labor','process:welding','process:bending','process:finishing','process:machine'].includes(l.key)).reduce((a,l)=>a+l.costAmount,0),
  };
}
