/** Separate, persistent Nesting source tabs: main sign geometry and imported vector jobs. */
export const NESTING_TAB_FIELDS = [
  'sheetWidthMm','sheetHeightMm','marginMm','marginLeftMm','marginRightMm','marginTopMm','marginBottomMm',
  'clearanceMm','spacingMm','kerfMm','allowedAngles','fineAngleStep','rotationStepDeg',
  'placementStrategy','previewColors','copies','grainDirection','targetPart','allowHoleNesting',
  'groupByMaterial','enforceGrainDirection','presetId','sheets','unplaced',
];
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const asName = value => String(value||'Dosya').slice(0,90);
export function snapshotNestingTab(n) {
  return Object.fromEntries(NESTING_TAB_FIELDS.map(k => [k, clone(n[k])]));
}
export function syncActiveNestingTab(n) {
  if (!n || !Array.isArray(n.importedTabs)) return;
  const tabId=n.activeTabId || 'design';
  if(tabId === 'import') return;
  const snapshot=snapshotNestingTab(n);
  if(tabId==='design') n.designTabSnapshot=snapshot;
  else {
    const tab=n.importedTabs.find(x=>x.id===tabId);
    if(tab)tab.settings=snapshot;
  }
}
export function switchNestingTab(n, nextTabId) {
  n.importedTabs ||= [];
  if(nextTabId!=='design'&&nextTabId!=='import'&&!n.importedTabs.some(t=>t.id===nextTabId)) return false;
  const previous=n.activeTabId||'design';
  if(previous===nextTabId)return true;
  syncActiveNestingTab(n);
  if(nextTabId==='import') {n.activeTabId='import';return true;}
  const source=nextTabId==='design'?n.designTabSnapshot:n.importedTabs.find(t=>t.id===nextTabId)?.settings;
  if(source)for(const field of NESTING_TAB_FIELDS)if(Object.hasOwn(source,field))n[field]=clone(source[field]);
  n.activeTabId=nextTabId;
  return true;
}
export function openNestingImportTab(n) {return switchNestingTab(n,'import');}
export function createNestingImportedTab(n, imported, options={}) {
  if(!Array.isArray(imported?.items)||!imported.items.length)throw Error('Vektör dosyasında kapalı kesim konturu bulunamadı.');
  n.importedTabs ||= [];
  syncActiveNestingTab(n);
  const id = options.id || ('nest_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6));
  if(n.importedTabs.some(t=>t.id===id))throw Error('Bu nesting sekme kimliği zaten kullanımda.');
  const tab={id,name:asName(imported.filename||options.name),format:imported.format||'vector',
    items:clone(imported.items),warnings:clone(imported.warnings||[]),
    settings:{...snapshotNestingTab(n),sheets:[],unplaced:[]}};
  n.importedTabs.push(tab);
  for(const field of NESTING_TAB_FIELDS)if(Object.hasOwn(tab.settings,field))n[field]=clone(tab.settings[field]);
  n.activeTabId=id;
  return tab;
}
export function getActiveNestingImportedItems(n) {
  if(!n||!n.activeTabId||['design','import'].includes(n.activeTabId))return null;
  const tab=n.importedTabs?.find(t=>t.id===n.activeTabId);
  if(!tab)return null;
  const copies=Math.max(1,Math.min(500,Number(n.copies)||1));
  return Array.from({length:copies},(_,i)=>tab.items.map(item=>({...clone(item),id:item.id+'_copy'+i}))).flat();
}
export function closeNestingImportedTab(n,id) {
  const tab=n.importedTabs?.find(t=>t.id===id);
  if(!tab)return false;
  if(n.activeTabId===id)switchNestingTab(n,'design');
  n.importedTabs=n.importedTabs.filter(t=>t.id!==id);
  return true;
}
export function getNestingTabTitle(n) {
  if(!n?.activeTabId||n.activeTabId==='design')return 'Bu Proje';
  if(n.activeTabId==='import')return 'Dosya İçe Aktar';
  return n.importedTabs?.find(t=>t.id===n.activeTabId)?.name||'Vektör dosyası';
}
