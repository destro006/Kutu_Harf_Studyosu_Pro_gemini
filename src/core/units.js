/**
 * CorelDRAW-style display units. All source CAD geometry remains in millimeters.
 * CSS pixels use 96 DPI; typographic points use 72 per inch.
 */
export const DISPLAY_UNITS = Object.freeze([
  {id:'mm',label:'Milimetre (mm)',mmPerUnit:1},
  {id:'cm',label:'Santimetre (cm)',mmPerUnit:10},
  {id:'m',label:'Metre (m)',mmPerUnit:1000},
  {id:'in',label:'İnç (in)',mmPerUnit:25.4},
  {id:'pt',label:'Punto (pt)',mmPerUnit:25.4/72},
  {id:'px',label:'Piksel (px · 96 DPI)',mmPerUnit:25.4/96},
]);
const FACTORS=Object.fromEntries(DISPLAY_UNITS.map(u=>[u.id,u.mmPerUnit]));
export const PAGE_SIZE_PRESETS = Object.freeze([
  {id:'custom',label:'Özel Ebat',widthMm:2000,heightMm:1000},
  {id:'A4',label:'A4 · 210 × 297 mm',widthMm:210,heightMm:297},
  {id:'A3',label:'A3 · 297 × 420 mm',widthMm:297,heightMm:420},
  {id:'A2',label:'A2 · 420 × 594 mm',widthMm:420,heightMm:594},
  {id:'A1',label:'A1 · 594 × 841 mm',widthMm:594,heightMm:841},
  {id:'A0',label:'A0 · 841 × 1189 mm',widthMm:841,heightMm:1189},
  {id:'2000x1000',label:'Tabela · 2000 × 1000 mm',widthMm:2000,heightMm:1000},
  {id:'3000x1500',label:'Tabela · 3000 × 1500 mm',widthMm:3000,heightMm:1500},
]);
export const normalizeDisplayUnit = unit => Object.hasOwn(FACTORS,unit)?unit:'mm';
export const displayUnitLabel = unit => normalizeDisplayUnit(unit);
export function mmToDisplay(mm,unit='mm') {
  const n=Number(mm);
  return Number.isFinite(n)?n/FACTORS[normalizeDisplayUnit(unit)]:NaN;
}
export function displayToMm(value,unit='mm') {
  if(value==null||String(value).trim()==='')return NaN;
  const n=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(n)?n*FACTORS[normalizeDisplayUnit(unit)]:NaN;
}
export function formatMmAsUnit(mm,unit='mm') {
  const v=mmToDisplay(mm,unit);
  if(!Number.isFinite(v))return '';
  return String(Number(v.toFixed(6)));
}
