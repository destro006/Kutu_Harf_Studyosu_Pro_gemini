import THREE from './vendor/three.js';
import { buildChannelComponent } from './geometry/ChannelLetterGeometry.js';
import { StateStore, createDefaultState, createObjectId, structuredCloneSafe } from './core/state.js';
import { DocumentManager } from './core/DocumentManager.js';
import { Vector2DCanvas } from './cad/Vector2DCanvas.js';
import { ContextMenu } from './ui/ContextMenu.js';
import { renderPropertyBar } from './ui/PropertyBar.js';
import { polygonSize, nominalSize, roundMm, resizeObjectToMm } from './core/ObjectDimensions.js';
import { PAGE_SIZE_PRESETS, normalizeDisplayUnit, formatMmAsUnit, displayToMm } from './core/units.js';
import { attachMenuBar } from './ui/MenuBar.js';
import { renderNestingCenter, renderCncCenter, renderCostCenter } from './ui/CentralWorkspaces.js';
import { generateNestedGcode, generateNestedHpgl } from './export/CncGcodeExporter.js';
import { HistoryManager } from './core/history.js';
import {
  deserializeProject,
  deleteSavedProject,
  listSavedProjects,
  readAutosave, readAutosaveIndexedDb,
  saveProjectToBrowser,
  serializeProject,
  writeAutosave,
} from './core/projectSerializer.js';
import { FontManager } from './geometry/FontManager.js';
import { generateCutoutPreview, parseSvgLogo, traceRasterLogo } from './geometry/LogoTracer.js';
import { SignEngine, QUALITY_PROFILES } from './render/SignEngine.js';
import { ACRYLIC_PALETTE, MATERIAL_PRESETS, PAINT_PALETTE } from './render/MaterialLibrary.js';
import { RAL_COLORS, RAL_GROUPS } from './render/RalColors.js';
import { ENVIRONMENT_PRESETS } from './render/EnvironmentManager.js';
import { LIGHT_COLOR_PRESETS, LIGHTING_MODES } from './render/LightingSystem.js';
import { BACKGROUND_SCENES } from './photomontage/BackgroundLibrary.js';
import { PhotomontageOverlay } from './ui/PhotomontageOverlay.js';
import { renderNestingSvg } from './ui/NestingView.js';
import { applySurfaceMaterialPreset, getDisplayedSurfaceMaterial } from './core/MaterialActions.js';
import { getExportSelection } from './export/ExportScope.js';
import { EXPORT_FORMAT_GROUPS, getExportFormat, formatSupportsSource } from './export/ExportFormatCatalog.js';
import { runProfessionalExport } from './export/ProfessionalExportController.js';
import {
  assignMaterialToSelected,
  deleteSelectedLayers,
  duplicateSelectedLayers,
  groupSelectedLayers,
  renameLayer,
  reorderLayer,
  selectLayer,
  toggleLayerLock,
  toggleLayerVisibility,
  ungroupSelectedLayers,
} from './cad/LayerManager.js';
import {
  alignSelectedObjects,
  applyBooleanToSelected,
  convertObjectToCurves,
  createShapeObject,
  distributeSelectedObjects,
  mirrorSelectedObjects,
  offsetPolygonObject,
  breakApartObjectToLetters,
  addNodeToPolygon,
  deleteNodeFromPolygon,
  reversePolygonPath,
  combineSelectedToCompound,
} from './cad/CadTools.js';
import { SHORTCUT_LIST, SHORTCUT_GROUPS, attachShortcuts } from './cad/Shortcuts.js';
import { captureObjectClipboard, pasteObjectClipboard } from './core/ObjectClipboard.js';
import { calculateManufacturingMetrics } from './manufacturing/MetricsCalculator.js';
import { SHEET_PRESETS, extractNestingItems, runTrueShapeNesting, validateSheetLayout, editNestingPlacement, refreshNestingSheet } from './manufacturing/NestingEngine.js';
import { importVectorText } from './manufacturing/VectorFileImport.js';
import { importPdfFile } from './manufacturing/PdfVectorImport.js';
import { runVectorImportJob } from './manufacturing/AsyncVectorImport.js';
import {
  createNestingImportedTab, getActiveNestingImportedItems, openNestingImportTab,
  switchNestingTab, closeNestingImportedTab, syncActiveNestingTab, applyNestingPartOverrides,
} from './manufacturing/NestingTabs.js';
import { calculateProjectCosts, formatMoney, getPriceCard, listPriceCatalog, changeRateCurrency } from './manufacturing/CostEngine.js';
import { buildQuoteHtml } from './manufacturing/QuoteGenerator.js';
import {
  downloadBlob,
  downloadDataUrl,
  generateManufacturingDxf,
  generateManufacturingSvg,
  generateNestedCsv,
  generateNestedDxf,
  generateNestedSvg,
} from './export/ExportService.js';

const FILELI_PRESET_WIDTHS = [0, 3, 5, 8, 12, 15, 20, 25, 30];
const USER_DEFAULTS_KEY = 'khs_user_defaults_v1';

const CONSTRUCTION_TYPES = [
  { id: 'fileli', label: 'Fileli Kutu Harf', desc: 'İçe dönük metal file çerçeve + içeride pleksi yüz, opak yan bant.' },
  { id: 'pleksi', label: 'Pleksi Kutu Harf', desc: 'Tam pleksi yüz, içten LED. Yüz seçtiğiniz ışık rengiyle parlar.' },
  { id: 'metal', label: 'Krom / Metal Kutu Harf', desc: 'Ayna veya mat krom, fırçalı altın-gümüş. İsteğe bağlı halo ışık.' },
  { id: 'halo', label: 'Arkadan Işıklı (Halo)', desc: 'Yüz kapalı, LED ışığı harfin arkasından duvara vurur.' },
  { id: 'isiksiz', label: 'Işıksız Kutu Harf', desc: 'Boyalı alüminyum veya metal, aydınlatmasız ekonomik seçenek.' },
];

const docManager = new DocumentManager();
// IndexedDB keeps large imported nesting jobs local, beyond localStorage quotas.
const autosaved = await readAutosaveIndexedDb() || readAutosave();
if (autosaved) {
  docManager.getActiveStore().set(autosaved);
  docManager.getActiveDoc().title = autosaved.projectName || 'Yeni Tabela Projesi';
} else {
  applySavedMaterialDefaults(docManager.getActiveStore());
}

// Personal presets apply to fresh projects; restored projects retain their own finish.
function applySavedMaterialDefaults(targetStore) {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_DEFAULTS_KEY) || 'null');
    if (!saved?.materials || !saved?.lighting || !saved?.render) return;
    targetStore.update(s => {
      for (const key of ['materials', 'materialOverrides', 'lighting', 'render']) {
        if (saved[key] && typeof saved[key] === 'object') {
          s[key] = { ...s[key], ...saved[key] };
        }
      }
      for (const o of s.objects || []) {
        o.faceMaterial = s.materials.faceId;
        o.faceColor = s.materials.faceColor;
        o.sideMaterial = s.materials.sideId;
        o.sideColor = s.materials.sideColor;
        o.sideFollowsFace = s.materials.sideFollowsFace;
        o.lightingMode = s.lighting.mode;
      }
    });
  } catch { /* Use built-in defaults when browser storage is unavailable. */ }
}
const store = {
  get: () => docManager.getActiveStore().get(),
  set: (s, m) => docManager.getActiveStore().set(s, m),
  update: (fn, m) => docManager.getActiveStore().update(fn, m),
  updateScoped:(keys,fn)=>docManager.getActiveStore().updateScoped(keys,fn),
  updateObject:(id,fn,deep=false)=>docManager.getActiveStore().updateObject(id,fn,deep),
};
const history = {
  push: (s, l) => docManager.getActiveHistory().push(s, l),
  undo: (s) => docManager.getActiveHistory().undo(s),
  redo: (s) => docManager.getActiveHistory().redo(s),
  canUndo: () => docManager.getActiveHistory().canUndo(),
  canRedo: () => docManager.getActiveHistory().canRedo(),
};
let vector2D = null;
let contextMenu = null;
let activeSheetIdx = 0;
const fontManager = new FontManager();
const fontMap = new Map();
window.__khsFontMap = fontMap;

let signEngine = null;
let ensureSignEngine=()=>signEngine;
const is3DWorkspace=state=>['model3d','materials'].includes(state.mainWorkspace||'model3d');
let sceneDataKey=null;
let photomontageOverlay = null;
let lastSceneResult = { sizeM: { w: 2, h: 0.4 }, metricsList: [], warnings: [] };
let lastMetrics = calculateManufacturingMetrics([], store.get());
let lastCosts = calculateProjectCosts(lastMetrics, store.get());
let lastNesting = null;
let lastPhotomontageScene=null,lastPhotomontageUrl=null;
let selectedNestingId = null;
let objectClipboard = null;
let activeCostTab = 'summary';
let activeCostRole = 'face';
const PRICE_TEMPLATE_STORAGE = 'khs_pricebook_template_v1';

function setDocumentClipboardStatus(message) {
  const el = document.getElementById('docClipboardStatus');
  if (el) el.textContent = message;
}
function copySelectionToClipboard(includeLocked = true) {
  if(store.get().mainWorkspace==='nesting')return false;
  const next = captureObjectClipboard(store.get(), { includeLocked, sourceDocumentId: docManager.activeDocId });
  if (!next) {
    setDocumentClipboardStatus('Önce bir nesne seçin');
    return false;
  }
  objectClipboard = next;
  setDocumentClipboardStatus(`${next.objects.length} nesne kopyalandı`);
  return true;
}
function cutSelectionToClipboard() {
  if (copySelectionToClipboard(false)) mutate('Kes', s => deleteSelectedLayers(s));
}
function pasteSelectionFromClipboard() {
  if(store.get().mainWorkspace==='nesting')return;
  if (!objectClipboard) {
    setDocumentClipboardStatus('Panoda nesne yok');
    return;
  }
  const offsetMm = objectClipboard.sourceDocumentId === docManager.activeDocId ? 40 : 0;
  mutate('Yapıştır', s => pasteObjectClipboard(s, objectClipboard, { offsetMm }));
  setDocumentClipboardStatus(`${objectClipboard.objects.length} nesne bu sekmeye aktarıldı`);
}

let fontSearchQuery = '';
let matColorTab = 'basic';
let ralGroupFilter = 'all';
let ralSearchQuery = '';
let ralTargetPart = 'face';
let localFontStatus = '';
let localFontList = [];
let logoTraceOptions = { threshold: 0.5, bgTolerance: 45, smoothPasses: 1, removeBackground: true };
let penPoints = [];
let measurePoints = [];
let measureHover = null;
let measureDragging = false;
let dragBeforeState = null;
let liveUiFrame=0;
function scheduleLiveUi(){if(liveUiFrame)return;liveUiFrame=requestAnimationFrame(()=>{liveUiFrame=0;const state=store.get();updateStageChrome(state);updateNumericBar(state);});}
let editingNodeIdx = -1;

// Debounced scene rebuild
let rebuildTimer = null;
let rebuildRevision = 0;
/**
 * A failed WebGL context must never take down the 2D CAD editor, the layer
 * inspector or the manufacturing model. Derive metrics from the same vector
 * outlines, independent of Three.js's renderer.
 */
function computeSceneWithoutWebGL(state, loadedFonts, intentional=false) {
  const metricsList = [];
  const warnings = intentional?[]:['3D WebGL başlatılamadı. 2D Tasarım, nesting ve diğer kontur işlemleri kullanılabilir. Tarayıcının donanım hızlandırmasını kontrol edin.'];
  if (!vector2D) return { metricsList, warnings, sizeM: { w: 1.6, h: 0.4 } };
  for (const object of state.objects || []) {
    if (!object.visible) continue;
    try {
      const polygons = vector2D._getObjectPolysWorld(object, loadedFonts);
      for (const [index, poly] of polygons.entries()) {
        if (!poly.outer || poly.outer.length < 3) continue;
        const shape = new THREE.Shape();
        poly.outer.forEach((point, i) => i ? shape.lineTo(point.x, point.y) : shape.moveTo(point.x, point.y));
        shape.closePath();
        for (const hole of poly.holes || []) {
          const path = new THREE.Path();
          hole.forEach((point, i) => i ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y));
          path.closePath();
          shape.holes.push(path);
        }
        const build = buildChannelComponent([shape], {
          constructionType: object.constructionType || state.constructionType,
          depthMm: object.depthMm ?? state.dimensions?.depthMm ?? 80,
          bevelMm: state.materialOverrides?.bevelMm ?? 1.8,
          fileWidthMm: object.fileWidthMm ?? state.fileli?.fileWidthMm ?? 5,
          fileThicknessMm: state.fileli?.fileThicknessMm ?? 2,
          metalThicknessMm: state.fileli?.metalThicknessMm ?? 1,
          acrylicThicknessMm: state.fileli?.acrylicThicknessMm ?? 3,
          acrylicInsetMm: state.fileli?.acrylicInsetMm ?? 2.5,
          borderBevelMm: state.fileli?.borderBevelMm ?? 0.8,
        });
        metricsList.push({
          objectId: object.id,
          label: object.kind === 'text' ? `${object.name || 'Harf'} ${index + 1}` : object.name,
          ...build.metrics,
          depthMm: object.depthMm ?? state.dimensions?.depthMm ?? 80,
          constructionType: object.constructionType || state.constructionType,
          lightingMode: object.lightingMode || state.lighting?.mode,
          polygonsMm: build.polygonsMm,
          exportContours: build.exportContours,
          offsetXMm: 0,
          offsetYMm: 0,
        });
        warnings.push(...build.warnings);
        for (const geometry of [...build.outerGeos, ...build.fileGeos, ...build.acrylicGeos]) geometry.dispose();
      }
    } catch (error) {
      warnings.push(`${object.name || object.id}: ${error?.message || 'Geometri hesaplanamadı'}`);
    }
  }
  return { metricsList, warnings, sizeM: { w: 1.6, h: 0.4 } };
}

function scheduleRebuild(immediate = false) {
  clearTimeout(rebuildTimer);
  const revision = ++rebuildRevision;
  const run = async () => {
    let state = store.get();
    // Ensure all needed fonts are loaded
    const neededFonts = new Set(['cinzel', 'montserrat', ...state.objects.filter(o => o.kind === 'text').map(o => o.fontId || 'cinzel')]);
    for (const fid of neededFonts) {
      if (!fontMap.has(fid)) {
        try {
          fontMap.set(fid, await fontManager.loadFont(fid));
        } catch {
          // ignore
        }
      }
    }

    // A slower font load must not overwrite a newer edit or document switch.
    if (revision !== rebuildRevision) return;
    state=store.get(); // keep intervening view/price changes during async font loading
    try {
      // Outside 3D, calculate only the CPU manufacturing data when needed.
      if(is3DWorkspace(state)){
        const engine=ensureSignEngine();
        lastSceneResult=engine&&!engine.isDisposed?engine.updateScene(state,fontMap):computeSceneWithoutWebGL(state,fontMap);
        sceneDataKey=null;
      }else{
        const key=[docManager.activeDocId,state.activePageId,state.objects,state.dimensions,state.fileli,state.materialOverrides,state.lighting,state.constructionType];
        if(!sceneDataKey||key.some((v,i)=>v!==sceneDataKey[i])){
          lastSceneResult=computeSceneWithoutWebGL(state,fontMap,true);sceneDataKey=key;
        }
      }
      if (!lastSceneResult?.metricsList) throw new Error('Geçerli sahne verisi oluşturulamadı.');
    } catch (error) {
      console.error('Kutu Harf Stüdyosu: 3D sahne güncellenemedi', error);
      lastSceneResult = computeSceneWithoutWebGL(state, fontMap);
      lastSceneResult.warnings.unshift('3D sahne hatası: ' + (error?.message || 'Bilinmeyen hata'));
    }
    lastMetrics = calculateManufacturingMetrics(lastSceneResult.metricsList, state);
    lastCosts = calculateProjectCosts(lastMetrics, state);
    if (vector2D && state.mainWorkspace === 'design2d') {
      vector2D.render(state, fontMap);
    }
    updateStageChrome(state);
    updateNumericBar(state);
    renderDocumentTabs();
    renderPageTabs();
    updateCenterWorkspaces(state);
    writeAutosave(state);
    drawCadOverlay(state);
  };
  const safeRun = () => run().catch(error => {
    console.error('Kutu Harf Stüdyosu: çalışma alanı yenileme hatası', error);
    const warning = document.getElementById('stageWarning');
    if (warning) { warning.textContent = 'Çalışma alanı hatası: ' + (error?.message || 'Bilinmeyen hata'); warning.classList.remove('hidden'); }
  });
  rebuildTimer=setTimeout(safeRun,immediate?16:80);
}

function mutate(label, fn, renderWorkspace = true, rebuildScene=true) {
  history.push(store.get(), label);
  store.update(s => {
    fn(s);
    syncActiveNestingTab(s.nesting);
  });
  docManager.markDirty();
  updateUndoRedoButtons();
  if(rebuildScene)scheduleRebuild(true);
  else{const state=store.get();lastCosts=calculateProjectCosts(lastMetrics,state);updateStageChrome(state);updateNumericBar(state);updateCenterWorkspaces(state);writeAutosave(state);}
  if (renderWorkspace) renderActiveWorkspace();
}
function mutateData(label,fn,renderWorkspace=false){return mutate(label,fn,renderWorkspace,false);}

function updateUndoRedoButtons() {
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if (u) u.disabled = !history.canUndo();
  if (r) r.disabled = !history.canRedo();
}

const objectSizeCache=new WeakMap(),textSizeCache=new Map();
function objectPhysicalSize(o){
  if(!o)return null;
  const key=o.kind==='text'?JSON.stringify([o.fontId,o.text,o.heightMm,o.letterSpacingMm,o.lineSpacingMult,o.textAlign]):null;
  const source=o.kind==='polygon'?o.polygonsMm:o.kind==='logo'?o.logoData:o;
  const font=key?fontMap.get(o.fontId||'cinzel'):null;
  let entry=key?textSizeCache.get(key):source?objectSizeCache.get(source):null;
  if(entry&&(entry.font!==font||entry.height!==o.heightMm||entry.width!==o.widthMm||entry.radius!==o.cornerRadiusMm))entry=null;
  if(!entry&&vector2D&&(!key||font)){
    const size=polygonSize(vector2D._getObjectPolysWorld({...o,xMm:0,yMm:0,rotationDeg:0,scaleX:1,scaleY:1,mirrorX:false,mirrorY:false},fontMap));
    if(size?.widthMm>0&&size?.heightMm>0){
      entry={size,font,height:o.heightMm,width:o.widthMm,radius:o.cornerRadiusMm};
      if(key){if(textSizeCache.size>=128)textSizeCache.delete(textSizeCache.keys().next().value);textSizeCache.set(key,entry);}
      else if(source)objectSizeCache.set(source,entry);
    }
  }
  return entry?{widthMm:entry.size.widthMm*Math.abs(o.scaleX??1),heightMm:entry.size.heightMm*Math.abs(o.scaleY??1)}:nominalSize(o);
}
function syncInspectorDimensions(state){
  const obj=getSelectedOrFirst(state),size=objectPhysicalSize(obj),unit=normalizeDisplayUnit(state.pageLayout?.displayUnit);
  for(const [id,value] of [['wsHeightMm',size?.heightMm??state.dimensions.heightMm],['wsWidthMm',size?.widthMm],['wsDepthMm',obj?.depthMm??state.dimensions.depthMm],['wsSpacingMm',obj?.letterSpacingMm??state.dimensions.letterSpacingMm]]){
    for(const el of document.querySelectorAll('#'+id))if(value!=null&&document.activeElement!==el)el.value=formatMmAsUnit(roundMm(value),unit);
  }
}
function updateStageChrome(state) {
  const selObj = state.objects.find(o => state.selectedIds.includes(o.id)) || state.objects[0];
  const selected=state.objects.filter(o=>state.selectedIds.includes(o.id));
  const size=selected.length===1?objectPhysicalSize(selected[0]):null;
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(roundMm(mm),unit);
  document.getElementById('dimHeight').textContent=size?`${show(size.heightMm)} ${unit}`:'—';
  document.getElementById('dimTotal').textContent=size?`${show(size.widthMm)} × ${show(size.heightMm)} ${unit}`:`${show(lastMetrics.totalWidthMm)} × ${show(lastMetrics.totalHeightMm)} ${unit}`;
  document.getElementById('dimTotal').title=size?'Seçili nesnenin gerçek ebatı':'Projenin toplam ebatı';
  syncInspectorDimensions(state);

  const fileBadge = document.getElementById('dimFileBadge');
  const isFileli = (selObj?.constructionType || state.constructionType) === 'fileli';
  fileBadge.classList.toggle('hidden', !isFileli);
  document.getElementById('dimFile').textContent = `${show(selObj?.fileWidthMm ?? state.fileli.fileWidthMm)} ${unit}`;

  document.getElementById('headerTotalBadge').textContent = formatMoney(lastCosts.grandTotal, lastCosts.currency);
  const pni = document.getElementById('projectNameInput'); if (pni) pni.value = state.projectName;

  // Warning banner
  const warnEl = document.getElementById('stageWarning');
  if (lastSceneResult.warnings.length) {
    warnEl.textContent = lastSceneResult.warnings[0];
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }

  const qualitySelect = document.getElementById('qualitySelect');
  if (qualitySelect) qualitySelect.value = state.quality || 'high';
  const qStatus = document.getElementById('qualityStatus');
  if (qStatus) {
    const qualityLabels = {performance:'Performans',balanced:'Dengeli',high:'Yüksek',ultra:'Ultra'};
    const info = signEngine?.getQualityInfo?.();
    qStatus.textContent = '3D: ' + (qualityLabels[state.quality] || 'Yüksek') + (info ? ' · ' + info.pixelRatio.toFixed(2) + '×' : '');
    qStatus.title = info ? 'Gerçek render ölçeği: ' + info.pixelRatio.toFixed(2) + '×; gölge dokusu: ' + info.shadowSize + ' px' : '3D render kullanılamıyor';
  }

  // Day/Night & Light buttons
  document.getElementById('btnDay').classList.toggle('on', !state.scene.night);
  document.getElementById('btnNight').classList.toggle('on', state.scene.night);
  const lightBtn = document.getElementById('btnLightToggle');
  lightBtn.classList.toggle('on', state.lighting.enabled);
  document.getElementById('lightDot').style.setProperty('--c', state.lighting.colorHex);
  document.getElementById('lightToggleLabel').textContent = state.lighting.enabled ? 'Işık açık' : 'Işık kapalı';

  // Wall buttons
  const quickWallSelect=document.getElementById('quickWallSelect');if(quickWallSelect)quickWallSelect.value=state.scene.wallId;
  document.querySelectorAll('#quickWallSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.wall === state.scene.wallId);
  });

  // Photomontage preview sync
  if(is3DWorkspace(state)&&state.activeWorkspace==='background'&&state.photomontage.photoUrl&&signEngine&&!signEngine.isDisposed){
    if(!dragBeforeState&&lastPhotomontageScene!==lastSceneResult){
      lastPhotomontageUrl=signEngine.capturePng(900,560,{transparent:true});lastPhotomontageScene=lastSceneResult;
    }
    if(lastPhotomontageUrl)photomontageOverlay?.render(state,lastPhotomontageUrl);
  }else photomontageOverlay?.container.classList.add('hidden');
}

function updateNumericBar(state) {
  renderPropertyBar(state, {
    activeSheetIdx,
    selectedPlacementId: selectedNestingId,
    fonts: fontManager.getAllFontMetas(),
    getObjectSize: objectPhysicalSize,
    onEditSelected: (fn) => mutate('Özellik düzenlendi', s => {
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) fn(o);
    }),
    onCadAction: (act) => runCadAction(act),
    onTool: (t) => activateTool(t),
    onAlign: (m) => mutate('Hizalama', s => alignSelectedObjects(s, m)),
    onDistribute: (ax) => mutate('Dağıtma', s => distributeSelectedObjects(s, ax)),
    onRefreshBar: () => updateNumericBar(store.get()),
    onDisplayUnit: unit => {
      const safeUnit = normalizeDisplayUnit(unit);
      store.updateScoped(['pageLayout'],s => { s.pageLayout.displayUnit = safeUnit; });
      // Unit switching only changes the presentation of dimensions; the model remains in mm.
      updateStageChrome(store.get());
      updateNumericBar(store.get());
      renderActiveWorkspace();
      if (store.get().mainWorkspace === 'design2d') vector2D?.render(store.get(), fontMap);
      writeAutosave(store.get());
    },
    onPagePreset: id => {
      const preset = PAGE_SIZE_PRESETS.find(p => p.id === id);
      if (!preset) return;
      mutate('Sayfa ebadı', s => {
        s.pageLayout.preset = id;
        if (preset.widthMm && preset.heightMm) {
          const landscape = s.pageLayout.widthMm >= s.pageLayout.heightMm;
          s.pageLayout.widthMm = landscape ? Math.max(preset.widthMm, preset.heightMm) : Math.min(preset.widthMm, preset.heightMm);
          s.pageLayout.heightMm = landscape ? Math.min(preset.widthMm, preset.heightMm) : Math.max(preset.widthMm, preset.heightMm);
          const page = s.pages?.find(p => p.id === s.activePageId);
          if (page) { page.widthMm = s.pageLayout.widthMm; page.heightMm = s.pageLayout.heightMm; }
        }
      });
    },
    onPageSize: (w, h) => mutate('Sayfa ölçüsü', s => {
      const p = s.pages?.find(x => x.id === s.activePageId);
      if (w !== null && Number.isFinite(w) && w > 0) { s.pageLayout.widthMm = Math.max(1, w); if (p) p.widthMm = s.pageLayout.widthMm; }
      if (h !== null && Number.isFinite(h) && h > 0) { s.pageLayout.heightMm = Math.max(1, h); if (p) p.heightMm = s.pageLayout.heightMm; }
      s.pageLayout.preset = 'custom';
    }),
    onTogglePageOrient: () => mutate('Sayfa yönü', s => {
      const w = s.pageLayout.widthMm;
      s.pageLayout.widthMm = s.pageLayout.heightMm;
      s.pageLayout.heightMm = w;
      const p = s.pages?.find(x => x.id === s.activePageId);
      if (p) { p.widthMm = s.pageLayout.widthMm; p.heightMm = s.pageLayout.heightMm; }
    }),
    onToggleGrid: (k) => { store.update(s => { s.grid[k] = !s.grid[k]; }); scheduleRebuild(true); },
    onTogglePageFrame: () => { store.update(s => { s.pageLayout.visible = !s.pageLayout.visible; }); scheduleRebuild(true); },
    onFitView: () => {
      if (store.get().mainWorkspace === 'design2d') vector2D?.fitAll(store.get());
      else signEngine?.setCameraPreset('fit');
    },
    onNestingPartEdit: (action, val) => {
      const sheets = store.get().nesting?.sheets || [];
      const sh = sheets[activeSheetIdx];
      const part = sh?.placements?.find(p => p.id === selectedNestingId);
      if (!part) return;
      mutateData('Nesting parça düzenleme', s => {
        const sSh = s.nesting.sheets[activeSheetIdx];
        const sPart = sSh?.placements?.find(p => p.id === selectedNestingId);
        if (!sPart) return;
        if (action === 'toggleLock') sPart.locked = !sPart.locked;
        else if(!sPart.locked&&['x','y','rot','width','height','scale'].includes(action))applyNestingEdit(s.nesting,sPart,action,val);
        else if(action==='moveSheet'&&!sPart.locked){
          const targetSh=s.nesting.sheets[val];
          if(targetSh&&targetSh!==sSh&&(!targetSh.materialGroup||targetSh.materialGroup===sPart.materialGroup)){
            const copy=structuredCloneSafe(sPart);
            if(validateSheetLayout({...targetSh,placements:[...targetSh.placements,copy]},(s.nesting.clearanceMm??5)+(s.nesting.kerfMm??.4)).valid){
              sSh.placements=sSh.placements.filter(p=>p.id!==sPart.id);targetSh.placements.push(copy);activeSheetIdx=val;
              sSh.usedAreaMm2=sSh.placements.reduce((a,p)=>a+p.areaMm2,0);
              targetSh.usedAreaMm2=targetSh.placements.reduce((a,p)=>a+p.areaMm2,0);
            }
          }
        }
        for(const sh of s.nesting.sheets)refreshNestingSheet(sh,nestingSeparation(s.nesting));
      });
    },
  });
  renderCanvasTransformHud(state);
}

/* ---------------- CAD 2D Overlay (Ruler, Pen, Node Editing, Measure) ---------------- */
function drawCadOverlay(state) {
  const canvas = document.getElementById('cadOverlay');
  const wrap = document.getElementById('stageWrap');
  if (!canvas || !wrap) return;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const tool = state.activeTool;
  canvas.classList.toggle('interactive', ['pen', 'node', 'measure'].includes(tool));

  // Ruler & Guides
  if (state.scene.showRuler) {
    ctx.fillStyle = 'rgba(15, 16, 20, 0.72)';
    ctx.fillRect(0, 0, canvas.width, 18);
    ctx.fillRect(0, 0, 18, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.fillStyle = '#989aa3';
    ctx.font = '9px sans-serif';
    for (let x = 20; x < canvas.width; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 18); ctx.stroke();
      ctx.fillText(String(x), x + 2, 10);
    }
    for (let y = 20; y < canvas.height; y += 50) {
      ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(18, y); ctx.stroke();
    }
  }

  // Pen tool preview
  if (tool === 'pen' && penPoints.length) {
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 2;
    ctx.beginPath();
    penPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
    ctx.stroke();
    for (const p of penPoints) {
      ctx.fillStyle = '#ffb547';
      ctx.fillRect(p.sx - 4, p.sy - 4, 8, 8);
    }
  }

  // Live Measure tool (hover crosshair + click-and-drag live dimension line)
  if (tool === 'measure') {
    if (measureHover && !measureDragging) {
      const { sx, sy, mmX, mmY } = measureHover;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx - 14, sy); ctx.lineTo(sx + 14, sy);
      ctx.moveTo(sx, sy - 14); ctx.lineTo(sx, sy + 14);
      ctx.stroke();
      ctx.setLineDash([]);
      const lbl = `X: ${Math.round(mmX)} mm  Y: ${Math.round(mmY)} mm`;
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(lbl).width + 14;
      const bx = Math.min(canvas.width - tw - 8, sx + 14);
      const by = Math.max(24, sy - 26);
      ctx.fillStyle = 'rgba(15, 16, 20, 0.92)';
      ctx.fillRect(bx, by, tw, 22);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(bx, by, tw, 22);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(lbl, bx + 7, by + 15);
    }
    if (measurePoints.length) {
      const p0 = measurePoints[0];
      const p1 = measurePoints[1] || measureHover;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(p0.sx, p0.sy, 4, 0, Math.PI * 2); ctx.fill();
      if (p1) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(p1.sx, p1.sy, 4, 0, Math.PI * 2); ctx.fill();

        const dx = Math.round(p1.mmX - p0.mmX);
        const dy = Math.round(p1.mmY - p0.mmY);
        const dist = Math.round(Math.hypot(dx, dy));
        const lbl = `📏 ${dist} mm  (ΔX: ${Math.abs(dx)}  ΔY: ${Math.abs(dy)})`;
        ctx.font = 'bold 12px sans-serif';
        const tw = ctx.measureText(lbl).width + 16;
        const anchorX = measureDragging ? p1.sx + 14 : (p0.sx + p1.sx) / 2 - tw / 2;
        const anchorY = measureDragging ? p1.sy - 28 : (p0.sy + p1.sy) / 2 - 14;
        const bx = Math.max(22, Math.min(canvas.width - tw - 8, anchorX));
        const by = Math.max(24, Math.min(canvas.height - 28, anchorY));
        ctx.fillStyle = 'rgba(15, 16, 20, 0.94)';
        ctx.fillRect(bx, by, tw, 24);
        ctx.strokeStyle = '#ffb547';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, by, tw, 24);
        ctx.fillStyle = '#ffb547';
        ctx.fillText(lbl, bx + 8, by + 16);
      }
    }
  }

  // Node editing handles on selected polygon
  if (tool === 'node') {
    const sel = state.objects.find(o => state.selectedIds.includes(o.id) && o.kind === 'polygon' && o.polygonsMm?.length);
    if (sel) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const pxPerMm = 0.5;
      sel.polygonsMm[0].outer.forEach((pt, idx) => {
        const sx = cx + (pt.x + (sel.xMm || 0)) * pxPerMm;
        const sy = cy - (pt.y + (sel.yMm || 0)) * pxPerMm;
        ctx.fillStyle = idx === editingNodeIdx ? '#ef4444' : '#ffb547';
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
      });
    }
  }
}

/* ---------------- Workspace Renderer (All 9 Workspaces) ---------------- */
const WS_META = [
  { id: 'objects', label: 'Nesneler', fn: renderObjectsTreeDocker },
  { id: 'properties', label: 'Özellikler', fn: renderDesignWs },
  { id: 'layers', label: 'Katmanlar', fn: renderLayersWs },
  { id: 'materials', label: 'Malzemeler', fn: renderMaterialsAndLightDocker },
  { id: 'manufacturing', label: 'İmalat', fn: renderManufacturingDocker },
  { id: 'align', label: 'Hizalama', fn: renderAlignDocker },
  { id: 'background', label: 'Arka Plan / Cephe', fn: renderBackgroundWs },
  { id: 'projects', label: 'Projeler', fn: renderProjectsWs },
];

function renderObjectsTreeDocker(state) {
  const doc = docManager.getActiveDoc();
  const page = (state.pages || []).find(p => p.id === state.activePageId) || state.pages?.[0];
  const selSet = new Set(state.selectedIds || []);
  const iconFor = (k) => k === 'text' ? 'T' : k === 'rect' ? '▭' : k === 'ellipse' ? '◯' : k === 'logo' ? '🖼' : '∿';
  return `
    <section class="sec">
      <h3 class="sec-title">Belge &amp; Nesne Ağacı</h3>
      <div class="obj-tree">
        <div class="tree-node"><span>📁 <b>${escapeHtml(doc.title)}</b></span></div>
        <div class="tree-node tree-indent-1"><span>📄 ${escapeHtml(page?.name || 'Sayfa 1')}</span></div>
        ${(page?.layers || []).map(l => `
          <div class="tree-node tree-indent-2"><span>🗂 ${escapeHtml(l.name)}</span></div>
        `).join('')}
        ${(state.objects || []).map(o => `
          <div class="tree-node tree-indent-3 ${selSet.has(o.id) ? 'on' : ''}" data-tree-id="${o.id}">
            <button type="button" class="icon-btn" data-vis="${o.id}" title="Gizle/Göster">${o.visible ? '👁' : '🚫'}</button>
            <button type="button" class="icon-btn" data-lock="${o.id}" title="Kilitle">${o.locked ? '🔒' : '🔓'}</button>
            <span class="layer-name" data-sel="${o.id}">${iconFor(o.kind)} ${escapeHtml(o.name)}</span>
          </div>
        `).join('')}
      </div>
      ${(state.pages || []).length > 1 && state.selectedIds?.length ? `
        <div class="field-row" style="margin-top:8px">
          <label>Sayfaya Taşı</label>
          <select id="selMoveObjPage">
            <option value="">Hedef sayfa seçin...</option>
            ${state.pages.filter(p => p.id !== state.activePageId).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      ` : ''}
    </section>
  `;
}

function renderMaterialsAndLightDocker(state) {
  return renderMaterialsWs(state) + renderLightingWs(state);
}

function renderManufacturingDocker(state) {
  const obj = getSelectedOrFirst(state);
  const fw = obj?.fileWidthMm ?? state.fileli?.fileWidthMm ?? 5;
  return `
    <section class="sec">
      <h3 class="sec-title">Fileli &amp; İmalat Parametreleri</h3>
      <div class="field-row"><label>File Genişliği (mm)</label><input id="mfgFileW" type="number" min="0" max="40" value="${fw}"></div>
      <div class="field-row"><label>Kenar Çıta Ebatı (mm)</label><input id="mfgDepth" type="number" min="10" max="400" value="${obj?.depthMm ?? 80}"></div>
      <div class="field-row"><label>Pleksi Kalınlığı (mm)</label><input id="mfgAcThick" type="number" min="1" max="20" step="0.5" value="${state.fileli?.acrylicThicknessMm ?? 3}"></div>
      <div class="field-row"><label>Pleksi İçe Çökme (mm)</label><input id="mfgAcInset" type="number" min="0" max="20" step="0.5" value="${state.fileli?.acrylicInsetMm ?? 2.5}"></div>
      <div class="field-row"><label>Ön File Metal Yüksekliği (mm)</label><input id="mfgMetThick" type="number" min="0.5" max="5" step="0.1" value="${state.fileli?.fileThicknessMm ?? 2}"></div>
      <div class="field-row"><label>Yanak Sac Kalınlığı (mm)</label><input id="mfgWallThickness" type="number" min="0.2" max="3" step="0.1" value="${state.fileli?.metalThicknessMm ?? 1}"></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="cta-btn" id="mfgGoNest">Nesting'e Geç</button>
        <button type="button" class="sec-btn" id="mfgGoCnc">Üretim / CNC</button>
      </div>
    </section>
  `;
}

function renderAlignDocker() {
  return `
    <section class="sec">
      <h3 class="sec-title">Hizalama &amp; Dağıtma</h3>
      <div class="grid-2" style="gap:6px">
        <button type="button" class="sec-btn" data-dalign="left">◧ Sola Hizala</button>
        <button type="button" class="sec-btn" data-dalign="centerX">◫ Yatay Ortala</button>
        <button type="button" class="sec-btn" data-dalign="right">◨ Sağa Hizala</button>
        <button type="button" class="sec-btn" data-dalign="top">⊤ Üste Hizala</button>
        <button type="button" class="sec-btn" data-dalign="centerY">⊟ Dikey Ortala</button>
        <button type="button" class="sec-btn" data-dalign="bottom">⊥ Alta Hizala</button>
        <button type="button" class="sec-btn" data-ddist="x">⋯ Yatay Dağıt</button>
        <button type="button" class="sec-btn" data-ddist="y">⋮ Dikey Dağıt</button>
      </div>
      <h3 class="sec-title" style="margin-top:12px">Vektör &amp; Gruplama</h3>
      <div class="grid-2" style="gap:6px">
        <button type="button" class="sec-btn" data-dact="toCurves">∿ Eğriye Çevir</button>
        <button type="button" class="sec-btn" data-dact="breakApart">✂ Harflere Ayır</button>
        <button type="button" class="sec-btn" data-dact="group">Grupla</button>
        <button type="button" class="sec-btn" data-dact="ungroup">Grubu Çöz</button>
        <button type="button" class="sec-btn" data-dact="union">⊕ Birleştir</button>
        <button type="button" class="sec-btn" data-dact="difference">⊖ Çıkar</button>
      </div>
    </section>
  `;
}

const WS_LAYOUT_KEY = 'khs_ws_layout_v1';
function loadWsLayout() {
  try {
    const raw = localStorage.getItem(WS_LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { floating: [], dockedUnder: {}, tabOrder: [] };
}
const wsLayout = loadWsLayout();
if (!Array.isArray(wsLayout.floating)) wsLayout.floating = [];
if (!wsLayout.dockedUnder || typeof wsLayout.dockedUnder !== 'object') wsLayout.dockedUnder = {};
if (!Array.isArray(wsLayout.tabOrder)) wsLayout.tabOrder = [];
wsLayout.floating = wsLayout.floating.filter(f => WS_META.some(m => m.id === f.id));
for (const host of Object.keys(wsLayout.dockedUnder)) {
  wsLayout.dockedUnder[host] = (wsLayout.dockedUnder[host] || []).filter(id => WS_META.some(m => m.id === id) && id !== host);
}
function arrangeDockerTabs() {
  const bar = document.getElementById('workspaceTabs');
  if (!bar) return;
  const ids = WS_META.map(m => m.id);
  wsLayout.tabOrder = [...new Set([...wsLayout.tabOrder, ...ids])].filter(id => ids.includes(id));
  for (const id of wsLayout.tabOrder) {
    const tab = bar.querySelector(`button[data-ws="${id}"]`);
    if (tab) bar.appendChild(tab);
  }
}
function reorderDockerTab(movingId, beforeId) {
  if (!movingId || !beforeId || movingId === beforeId) return;
  const order = wsLayout.tabOrder.filter(id => id !== movingId);
  const at = order.indexOf(beforeId);
  order.splice(at < 0 ? order.length : at, 0, movingId);
  wsLayout.tabOrder = order;
  arrangeDockerTabs();
  saveWsLayout();
}
function dockFloatingIntoTabs(wsId, beforeId = null) {
  restoreWorkspaceToTab(wsId);
  if (beforeId) reorderDockerTab(wsId, beforeId);
  store.update(s => { s.activeWorkspace = wsId; s.ui.stackMode = 'tabs'; });
  renderActiveWorkspace();
}
function saveWsLayout() {
  try { localStorage.setItem(WS_LAYOUT_KEY, JSON.stringify(wsLayout)); } catch {}
}

function detachWorkspaceToFloat(wsId, x = 320, y = 110) {
  if (!WS_META.some(m => m.id === wsId)) return;
  // Remove from any dockedUnder list
  for (const host of Object.keys(wsLayout.dockedUnder)) {
    wsLayout.dockedUnder[host] = (wsLayout.dockedUnder[host] || []).filter(id => id !== wsId);
  }
  const existing = wsLayout.floating.find(f => f.id === wsId);
  if (existing) {
    existing.x = x;
    existing.y = y;
  } else {
    wsLayout.floating.push({
      id: wsId,
      x: Math.max(20, Math.min(window.innerWidth - 340, x)),
      y: Math.max(56, Math.min(window.innerHeight - 280, y)),
      w: 330,
      h: 460,
    });
  }
  saveWsLayout();
  renderActiveWorkspace();
}

function dockWorkspaceUnder(childId, hostId) {
  if (!childId || !hostId || childId === hostId) return;
  wsLayout.floating = wsLayout.floating.filter(f => f.id !== childId);
  for (const h of Object.keys(wsLayout.dockedUnder)) {
    wsLayout.dockedUnder[h] = (wsLayout.dockedUnder[h] || []).filter(id => id !== childId);
  }
  if (!wsLayout.dockedUnder[hostId]) wsLayout.dockedUnder[hostId] = [];
  if (!wsLayout.dockedUnder[hostId].includes(childId)) {
    wsLayout.dockedUnder[hostId].push(childId);
  }
  saveWsLayout();
  store.update(s => { s.activeWorkspace = hostId; });
  renderActiveWorkspace();
}

function restoreWorkspaceToTab(wsId) {
  wsLayout.floating = wsLayout.floating.filter(f => f.id !== wsId);
  for (const h of Object.keys(wsLayout.dockedUnder)) {
    wsLayout.dockedUnder[h] = (wsLayout.dockedUnder[h] || []).filter(id => id !== wsId);
  }
  saveWsLayout();
  renderActiveWorkspace();
}

function renderFloatingWindows(state) {
  const layer = document.getElementById('floatingWindowsLayer');
  if (!layer) return;
  const floatingKey = wsLayout.floating.map(f => f.id).join('|');
  if (!layer._focusPreservationBound) {
    layer._focusPreservationBound = true;
    layer.addEventListener('focusout', () => setTimeout(() => {
      if (layer.dataset.pendingRefresh === '1' && !layer.contains(document.activeElement)) {
        layer.dataset.pendingRefresh = '0';
        renderFloatingWindows(store.get());
      }
    }, 0));
  }
  const activeControl = document.activeElement;
  if (layer.dataset.floatingKey === floatingKey &&
      layer.contains(activeControl) &&
      /^(INPUT|SELECT|TEXTAREA)$/i.test(activeControl?.tagName || '')) {
    layer.dataset.pendingRefresh = '1';
    return;
  }
  layer.dataset.floatingKey = floatingKey;
  layer.dataset.pendingRefresh = '0';
  const activeFocused = document.activeElement?.id;
  layer.innerHTML = wsLayout.floating.map(fw => {
    const meta = WS_META.find(m => m.id === fw.id);
    if (!meta) return '';
    return `
      <div class="float-win" data-float-ws="${fw.id}" style="left:${fw.x}px;top:${fw.y}px;width:${fw.w}px;height:${fw.h}px">
        <div class="float-win-head" data-float-drag="${fw.id}">
          <span class="float-win-title"><span>▤</span> ${meta.label}</span>
          <div class="float-win-actions">
            <button type="button" class="float-win-btn" data-float-dock="${fw.id}" title="Aktif Sekmenin Altına Sabitle">📌 Altına Sabitle</button>
            <button type="button" class="float-win-btn" data-float-close="${fw.id}" title="Sağ Panele Geri Al">✕</button>
          </div>
        </div>
        <div class="float-win-body" data-float-body="${fw.id}">${meta.fn(state)}</div>
      </div>
    `;
  }).join('');

  for (const fw of wsLayout.floating) {
    const body = layer.querySelector(`[data-float-body="${fw.id}"]`);
    if (body) bindWorkspaceEvents(fw.id, body);
  }

  layer.querySelectorAll('[data-float-dock]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    dockWorkspaceUnder(btn.dataset.floatDock, store.get().activeWorkspace);
  });
  layer.querySelectorAll('[data-float-close]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    restoreWorkspaceToTab(btn.dataset.floatClose);
  });

  // Drag floating windows anywhere or drop onto right-panel tabs
  layer.querySelectorAll('[data-float-drag]').forEach(head => {
    head.onpointerdown = (e) => {
      if (e.target.closest('button')) return;
      const wsId = head.dataset.floatDrag;
      const winEl = head.closest('.float-win');
      const fw = wsLayout.floating.find(f => f.id === wsId);
      if (!winEl || !fw) return;
      const startX = e.clientX, startY = e.clientY;
      const origX = fw.x, origY = fw.y;
      const dockZone = document.getElementById('dockDropZone');
      dockZone?.classList.remove('hidden');

      const onMove = (mv) => {
        const nx = Math.max(8, Math.min(window.innerWidth - 120, origX + mv.clientX - startX));
        const ny = Math.max(46, Math.min(window.innerHeight - 60, origY + mv.clientY - startY));
        fw.x = nx; fw.y = ny;
        winEl.style.left = `${nx}px`;
        winEl.style.top = `${ny}px`;
        document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => {
          const r = tb.getBoundingClientRect();
          const over = mv.clientX >= r.left && mv.clientX <= r.right && mv.clientY >= r.top && mv.clientY <= r.bottom;
          tb.classList.toggle('drag-over', over && tb.dataset.ws !== wsId);
        });
      };

      const onUp = (up) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        dockZone?.classList.add('hidden');
        document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => tb.classList.remove('drag-over'));

        // Check if dropped on a tab to dock under it
        let targetTab = null;
        document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => {
          const r = tb.getBoundingClientRect();
          if (up.clientX >= r.left && up.clientX <= r.right && up.clientY >= r.top && up.clientY <= r.bottom && tb.dataset.ws !== wsId) {
            targetTab = tb.dataset.ws;
          }
        });
        if (targetTab) {
          dockFloatingIntoTabs(wsId, targetTab);
          return;
        }
        // Check if dropped on dockDropZone
        if (dockZone) {
          const dz = dockZone.getBoundingClientRect();
          if (up.clientX >= dz.left && up.clientX <= dz.right && up.clientY >= dz.top && up.clientY <= dz.bottom) {
            dockFloatingIntoTabs(wsId);
            return;
          }
        }
        const inspector = document.getElementById('inspectorCol')?.getBoundingClientRect();
        if (inspector && up.clientX >= inspector.left && up.clientX <= inspector.right && up.clientY >= inspector.top && up.clientY <= inspector.bottom) {
          dockFloatingIntoTabs(wsId);
          return;
        }
        saveWsLayout();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  });

  if (activeFocused && document.getElementById(activeFocused)) {
    document.getElementById(activeFocused).focus?.();
  }
}

function renderQuickPalette(state) {
  const host = document.getElementById('inspectorQuickColors');
  if (!host) return;
  const selected = state.objects.find(o => (state.selectedIds || []).includes(o.id));
  const current = (selected?.faceColor || state.materials.faceColor || '').toLowerCase();
  const basicColors = PAINT_PALETTE.slice(0, 12);
  host.innerHTML = `<span class="quick-palette-label">Renkler</span><div class="quick-palette-swatches">${basicColors.map(c => `
    <button type="button" class="quick-palette-swatch ${current === c.hex.toLowerCase() ? 'on' : ''}" data-quick-hex="${c.hex}" title="${c.label}" style="--color:${c.hex}"></button>
  `).join('')}</div><button type="button" class="quick-palette-more" id="btnOpenRalPalette" title="213 RAL Classic ve tüm renk seçenekleri">Tüm RAL ▸</button>`;
}
function openMaterialPalette() {
  restoreWorkspaceToTab('materials');
  matColorTab = 'ral';
  store.update(s => { s.activeWorkspace = 'materials'; s.ui.stackMode = 'tabs'; });
  renderActiveWorkspace();
  const search = document.getElementById('ralSearchInput');
  search?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('inspectorCol')?.classList.add('mobile-open');
}

function renderActiveWorkspace() {
  const state = store.get();
  renderQuickPalette(state);
  const ws = (WS_META.some(m => m.id === state.activeWorkspace) ? state.activeWorkspace : 'properties');
  const stackMode = state.ui?.stackMode === 'stacked';
  arrangeDockerTabs();
  const tabsEl = document.getElementById('workspaceTabs');
  const panelSelect = document.getElementById('inspectorPanelSelect');
  if (panelSelect) panelSelect.value = ws;
  const stackBtn = document.getElementById('btnToggleStackMode');
  if (tabsEl) tabsEl.classList.toggle('hidden', stackMode);
  if (stackBtn) stackBtn.textContent = stackMode ? '⊟ Sekme Modu' : '⊞ Alt Alta Aç';

  const floatIds = new Set(wsLayout.floating.map(f => f.id));
  document.querySelectorAll('#workspaceTabs button').forEach(b => {
    const id = b.dataset.ws;
    b.classList.toggle('on', id === ws);
    b.classList.toggle('secondary-docker-tab', !['properties', 'objects', 'materials'].includes(id));
    b.classList.toggle('is-detached', floatIds.has(id));
    b.classList.toggle('has-docked', (wsLayout.dockedUnder[id] || []).length > 0);
  });

  const root = document.getElementById('workspaceContent');
  if (!root) return;
  // Only rebuild the panel after a native input/select is committed or
  // focus leaves it. Replacing DOM during pointerdown closes the dropdown.
  const layoutKey = [ws, stackMode ? 'stack' : 'tabs',
    wsLayout.floating.map(f => f.id).join(','),
    JSON.stringify(wsLayout.dockedUnder)].join('|');
  if (!root._focusPreservationBound) {
    root._focusPreservationBound = true;
    root.addEventListener('focusout', () => setTimeout(() => {
      if (root.dataset.pendingRefresh === '1' && !root.contains(document.activeElement)) {
        root.dataset.pendingRefresh = '0';
        renderActiveWorkspace();
      }
    }, 0));
  }
  const activeControl = document.activeElement;
  if (root.dataset.layoutKey === layoutKey &&
      root.contains(activeControl) &&
      /^(INPUT|SELECT|TEXTAREA)$/i.test(activeControl?.tagName || '')) {
    root.dataset.pendingRefresh = '1';
    return;
  }
  root.dataset.layoutKey = layoutKey;
  root.dataset.pendingRefresh = '0';
  const previousScroll = root.scrollTop;

  if (!stackMode) {
    const meta = WS_META.find(m => m.id === ws) || WS_META[0];
    const dockedList = (wsLayout.dockedUnder[ws] || []).filter(id => id !== ws);
    const dockedHtml = dockedList.map(cid => {
      const cm = WS_META.find(m => m.id === cid);
      if (!cm) return '';
      return `
        <div class="docked-panel" data-docked-ws="${cid}">
          <div class="docked-head">
            <span>📌 ${cm.label}</span>
            <div style="display:flex;gap:4px">
              <button type="button" class="float-win-btn" data-dock-float="${cid}" title="Yüzen Pencere Olarak Ayır">↗ Ayır</button>
              <button type="button" class="float-win-btn" data-dock-remove="${cid}" title="Sabitlemeyi Kaldır">✕</button>
            </div>
          </div>
          <div class="docked-body" data-docked-body="${cid}">${cm.fn(state)}</div>
        </div>
      `;
    }).join('');

    const detachedActive = floatIds.has(ws);
    root.innerHTML = `<div class="docker-primary-body" data-primary-docker="${ws}">${detachedActive ? `<section class="sec"><h3 class="sec-title">${meta.label}</h3><p class="dock-helper">Bu panel serbest pencerede açık.</p><button type="button" class="sec-btn" id="btnReturnFloatingActive">Sağ panele geri al</button></section>` : meta.fn(state)}</div>` + dockedHtml;
    const primary = root.querySelector('[data-primary-docker]');
    if (!detachedActive) bindWorkspaceEvents(ws, primary);
    root.querySelector('#btnReturnFloatingActive')?.addEventListener('click', () => dockFloatingIntoTabs(ws));
    for (const cid of dockedList) {
      const body = root.querySelector(`[data-docked-body="${cid}"]`);
      if (body) bindWorkspaceEvents(cid, body);
    }
    root.querySelectorAll('[data-dock-float]').forEach(btn => btn.onclick = () => {
      const r = btn.getBoundingClientRect();
      detachWorkspaceToFloat(btn.dataset.dockFloat, Math.max(40, r.left - 340), Math.max(70, r.top));
    });
    root.querySelectorAll('[data-dock-remove]').forEach(btn => btn.onclick = () => {
      restoreWorkspaceToTab(btn.dataset.dockRemove);
    });
  } else {
    const openSet = new Set(state.ui?.openSections || ['design', 'materials']);
    root.innerHTML = WS_META.map(m => {
      const isOpen = openSet.has(m.id);
      return `<div class="acc-item" data-acc="${m.id}">
        <button type="button" class="acc-head ${isOpen ? 'on' : ''}" data-acc-toggle="${m.id}">
          <span>${m.label}</span><span>${isOpen ? '▾' : '▸'}</span>
        </button>
        ${isOpen ? `<div class="acc-body" data-acc-body="${m.id}">${m.fn(state)}</div>` : ''}
      </div>`;
    }).join('');

    root.querySelectorAll('[data-acc-toggle]').forEach(btn => btn.onclick = () => {
      const id = btn.dataset.accToggle;
      store.update(st => {
        const arr = st.ui.openSections || [];
        st.ui.openSections = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      });
      renderActiveWorkspace();
    });

    for (const m of WS_META) {
      if (openSet.has(m.id)) {
        const body = root.querySelector(`[data-acc-body="${m.id}"]`);
        if (body) bindWorkspaceEvents(m.id, body);
      }
    }
  }

  root.scrollTop = previousScroll;
  renderFloatingWindows(state);
}

function getSelectedOrFirst(state) {
  return state.objects.find(o => state.selectedIds.includes(o.id)) || state.objects[0];
}

function renderDesignWs(state) {
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(roundMm(mm),unit);
  const obj = getSelectedOrFirst(state);
  const cType = obj?.constructionType || state.constructionType;
  const fonts = fontManager.getAllFontMetas().filter(f =>
    !fontSearchQuery || f.label.toLowerCase().includes(fontSearchQuery.toLowerCase())
  );
  const fw = obj?.fileWidthMm ?? state.fileli.fileWidthMm;

  return `
    <section class="sec">
      <h3 class="sec-title">1. Harf / Üretim Yapısı</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${CONSTRUCTION_TYPES.map(t => `
          <button type="button" class="type-card ${cType === t.id ? 'on' : ''}" data-ctype="${t.id}">
            <strong>${t.label}</strong>
            <span>${t.desc}</span>
          </button>
        `).join('')}
      </div>
    </section>

    ${(!obj || obj.kind === 'text') ? `
    <section class="sec">
      <h3 class="sec-title">2. Yazı ve Yazı Tipi <small>Türkçe ŞİĞÜÇÖ tam destekli</small></h3>
      <textarea id="wsTextIn" class="text-in" rows="2" placeholder="Tabela yazısını girin (çok satır için Enter)...">${escapeHtml(obj?.kind === 'text' ? obj.text : '')}</textarea>
      <div class="field-row">
        <label>Satır Hizası &amp; Aralığı</label>
        <div style="display:flex;gap:4px">
          <button type="button" class="icon-btn" data-talign="left" title="Sola">◧</button>
          <button type="button" class="icon-btn" data-talign="center" title="Ortala">◫</button>
          <button type="button" class="icon-btn" data-talign="right" title="Sağa">◨</button>
          <input id="wsLineSpacing" type="number" min="0.8" max="2.5" step="0.05" value="${obj?.lineSpacingMult ?? 1.25}" style="width:58px" title="Satır Aralığı Çarpanı">
        </div>
      </div>
      <div class="field-row">
        <input id="fontSearchIn" type="text" placeholder="Font ara..." value="${escapeAttr(fontSearchQuery)}" style="width:100%">
      </div>
      <div class="fonts-grid">
        ${fonts.map(f => `
          <button type="button" class="font-btn ${(obj?.fontId || 'cinzel') === f.id ? 'on' : ''}" data-font="${f.id}">
            <span style="font-family:${f.family};font-weight:${f.weight}">AgŞğİ</span>
            <small>${escapeHtml(f.label)}${f.isCustom ? ' ★' : ''}</small>
          </button>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <label class="sec-btn" style="cursor:pointer;flex:1;text-align:center">
          + TTF / OTF / WOFF Yükle
          <input id="customFontUpload" type="file" accept=".ttf,.otf,.woff" class="hidden">
        </label>
        <button id="btnQueryLocalFonts" type="button" class="sec-btn">Sistem Fontları</button>
      </div>
      ${localFontStatus ? `<p style="font-size:11.5px;color:var(--muted);margin:6px 0 0">${escapeHtml(localFontStatus)}</p>` : ''}
      ${localFontList.length ? `<select id="selSystemFont" style="width:100%;margin-top:6px;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px;font-size:12px"><option value="">Sistem fontu seçin (${localFontList.length})...</option>${localFontList.map(f => `<option value="${escapeAttr(f.family)}">${escapeHtml(f.family)}</option>`).join('')}</select>` : ''}
    </section>` : `
    <section class="sec">
      <h3 class="sec-title">2. Seçili Nesne: ${escapeHtml(obj.name)}</h3>
      <p style="font-size:12px;color:var(--muted);margin:0">Ölçü ve pozisyon ayarlarını aşağıdan veya üst çubuktan düzenleyebilirsiniz.</p>
    </section>`}

    <section class="sec">
      <h3 class="sec-title">3. Ölçüler (${unit})</h3>
      <div class="field-row">
        <label>Nesne Yüksekliği (${unit})</label>
        <input id="wsHeightMm" type="number" step="any" value="${show(objectPhysicalSize(obj)?.heightMm??state.dimensions.heightMm)}">
      </div>
      ${obj?`<div class="field-row"><label>Nesne Genişliği (${unit})</label><input id="wsWidthMm" type="number" step="any" value="${show(objectPhysicalSize(obj).widthMm)}"></div>`:''}
      <div class="field-row">
        <label>Kenar Çıta Ebatı (${unit})</label>
        <input id="wsDepthMm" type="number" step="any" value="${show(obj?.depthMm || state.dimensions.depthMm)}">
      </div>
      <div class="field-row">
        <label>Harf Aralığı (${unit})</label>
        <input id="wsSpacingMm" type="number" step="any" value="${show(obj?.letterSpacingMm ?? state.dimensions.letterSpacingMm)}">
      </div>
    </section>

    ${cType === 'fileli' ? `
    <section class="sec">
      <h3 class="sec-title">4. Fileli Kutu Harf Ayarları <small>Dış ölçü korunur</small></h3>
      <div class="chips" style="margin-bottom:8px">
        ${FILELI_PRESET_WIDTHS.map(w => `<button type="button" class="chip ${fw === w ? 'on' : ''}" data-fw="${w}">${w} mm</button>`).join('')}
      </div>
      <div class="field-row">
        <label>Özel File Genişliği (mm)</label>
        <input id="wsFileWidthMm" type="number" min="1" max="60" step="0.5" value="${fw}">
      </div>
      <div class="field-row">
        <label>File Kalınlığı (mm)</label>
        <input id="wsFileThickMm" type="number" min="0.8" max="10" step="0.2" value="${state.fileli.fileThicknessMm}">
      </div>
      <div class="field-row">
        <label>Yanak Sac Kalınlığı (mm)</label>
        <input id="wsWallThicknessMm" type="number" min="0.2" max="3" step="0.1" value="${state.fileli.metalThicknessMm ?? 1}">
      </div>
      <div class="field-row">
        <label>File Pahı (mm)</label>
        <input id="wsBorderBevelMm" type="number" min="0" max="4" step="0.2" value="${state.fileli.borderBevelMm}">
      </div>
      <div class="field-row">
        <label>Pleksi İçe Girinti (mm)</label>
        <input id="wsAcrylicInsetMm" type="number" min="0" max="25" step="0.5" value="${state.fileli.acrylicInsetMm}">
      </div>
      <div class="field-row">
        <label>Pleksi Kalınlığı (mm)</label>
        <input id="wsAcrylicThickMm" type="number" min="1.5" max="15" step="0.5" value="${state.fileli.acrylicThicknessMm}">
      </div>
    </section>
    ` : ''}

    <section class="sec">
      <h3 class="sec-title">5. Logo İçe Aktarma &amp; Vektörizasyon</h3>
      <label class="sec-btn" style="display:block;text-align:center;cursor:pointer;margin-bottom:8px">
        SVG, PNG, JPG veya WEBP Logo Yükle
        <input id="logoFileInput" type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" class="hidden">
      </label>
      <div class="field-row">
        <label>Eşik (Threshold)</label>
        <input id="logoThreshold" type="range" min="0.1" max="0.9" step="0.05" value="${logoTraceOptions.threshold}">
      </div>
      <div class="field-row">
        <label>Arka Plan Toleransı</label>
        <input id="logoBgTol" type="range" min="10" max="120" step="5" value="${logoTraceOptions.bgTolerance}">
      </div>
      <div class="field-row">
        <label>Yumuşatma Geçişi</label>
        <input id="logoSmooth" type="number" min="0" max="4" step="1" value="${logoTraceOptions.smoothPasses}">
      </div>
      <div id="logoTraceStatus" style="font-size:11.5px;color:var(--muted)"></div>
    </section>
  `;
}

/** Keep the file rim, its full-depth sidewalls and the visible metal
 * material palette in sync for fileli construction. A user can opt out of
 * linked side material via the existing checkbox; never overwrite that choice.
 * Acrylic color/material remains independent.
 */
function syncSelectedFileliMetal(state, { id, color } = {}) {
  const selected = (state.objects || []).filter(o =>
    (state.selectedIds || []).includes(o.id) && !o.locked &&
    (o.constructionType || state.constructionType) === 'fileli'
  );
  if (id) {
    state.fileli.fileMaterial = id;
    state.materials.faceId = id;
  }
  if (color) {
    state.fileli.fileColor = color;
    state.materials.faceColor = color;
  }
  if (state.materials.sideFollowsFace !== false) {
    if (id) state.materials.sideId = id;
    if (color) state.materials.sideColor = color;
  }
  for (const o of selected) {
    if (id) { o.fileMaterial = id; o.faceMaterial = id; }
    if (color) { o.fileColor = color; o.faceColor = color; }
    if ((o.sideFollowsFace ?? state.materials.sideFollowsFace) !== false) {
      if (id) o.sideMaterial = id;
      if (color) o.sideColor = color;
    }
  }
}

// A RAL coating is an opaque painted finish, not tinted chrome/gold.
// The selected surface switches its PBR preset to boyaliAluminyum.
function applyRalCoating(s, hex, part = 'face', ralCode = '') {
  const paintId = 'boyaliAluminyum';
  s.materialOverrides.metalness = null;
  s.materialOverrides.roughness = null;
  const current = getSelectedOrFirst(s);
  const fileli = (current?.constructionType || s.constructionType) === 'fileli';
  const ids = new Set(s.selectedIds || []);
  const eligible = (s.objects || []).filter(o => !o.locked && (!ids.size || ids.has(o.id)));
  if (part === 'side') {
    s.materials.sideFollowsFace = false;
    s.materials.sideId = paintId;
    s.materials.sideColor = hex;
    for (const o of eligible) {
      o.sideFollowsFace = false; o.sideMaterial = paintId; o.sideColor = hex;
      o.sideRalCode = ralCode;
    }
    return;
  }
  s.materials.faceId = paintId;
  s.materials.faceColor = hex;
  s.materials.ralCode = ralCode;
  if (fileli) {
    s.fileli.fileMaterial = paintId; s.fileli.fileColor = hex;
    if (s.materials.sideFollowsFace !== false) {
      s.materials.sideId = paintId; s.materials.sideColor = hex;
    }
  }
  for (const o of eligible) {
    o.faceMaterial = paintId; o.faceColor = hex; o.ralCode = ralCode;
    if ((o.constructionType || s.constructionType) === 'fileli') {
      o.fileMaterial = paintId; o.fileColor = hex;
      if ((o.sideFollowsFace ?? s.materials.sideFollowsFace) !== false) {
        o.sideMaterial = paintId; o.sideColor = hex;
      }
    }
  }
}

function renderMaterialsWs(state) {
  const obj = state.objects.find(o => (state.selectedIds || []).includes(o.id)) || null;
  const faceId = obj?.faceMaterial || state.materials.faceId;
  const sideId = obj?.sideMaterial || state.materials.sideId;
  const fileId = obj?.fileMaterial || state.fileli.fileMaterial;
  const isFileli = (obj?.constructionType || state.constructionType) === 'fileli';
  const displayedMetalId = getDisplayedSurfaceMaterial(state);
  const facePreset = MATERIAL_PRESETS[displayedMetalId] || MATERIAL_PRESETS.aynaAltin;
  const sideFollows = obj?.sideFollowsFace ?? state.materials.sideFollowsFace;
  const ralPaintActive = displayedMetalId === 'boyaliAluminyum' && Boolean(obj?.ralCode || state.materials.ralCode);

  return `
    <section class="sec">
      <h3 class="sec-title">Ön Yüzey / File Materyali</h3>
      <div class="material-selection-status" aria-live="polite">✓ ${escapeHtml(facePreset.shortLabel || facePreset.label || displayedMetalId)} · ${(state.selectedIds || []).length ? (state.selectedIds || []).length + ' seçili nesne' : 'Seçim yok: tüm kilitsiz nesneler'}</div>
      ${ralPaintActive ? `<div class="ral-active-notice">RAL boya aktif ${escapeHtml(obj?.ralCode || state.materials.ralCode || '')}. Metal seçerek RAL modundan çıkabilirsiniz.</div>` : ''}
      <div class="mat-grid">
        ${Object.values(MATERIAL_PRESETS).filter(m => !isFileli || m.kind !== 'acrylic').map(m => `
          <button type="button" class="mat-btn ${!ralPaintActive && displayedMetalId === m.id ? 'on' : ''}" data-face-mat="${m.id}" aria-pressed="${!ralPaintActive && displayedMetalId === m.id}" title="${escapeHtml(m.label)} materyalini uygula">
            <i style="background:${m.swatch}"></i>
            <span>${m.shortLabel}</span>
          </button>
        `).join('')}
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>Yüzey Bitişi (Parlak / Mat)</label>
        <div class="chips" style="margin:0">
          ${[
            { id: 'gloss', label: 'Parlak', r: 0.06 },
            { id: 'satin', label: 'Saten', r: 0.24 },
            { id: 'matte', label: 'Mat', r: 0.58 },
          ].map(f => {
            const curR = state.materialOverrides.roughness ?? facePreset.roughness;
            const isOn = (f.id === 'gloss' && curR <= 0.12) || (f.id === 'satin' && curR > 0.12 && curR <= 0.38) || (f.id === 'matte' && curR > 0.38);
            return `<button type="button" class="chip ${isOn ? 'on' : ''}" data-finish-r="${f.r}">${f.label}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="field-row" style="margin-top:8px">
        <label>Özel Yüzey Rengi</label>
        <input id="faceColorPicker" type="color" value="${isFileli ? (obj?.fileColor || state.fileli.fileColor) : (obj?.faceColor || facePreset.color)}">
      </div>

      <div class="chips" style="margin-top:6px">
        <button type="button" class="chip ${matColorTab === 'ral' ? 'on' : ''}" data-mcol-tab="ral">RAL Kodları (${RAL_COLORS.length})</button>
        <button type="button" class="chip ${matColorTab === 'basic' ? 'on' : ''}" data-mcol-tab="basic">Temel Palet</button>
      </div>

      ${matColorTab === 'basic' ? `
        <div class="swatches" style="margin-top:6px">
          ${(facePreset.palette === 'pleksi' ? ACRYLIC_PALETTE : PAINT_PALETTE).map(p => `
            <button type="button" class="sw" style="--c:${p.hex}" data-face-hex="${p.hex}" title="${p.label}"></button>
          `).join('')}
        </div>
      ` : (() => {
        const q = ralSearchQuery.trim().toLowerCase();
        const filteredRal = RAL_COLORS.filter(r => {
          const grpOk = ralGroupFilter === 'all' || r.code.startsWith('RAL ' + ralGroupFilter);
          const qOk = !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
          return grpOk && qOk;
        });
        const curColor = (ralTargetPart === 'file' ? (obj?.fileColor || state.fileli.fileColor) : ralTargetPart === 'side' ? (obj?.sideColor || state.materials.sideColor) : (isFileli ? (obj?.fileColor || state.fileli.fileColor) : (obj?.faceColor || facePreset.color))).toUpperCase();
        return `
          <div class="ral-panel">
            <div class="chips" style="margin-bottom:6px">
              <button type="button" class="chip ${ralTargetPart === 'face' ? 'on' : ''}" data-ral-target="face">Ön Yüzey</button>
              <button type="button" class="chip ${ralTargetPart === 'side' ? 'on' : ''}" data-ral-target="side">Yan Bant</button>
              <button type="button" class="chip ${ralTargetPart === 'file' ? 'on' : ''}" data-ral-target="file">File Çerçeve</button>
            </div>
            <input id="ralSearchInput" class="ral-search" type="text" placeholder="RAL kodu veya renk adı ara (örn: 3020, Antrasit)..." value="${escapeAttr(ralSearchQuery)}">
            <div class="chips" style="gap:4px">
              ${RAL_GROUPS.map(g => `<button type="button" class="chip ${ralGroupFilter === g.id ? 'on' : ''}" style="padding:2px 6px;font-size:10.5px" data-ral-grp="${g.id}">${g.label}</button>`).join('')}
            </div>
            <div class="ral-grid">
              ${filteredRal.map(r => `
                <button type="button" class="ral-sw ${curColor === r.hex.toUpperCase() ? 'on' : ''}" data-ral-hex="${r.hex}" title="${r.code} — ${r.name}">
                  <i style="background:${r.hex}"></i>
                  <span>${r.code}</span>
                  <small>${r.name}</small>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      })()}
    </section>

    <section class="sec">
      <h3 class="sec-title">Yan Bant (Dönüş) &amp; File Çerçeve</h3>
      <div class="field-row">
        <label>${isFileli ? 'Yanaklar tüm derinlikte file metaliyle aynı olsun' : 'Yan bant ön yüzeyle aynı olsun'}</label>
        <input id="chkSideFollows" type="checkbox" ${sideFollows ? 'checked' : ''}>
      </div>
      ${!sideFollows ? `
        <div class="mat-grid">
          ${Object.values(MATERIAL_PRESETS).filter(m => m.kind !== 'acrylic').map(m => `
            <button type="button" class="mat-btn ${sideId === m.id ? 'on' : ''}" data-side-mat="${m.id}">
              <i style="background:${m.swatch}"></i>
              <span>${m.shortLabel}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${isFileli ? '<p class="hint">Açıkken metal file, iç/dış yanaklar ve tüm harf derinliği tek PBR materyali paylaşır. Ortadaki pleksi bağımsız kalır.</p>' : ''}
      <div class="field-row" style="margin-top:8px">
        <label>File Çerçeve Materyali</label>
        <select id="selFileMat">
          ${Object.values(MATERIAL_PRESETS).filter(m => m.kind !== 'acrylic').map(m => `
            <option value="${m.id}" ${fileId === m.id ? 'selected' : ''}>${m.label}</option>
          `).join('')}
        </select>
      </div>
    </section>

    <section class="sec">
      <h3 class="sec-title">PBR Fiziksel Parametreler</h3>
      <div class="field-row"><label>Metaliklik (Metalness)</label><input id="ovrMetalness" type="number" min="0" max="1" step="0.05" value="${state.materialOverrides.metalness ?? facePreset.metalness}"></div>
      <div class="field-row"><label>Pürüzlülük (Roughness)</label><input id="ovrRoughness" type="number" min="0.01" max="1" step="0.02" value="${state.materialOverrides.roughness ?? facePreset.roughness}"></div>
      <div class="field-row"><label>Yansıma Yoğunluğu</label><input id="ovrRefl" type="number" min="0" max="3" step="0.1" value="${state.render.reflectionIntensity}"></div>
      <div class="field-row"><label>Pozlama (Exposure)</label><input id="ovrExposure" type="number" min="0.3" max="2.5" step="0.05" value="${state.render.exposure}"></div>
      ${facePreset.brushed ? `
      <div class="field-row"><label>Fırçalama Yönü (°)</label><input id="ovrBrushDir" type="number" min="0" max="180" step="15" value="${state.materialOverrides.brushDirection}"></div>
      <div class="field-row"><label>Fırçalama Ölçeği</label><input id="ovrBrushScale" type="number" min="1" max="20" step="1" value="${state.materialOverrides.brushScale}"></div>
      <div class="field-row"><label>Fırçalama Yoğunluğu</label><input id="ovrBrushInt" type="number" min="0" max="1.5" step="0.05" value="${state.materialOverrides.brushIntensity}"></div>
      ` : ''}
      <div class="field-row"><label>Patlatılmış Katman Görünümü (3D Kesit)</label><input id="chkExploded" type="checkbox" ${state.render.explodedView ? 'checked' : ''}></div>
      <div class="field-row"><label>Pah Genişliği (mm)</label><input id="ovrBevel" type="number" min="0" max="6" step="0.2" value="${state.materialOverrides.bevelMm}"></div>
      ${(facePreset.kind === 'acrylic' || (obj?.constructionType || state.constructionType) === 'fileli' || (obj?.constructionType || state.constructionType) === 'pleksi') ? `<div class="field-row"><label>Pleksi Opaklık</label><input id="ovrAcOpacity" type="number" min="0.2" max="1" step="0.02" value="${state.materialOverrides.acrylicOpacity}"></div>` : ''}
    </section>

    <section class="sec">
      <h3 class="sec-title">HDR / Stüdyo Yansıma Ortamı</h3>
      <div class="chips" style="margin-bottom:8px">
        ${Object.values(ENVIRONMENT_PRESETS).map(e => `
          <button type="button" class="chip ${state.render.envPreset === e.id && !state.render.useCustomEnv ? 'on' : ''}" data-env="${e.id}">${e.label}</button>
        `).join('')}
      </div>
      <div class="field-row"><label>Yansıma Yatay Açı (°)</label><input id="ovrEnvRot" type="number" min="0" max="360" step="15" value="${state.render.envRotationDeg}"></div>
      <div class="field-row"><label>Yansıma Dikey Açı (°)</label><input id="ovrEnvPitch" type="number" min="-90" max="90" step="10" value="${state.render.envPitchDeg || 0}"></div>
      <div class="field-row"><label>Yansıma Alanı Ölçeği</label><input id="ovrCardScale" type="number" min="0.3" max="2.5" step="0.1" value="${state.render.customCardScale || 1.0}"></div>
      <label class="sec-btn" style="display:block;text-align:center;cursor:pointer">
        Özel .HDR veya Ekvirektangüler Yansıma Yükle
        <input id="customEnvUpload" type="file" accept=".hdr,image/png,image/jpeg,image/webp" class="hidden">
      </label>
    </section>
  `;
}

function renderLightingWs(state) {
  const obj = getSelectedOrFirst(state);
  const mode = obj?.lightingMode || state.lighting.mode;
  const enabled = state.lighting.enabled;
  const hasFront = enabled && (mode === 'front' || mode === 'both');
  const hasHalo = enabled && (mode === 'halo' || mode === 'both');

  return `
    <section class="sec">
      <h3 class="sec-title">Aydınlatma Modu</h3>
      <div class="grid-2">
        ${Object.values(LIGHTING_MODES).map(m => `
          <button type="button" class="chip ${mode === m.id ? 'on' : ''}" data-lmode="${m.id}">${m.label}</button>
        `).join('')}
      </div>
      <div class="field-row" style="margin-top:10px">
        <label>Aydınlatma Açık</label>
        <input id="chkLightEnabled" type="checkbox" ${enabled ? 'checked' : ''}>
      </div>
    </section>

    ${(hasFront || hasHalo) ? `
    <section class="sec">
      <h3 class="sec-title">Işık Rengi &amp; Renk Sıcaklığı</h3>
      <div class="swatches">
        ${LIGHT_COLOR_PRESETS.map(c => `
          <button type="button" class="sw ${state.lighting.colorHex.toLowerCase() === c.hex ? 'on' : ''}" style="--c:${c.hex}" data-lhex="${c.hex}" title="${c.label}"></button>
        `).join('')}
        <label class="sw custom" title="Özel RGB LED">
          <input id="customLightHex" type="color" value="${state.lighting.colorHex}">
        </label>
      </div>
    </section>
    ` : `<section class="sec"><p style="font-size:12px;color:var(--muted);margin:0">Işıksız mod seçili. Aydınlatma ayarlarını görmek için Önden, Arkadan (Halo) veya Çift mod seçin.</p></section>`}

    ${hasFront ? `
    <section class="sec">
      <h3 class="sec-title">Ön Yüzey Işık Ayarları</h3>
      <div class="field-row">
        <label>Ön Yüz Işık Şiddeti</label>
        <input id="lFrontIntRange" type="range" min="0" max="3" step="0.1" value="${state.lighting.frontIntensity}">
        <input id="lFrontInt" type="number" min="0" max="3" step="0.1" value="${state.lighting.frontIntensity}" style="width:62px">
      </div>
    </section>
    ` : ''}

    ${hasHalo ? `
    <section class="sec">
      <h3 class="sec-title">Arka (Halo) Duvar Işığı Ayarları</h3>
      <div class="field-row">
        <label>Arka Halo Şiddeti</label>
        <input id="lBackIntRange" type="range" min="0" max="3" step="0.1" value="${state.lighting.backIntensity}">
        <input id="lBackInt" type="number" min="0" max="3" step="0.1" value="${state.lighting.backIntensity}" style="width:62px">
      </div>
      <div class="field-row">
        <label>Duvardan Uzaklık (mm)</label>
        <input id="lWallDistRange" type="range" min="5" max="150" step="5" value="${state.lighting.wallDistanceMm}">
        <input id="lWallDist" type="number" min="5" max="150" step="5" value="${state.lighting.wallDistanceMm}" style="width:62px">
      </div>
      <div class="field-row">
        <label>Halo Yayılımı</label>
        <input id="lHaloSpread" type="number" min="0.3" max="2.5" step="0.1" value="${state.lighting.haloSpread}">
      </div>
      <div class="field-row">
        <label>Işık Sönümlemesi (Falloff)</label>
        <input id="lFalloff" type="number" min="0.3" max="2.5" step="0.1" value="${state.lighting.falloff}">
      </div>
    </section>
    ` : ''}
  `;
}

function renderLayersWs(state) {
  return `
    <section class="sec">
      <h3 class="sec-title">Katman Yöneticisi <small>${state.objects.length} nesne</small></h3>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <button type="button" id="btnGrp" class="sec-btn">Grupla</button>
        <button type="button" id="btnUngrp" class="sec-btn">Grubu Çöz</button>
        <button type="button" id="btnDupLayer" class="sec-btn">Çoğalt</button>
        <button type="button" id="btnDelLayer" class="sec-btn" style="color:var(--danger)">Sil</button>
      </div>
      <div>
        ${state.objects.map(o => `
          <div class="layer-item ${state.selectedIds.includes(o.id) ? 'on' : ''}" data-lid="${o.id}">
            <button type="button" class="icon-btn" data-vis="${o.id}" title="Görünürlük">${o.visible ? '👁' : '🚫'}</button>
            <button type="button" class="icon-btn" data-lock="${o.id}" title="Kilitle">${o.locked ? '🔒' : '🔓'}</button>
            <span class="layer-name" data-sel="${o.id}" title="${escapeAttr(o.name)}">${escapeHtml(o.name)} ${o.groupId ? '<small style="color:var(--accent)">[G]</small>' : ''}</span>
            <button type="button" class="icon-btn" data-ren="${o.id}" title="Yeniden Adlandır">✎</button>
            <button type="button" class="icon-btn" data-up="${o.id}" title="Yukarı Taşı">↑</button>
            <button type="button" class="icon-btn" data-dn="${o.id}" title="Aşağı Taşı">↓</button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderBackgroundWs(state) {
  const pm = state.photomontage;
  return `
    <section class="sec">
      <h3 class="sec-title">Hazır Mimari Sahneler</h3>
      <p class="dock-helper">ZIP'teki tüm hazır duvar ve cephe seçenekleri. Bir sahne seçtiğinizde 3D arka plan güncellenir.</p>
      <div class="background-preset-grid">
        ${BACKGROUND_SCENES.map(b => `
          <button type="button" class="background-preset ${state.scene.wallId === b.id ? 'on' : ''}" data-bg-wall="${b.id}" title="${b.label}">
            <span class="background-preview background-preview-${b.id}"></span>
            <span>${b.label}</span>
            ${state.scene.wallId === b.id ? '<b>✓ Seçili</b>' : ''}
          </button>
        `).join('')}
      </div>
    </section>

    <section class="sec">
      <h3 class="sec-title">Müşteri Mağaza Fotoğrafı &amp; 4 Nokta Perspektif</h3>
      <label class="sec-btn" style="display:block;text-align:center;cursor:pointer;margin-bottom:8px">
        Mağaza / Cephe Fotoğrafı Yükle
        <input id="pmPhotoUpload" type="file" accept="image/png,image/jpeg,image/webp" class="hidden">
      </label>
      ${pm.photoUrl ? `
        <p style="font-size:12px;color:var(--ok);margin:0 0 8px">Yüklü: ${escapeHtml(pm.photoName)}. Sahnedeki 4 sarı köşe tutamacını sürükleyerek perspektifi oturtun.</p>
        <div class="field-row"><label>Duvar Gölge Şiddeti</label><input id="pmShadow" type="range" min="0" max="1" step="0.05" value="${pm.wallShadow}"></div>
        <div class="field-row"><label>Ortam Işık Uyumu</label><input id="pmAmbient" type="range" min="0" max="1" step="0.05" value="${pm.ambientMatch}"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button type="button" id="btnExportPm" class="cta-btn">Cephe Sunum PNG İndir</button>
          <button type="button" id="btnClearPm" class="sec-btn">Kaldır</button>
        </div>
      ` : '<p style="font-size:12px;color:var(--muted);margin:0">Kendi cephe fotoğrafınızı yükleyerek 4 köşe perspektif yerleştirme yapabilirsiniz.</p>'}
    </section>
  `;
}

function renderNestingWs(state) {
  const n = state.nesting;
  return `
    <section class="sec">
      <h3 class="sec-title">Gerçek Şekil Plaka Nesting Motoru</h3>
      <div class="field-row">
        <label>Plaka Önayarı</label>
        <select id="nestPreset">
          ${SHEET_PRESETS.map(p => `<option value="${p.id}" ${n.sheetWidthMm === p.w && n.sheetHeightMm === p.h ? 'selected' : ''}>${p.label}</option>`).join('')}
          <option value="custom">Özel Ölçü</option>
        </select>
      </div>
      <div class="field-row"><label>Plaka Genişliği (mm)</label><input id="nestW" type="number" min="200" max="6000" step="50" value="${n.sheetWidthMm}"></div>
      <div class="field-row"><label>Plaka Yüksekliği (mm)</label><input id="nestH" type="number" min="200" max="4000" step="50" value="${n.sheetHeightMm}"></div>
      <div class="field-row"><label>Kenar Payı (mm)</label><input id="nestMargin" type="number" min="0" max="100" step="1" value="${n.marginMm}"></div>
      <div class="field-row"><label>Kesim Boşluğu (mm)</label><input id="nestClear" type="number" min="1" max="50" step="0.5" value="${n.clearanceMm}"></div>
      <div class="field-row"><label>Kerf / Lazer Payı (mm)</label><input id="nestKerf" type="number" min="0" max="5" step="0.1" value="${n.kerfMm}"></div>
      <div class="field-row"><label>Kopya Adedi</label><input id="nestCopies" type="number" min="1" max="50" step="1" value="${n.copies}"></div>
      <div class="field-row"><label>Delik İçi Yerleştirme (O/D)</label><input id="nestHole" type="checkbox" ${n.allowHoleNesting !== false ? 'checked' : ''}></div>
      <div class="field-row"><label>Malzemeye Göre Ayır</label><input id="nestGroupMat" type="checkbox" ${n.groupByMaterial !== false ? 'checked' : ''}></div>
      <div class="field-row">
        <label>Doku / Fırça Yönü</label>
        <select id="nestGrain">
          <option value="none" ${n.grainDirection === 'none' ? 'selected' : ''}>Serbest (0/90/180/270°)</option>
          <option value="horizontal" ${n.grainDirection === 'horizontal' ? 'selected' : ''}>Yatay Doku (0/180°)</option>
          <option value="vertical" ${n.grainDirection === 'vertical' ? 'selected' : ''}>Dikey Doku (0/180°)</option>
        </select>
      </div>
      <div class="field-row">
        <label>İnce Açı Adımı (°)</label>
        <select id="nestAngleStep">
          <option value="0" ${n.fineAngleStep === 0 ? 'selected' : ''}>0°, 90°, 180°, 270°</option>
          <option value="45" ${n.fineAngleStep === 45 ? 'selected' : ''}>45° Adımlı</option>
          <option value="15" ${n.fineAngleStep === 15 ? 'selected' : ''}>15° İnce Arama</option>
        </select>
      </div>
      <div class="field-row">
        <label>Parça Grubu</label>
        <select id="nestTarget">
          <option value="all" ${n.targetPart === 'all' ? 'selected' : ''}>Tüm Parçalar (Ayrı Plakalarda)</option>
          <option value="acrylic" ${n.targetPart === 'acrylic' ? 'selected' : ''}>Yalnız Pleksi</option>
          <option value="file" ${n.targetPart === 'file' ? 'selected' : ''}>Yalnız File</option>
          <option value="outer" ${n.targetPart === 'outer' ? 'selected' : ''}>Yalnız Ana Gövde</option>
        </select>
      </div>
      <button type="button" id="btnRunNesting" class="cta-btn">Gerçek Şekil Nesting Hesapla</button>
    </section>

    ${lastNesting ? `
    <section id="nestingResultsSec" class="sec">
      <h3 class="sec-title">Nesting Sonuçları <small>${lastNesting.sheetCount} Plaka</small></h3>
      <p style="font-size:12px;margin:0 0 8px">
        Verimlilik: <strong>%${lastNesting.overallUtilizationPct.toFixed(1)}</strong> ·
        Fire: <strong>${lastNesting.totalScrapM2.toFixed(2)} m²</strong> ·
        İç İçe Geçme: <strong>${lastNesting.interlockedPairs} çift</strong>
      </p>
      ${lastNesting.unplaced.length ? `<div style="background:rgba(239,68,68,0.14);border:1px solid #ef4444;padding:6px 8px;border-radius:6px;font-size:11.5px;margin-bottom:8px">Yerleştirilemeyen (${lastNesting.unplaced.length}): ${lastNesting.unplaced.map(u => escapeHtml(u.item.label + " — " + u.reason)).join(", ")}</div>` : ''}
      ${lastNesting.sheets.map(sh => `
        <div style="margin-bottom:10px">
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">
            Plaka #${sh.index} [${escapeHtml(sh.materialGroup)}] (${sh.widthMm}×${sh.heightMm} mm) — %${sh.utilizationPct.toFixed(1)} dolu · ${sh.placements.length} parça
          </div>
          ${renderNestingSvg(sh, selectedNestingId)}
        </div>
      `).join('')}
      ${selectedNestingId ? `
        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="sec-btn" data-nest-nudge="-20,0">← 20mm</button>
          <button type="button" class="sec-btn" data-nest-nudge="20,0">20mm →</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,20">↑ 20mm</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,-20">↓ 20mm</button>
          <button type="button" class="sec-btn" id="btnLockNestPart">🔒 Kilitle/Çöz</button>
        </div>
      ` : '<p style="font-size:11px;color:var(--muted);margin:4px 0 0">Manuel kaydırmak veya kilitlemek için plaka üzerindeki bir parçaya tıklayın.</p>'}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button type="button" id="btnExportNestedSvg" class="cta-btn" style="flex:1">Nesting Dışa Aktar (SVG)</button>
        <button type="button" id="btnExportNestedDxf" class="sec-btn">DXF (1:1 mm)</button>
        <button type="button" id="btnExportNestedCsv" class="sec-btn">CSV</button>
      </div>
    </section>
    ` : ''}
  `;
}

function renderCostWs(state) {
  const c=lastCosts, curr=c.currency;
  return `<section class="sec">
    <h3 class="sec-title">Maliyet &amp; Teklif</h3>
    <div class="field-row"><span>Üretici Maliyeti</span><b>${formatMoney(c.totalCost,curr)}</b></div>
    <div class="field-row"><span>Müşteriye Satış (KDV Hariç)</span><b>${formatMoney(c.subtotal,curr)}</b></div>
    <div class="field-row"><span>Gerçek Kâr</span><b style="color:${c.profitAmount>=0?'#8bdea9':'#ef8d89'}">${formatMoney(c.profitAmount,curr)}</b></div>
    <div class="field-row"><span>KDV Dahil Toplam</span><b>${formatMoney(c.grandTotal,curr)}</b></div>
    <p class="cst-help">Malzeme birim alış-satış fiyatları, işçilik, LED, nakliye ve teklifler ana çalışma alanında ayrı yönetilir.</p>
    <button class="cta-btn" type="button" data-open-cost-studio="summary" style="width:100%;margin-top:12px">Maliyet Stüdyosunu Aç ↗</button>
  </section>`;
}

function renderQuoteWs(state) {
  const q=state.quote;
  return `<section class="sec">
   <h3 class="sec-title">Kurumsal Teklif</h3>
   <div class="field-row"><span>Üretici</span><b>${escapeHtml(q.companyName||'—')}</b></div>
   <div class="field-row"><span>Müşteri</span><b>${escapeHtml(q.customerCompany||q.customerName||'—')}</b></div>
   <div class="field-row"><span>Teklif</span><b>${formatMoney(lastCosts.grandTotal,lastCosts.currency)}</b></div>
   <p class="cst-help">Firma ve müşteri logosu, telefonlar, ödeme, teslimat ve A4 PDF teklifi için tasarım ekranını açın.</p>
   <button class="cta-btn" type="button" data-open-cost-studio="quote" style="width:100%;margin-top:12px">Teklif Tasarımını Aç ↗</button>
  </section>`;
}

function renderProjectsWs(state) {
  const saved = listSavedProjects();
  return `
    <section class="sec">
      <h3 class="sec-title">Proje Kaydetme &amp; Yükleme</h3>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button type="button" id="btnSaveBrowser" class="cta-btn">Tarayıcıya Kaydet</button>
        <label class="sec-btn" style="cursor:pointer;white-space:nowrap">
          JSON İçe Aktar
          <input id="importJsonInput" type="file" accept=".json" class="hidden">
        </label>
      </div>
      <div>
        ${saved.length ? saved.map(p => `
          <div class="layer-item">
            <span class="layer-name" title="${escapeAttr(p.name)}">${escapeHtml(p.name)}<br><small style="color:var(--muted)">${new Date(p.savedAt).toLocaleString('tr-TR')}</small></span>
            <button type="button" class="icon-btn" data-load-proj="${p.id}">Aç</button>
            <button type="button" class="icon-btn" data-del-proj="${p.id}" style="color:var(--danger)">Sil</button>
          </div>
        `).join('') : '<p style="font-size:12px;color:var(--muted);margin:0">Henüz kayıtlı proje yok.</p>'}
      </div>
    </section>
  `;
}

/* ---------------- Event Binding ---------------- */
function bindWorkspaceEvents(ws, root) {
  root.querySelectorAll('[data-open-cost-studio]').forEach(b=>b.addEventListener('click',()=>{
    activeCostTab=b.dataset.openCostStudio || 'summary';
    setMainWorkspace('cost');
  }));
  if (ws === 'design' || ws === 'properties') {
    root.querySelectorAll('[data-ctype]').forEach(b => b.onclick = () => {
      mutate('Yapı tipi değiştirildi', s => {
        s.constructionType = b.dataset.ctype;
        // The inspector shows the first object when nothing is selected.
        // Apply the change to that same object, not only to project defaults.
        const ids = new Set((s.selectedIds || []).length ? s.selectedIds : [s.objects[0]?.id].filter(Boolean));
        for (const o of s.objects) {
          if (ids.has(o.id) && !o.locked) o.constructionType = b.dataset.ctype;
        }
        if (b.dataset.ctype === 'metal' || b.dataset.ctype === 'isiksiz') {
          s.lighting.enabled = false; s.lighting.mode = 'none';
          for (const o of s.objects) if (ids.has(o.id) && !o.locked) o.lightingMode = 'none';
        }
      });
    });

    const textIn = root.querySelector('#wsTextIn');
    if (textIn) textIn.oninput = (e) => {
      const val = e.target.value;
      mutate('Yazı güncellendi', s => {
        let o = getSelectedOrFirst(s);
        if (!o || o.kind !== 'text') {
          o = createShapeObject('text', s, { text: val, xMm: 0, yMm: 0 });
          s.objects.push(o);
          s.selectedIds = [o.id];
        } else if (!o.locked) {
          o.text = val;
        }
      }, false);
    };

    root.querySelectorAll('[data-talign]').forEach(b => b.onclick = () => mutate('Metin hizası', s => {
      const o = getSelectedOrFirst(s);
      if (o && o.kind === 'text' && !o.locked) o.textAlign = b.dataset.talign;
    }));
    root.querySelector('#wsLineSpacing')?.addEventListener('change', e => mutate('Satır aralığı', s => {
      const o = getSelectedOrFirst(s);
      if (o && o.kind === 'text' && !o.locked) o.lineSpacingMult = Math.max(0.8, Number(e.target.value) || 1.25);
    }));
    const searchIn = root.querySelector('#fontSearchIn');
    if (searchIn) searchIn.oninput = (e) => { fontSearchQuery = e.target.value; renderActiveWorkspace(); };

    root.querySelectorAll('[data-font]').forEach(b => b.onclick = () => {
      mutate('Yazı tipi değiştirildi', s => {
        const o = getSelectedOrFirst(s);
        if (o && o.kind === 'text' && !o.locked) o.fontId = b.dataset.font;
      });
    });

    root.querySelector('#customFontUpload')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const entry = await fontManager.uploadCustomFont(f);
        localFontStatus = `${entry.label} yüklendi${entry.turkishReady ? ' (Türkçe destekli)' : ' (Bazı Türkçe karakterler eksik olabilir)'}.`;
        mutate('Özel font eklendi', s => {
          const o = getSelectedOrFirst(s);
          if (o && o.kind === 'text' && !o.locked) o.fontId = entry.id;
        });
      } catch (err) {
        localFontStatus = err.message;
        renderActiveWorkspace();
      }
    });

    root.querySelector('#btnQueryLocalFonts')?.addEventListener('click', async () => {
      const res = await fontManager.queryBrowserLocalFonts();
      localFontStatus = res.message;
      localFontList = res.fonts.filter(f => !/symbol|wingding|webding|marlett|emoji/i.test(f.family));
      renderActiveWorkspace();
    });
    root.querySelector('#selSystemFont')?.addEventListener('change', async (e) => {
      const fam = e.target.value;
      const item = localFontList.find(f => f.family === fam);
      if (!item) return;
      try {
        const entry = await fontManager.activateBrowserLocalFont(item.fontData);
        localFontStatus = `${entry.label} aktif edildi.`;
        mutate('Sistem fontu seçildi', s => {
          const o = getSelectedOrFirst(s);
          if (o && o.kind === 'text' && !o.locked) o.fontId = entry.id;
        });
      } catch (err) {
        localFontStatus = `Bu sistem fontu okunamadı (${err.message}). TTF/OTF yükleyebilirsiniz.`;
        renderActiveWorkspace();
      }
    });

    const bindNum = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => {
      const units=['wsHeightMm','wsWidthMm','wsDepthMm','wsSpacingMm'];
      const value=units.includes(id)?displayToMm(e.target.value,store.get().pageLayout?.displayUnit):Number(e.target.value);
      if(Number.isFinite(value))mutate('Ölçü değiştirildi',s=>fn(s,value));
    });
    bindNum('wsHeightMm', (s, v) => {
      if(!Number.isFinite(v)||v<=0)return;
      const o=getSelectedOrFirst(s);
      if(o)resizeObjectToMm(o,'h',v,objectPhysicalSize(o));else s.dimensions.heightMm=v;
    });
    bindNum('wsWidthMm',(s,v)=>{const o=getSelectedOrFirst(s);if(o)resizeObjectToMm(o,'w',v,objectPhysicalSize(o));});
    bindNum('wsDepthMm', (s, v) => {
      const val = Math.max(10, Math.min(400, v || 80));
      s.dimensions.depthMm = val;
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) o.depthMm = val;
    });
    bindNum('wsSpacingMm', (s, v) => {
      s.dimensions.letterSpacingMm = v;
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) o.letterSpacingMm = v;
    });

    root.querySelectorAll('[data-fw]').forEach(b => b.onclick = () => {
      const val = Number(b.dataset.fw);
      mutate('File genişliği', s => {
        s.fileli.fileWidthMm = val;
        const o = getSelectedOrFirst(s);
        if (o && !o.locked) o.fileWidthMm = val;
      });
    });
    bindNum('wsFileWidthMm', (s, v) => {
      const val = Math.max(0.5, Math.min(60, v || 8));
      s.fileli.fileWidthMm = val;
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) o.fileWidthMm = val;
    });
    bindNum('wsFileThickMm', (s, v) => { s.fileli.fileThicknessMm = Math.max(0.5, v || 2); });
    bindNum('wsWallThicknessMm', (s, v) => { s.fileli.metalThicknessMm = Math.max(0.2, Math.min(3, v || 1)); });
    bindNum('wsBorderBevelMm', (s, v) => { s.fileli.borderBevelMm = Math.max(0, v || 0); });
    bindNum('wsAcrylicInsetMm', (s, v) => { s.fileli.acrylicInsetMm = Math.max(0, v || 0); });
    bindNum('wsAcrylicThickMm', (s, v) => { s.fileli.acrylicThicknessMm = Math.max(1, v || 3); });

    root.querySelector('#logoThreshold')?.addEventListener('input', e => { logoTraceOptions.threshold = Number(e.target.value); });
    root.querySelector('#logoBgTol')?.addEventListener('input', e => { logoTraceOptions.bgTolerance = Number(e.target.value); });
    root.querySelector('#logoSmooth')?.addEventListener('change', e => { logoTraceOptions.smoothPasses = Number(e.target.value); });
    root.querySelector('#logoFileInput')?.addEventListener('change', e => handleLogoUpload(e.target.files?.[0]));
  } else if (ws === 'materials') {
    root.querySelectorAll('[data-face-mat]').forEach(b => b.onclick = () => {
      if (!MATERIAL_PRESETS[b.dataset.faceMat]) return;
      mutate('Yüz materyali', s => applySurfaceMaterialPreset(s,b.dataset.faceMat));
    });
    root.querySelector('[data-surface-metal]')?.addEventListener('click', () => mutate('Metal yüzeye geç', s => applySurfaceMaterialPreset(s,'aynaKrom')));
    root.querySelector('#faceColorPicker')?.addEventListener('input', e => {
      mutate('Yüz rengi', s => {
        s.materials.faceColor = e.target.value;
        assignMaterialToSelected(s, { faceColor: e.target.value });
        if ((getSelectedOrFirst(s)?.constructionType || s.constructionType) === 'fileli') {
          syncSelectedFileliMetal(s, { color: e.target.value });
        }
      }, false);
    });
    root.querySelectorAll('[data-face-hex]').forEach(b => b.onclick = () => {
      mutate('Yüz rengi', s => {
        s.materials.faceColor = b.dataset.faceHex;
        assignMaterialToSelected(s, { faceColor: b.dataset.faceHex });
        if ((getSelectedOrFirst(s)?.constructionType || s.constructionType) === 'fileli') {
          syncSelectedFileliMetal(s, { color: b.dataset.faceHex });
        }
      });
    });
    root.querySelectorAll('[data-finish-r]').forEach(b => b.onclick = () => {
      const rVal = Number(b.dataset.finishR);
      mutate('Yüzey bitişi', s => {
        s.materialOverrides.roughness = rVal;
      });
    });
    root.querySelectorAll('[data-mcol-tab]').forEach(b => b.onclick = () => {
      matColorTab = b.dataset.mcolTab;
      renderActiveWorkspace();
    });
    root.querySelectorAll('[data-ral-target]').forEach(b => b.onclick = () => {
      ralTargetPart = b.dataset.ralTarget;
      renderActiveWorkspace();
    });
    root.querySelectorAll('[data-ral-grp]').forEach(b => b.onclick = () => {
      ralGroupFilter = b.dataset.ralGrp;
      renderActiveWorkspace();
    });
    root.querySelector('#ralSearchInput')?.addEventListener('input', e => {
      ralSearchQuery = e.target.value;
      renderActiveWorkspace();
      const inp = document.getElementById('ralSearchInput');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    });
    root.querySelectorAll('[data-ral-hex]').forEach(b => b.onclick = () => {
      const hex = b.dataset.ralHex;
      const ralColor = RAL_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase());
      mutate('RAL boya seçildi', s => applyRalCoating(s, hex, ralTargetPart, ralColor?.code || ''));
    });
    root.querySelector('#chkSideFollows')?.addEventListener('change', e => {
      mutate('Yan yüzey senkronizasyonu', s => {
        s.materials.sideFollowsFace = e.target.checked;
        assignMaterialToSelected(s, { sideFollowsFace: e.target.checked });
        if (e.target.checked && (getSelectedOrFirst(s)?.constructionType || s.constructionType) === 'fileli') {
          const obj = getSelectedOrFirst(s);
          syncSelectedFileliMetal(s, {
            id: obj?.fileMaterial || s.fileli.fileMaterial,
            color: obj?.fileColor || s.fileli.fileColor,
          });
        }
      });
    });
    root.querySelectorAll('[data-side-mat]').forEach(b => b.onclick = () => {
      const id = b.dataset.sideMat;
      mutate('Yan materyali', s => {
        s.materials.sideId = id;
        s.materials.sideColor = MATERIAL_PRESETS[id].color;
        assignMaterialToSelected(s, { sideMaterial: id, sideColor: MATERIAL_PRESETS[id].color });
      });
    });
    root.querySelector('#selFileMat')?.addEventListener('change', e => {
      const id = e.target.value;
      mutate('File materyali', s => {
        s.fileli.fileMaterial = id;
        s.fileli.fileColor = MATERIAL_PRESETS[id].color;
        assignMaterialToSelected(s, { fileMaterial: id, fileColor: MATERIAL_PRESETS[id].color });
        if ((getSelectedOrFirst(s)?.constructionType || s.constructionType) === 'fileli') {
          syncSelectedFileliMetal(s, { id, color: MATERIAL_PRESETS[id].color });
        }
      });
    });

    const bindOvr = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('Materyal ayarı', s => fn(s, Number(e.target.value)), false));
    bindOvr('ovrMetalness', (s, v) => { s.materialOverrides.metalness = v; });
    bindOvr('ovrRoughness', (s, v) => { s.materialOverrides.roughness = v; });
    bindOvr('ovrRefl', (s, v) => { s.render.reflectionIntensity = v; });
    bindOvr('ovrExposure', (s, v) => { s.render.exposure = v; });
    bindOvr('ovrBrushDir', (s, v) => { s.materialOverrides.brushDirection = v; });
    bindOvr('ovrBrushScale', (s, v) => { s.materialOverrides.brushScale = v; });
    bindOvr('ovrBrushInt', (s, v) => { s.materialOverrides.brushIntensity = v; });
    root.querySelector('#chkExploded')?.addEventListener('change', e => mutate('Patlatılmış görünüm', s => { s.render.explodedView = e.target.checked; }, false));
    bindOvr('ovrBevel', (s, v) => { s.materialOverrides.bevelMm = v; });
    bindOvr('ovrAcOpacity', (s, v) => { s.materialOverrides.acrylicOpacity = v; });
    bindOvr('ovrEnvRot', (s, v) => { s.render.envRotationDeg = v; });
    bindOvr('ovrEnvPitch', (s, v) => { s.render.envPitchDeg = v; });
    root.querySelector('#ovrCardScale')?.addEventListener('change', e => {
      const val = Math.max(0.3, Math.min(2.5, Number(e.target.value) || 1.0));
      store.update(st => { st.render.customCardScale = val; });
      if (store.get().render.useCustomEnv && is3DWorkspace(store.get())) ensureSignEngine()?.envManager?.rebuildCustomCardEnvironment({ areaScale: val });
      scheduleRebuild(true);
    });

    root.querySelectorAll('[data-env]').forEach(b => b.onclick = () => {
      mutate('Yansıma ortamı', s => {
        s.render.envPreset = b.dataset.env;
        s.render.useCustomEnv = false;
      });
    });
    root.querySelector('#customEnvUpload')?.addEventListener('change', async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      if(!is3DWorkspace(store.get()))setMainWorkspace('materials');
      await ensureSignEngine()?.envManager?.loadCustomEnvironment(f);
      mutate('Özel yansıma ortamı', s => { s.render.useCustomEnv = true; });
    });
  } else if (ws === 'lighting') {
    root.querySelectorAll('[data-lmode]').forEach(b => b.onclick = () => {
      mutate('Aydınlatma modu', s => {
        s.lighting.mode = b.dataset.lmode;
        const o = getSelectedOrFirst(s);
        if (o && !o.locked) o.lightingMode = b.dataset.lmode;
      });
    });
    root.querySelector('#chkLightEnabled')?.addEventListener('change', e => {
      mutate('Işık durumu', s => { s.lighting.enabled = e.target.checked; });
    });
    root.querySelectorAll('[data-lhex]').forEach(b => b.onclick = () => {
      mutate('Işık rengi', s => { s.lighting.colorHex = b.dataset.lhex; s.lighting.ledKind = 'mono'; });
    });
    root.querySelector('#customLightHex')?.addEventListener('input', e => {
      mutate('RGB ışık rengi', s => { s.lighting.colorHex = e.target.value; s.lighting.ledKind = 'rgb'; }, false);
    });
    const bindL = (id, key, mirrorId = null) => {
      const el = root.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('input', e => {
        const val = Number(e.target.value);
        if (mirrorId) { const m = root.querySelector('#' + mirrorId); if (m) m.value = val; }
        store.update(s => { s.lighting[key] = val; });
        scheduleRebuild(false);
      });
      el.addEventListener('change', e => mutate('Işık ayarı', s => { s.lighting[key] = Number(e.target.value); }, false));
    };
    bindL('lFrontInt', 'frontIntensity', 'lFrontIntRange');
    bindL('lFrontIntRange', 'frontIntensity', 'lFrontInt');
    bindL('lBackInt', 'backIntensity', 'lBackIntRange');
    bindL('lBackIntRange', 'backIntensity', 'lBackInt');
    bindL('lWallDist', 'wallDistanceMm', 'lWallDistRange');
    bindL('lWallDistRange', 'wallDistanceMm', 'lWallDist');
    bindL('lHaloSpread', 'haloSpread');
    bindL('lFalloff', 'falloff');
  } else if (ws === 'objects') {
    root.querySelectorAll('[data-vis]').forEach(b => b.onclick = () => mutate('Görünürlük', s => toggleLayerVisibility(s, b.dataset.vis)));
    root.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => mutate('Kilit', s => toggleLayerLock(s, b.dataset.lock)));
    root.querySelectorAll('[data-sel]').forEach(el => el.onclick = () => {
      store.update(s => { s.selectedIds = selectLayer(s, el.dataset.sel, false); });
      signEngine?.updateSelectionBox(store.get());
      updateNumericBar(store.get());
      renderActiveWorkspace();
    });
    root.querySelector('#selMoveObjPage')?.addEventListener('change', e => {
      if (e.target.value) { docManager.moveSelectedToPage(e.target.value, false); scheduleRebuild(true); renderActiveWorkspace(); }
    });
  } else if (ws === 'manufacturing') {
    const bindM = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('İmalat ayarı', s => fn(s, Number(e.target.value))));
    bindM('mfgFileW', (s, v) => { const fw = Math.max(0, Math.min(40, v)); s.fileli.fileWidthMm = fw; const o = getSelectedOrFirst(s); if (o) o.fileWidthMm = fw; });
    bindM('mfgDepth', (s, v) => { const o = getSelectedOrFirst(s); if (o) o.depthMm = Math.max(10, v); });
    bindM('mfgAcThick', (s, v) => { s.fileli.acrylicThicknessMm = Math.max(1, v); });
    bindM('mfgAcInset', (s, v) => { s.fileli.acrylicInsetMm = Math.max(0, v); });
    bindM('mfgMetThick', (s, v) => { s.fileli.fileThicknessMm = Math.max(0.5, v); });
    bindM('mfgWallThickness', (s, v) => { s.fileli.metalThicknessMm = Math.max(0.2, Math.min(3, v)); });
    root.querySelector('#mfgGoNest')?.addEventListener('click', () => setMainWorkspace('nesting'));
    root.querySelector('#mfgGoCnc')?.addEventListener('click', () => setMainWorkspace('cnc'));
  } else if (ws === 'align') {
    root.querySelectorAll('[data-dalign]').forEach(b => b.onclick = () => mutate('Hizalama', s => alignSelectedObjects(s, b.dataset.dalign)));
    root.querySelectorAll('[data-ddist]').forEach(b => b.onclick = () => mutate('Dağıtma', s => distributeSelectedObjects(s, b.dataset.ddist)));
    root.querySelectorAll('[data-dact]').forEach(b => b.onclick = () => {
      if (b.dataset.dact === 'group') mutate('Grupla', s => groupSelectedLayers(s));
      else if (b.dataset.dact === 'ungroup') mutate('Grubu çöz', s => ungroupSelectedLayers(s));
      else runCadAction(b.dataset.dact);
    });
  } else if (ws === 'layers') {
    root.querySelectorAll('[data-sel]').forEach(el => el.onclick = (e) => {
      store.update(s => { s.selectedIds = selectLayer(s, el.dataset.sel, e.ctrlKey || e.shiftKey); });
      renderActiveWorkspace();
      updateNumericBar(store.get());
    });
    root.querySelectorAll('[data-vis]').forEach(b => b.onclick = () => mutate('Katman görünürlüğü', s => toggleLayerVisibility(s, b.dataset.vis)));
    root.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => mutate('Katman kilidi', s => toggleLayerLock(s, b.dataset.lock)));
    root.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
      const obj = store.get().objects.find(o => o.id === b.dataset.ren);
      const next = prompt('Yeni katman adı:', obj?.name || '');
      if (next) mutate('Katman adı', s => renameLayer(s, b.dataset.ren, next));
    });
    root.querySelectorAll('[data-up]').forEach(b => b.onclick = () => mutate('Katman sırası', s => reorderLayer(s, b.dataset.up, 'up')));
    root.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => mutate('Katman sırası', s => reorderLayer(s, b.dataset.dn, 'down')));
    root.querySelector('#btnGrp')?.addEventListener('click', () => mutate('Grupla', s => groupSelectedLayers(s)));
    root.querySelector('#btnUngrp')?.addEventListener('click', () => mutate('Grubu çöz', s => ungroupSelectedLayers(s)));
    root.querySelector('#btnDupLayer')?.addEventListener('click', () => mutate('Çoğalt', s => duplicateSelectedLayers(s)));
    root.querySelector('#btnDelLayer')?.addEventListener('click', () => mutate('Sil', s => deleteSelectedLayers(s)));
  } else if (ws === 'background') {
    root.querySelectorAll('[data-bg-wall]').forEach(b => b.onclick = () => {
      mutate('Arka plan duvarı', s => { s.scene.wallId = b.dataset.bgWall; });
    });
    root.querySelector('#pmPhotoUpload')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        mutate('Müşteri fotoğrafı', s => {
          s.photomontage.photoUrl = reader.result;
          s.photomontage.photoName = f.name;
        });
      };
      reader.readAsDataURL(f);
    });
    root.querySelector('#pmShadow')?.addEventListener('input', e => {
      store.update(s => { s.photomontage.wallShadow = Number(e.target.value); });
      updateStageChrome(store.get());
    });
    root.querySelector('#pmAmbient')?.addEventListener('input', e => {
      store.update(s => { s.photomontage.ambientMatch = Number(e.target.value); });
    });
    root.querySelector('#btnExportPm')?.addEventListener('click', () => photomontageOverlay.exportComposite(store.get(), signEngine));
    root.querySelector('#btnClearPm')?.addEventListener('click', () => mutate('Fotoğraf kaldır', s => { s.photomontage.photoUrl = null; }));
  } else if (ws === 'nesting') {
    const bindN = (id, key) => root.querySelector('#' + id)?.addEventListener('change', e => {
      store.update(s => { s.nesting[key] = Number(e.target.value); });
    });
    root.querySelector('#nestW')?.addEventListener('change', e => applyNestingSheetSize(e.target.value, store.get().nesting.sheetHeightMm));
    root.querySelector('#nestH')?.addEventListener('change', e => applyNestingSheetSize(store.get().nesting.sheetWidthMm, e.target.value));
    bindN('nestMargin', 'marginMm');
    bindN('nestClear', 'clearanceMm');
    bindN('nestKerf', 'kerfMm');
    bindN('nestCopies', 'copies');
    root.querySelector('#nestAngleStep')?.addEventListener('change', e => store.update(s => { s.nesting.fineAngleStep = Number(e.target.value); }));
    root.querySelector('#nestPreset')?.addEventListener('change', e => {
      const p = SHEET_PRESETS.find(x => x.id === e.target.value);
      if (p) applyNestingSheetSize(p.w, p.h, p.id);
    });
    root.querySelector('#nestHole')?.addEventListener('change', e => store.update(s => { s.nesting.allowHoleNesting = e.target.checked; }));
    root.querySelector('#nestGroupMat')?.addEventListener('change', e => store.update(s => { s.nesting.groupByMaterial = e.target.checked; }));
    root.querySelector('#nestGrain')?.addEventListener('change', e => store.update(s => { s.nesting.grainDirection = e.target.value; }));
    root.querySelector('#nestTarget')?.addEventListener('change', e => store.update(s => { s.nesting.targetPart = e.target.value; }));
    root.querySelector('#btnLockNestPart')?.addEventListener('click', () => {
      if (!lastNesting || !selectedNestingId) return;
      for (const sh of lastNesting.sheets) {
        const p = sh.placements.find(x => x.id === selectedNestingId);
        if (p) p.locked = !p.locked;
      }
      renderActiveWorkspace();
    });
    root.querySelector('#btnExportNestedSvg')?.addEventListener('click', () => {
      if (!lastNesting?.sheets?.length) return;
      downloadBlob(`${store.get().projectName || 'nesting'}_nesting.svg`, generateNestedSvg(lastNesting.sheets), 'image/svg+xml');
    });
    root.querySelector('#btnExportNestedDxf')?.addEventListener('click', () => {
      if (!lastNesting?.sheets?.length) return;
      downloadBlob(`${store.get().projectName || 'nesting'}_nesting.dxf`, generateNestedDxf(lastNesting.sheets), 'application/dxf');
    });
    root.querySelector('#btnExportNestedCsv')?.addEventListener('click', () => {
      if (!lastNesting?.sheets?.length) return;
      downloadBlob(`${store.get().projectName || 'nesting'}_parcalar.csv`, generateNestedCsv(lastNesting.sheets), 'text/csv');
    });
    root.querySelector('#btnRunNesting')?.addEventListener('click', async () => {
      await runAutoNesting();
      renderActiveWorkspace();
      root.querySelector('#nestingResultsSec')?.scrollIntoView({ behavior: 'smooth' });
    });
    root.querySelectorAll('[data-pid]').forEach(el => el.onclick = () => {
      selectedNestingId = el.dataset.pid;
      renderActiveWorkspace();
    });
    root.querySelectorAll('[data-nest-nudge]').forEach(b => b.onclick = () => {
      if (!lastNesting || !selectedNestingId) return;
      const [dx, dy] = b.dataset.nestNudge.split(',').map(Number);
      for (const sh of lastNesting.sheets) {
        const p = sh.placements.find(x => x.id === selectedNestingId);
        if (p) {
          p.xMm += dx;
          p.yMm += dy;
          p.outer = p.outer.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
          p.holes = p.holes.map(h => h.map(pt => ({ x: pt.x + dx, y: pt.y + dy })));
          p.bounds.minX += dx; p.bounds.maxX += dx;
          p.bounds.minY += dy; p.bounds.maxY += dy;
          validateSheetLayout(sh, lastNesting.minSep || 5);
        }
      }
      renderActiveWorkspace();
    });
  } else if (ws === 'cost') {
    root.querySelector('#costCurrency')?.addEventListener('change', e => mutateData('Para birimi', s => { s.costConfig.currency = e.target.value; }));
    root.querySelector('#rateUsd')?.addEventListener('change', e => mutateData('USD kuru', s => { s.costConfig.rates.USD = Number(e.target.value); }));
    root.querySelector('#rateEur')?.addEventListener('change', e => mutateData('EUR kuru', s => { s.costConfig.rates.EUR = Number(e.target.value); }));
    root.querySelector('#pricingMode')?.addEventListener('change', e => mutateData('Fiyatlandırma yöntemi', s => { s.costConfig.pricingMode = e.target.value; }));
    root.querySelector('#profitPct')?.addEventListener('change', e => mutateData('Kar oranı', s => {
      if (s.costConfig.pricingMode === 'margin') s.costConfig.marginPct = Number(e.target.value);
      else s.costConfig.markupPct = Number(e.target.value);
    }));
    root.querySelector('#overheadPct')?.addEventListener('change', e => mutateData('Genel gider', s => { s.costConfig.overheadPct = Number(e.target.value); }));
    root.querySelector('#discountPct')?.addEventListener('change', e => mutateData('İndirim', s => { s.costConfig.discountPct = Number(e.target.value); }));
    root.querySelector('#mountingId')?.addEventListener('change', e => mutateData('Montaj tipi', s => { s.costConfig.mountingId = e.target.value; }));
  } else if (ws === 'quote') {
    const bindQ = (id, key, isNum = false) => root.querySelector('#' + id)?.addEventListener('change', e => {
      store.update(s => { s.quote[key] = isNum ? Number(e.target.value) : e.target.value; });
    });
    bindQ('qCompName', 'companyName');
    bindQ('qCustName', 'customerName');
    bindQ('qCustComp', 'customerCompany');
    bindQ('qDelivery', 'deliveryTerms');
    bindQ('qDays', 'productionDays', true);
    bindQ('qValid', 'validityDays', true);
    root.querySelector('#qLock')?.addEventListener('change', e => {
      store.update(s => {
        s.quote.locked = e.target.checked;
        s.quote.lockedSnapshot = e.target.checked
          ? { costs: structuredCloneSafe(lastCosts), metrics: structuredCloneSafe(lastMetrics) }
          : null;
      });
    });
    root.querySelector('#btnCopyQuoteText')?.addEventListener('click', async () => {
      const s = store.get();
      const text = [
        `📋 *${s.projectName}*`,
        `Ölçü: ${lastMetrics.totalWidthMm} × ${lastMetrics.totalHeightMm} mm`,
        `Parça: ${lastMetrics.componentCount} adet · LED: ${lastMetrics.totalLedModules} modül`,
        `KDV Dahil Toplam: ${formatMoney(lastCosts.grandTotal, lastCosts.currency)}`,
        `Teslimat: ${s.quote.productionDays} iş günü`,
      ].join("\n");
      try { await navigator.clipboard.writeText(text); } catch {}
    });
    root.querySelector('#btnPrintQuote')?.addEventListener('click', () => {
      const previewUrl = is3DWorkspace(store.get())&&signEngine&&!signEngine.isDisposed?signEngine.capturePng(1200,750):null;
      const html = buildQuoteHtml(store.get(), lastMetrics, lastCosts, previewUrl);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      } else {
        downloadBlob(`${store.get().projectName || 'teklif'}_teklif.html`, html, 'text/html');
      }
    });
  } else if (ws === 'projects') {
    root.querySelector('#btnSaveBrowser')?.addEventListener('click', () => {
      saveProjectToBrowser(store.get().projectName, store.get());
      renderActiveWorkspace();
    });
    root.querySelector('#importJsonInput')?.addEventListener('change', async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const loaded = deserializeProject(await f.text());
        history.push(store.get(), 'Proje yükle');
        store.set(loaded);
        scheduleRebuild(true);
        renderActiveWorkspace();
      } catch (err) {
        const warnEl = document.getElementById('stageWarning');
        if (warnEl) { warnEl.textContent = err.message || 'Proje dosyası yüklenemedi.'; warnEl.classList.remove('hidden'); }
      }
    });
    root.querySelectorAll('[data-load-proj]').forEach(b => b.onclick = () => {
      const entry = listSavedProjects().find(p => p.id === b.dataset.loadProj);
      if (!entry) return;
      const loaded = deserializeProject(entry.data);
      history.push(store.get(), 'Proje aç');
      store.set(loaded);
      scheduleRebuild(true);
      renderActiveWorkspace();
    });
    root.querySelectorAll('[data-del-proj]').forEach(b => b.onclick = () => {
      deleteSavedProject(b.dataset.delProj);
      renderActiveWorkspace();
    });
  }
}

async function handleLogoUpload(file) {
  if (!file) return;
  const statusEl = document.getElementById('logoTraceStatus');
  if (statusEl) statusEl.textContent = 'Logo vektöre çevriliyor...';

  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  let parsed = null;
  try {
    if (isSvg) {
      parsed = parseSvgLogo(await file.text());
    } else {
      const url = URL.createObjectURL(file);
      parsed = await traceRasterLogo(url, logoTraceOptions);
      if (parsed) parsed.preview = await generateCutoutPreview(url, logoTraceOptions.bgTolerance);
      URL.revokeObjectURL(url);
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    if (statusEl) statusEl.textContent = 'Logoda biçim algılanamadı. Toleransı ayarlayın.';
    return;
  }

  mutate('Logo eklendi', s => {
    const logoObj = createShapeObject('logo', s, {
      name: `Logo: ${file.name}`,
      heightMm: 450,
      xMm: -400,
      logoData: parsed,
    });
    s.objects.push(logoObj);
    s.selectedIds = [logoObj.id];
  });
  if (statusEl) statusEl.textContent = `${parsed.parts.length} bağımsız logo parçası 3D olarak eklendi.`;
}


/* ---------------- On-Canvas Floating CAD Transform HUD ---------------- */
function positionCanvasTransformHud(state) {
  const hud = document.getElementById('canvasTransformHud');
  if (!hud || hud.classList.contains('hidden') || !signEngine) return;
  const sel = state.objects.find(o => state.selectedIds.includes(o.id));
  if (!sel) { hud.classList.add('hidden'); return; }
  const bounds = signEngine.getSelectedScreenBounds([sel.id]);
  const wrap = document.getElementById('stageWrap');
  if (!bounds || !wrap) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const cx = Math.max(150, Math.min(w - 150, bounds.centerX));
  const cy = Math.max(92, Math.min(h - 70, bounds.top - 12));
  hud.style.left = `${cx}px`;
  hud.style.top = `${cy}px`;
}

function renderCanvasTransformHud(state) {
  const hud = document.getElementById('canvasTransformHud');
  if (!hud) return;
  if (!['design2d', 'model3d', 'materials'].includes(state.mainWorkspace || 'model3d')) { hud.classList.add('hidden'); return; }
  const tool = state.activeTool;
  // The HUD belongs only to an explicitly selected object. Falling back to
  // the first object caused its onFrame repositioner to hide it every frame.
  const sel = state.objects.find(o => (state.selectedIds || []).includes(o.id));
  if (!sel || sel.locked) {
    hud.classList.add('hidden');
    return;
  }
  const currentKey = tool + '|' + sel.id;
  const displayUnit=normalizeDisplayUnit(state.pageLayout?.displayUnit);
  if (hud.dataset.dismissedKey === currentKey) {
    hud.classList.add('hidden');
    return;
  }
  if (!hud._focusPreservationBound) {
    hud._focusPreservationBound = true;
    hud.addEventListener('focusout', () => setTimeout(() => {
      if (hud.dataset.pendingRefresh === '1' && !hud.contains(document.activeElement)) {
        hud.dataset.pendingRefresh = '0';
        renderCanvasTransformHud(store.get());
      }
    }, 0));
  }
  if (hud.dataset.hudTool === tool && hud.dataset.hudSel === sel.id && hud.dataset.displayUnit===displayUnit &&
      hud.contains(document.activeElement) &&
      /^(INPUT|SELECT|TEXTAREA)$/i.test(document.activeElement?.tagName || '')) {
    hud.dataset.pendingRefresh = '1';
    positionCanvasTransformHud(state);
    return;
  }
  hud.dataset.pendingRefresh = '0';
  hud.dataset.displayUnit=displayUnit;
  if (!['select', 'scale', 'rotate', 'move'].includes(tool)) {
    const tips = {
      pan: '✋ Sahneyi sürükleyerek kaydırın • Çıkış: Esc',
      pen: '✒ Noktalara tıklayarak çokgen çizin • Kapatmak için ilk noktaya tıklayın • İptal: Esc',
      node: '◈ Çokgen köşe noktalarını seçip düzenleyin • Çıkış: Esc',
      measure: '📏 Başlangıçtan bitişe tıklayıp sürükleyerek ölçün • İptal: Esc',
    };
    if (tips[tool]) {
      hud.innerHTML = `<div class="hud-head"><span>${tips[tool]}</span></div>`;
      hud.classList.remove('hidden');
      positionCanvasTransformHud(state);
    } else {
      hud.classList.add('hidden');
    }
    return;
  }

  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(roundMm(mm),unit);
  const actualSize=objectPhysicalSize(sel);
  const curW=show(actualSize.widthMm),curH=show(actualSize.heightMm);
  const locked = sel.proportionalLock !== false;

  // Avoid clobbering active input focus unless tool/selection changed
  const prevTool = hud.dataset.hudTool;
  const prevSel = hud.dataset.hudSel;
  const activeId = document.activeElement?.closest('#canvasTransformHud') ? document.activeElement.id : null;

  if (tool === 'scale') {
    hud.innerHTML = `
      <div class="hud-head">
        <span>⤢ Ölçek &amp; Ebat (${unit})</span>
        <button type="button" id="hudScaleLock" class="hud-lock-btn ${locked ? 'on' : ''}" title="Oranı Kilitle / Serbest Bırak">
          ${locked ? '🔒 Oran Kilitli' : '🔓 Serbest Ebat'}
        </button>
      </div>
      <div class="hud-row">
        <label class="hud-field"><span>G (${unit})</span><input id="hudScaleW" type="number" min="0" step="any" value="${curW}"></label>
        <label class="hud-field"><span>Y (${unit})</span><input id="hudScaleH" type="number" min="0" step="any" value="${curH}"></label>
      </div>
      <div class="hud-chips">
        <button type="button" class="hud-chip" data-hud-sf="0.5">%50</button>
        <button type="button" class="hud-chip" data-hud-sf="1">%100</button>
        <button type="button" class="hud-chip" data-hud-sf="1.5">%150</button>
        <button type="button" class="hud-chip" data-hud-sf="2">%200</button>
      </div>
      <div style="font-size:10px;color:#9aa4b4">💡 Nesneyi sürükleyerek ölçekleyin • Boş alan: 3D Kamera • İptal: Esc</div>
    `;

    hud.querySelector('#hudScaleLock').onclick = () => mutate('Oran kilidi', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o) o.proportionalLock = !(o.proportionalLock !== false);
    });

    const applyDim = (axis,newMm) => {mutate('Ebat ölçekleme',s=>{const o=s.objects.find(x=>x.id===sel.id);if(o)resizeObjectToMm(o,axis,newMm,objectPhysicalSize(o));});};

    hud.querySelector('#hudScaleW').onchange = (e) => applyDim('w', displayToMm(e.target.value,unit));
    hud.querySelector('#hudScaleH').onchange = (e) => applyDim('h', displayToMm(e.target.value,unit));
    hud.querySelectorAll('[data-hud-sf]').forEach(b => b.onclick = () => {
      const f = Number(b.dataset.hudSf);
      mutate('Hızlı ölçek', s => {
        const o = s.objects.find(x => x.id === sel.id);
        if (o && !o.locked) { o.scaleX = f; o.scaleY = f; }
      });
    });
  } else if (tool === 'rotate') {
    hud.innerHTML = `
      <div class="hud-head">
        <span>↻ 3D Döndürme (X / Y / Z)</span>
        <button type="button" id="hudRotReset3d" class="hud-chip">↺ 3D Sıfırla</button>
      </div>
      <div class="hud-row">
        <label class="hud-field"><span>X°</span><input id="hudRotX" type="number" min="-180" max="180" step="5" value="${Math.round(sel.rotXDeg || 0)}"></label>
        <label class="hud-field"><span>Y°</span><input id="hudRotY" type="number" min="-180" max="180" step="5" value="${Math.round(sel.rotYDeg || 0)}"></label>
        <label class="hud-field"><span>Z°</span><input id="hudRotDeg" type="number" min="-360" max="360" step="5" value="${Math.round(sel.rotationDeg || 0)}"></label>
      </div>
      <div class="hud-chips">
        <button type="button" class="hud-chip" data-hud-rot="-90">-90° Z</button>
        <button type="button" class="hud-chip" data-hud-rot="-45">-45° Z</button>
        <button type="button" class="hud-chip" data-hud-rot="0">0° Z</button>
        <button type="button" class="hud-chip" data-hud-rot="45">+45° Z</button>
        <button type="button" class="hud-chip" data-hud-rot="90">+90° Z</button>
      </div>
      <div style="font-size:10px;color:#9aa4b4">💡 Nesneyi sürükleyerek 3D döndürün (Shift: Z) • Boş alan: 3D Kamera • İptal: Esc</div>
    `;
    hud.querySelector('#hudRotX').onchange = (e) => mutate('3D X açısı', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.rotXDeg = Number(e.target.value) || 0;
    });
    hud.querySelector('#hudRotY').onchange = (e) => mutate('3D Y açısı', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.rotYDeg = Number(e.target.value) || 0;
    });
    hud.querySelector('#hudRotDeg').onchange = (e) => mutate('Z açısı', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.rotationDeg = Number(e.target.value) || 0;
    });
    hud.querySelector('#hudRotReset3d').onclick = () => mutate('3D açı sıfırla', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) { o.rotXDeg = 0; o.rotYDeg = 0; o.rotationDeg = 0; }
    });
    hud.querySelectorAll('[data-hud-rot]').forEach(b => b.onclick = () => mutate('Hızlı açı', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.rotationDeg = Number(b.dataset.hudRot);
    }));
  } else if (tool === 'move' || tool === 'select') {
    hud.innerHTML = `
      <div class="hud-head">
        <span>✥ Konum &amp; Ebat (${unit})</span>
        <button type="button" id="hudScaleLock" class="hud-lock-btn ${locked ? 'on' : ''}" title="Oranı Kilitle / Serbest Bırak">
          ${locked ? '🔒 Oran Kilitli' : '🔓 Serbest'}
        </button>
      </div>
      <div class="hud-row">
        <label class="hud-field"><span>G (${unit})</span><input id="hudScaleW" type="number" min="0" step="any" value="${curW}"></label>
        <label class="hud-field"><span>Y (${unit})</span><input id="hudScaleH" type="number" min="0" step="any" value="${curH}"></label>
        <label class="hud-field"><span>Çıta (${unit})</span><input id="hudDepthMm" type="number" min="0" step="any" value="${show(sel.depthMm || 80)}"></label>
      </div>
      <div class="hud-row">
        <label class="hud-field"><span>X (${unit})</span><input id="hudMoveX" type="number" step="any" value="${show(sel.xMm || 0)}"></label>
        <label class="hud-field"><span>Y (${unit})</span><input id="hudMoveY" type="number" step="any" value="${show(sel.yMm || 0)}"></label>
        <button type="button" id="hudMoveCenter" class="hud-chip">⌖ Ortala</button>
      </div>
    `;
    hud.querySelector('#hudScaleLock').onclick = () => mutate('Oran kilidi', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o) o.proportionalLock = !(o.proportionalLock !== false);
    });
    const applyDim2 = (axis,newMm) => {mutate('Ebat ölçekleme',s=>{const o=s.objects.find(x=>x.id===sel.id);if(o)resizeObjectToMm(o,axis,newMm,objectPhysicalSize(o));});};
    hud.querySelector('#hudScaleW').onchange = (e) => applyDim2('w', displayToMm(e.target.value,unit));
    hud.querySelector('#hudScaleH').onchange = (e) => applyDim2('h', displayToMm(e.target.value,unit));
    hud.querySelector('#hudDepthMm').onchange = (e) => mutate('Kenar çıta ebatı', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.depthMm = Math.max(10, displayToMm(e.target.value,unit) || 80);
    });
    hud.querySelector('#hudMoveX').onchange = (e) => mutate('X konumu', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.xMm = displayToMm(e.target.value,unit) || 0;
    });
    hud.querySelector('#hudMoveY').onchange = (e) => mutate('Y konumu', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) o.yMm = displayToMm(e.target.value,unit) || 0;
    });
    hud.querySelector('#hudMoveCenter').onclick = () => mutate('Sayfaya ortala', s => {
      const o = s.objects.find(x => x.id === sel.id);
      if (o && !o.locked) { o.xMm = 0; o.yMm = 0; }
    });
  }

  // Keep dismissal explicit; editing fields never closes the floating panel.
  const header = hud.querySelector('.hud-head');
  if (header) {
    const close = document.createElement('button');
    close.type = 'button';
    close.id = 'hudCloseBtn';
    close.className = 'hud-close-btn';
    close.title = 'Paneli kapat';
    close.setAttribute('aria-label', 'Konum ve ebat panelini kapat');
    close.textContent = '✕';
    header.prepend(close);
    close.onclick = e => {
      e.stopPropagation();
      hud.dataset.dismissedKey = currentKey;
      hud.classList.add('hidden');
    };
  }
  hud.dataset.hudTool = tool;
  hud.dataset.hudSel = sel.id;
  hud.classList.remove('hidden');
  positionCanvasTransformHud(state);
  if (activeId && prevTool === tool && prevSel === sel.id) {
    hud.querySelector(`#${activeId}`)?.focus?.();
  }
}


/* ---------------- 4-Tier Tab & Central Workspace Orchestration ---------------- */
function renderDocumentTabs() {
  const list = document.getElementById('documentTabsList');
  if (!list) return;
  list.innerHTML = docManager.documents.map(d => `
    <div class="doc-tab ${d.id === docManager.activeDocId ? 'on' : ''}" role="tab" tabindex="0" aria-selected="${d.id === docManager.activeDocId}" data-doc-id="${d.id}" title="Çift tıkla: Yeniden adlandır">
      <span class="doc-title">${escapeHtml(d.title)}${d.dirty ? '<span class="doc-dirty"> *</span>' : ''}</span>
      <button type="button" data-doc-close="${d.id}" title="Belgeyi Kapat">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-doc-id]').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('[data-doc-close]')) return;
      nestingRepackController?.abort();currentNestingImportController?.abort();
      docManager.switchDocument(el.dataset.docId);
      setMainWorkspace(store.get().mainWorkspace || 'model3d');
      scheduleRebuild(true);
      renderActiveWorkspace();
      renderDocumentTabs();
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
    el.ondblclick = () => {
      const doc = docManager.documents.find(x => x.id === el.dataset.docId);
      const next = prompt('Belge / Proje adı:', doc?.title || '');
      if (next) { docManager.renameDocument(el.dataset.docId, next); renderDocumentTabs(); }
    };
  });

  list.querySelector('.doc-tab.on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  list.querySelectorAll('[data-doc-close]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const res = docManager.closeDocument(btn.dataset.docClose, false);
    if (res.needsConfirm) {
      if (confirm(`"${res.title}" belgesinde kaydedilmemiş değişiklikler var. Kapatmak istiyor musunuz?`)) {
        docManager.closeDocument(btn.dataset.docClose, true);
      } else return;
    }
    setMainWorkspace(store.get().mainWorkspace || 'model3d');
    scheduleRebuild(true);
    renderActiveWorkspace();
  });
}

function renderPageTabs() {
  const list = document.getElementById('pageTabsList');
  if (!list) return;
  const st = store.get();
  const pages = st.pages || [];
  list.innerHTML = pages.map(p => `
    <button type="button" class="page-tab ${p.id === st.activePageId ? 'on' : ''}" data-page-id="${p.id}" title="Çift tıkla: Sayfa adını değiştir">
      ${escapeHtml(p.name)}
    </button>
  `).join('');

  list.querySelectorAll('[data-page-id]').forEach(btn => {
    btn.onclick = () => {
      nestingRepackController?.abort();currentNestingImportController?.abort();
      if (docManager.switchPage(btn.dataset.pageId)) {
        scheduleRebuild(true);
        renderActiveWorkspace();
      }
    };
    btn.ondblclick = () => {
      const p = store.get().pages.find(x => x.id === btn.dataset.pageId);
      const next = prompt('Sayfa adı:', p?.name || '');
      if (next) { docManager.renamePage(btn.dataset.pageId, next); renderPageTabs(); }
    };
  });
}

function setMainWorkspace(ws) {
  const previous=store.get().mainWorkspace;
  if(previous!==ws){nestingGesture?.cancel?.();nestingGesture=null;}
  store.updateScoped([],s => { s.mainWorkspace = ws; });
  document.querySelectorAll('#mainWorkspaceTabs button').forEach(b => b.classList.toggle('on', b.dataset.mainWs === ws));

  const is3D = ws === 'model3d' || ws === 'materials';
  document.getElementById('threeContainer')?.classList.toggle('hidden', !is3D);
  document.getElementById('stageViewsBar')?.classList.toggle('hidden', !is3D);
  document.getElementById('stageBottomTools')?.classList.toggle('hidden', !is3D);
  document.getElementById('vector2DWrap')?.classList.toggle('hidden', ws !== 'design2d');
  document.getElementById('nestingCenterWrap')?.classList.toggle('hidden', ws !== 'nesting');
  document.getElementById('cncCenterWrap')?.classList.toggle('hidden', ws !== 'cnc');
  document.getElementById('costCenterWrap')?.classList.toggle('hidden', ws !== 'cost');
  if(is3D){const engine=ensureSignEngine();engine?.setActive?.(true);if(previous!==ws)scheduleRebuild(true);}
  else signEngine?.setActive?.(false);
  syncWorkspaceRail(ws);

  if (ws === 'materials') {
    store.update(s => { s.activeWorkspace = 'materials'; });
    renderActiveWorkspace();
  }
  if (ws === 'design2d' && vector2D) {
    vector2D.render(store.get(), fontMap);
  }
  updateCenterWorkspaces(store.get());
  updateNumericBar(store.get());
}

// Keep the Nesting sheet-size editor mounted. Replacing the entire workspace DOM
// on every mutation closes native <select> menus and discards input focus.
function syncNestingSettingsControls(sidebar, nesting) {
  if (!sidebar) return;
  const values = {
    cwsNestPreset: SHEET_PRESETS.find(p => p.w === nesting.sheetWidthMm && p.h === nesting.sheetHeightMm)?.id || 'custom',
    cwsNestW: nesting.sheetWidthMm,
    cwsNestH: nesting.sheetHeightMm,
    cwsNestSp: nesting.clearanceMm,
    cwsNestMg: nesting.marginLeftMm,
    cwsNestRot: nesting.rotationStepDeg ?? 90,
    cwsNestStrategy: nesting.placementStrategy || 'compact',
    cwsNestBudget: nesting.optimizationBudgetMs||7000,
    cwsNestBodyColor: nesting.previewColors?.body || '#c89343',
    cwsNestHoleColor: nesting.previewColors?.holes || '#c89343',
    cwsNestHoles: nesting.allowHoleNesting,
    cwsNestGrain: nesting.enforceGrainDirection,
  };
  for (const [id, value] of Object.entries(values)) {
    const input = sidebar.querySelector('#' + id);
    if (!input || value == null || input === document.activeElement) continue;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (String(input.value) !== String(value)) input.value = String(value);
  }
}

function updateCenterWorkspaces(state) {
  const ws = state.mainWorkspace || 'model3d';
  if (ws === 'nesting') {
    const el = document.getElementById('nestingCenterWrap');
    if (el) {
      const grid = el.querySelector('.center-ws-grid');
      const currentTabId = el.querySelector('.nesting-workspace[data-nesting-tab]')?.getAttribute('data-nesting-tab');
      const targetTabId = state.nesting.activeTabId || 'design';
      if(currentNestingImportController&&targetTabId==='import'&&currentTabId==='import')return;
      if(nestingGesture?.active)return;
      const html=renderNestingCenter(state,{activeSheetIdx,selectedPlacementId:selectedNestingId});
      if(el._lastHtml===html)return;
      el._lastHtml=html;
      if (grid && currentTabId === targetTabId && grid.querySelector('.cws-side-r')) {
        // Replace only changing parts; preserve the exact right-panel DOM node.
        const template = document.createElement('template');
        template.innerHTML = html;
        for (const cls of ['cws-side', 'cws-main', 'cws-bottom']) {
          const current = grid.querySelector(':scope > .' + cls);
          const next = template.content.querySelector('.' + cls);
          if (current && next) current.replaceWith(next);
        }
        const tabs = el.querySelector('.nesting-source-tabs');
        const nextTabs = template.content.querySelector('.nesting-source-tabs');
        if (tabs && nextTabs) tabs.replaceWith(nextTabs);
        syncNestingSettingsControls(grid.querySelector('.cws-side-r'), state.nesting);
      } else {
        el.innerHTML = html;
      }
      bindNestingCenterEvents(el);
    }
  } else if (ws === 'cnc') {
    const el = document.getElementById('cncCenterWrap');
    if (el) {
      el.innerHTML = renderCncCenter(state);
      bindCncCenterEvents(el);
    }
  } else if (ws === 'cost') {
    const el = document.getElementById('costCenterWrap');
    if (el) {
      const oldScroll = el.scrollTop;
      el.innerHTML = renderCostCenter(state, lastMetrics, lastCosts, {tab:activeCostTab,role:activeCostRole});
      bindCostCenterEvents(el);
      el.scrollTop = oldScroll;
    }
  }
}

// All geometry-affecting settings repack in one undoable operation, keeping
// the physical sheet, stored placements, DXF and preview synchronized.
let nestingRepackController=null;
async function repackNestingSettings(label,updateNesting,quickImport=true){
  nestingRepackController?.abort();
  const controller=new AbortController();nestingRepackController=controller;
  const previous=store.get(),tab=previous.nesting.activeTabId||'design',docId=docManager.activeDocId,pageId=previous.activePageId;
  const next=structuredCloneSafe(previous.nesting);updateNesting(next);
  const items=applyNestingPartOverrides(getActiveNestingImportedItems(next)??extractNestingItems(lastSceneResult.metricsList||[],{...previous,nesting:next}),next);
  const button=document.getElementById('cwsRunNesting');
  if(button)button.textContent='İşleniyor… (tekrar tıkla: iptal)';
  try{
    let result={sheets:[],unplaced:[]};
    if(items.length){const out=await runVectorImportJob({jobId:Date.now(),operation:'nest',imported:{items},nesting:{...Object.fromEntries(Object.entries(next).filter(([key])=>!['sheets','unplaced','importedTabs','designTabSnapshot'].includes(key))),quickImport},lockedSheets:next.sheets?.filter(sh=>sh.placements.some(p=>p.locked))||[]},{signal:controller.signal});result=out.nesting;}
    if(controller.signal.aborted||docManager.activeDocId!==docId||store.get().activePageId!==pageId||(store.get().nesting.activeTabId||'design')!==tab)return;
    lastNesting=result;activeSheetIdx=0;selectedNestingId=null;
    next.optimizationInfo=result.optimization||null;
    mutateData(label,st=>{const {importedTabs,designTabSnapshot,activeTabId,...settings}=next;st.nesting={...st.nesting,...settings,sheets:result.sheets,unplaced:result.unplaced};},false);
    updateCenterWorkspaces(store.get());
  }catch(err){if(!controller.signal.aborted){const warning=document.getElementById('stageWarning');if(warning){warning.textContent=String(err.message||err);warning.classList.remove('hidden');}}}
  finally{if(nestingRepackController===controller){nestingRepackController=null;const btn=document.getElementById('cwsRunNesting');if(btn)btn.textContent='Otomatik Yerleştir';}}
}

function applyNestingSheetSize(width, height, presetId = 'custom') {
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 200 || h < 200 || w > 10000 || h > 10000) return;
  repackNestingSettings('Levha ebatı ve yerleşimi', n => {
    n.sheetWidthMm = w;
    n.sheetHeightMm = h;
    n.presetId = presetId;
  });
}

function runAutoNesting(){
  if(nestingRepackController){nestingRepackController.abort();return;}
  return repackNestingSettings('Otomatik Nesting',()=>{},false);
}

function openNestingVectorImport(openPicker = false) {
  mutateData('Nesting içe aktar sekmesi', s => openNestingImportTab(s.nesting), false);
  activeSheetIdx = 0;
  selectedNestingId = null;
  setMainWorkspace('nesting');
  if (openPicker) document.getElementById('nestVectorFileInput')?.click();
}

let currentNestingImportController = null;
async function importNestingVectorFiles(fileList, root) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const status = root.querySelector('#nestImportMessage');
  const cancel = root.querySelector('#nestImportCancel');
  const picker = root.querySelector('#nestVectorFileInput');
  const zone = root.querySelector('#nestVectorDropZone');
  const say = message => { if (status) status.textContent = message; };
  if (currentNestingImportController) {say('Mevcut içe aktarmayı tamamlayın veya iptal edin.');return;}
  const unit = root.querySelector('#nestImportUnit')?.value || 'auto';
  const scale = Number(root.querySelector('#nestImportScale')?.value || 1);
  const tolerance = Number(root.querySelector('#nestImportTolerance')?.value || 1);
  if (!(scale > 0 && scale <= 1000) || !(tolerance > 0)) {say('Ölçek veya hassasiyet geçersiz.');return;}
  const controller = new AbortController();
  currentNestingImportController=controller;
  const importDocId=docManager.activeDocId,importPageId=store.get().activePageId;
  if(cancel)cancel.hidden=false;
  if(picker)picker.disabled=true;
  zone?.classList.add('nesting-drop-busy');
  const ready=[],errors=[];
  try {
    for (let j=0;j<files.length;j++){
      if(controller.signal.aborted)break;
      const file=files[j],ext=file.name.toLowerCase().split('.').pop();
      say((j+1)+'/'+files.length+' · '+file.name+' okunuyor…');
      try {
        let job,filename=file.name;
        const options={unit,scale,tolerance},nesting=Object.fromEntries(Object.entries(store.get().nesting).filter(([key])=>!['sheets','unplaced','importedTabs','designTabSnapshot'].includes(key)));
        if(ext==='pdf'||(ext==='ai'&&(await file.slice(0,12).text()).startsWith('%PDF-'))){
          const output=await importPdfFile(file,options,text=>say(file.name+': '+text),controller.signal);
          if(controller.signal.aborted)break;
          job={jobId:j,operation:'importPdfPages',pages:output.pages,ops:output.ops,warnings:output.warnings,
               filename:file.name,options,nesting};
        }else{
          let text;
          if(ext==='svgz'){
            if(typeof DecompressionStream!=='function')throw Error('Bu tarayıcı yerel SVGZ gzip açma desteğine sahip değil.');
            text=await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
            filename=filename.replace(/\.svgz$/i,'.svg');
          }else text=await file.text();
          if(controller.signal.aborted)break;
          job={jobId:j,operation:'importText',text,filename,options,nesting};
        }
        const output=await runVectorImportJob(job,{
          signal:controller.signal,onStatus:msg=>say(file.name+': '+msg)});
        ready.push(output);
        say(file.name+': '+output.imported.items.length+' parça çözümlendi; hızlı levha yerleşimi hazır.');
        await new Promise(resolve=>setTimeout(resolve,0));
      }catch(error){
        if(controller.signal.aborted)break;
        errors.push(file.name+': '+(error?.message||'İçe aktarılamadı'));
      }
    }
    // Preserve the entire import picker and native controls until all CPU-heavy
    // worker calculations have completed; commit tabs in one state transaction.
    if(ready.length&&!controller.signal.aborted&&docManager.activeDocId===importDocId&&store.get().activePageId===importPageId){
      mutateData('Nesting vektör içe aktarımı ('+ready.length+' dosya)',state=>{
        for(const job of ready){
          switchNestingTab(state.nesting,'import');
          createNestingImportedTab(state.nesting,job.imported);
          state.nesting.sheets=job.nesting.sheets;
          state.nesting.unplaced=job.nesting.unplaced;
          syncActiveNestingTab(state.nesting);
        }
      },false);
      activeSheetIdx=0;selectedNestingId=null;
      setMainWorkspace('nesting');
      updateCenterWorkspaces(store.get());
    }
    if(errors.length||controller.signal.aborted){
      const warning=document.getElementById('stageWarning');
      if(warning){warning.textContent=(controller.signal.aborted?'İşlem iptal edildi. ':'')+errors.join(' · ').slice(0,800);warning.classList.remove('hidden');}
      if(!ready.length)say((controller.signal.aborted?'İşlem iptal edildi. ':'')+errors.join(' · '));
    }else if(!ready.length)say('İçe aktarılacak kapalı kontur bulunamadı.');
  }finally{
    currentNestingImportController=null;
    if(cancel)cancel.hidden=true;
    if(picker){picker.disabled=false;picker.value='';}
    zone?.classList.remove('nesting-drop-busy');
  }
}

let nestingTool='select',nestingGesture=null;
function nestingSeparation(n){return Math.max(.5,(n.clearanceMm??5)+(n.kerfMm??.4));}
function getNestingSelection(){return store.get().nesting.sheets?.[activeSheetIdx]?.placements.find(p=>p.id===selectedNestingId);}
function applyNestingEdit(n,p,action,value){
  if(p.locked)return false;
  if(['width','height','scale'].includes(action)){
    const factor=action==='width'?value/p.bounds.width:action==='height'?value/p.bounds.height:value;
    if(!Number.isFinite(factor)||factor<=0||factor>100)return false;
    if(!editNestingPlacement(p,'scale',factor))return false;
    n.partOverrides||={};const old=n.partOverrides[p.id]||{};
    n.partOverrides[p.id]={...old,scale:(old.scale||1)*factor};
    return true;
  }
  if(action==='rot'&&n.enforceGrainDirection&&Math.abs(value%180)>1e-6)return false;
  return editNestingPlacement(p,action,value);
}
function editSelectedNesting(action,value){
  const current=getNestingSelection();if(!current||current.locked&&action!=='toggleLock')return;
  nestingRepackController?.abort();
  const id=current.id;
  mutateData('Nesting parça '+action,s=>{
    const n=s.nesting,sh=n.sheets[activeSheetIdx],p=sh?.placements.find(x=>x.id===id);
    if(!p)return;
    if(action==='delete'){
      n.partOverrides||={};n.partOverrides[id]={...(n.partOverrides[id]||{}),deleted:true};
      sh.placements=sh.placements.filter(x=>x.id!==id);
      n.unplaced=(n.unplaced||[]).filter(x=>(x.item?.id||x.id)!==id);
      selectedNestingId=null;
    }else if(action==='toggleLock')p.locked=!p.locked;
    else if(action==='move'){applyNestingEdit(n,p,'x',value.x);applyNestingEdit(n,p,'y',value.y);}
    else applyNestingEdit(n,p,action,value);
    refreshNestingSheet(sh,nestingSeparation(n));
  },false);
}
function syncWorkspaceRail(ws){
  const isNest=ws==='nesting',supported=new Set(['select','move','scale','rotate','logo']);
  for(const b of document.querySelectorAll('.cad-rail [data-tool]')){
    b.disabled=isNest&&!supported.has(b.dataset.tool);
    b.classList.toggle('active',b.dataset.tool===(isNest?nestingTool:store.get().activeTool));
  }
  for(const b of document.querySelectorAll('.cad-rail [data-action]'))b.disabled=isNest&&b.dataset.action!=='delete';
}
function selectNestingPart(id){
  selectedNestingId=id;
  // Do not replace the SVG during a captured pointer gesture.
  const root=document.getElementById('nestingCenterWrap');
  if(nestingGesture?.active){
    root?.querySelectorAll('[data-pid]').forEach(g=>g.classList.toggle('nest-picked',g.dataset.pid===id));
    updateNumericBar(store.get());return;
  }
  updateCenterWorkspaces(store.get());updateNumericBar(store.get());
}
function bindNestingGestures(root){
  const svg=root.querySelector('.nesting-sheet-svg');if(!svg||svg._gestureBound)return;
  svg._gestureBound=true;svg.style.touchAction='none';
  const point=e=>{const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse());};
  let drag=null;
  const cancel=()=>{if(!drag)return;drag.group?.removeAttribute('transform');drag=null;if(nestingGesture)nestingGesture.active=false;};
  nestingGesture={active:false,cancel};
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0||!['select','move','rotate','scale'].includes(nestingTool))return;
    const group=e.target.closest('[data-pid]');if(!group){selectNestingPart(null);return;}
    e.preventDefault();e.stopPropagation();
    const part=store.get().nesting.sheets?.[activeSheetIdx]?.placements.find(p=>p.id===group.dataset.pid);
    if(!part)return;
    const start=point(e),h=store.get().nesting.sheets[activeSheetIdx].heightMm;
    const center={x:(part.bounds.minX+part.bounds.maxX)/2,y:h-(part.bounds.minY+part.bounds.maxY)/2};
    drag={part,group,start,center,h,tool:nestingTool==='select'?'move':nestingTool,pointer:e.pointerId,moved:false,dx:0,dy:0,factor:1,angle:0};
    nestingGesture.active=true;selectNestingPart(part.id);svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    if(!drag||drag.pointer!==e.pointerId||drag.part.locked)return;
    const p=point(e),d=drag;d.dx=p.x-d.start.x;d.dy=p.y-d.start.y;
    if(Math.hypot(d.dx,d.dy)<.5&&!d.moved)return;
    d.moved=true;
    if(d.tool==='move')d.group.setAttribute('transform','translate('+d.dx+' '+d.dy+')');
    if(d.tool==='rotate'){
      let a=(Math.atan2(p.y-d.center.y,p.x-d.center.x)-Math.atan2(d.start.y-d.center.y,d.start.x-d.center.x))*180/Math.PI;
      if(e.shiftKey)a=Math.round(a/15)*15;
      if(store.get().nesting.enforceGrainDirection)a=Math.round(a/180)*180;
      d.angle=a;d.group.setAttribute('transform','rotate('+a+' '+d.center.x+' '+d.center.y+')');
    }
    if(d.tool==='scale'){
      const anchor={x:d.part.bounds.minX,y:d.h-d.part.bounds.minY};
      const original=Math.max(1,Math.hypot(d.start.x-anchor.x,d.start.y-anchor.y));
      d.factor=Math.max(.02,Math.min(100,Math.hypot(p.x-anchor.x,p.y-anchor.y)/original));
      d.group.setAttribute('transform','translate('+anchor.x+' '+anchor.y+') scale('+d.factor+') translate('+(-anchor.x)+' '+(-anchor.y)+')');
    }
  });
  svg.addEventListener('pointerup',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;
    const d=drag;cancel();
    if(d.moved&&!d.part.locked){
      if(d.tool==='move')editSelectedNesting('move',{x:d.part.xMm+d.dx,y:d.part.yMm-d.dy});
      else if(d.tool==='rotate')editSelectedNesting('rot',(d.part.angleDeg||0)-d.angle);
      else if(d.tool==='scale')editSelectedNesting('scale',d.factor);
    }else selectNestingPart(d.part.id);
  });
  svg.addEventListener('pointercancel',()=>{cancel();updateCenterWorkspaces(store.get());});
  svg.addEventListener('lostpointercapture',()=>{cancel();});
}
function bindNestingCenterEvents(root) {
  bindNestingGestures(root);
  root.querySelectorAll('[data-nest-tab]').forEach(b => b.onclick = () => {
    nestingRepackController?.abort();currentNestingImportController?.abort();
    mutateData('Nesting iş sekmesi', s => switchNestingTab(s.nesting,b.dataset.nestTab), false);
    activeSheetIdx=0;selectedNestingId=null;
    updateCenterWorkspaces(store.get());
  });
  root.querySelectorAll('[data-nest-close]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    mutateData('Nesting dosya sekmesini kapat', s => closeNestingImportedTab(s.nesting,b.dataset.nestClose), false);
    activeSheetIdx=0;selectedNestingId=null;
    updateCenterWorkspaces(store.get());
  });
  root.querySelector('[data-nest-import]')?.addEventListener('click',() => openNestingVectorImport(true));
  root.querySelector('#nestVectorFileInput')?.addEventListener('change', e => importNestingVectorFiles(e.target.files, root));
  root.querySelector('#nestImportCancel')?.addEventListener('click', () => currentNestingImportController?.abort());
  const dropZone=root.querySelector('#nestVectorDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('nesting-drop-hover');});
    dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('nesting-drop-hover'));
    dropZone.addEventListener('drop',e=>{
      e.preventDefault();dropZone.classList.remove('nesting-drop-hover');
      importNestingVectorFiles(e.dataTransfer.files,root);
    });
  }
  root.querySelectorAll('[data-cws-sheet]').forEach(b => b.onclick = () => {
    activeSheetIdx = Number(b.dataset.cwsSheet);
    updateCenterWorkspaces(store.get());
    updateNumericBar(store.get());
  });
  root.querySelectorAll('[data-cws-pid]').forEach(el => el.onclick = () => {
    selectedNestingId = el.dataset.cwsPid;
    updateCenterWorkspaces(store.get());
    updateNumericBar(store.get());
  });
  root.querySelectorAll('#cwsNestSvgBox [data-pid]').forEach(g => {
    g.onclick = e=>{e.stopPropagation();};
    g.oncontextmenu = (e) => {
      e.preventDefault();
      selectedNestingId = g.getAttribute('data-pid');
      showNestingPartContextMenu(e, selectedNestingId);
    };
  });
  // A click on empty sheet space only clears the selected part. It must never
  // dismiss or rebuild the sheet-size and optimization settings sidebar.
  root.querySelector('#cwsNestSvgBox')?.addEventListener('click', e => {
    if (e.target.closest('[data-pid]') || !selectedNestingId) return;
    selectedNestingId = null;
    updateCenterWorkspaces(store.get());
    updateNumericBar(store.get());
  });
  root.querySelector('#cwsAddSheet')?.addEventListener('click', () => {
    mutateData('Yeni nesting levhası', s => {
      const idx = (s.nesting.sheets?.length || 0) + 1;
      s.nesting.sheets.push({
        id: createObjectId('sheet'),
        name: `Levha ${idx}`,
        materialKey: 'custom',
        materialLabel: 'Özel Levha',
        thicknessMm: 3,
        widthMm: s.nesting.sheetWidthMm,
        heightMm: s.nesting.sheetHeightMm,
        marginLeftMm: s.nesting.marginLeftMm,
        marginRightMm: s.nesting.marginRightMm,
        marginTopMm: s.nesting.marginTopMm,
        marginBottomMm: s.nesting.marginBottomMm,
        placements: [],
        utilization: 0,
      });
      activeSheetIdx = s.nesting.sheets.length - 1;
    });
  });
  root.querySelector('#cwsDeletePart')?.addEventListener('click',()=>editSelectedNesting('delete'));
  root.querySelector('#cwsRunNesting')?.addEventListener('click', () => runAutoNesting());
  root.querySelector('#cwsReoptUnlocked')?.addEventListener('click', () => runAutoNesting());
  // Settings are mounted once and persist across sheet/selection redraws.
  // Bind their listeners only once to prevent duplicate mutations.
  const nestingSettings = root.querySelector('.cws-side-r');
  if (nestingSettings && nestingSettings.dataset.nestingEventsBound !== 'true') {
    nestingSettings.dataset.nestingEventsBound = 'true';
    root.querySelector('#cwsNestPreset')?.addEventListener('change', e => {
      const p = SHEET_PRESETS.find(x => x.id === e.target.value);
      if (p) applyNestingSheetSize(p.w, p.h, p.id);
    });
  root.querySelector('#cwsNestW')?.addEventListener('change', e => applyNestingSheetSize(e.target.value, store.get().nesting.sheetHeightMm));
  root.querySelector('#cwsNestH')?.addEventListener('change', e => applyNestingSheetSize(store.get().nesting.sheetWidthMm, e.target.value));
  root.querySelector('#cwsNestSp')?.addEventListener('change', e => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) repackNestingSettings('Parça aralığı', n => { n.clearanceMm = v; });
  });
  root.querySelector('#cwsNestMg')?.addEventListener('change', e => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) repackNestingSettings('Levha kenar payı', n => {
      n.marginMm = n.marginLeftMm = n.marginRightMm = n.marginTopMm = n.marginBottomMm = v;
    });
  });
  root.querySelector('#cwsNestHoles')?.addEventListener('change', e =>
    repackNestingSettings('Delik içi yerleşim', n => { n.allowHoleNesting = e.target.checked; }));
  root.querySelector('#cwsNestGrain')?.addEventListener('change', e =>
    repackNestingSettings('Fırça yönü kısıtı', n => { n.enforceGrainDirection = e.target.checked; }));
  root.querySelector('#cwsNestRot')?.addEventListener('change', e =>
    repackNestingSettings('Dönüş adımı', n => { n.rotationStepDeg = Number(e.target.value); }));
  root.querySelector('#cwsNestBudget')?.addEventListener('change',e=>mutateData('Optimizasyon süresi',s=>{s.nesting.optimizationBudgetMs=Number(e.target.value);},false));
  root.querySelector('#cwsNestStrategy')?.addEventListener('change', e =>
    repackNestingSettings('Nesting yönü', n => { n.placementStrategy = e.target.value; }));
  const setNestingPreviewColor = (field, value) => {
    if (!/^#[a-f0-9]{6}$/i.test(value)) return;
    mutateData('Nesting önizleme rengi', s => {
      s.nesting.previewColors ||= {};
      s.nesting.previewColors[field] = value;
    }, false);
    updateCenterWorkspaces(store.get());
  };
  root.querySelector('#cwsNestBodyColor')?.addEventListener('change', e => setNestingPreviewColor('body', e.target.value));
  root.querySelector('#cwsNestHoleColor')?.addEventListener('change', e => setNestingPreviewColor('holes', e.target.value));
  root.querySelector('#cwsNestResetColors')?.addEventListener('click', () => mutateData('Nesting renklerini sıfırla', s => {
    s.nesting.previewColors = { body: '#c89343', holes: '#c89343' };
  }, false));
  root.querySelector('#cwsExpSvg')?.addEventListener('click', () => {
    const sh = store.get().nesting.sheets[activeSheetIdx];
    if (sh) downloadBlob(`${store.get().projectName}_levha${activeSheetIdx + 1}.svg`, generateNestedSvg([sh]), 'image/svg+xml');
  });
  root.querySelector('#cwsExpDxf')?.addEventListener('click', () => {
    const sheets = store.get().nesting.sheets || [];
    if (sheets.length) downloadBlob(`${store.get().projectName}_nesting.dxf`, generateNestedDxf(sheets), 'application/dxf');
  });
  root.querySelector('#cwsExpCsv')?.addEventListener('click', () => {
    const sheets = store.get().nesting.sheets || [];
    if (sheets.length) downloadBlob(`${store.get().projectName}_parcalar.csv`, generateNestedCsv(sheets), 'text/csv');
  });
  }
}

function bindCncCenterEvents(root) {
  const upd = (id, fn, isChk = false) => root.querySelector('#' + id)?.addEventListener('change', e => {
    mutateData('CNC ayarı', s => fn(s.cnc, isChk ? e.target.checked : e.target.value));
  });
  upd('cncProfile', (c, v) => { c.profile = v; });
  upd('cncKerf', (c, v) => { c.kerfMm = Number(v); });
  upd('cncToolDia', (c, v) => { c.toolDiameterMm = Number(v); });
  upd('cncComp', (c, v) => { c.compensation = v; });
  upd('cncSeq', (c, v) => { c.sequence = v; });
  upd('cncLeadIn', (c, v) => { c.leadInMm = Number(v); });
  upd('cncTabs', (c, v) => { c.microTabs = v; }, true);
  upd('cncTol', (c, v) => { c.curveTolMm = Number(v); });

  root.querySelector('#cncBtnNestNow')?.addEventListener('click', () => runAutoNesting());
  root.querySelector('#cncBtnExportDxf')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_nesting_1to1.dxf`, generateNestedDxf(s.nesting.sheets || []), 'application/dxf');
  });
  root.querySelector('#cncBtnExportGcode')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_cnc.nc`, generateNestedGcode(s.nesting.sheets || [], s.cnc), 'text/plain');
  });
  root.querySelector('#cncBtnExportSvg')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_nesting.svg`, generateNestedSvg(s.nesting.sheets || []), 'image/svg+xml');
  });
  root.querySelector('#cncBtnExportPlt')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_plotter.plt`, generateNestedHpgl(s.nesting.sheets || []), 'text/plain');
  });
  root.querySelector('#cncBtnExportCsv')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_parcalar.csv`, generateNestedCsv(s.nesting.sheets || []), 'text/csv');
  });
}

function applyDefaultPriceTemplate() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE_TEMPLATE_STORAGE) || 'null');
    if (!saved || typeof saved !== 'object') return;
    store.update(s => {
      if (!s.costConfig?.priceBook || !Object.keys(s.costConfig.priceBook).length) {
        s.costConfig.priceBook = structuredCloneSafe(saved);
      }
    });
  } catch (err) { console.warn('Fiyat şablonu okunamadı', err); }
}

function openCustomerQuote(print = false) {
  const state = store.get();
  const preview = is3DWorkspace(state)&&signEngine&&!signEngine.isDisposed ? signEngine.capturePng(1200, 750) : null;
  const html = buildQuoteHtml(state, lastMetrics, lastCosts, preview);
  const w = window.open('', '_blank', 'width=1050,height=850');
  if (!w) {
    downloadBlob(`${state.projectName || 'teklif'}_teklif.html`, html, 'text/html');
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  if (print) { w.focus(); setTimeout(() => w.print(), 450); }
}
function customerQuoteText() {
  const s=store.get();
  const cost=s.quote?.locked && s.quote?.lockedSnapshot?.costs ? s.quote.lockedSnapshot.costs : lastCosts;
  const metrics=s.quote?.locked && s.quote?.lockedSnapshot?.metrics ? s.quote.lockedSnapshot.metrics : lastMetrics;
  return [
    `*${s.quote?.companyName || 'Tabela Teklifi'}*`,
    `Proje: ${s.projectName}`,
    `Müşteri: ${s.quote?.customerCompany || s.quote?.customerName || '—'}`,
    `Ölçü: ${metrics.totalWidthMm} × ${metrics.totalHeightMm} mm`,
    `KDV Hariç: ${formatMoney(cost.subtotal, cost.currency)}`,
    `KDV Dahil: *${formatMoney(cost.grandTotal, cost.currency)}*`,
    `Üretim: ${s.quote?.productionDays || 7} iş günü`,
    `Geçerlilik: ${s.quote?.validityDays || 15} gün`,
  ].join('\n');
}
function exportInternalCostCsv() {
  const c=lastCosts;
  const quoteCsv=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const rows=[['Kalem','Miktar','Birim','Alış Birim','Maliyet','Satış Birim','Satış','Para Birimi'],
    ...c.lines.map(l=>[l.label,l.quantity,l.unit,l.buyUnit,l.costAmount,l.saleUnit,l.sellAmount,c.currency]),
    ['Üretici maliyet toplamı','','','',c.totalCost],
    ['Genel gider','','','',c.overheadAmount],
    ['Satış ara toplamı','','','','','',c.subtotal],
    ['KDV','','','','','',c.vatAmount],
    ['Müşteri genel toplamı','','','','','',c.grandTotal],
    ['Gerçek kâr','','','',c.profitAmount]
  ];
  downloadBlob(`${store.get().projectName||'proje'}_gizli_maliyet.csv`, '\ufeff'+rows.map(r=>r.map(quoteCsv).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
async function loadLogoAsCompressedDataUrl(file) {
  if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Logo PNG, JPG veya WebP olmalıdır.');
  if(file.size>8_000_000)throw new Error('Logo en fazla 8 MB olabilir.');
  const src=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
  });
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;
  });
  const scale=Math.min(1,500/Math.max(image.naturalWidth||500,1),240/Math.max(image.naturalHeight||240,1));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Logo işlenemedi.');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/png');
  if(data.length>1_800_000)throw new Error('Logo boyutu hâlâ çok büyük. Daha küçük bir görsel seçin.');
  return data;
}
function bindCostCenterEvents(root) {
  root.querySelectorAll('[data-cost-tab]').forEach(el=>{
    el.onclick=()=>{activeCostTab=el.dataset.costTab; root.scrollTop=0; updateCenterWorkspaces(store.get());};
  });
  root.querySelector('#costHeaderQuoteBtn')?.addEventListener('click',()=>{
    activeCostTab='quote';root.scrollTop=0;updateCenterWorkspaces(store.get());
  });
  root.querySelectorAll('[data-cost-role]').forEach(el=>el.addEventListener('click',()=>{
    activeCostRole=el.dataset.costRole;updateCenterWorkspaces(store.get());
  }));
  root.querySelector('#costCatalogSearch')?.addEventListener('input',e=>{
    const needle=e.target.value.trim().toLocaleLowerCase('tr-TR');
    root.querySelectorAll('[data-cost-catalog-item]').forEach(row=>{
      row.hidden=Boolean(needle) && !row.textContent.toLocaleLowerCase('tr-TR').includes(needle);
    });
  });
  root.querySelectorAll('[data-cost-config]').forEach(el=>el.addEventListener('change',()=>{
    const path=el.dataset.costConfig.split('.');
    const val=el.type==='number' || el.type==='range' ? Number(el.value) : el.value;
    if(el.type==='number' && !Number.isFinite(val))return;
    mutateData('Maliyet ayarları',s=>{
      let cfg=s.costConfig;for(let i=0;i<path.length-1;i++)cfg=cfg[path[i]] ||= {};
      cfg[path.at(-1)]=val;
    },false);
  }));
  root.querySelectorAll('[data-cost-include]').forEach(el=>el.addEventListener('change',()=>{mutateData('Maliyet kalemi seçimi',s=>{s.costConfig.excludedCostKeys||={};if(el.checked)delete s.costConfig.excludedCostKeys[el.dataset.costInclude];else s.costConfig.excludedCostKeys[el.dataset.costInclude]=true;},false);}));
  root.querySelectorAll('[data-bulk-currency]').forEach(el=>el.addEventListener('change',()=>{
    const currency=el.value,which=el.dataset.bulkCurrency,role=el.dataset.bulkRole;
    if(!['TRY','USD','EUR'].includes(currency)||!['buy','sell'].includes(which))return;
    const current=store.get(),cards=listPriceCatalog(current).filter(r=>r.key.startsWith(role+':'));
    const changes=cards.map(r=>({r,rate:changeRateCurrency(r[which],currency,current.costConfig.rates)}));
    if(changes.some(x=>!x.rate)){alert('Önce geçerli döviz kurunu girin.');el.value='';return;}
    mutateData('Toplu para birimi değişikliği',s=>{s.costConfig.priceBook||={};for(const {r,rate} of changes){s.costConfig.priceBook[r.key]||={buy:{...r.buy},sell:{...r.sell}};s.costConfig.priceBook[r.key][which]=rate;}},false);
  }));
  root.querySelectorAll('[data-rate-key]').forEach(el=>el.addEventListener('change',()=>{
    const key=el.dataset.rateKey, [which,field]=el.dataset.ratePath.split('.');
    const val=field==='value'?Number(el.value):el.value;
    if(field==='value' && !(Number.isFinite(val)&&val>=0))return;
    mutateData('Malzeme alış / satış tarifesi',s=>{
      s.costConfig.priceBook ||= {};
      s.costConfig.priceBook[key] ||= {buy:{...getPriceCard(s,key).buy},sell:{...getPriceCard(s,key).sell}};
      if(field==='currency'){const next=changeRateCurrency(s.costConfig.priceBook[key][which],val,s.costConfig.rates);if(next)s.costConfig.priceBook[key][which]=next;}
      else s.costConfig.priceBook[key][which][field]=val;
    },false);
  }));
  root.querySelectorAll('[data-cost-reset-rate]').forEach(b=>b.addEventListener('click',()=>{
    mutateData('Tarifeyi sıfırla',s=>{delete s.costConfig.priceBook?.[b.dataset.costResetRate];},false);
  }));
  root.querySelector('#costSavePriceDefaults')?.addEventListener('click',()=>{
    try { localStorage.setItem(PRICE_TEMPLATE_STORAGE,JSON.stringify(store.get().costConfig.priceBook||{}));
      const btn=root.querySelector('#costSavePriceDefaults');if(btn)btn.textContent='✓ Tarife Kaydedildi';
    } catch(e){alert('Tarife tarayıcıya kaydedilemedi: '+e.message);}
  });
  root.querySelector('#costAddExtra')?.addEventListener('click',()=>{
    mutateData('Ek maliyet kalemi ekle',s=>{
      s.costConfig.extraItems ||= [];
      s.costConfig.extraItems.push({id:createObjectId('extra'),label:'Özel iş / malzeme',qty:1,unit:'adet',buy:{value:0,currency:'TRY'},sell:{value:0,currency:'TRY'}});
      s.costConfig.pricingMode='unit';
    },false);
  });
  root.querySelectorAll('[data-extra-field]').forEach(el=>el.addEventListener('change',()=>{
    const id=el.closest('[data-extra-id]')?.dataset.extraId;
    const path=el.dataset.extraField.split('.');
    const val=el.type==='number'?Number(el.value):el.value;
    if(el.type==='number'&&!(Number.isFinite(val)&&val>=0))return;
    mutateData('Özel iş kalemi',s=>{
      const item=s.costConfig.extraItems?.find(i=>i.id===id);if(!item)return;
      if(path.length===2) {item[path[0]] ||= {};item[path[0]][path[1]]=val;}
      else item[path[0]]=val;
      s.costConfig.pricingMode='unit';
    },false);
  }));
  root.querySelectorAll('[data-remove-extra]').forEach(b=>b.addEventListener('click',()=>{
    mutateData('Özel kalemi sil',s=>{s.costConfig.extraItems=(s.costConfig.extraItems||[]).filter(i=>i.id!==b.dataset.removeExtra);},false);
  }));
  root.querySelectorAll('[data-quote-field]').forEach(el=>el.addEventListener('change',()=>{
    const field=el.dataset.quoteField;
    const value=el.type==='number'?Number(el.value):el.value;
    mutateData('Teklif bilgileri',s=>{s.quote[field]=value;},false);
  }));
  root.querySelectorAll('[data-cost-logo]').forEach(input=>input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      const data=await loadLogoAsCompressedDataUrl(file);
      mutateData('Teklif logosu',s=>{s.quote[input.dataset.costLogo]=data;},false);
    }catch(err){alert(err.message||'Logo okunamadı.');}
  }));
  root.querySelectorAll('[data-cost-clear-logo]').forEach(b=>b.addEventListener('click',()=>{
    mutateData('Teklif logosu kaldır',s=>{s.quote[b.dataset.costClearLogo]=null;},false);
  }));
  root.querySelector('#costQuoteLock')?.addEventListener('change',e=>{
    const locked=e.target.checked;
    mutateData('Teklif fiyatı kilidi',s=>{
      s.quote.locked=locked;
      s.quote.lockedSnapshot=locked?{costs:structuredCloneSafe(lastCosts),metrics:structuredCloneSafe(lastMetrics),createdAt:new Date().toISOString()}:null;
    },false);
  });
  root.querySelector('#costCenterPreviewBtn')?.addEventListener('click',()=>openCustomerQuote(false));
  root.querySelector('#costCenterPdfBtn')?.addEventListener('click',()=>openCustomerQuote(true));
  root.querySelector('#costCenterHtmlBtn')?.addEventListener('click',()=>{
    const s=store.get();downloadBlob(`${s.projectName||'proje'}_musteri_teklifi.html`,buildQuoteHtml(s,lastMetrics,lastCosts), 'text/html;charset=utf-8');
  });
  root.querySelector('#costCenterCopyBtn')?.addEventListener('click',()=>navigator.clipboard?.writeText(customerQuoteText()));
  root.querySelectorAll('#costExportInternalCsv').forEach(b=>b.addEventListener('click',exportInternalCostCsv));
}

function showObjectContextMenu(e, objId) {
  if (!contextMenu) return;
  if (objId) {
    store.update(s => { if (!s.selectedIds.includes(objId)) s.selectedIds = [objId]; });
    signEngine?.updateSelectionBox(store.get());
    updateNumericBar(store.get());
  }
  const hasSel = (store.get().selectedIds || []).length > 0;
  if (hasSel) {
    contextMenu.show(e.clientX, e.clientY, [
      { label: 'Kes', kbd: 'Ctrl+X', action: cutSelectionToClipboard },
      { label: 'Kopyala', kbd: 'Ctrl+C', action: () => copySelectionToClipboard() },
      { label: 'Çoğalt', kbd: 'Ctrl+D', action: () => runCadAction('duplicate') },
      { sep: true },
      { label: 'Eğriye Çevir', kbd: 'Ctrl+Q', action: () => runCadAction('toCurves') },
      { label: 'Harflere / Parçalara Ayır', kbd: 'Ctrl+K', action: () => runCadAction('breakApart') },
      { label: 'Grupla', kbd: 'Ctrl+G', action: () => mutate('Grupla', s => groupSelectedLayers(s)) },
      { label: 'Grubu Çöz', kbd: 'Ctrl+U', action: () => mutate('Grubu çöz', s => ungroupSelectedLayers(s)) },
      { sep: true },
      { label: 'Sayfaya Ortala', kbd: 'P', action: () => mutate('Sayfaya ortala', s => { const o = getSelectedOrFirst(s); if (o && !o.locked) { o.xMm = 0; o.yMm = 0; } }) },
      { label: 'Kilitle / Aç', action: () => mutate('Kilit', s => { const o = getSelectedOrFirst(s); if (o) toggleLayerLock(s, o.id); }) },
      { label: 'Sil', kbd: 'Del', danger: true, action: () => runCadAction('delete') },
    ]);
  } else {
    contextMenu.show(e.clientX, e.clientY, [
      { label: 'Yapıştır', kbd: 'Ctrl+V', disabled: !objectClipboard?.objects?.length, action: () => runCadAction('paste') },
      { label: 'Yeni Yazı Ekle', kbd: 'F8', action: () => activateTool('text') },
      { label: 'Dikdörtgen Ekle', kbd: 'F6', action: () => activateTool('rect') },
      { label: 'Elips Ekle', kbd: 'F7', action: () => activateTool('ellipse') },
      { sep: true },
      { label: 'Ekrana Sığdır', kbd: 'F4', action: () => { if (store.get().mainWorkspace === 'design2d') vector2D?.fitAll(store.get()); else signEngine?.setCameraPreset('fit'); } },
      { label: 'Izgara Göster/Gizle', action: () => { store.update(s => { s.grid.visible = !s.grid.visible; }); scheduleRebuild(true); } },
    ]);
  }
}

function showNestingPartContextMenu(e, pid) {
  if (!contextMenu) return;
  contextMenu.show(e.clientX, e.clientY, [
    { label: '90° Döndür', action: () => mutateData('Parça döndür', s => { const p = s.nesting.sheets[activeSheetIdx]?.placements?.find(x => x.id === pid); if(p){editNestingPlacement(p,'rot',((p.angleDeg||0)+90)%360);validateSheetLayout(s.nesting.sheets[activeSheetIdx],(s.nesting.clearanceMm??5)+(s.nesting.kerfMm??.4));} }) },
    { label: 'Kilitle / Kilidi Aç', action: () => mutateData('Parça kilidi', s => { const p = s.nesting.sheets[activeSheetIdx]?.placements?.find(x => x.id === pid); if (p) p.locked = !p.locked; }) },
    { label: 'Parçayı Sil',kbd:'Del',danger:true,action:()=>{selectedNestingId=pid;editSelectedNesting('delete');} },
    { label: 'Kilitsizleri Yeniden Optimize Et', action: () => runAutoNesting() },
  ]);
}


function resetMaterialDefaults() {
    const def = createDefaultState();
    mutate('Varsayılanlara dön', s => {
      s.materials = def.materials;
      s.materialOverrides = def.materialOverrides;
      s.lighting = def.lighting;
      s.render = def.render;
      for (const o of s.objects) {
        if (!o.locked) {
          o.faceMaterial = def.materials.faceId;
          o.faceColor = def.materials.faceColor;
          o.sideMaterial = def.materials.sideId;
          o.sideColor = def.materials.sideColor;
          o.lightingMode = def.lighting.mode;
        }
      }
    });
}


/**
 * Export panel routes all formats through one consistent scope.
 * Selected-only exports preserve the editing document and its global state.
 */
async function studioExport(format, selectedOnly = false, resolution = '2400x1500', source = 'design') {
  return runProfessionalExport({
    format,source,selectedOnly,resolution,state:store.get(),
    metricsList:lastSceneResult?.metricsList || [],signEngine,activeSheetIdx,
    confirmCnc:message=>window.confirm(message),
  });
}

function openExportDialog() {
  const modal=document.getElementById('exportDialog');
  if (!modal) return;
  const count=(store.get().objects||[]).filter(o => (store.get().selectedIds||[]).includes(o.id) && o.visible!==false).length;
  const selection=document.getElementById('exportSelectionCount');
  if (selection) selection.textContent='Seçili nesne: '+count;
  const message=document.getElementById('exportDialogMessage');
  if (message) message.textContent='';
  modal.classList.remove('hidden');
  updateProfessionalExportDialogState();
  document.getElementById('exportFormat')?.focus();
}
function closeExportDialog() {
  document.getElementById('exportDialog')?.classList.add('hidden');
}
function updateProfessionalExportDialogState() {
  const formatEl=document.getElementById('exportFormat');
  const sourceEl=document.getElementById('exportSource');
  const selectedEl=document.getElementById('exportOnlySelected');
  const format=formatEl?.value;
  const meta=getExportFormat(format);
  if(!meta) return;
  const source=sourceEl?.value || 'design';
  const supported=meta.ready && formatSupportsSource(format,source);
  const label=document.getElementById('exportFormatHelp');
  if(label) {
    const base=meta.info || (meta.ready ? 'Gerçek dosya üretimi desteklenir.' : 'Bu biçim harici lisanslı dönüştürücü veya uygulama gerektirir.');
    label.textContent=base + (!meta.ready && meta.alt ? ' Önerilen çıktı: '+meta.alt.toUpperCase()+'.' : '') +
      (meta.ready && !supported ? ' Seçilen kaynak ile uyumlu değil; Tasarım veya Nesting kaynağını değiştirin.' : '');
    label.classList.toggle('export-format-unavailable',!supported);
  }
  const run=document.getElementById('btnRunExport');
  if(run) {
    run.disabled=!supported;
    run.title=!supported ? (meta.ready?'Bu kaynak ile kullanılamaz.':'Gerçek dönüştürücü desteklenmiyor.'):'Dosyayı üret';
  }
  const isRaster=meta.kind==='raster';
  document.getElementById('exportResolutionRow')?.classList.toggle('hidden',!isRaster);
  if(selectedEl) {
    selectedEl.disabled=source!=='design';
    selectedEl.closest('label')?.classList.toggle('export-control-disabled',source!=='design');
  }
  const formatStatus=document.getElementById('exportFormatStatus');
  if(formatStatus)formatStatus.textContent=meta.ready?(supported?'● Gerçek çıktı üretimi':'● Kaynak uyumsuz'):'● Dönüştürücü gerekli';
  const count=(store.get().objects||[]).filter(o=>(store.get().selectedIds||[]).includes(o.id)&&o.visible!==false).length;
  const selectedCount=document.getElementById('exportSelectionCount');
  if(selectedCount)selectedCount.textContent='Seçili nesne: '+count+(source!=='design'?' · Nesting kaynağı kullanılıyor':'');
}
function bindExportDialog() {
  const modal=document.getElementById('exportDialog');
  if(!modal)return;
  const formatEl=document.getElementById('exportFormat');
  // Populate from a single versioned format catalogue, with honest converter statuses.
  if(formatEl) {
    formatEl.replaceChildren();
    for(const group of EXPORT_FORMAT_GROUPS) {
      const optGroup=document.createElement('optgroup');
      optGroup.label=group.label;
      for(const item of group.items) {
        const opt=document.createElement('option');
        opt.value=item.id;opt.textContent=item.label;
        if(!item.ready) opt.dataset.converterRequired='true';
        optGroup.appendChild(opt);
      }
      formatEl.appendChild(optGroup);
    }
    formatEl.value='pdf';
  }
  const sourceEl=document.getElementById('exportSource');
  if(sourceEl)sourceEl.value='design';
  document.getElementById('btnOpenExport')?.addEventListener('click',openExportDialog);
  document.getElementById('btnCloseExport')?.addEventListener('click',closeExportDialog);
  document.getElementById('btnCancelExport')?.addEventListener('click',closeExportDialog);
  modal.addEventListener('click',e=>{if(e.target===modal)closeExportDialog();});
  formatEl?.addEventListener('change',updateProfessionalExportDialogState);
  sourceEl?.addEventListener('change',updateProfessionalExportDialogState);
  document.getElementById('exportOnlySelected')?.addEventListener('change',updateProfessionalExportDialogState);
  document.getElementById('btnRunExport')?.addEventListener('click',async()=>{
    const message=document.getElementById('exportDialogMessage');
    const button=document.getElementById('btnRunExport');
    const format=formatEl?.value;
    const meta=getExportFormat(format);
    if(!meta?.ready) {
      if(message)message.textContent='Bu format harici dönüştürücü gerektirir. '+(meta?.alt || 'PDF')+' kullanın.';
      return;
    }
    if(button) {button.disabled=true;button.textContent='Dosya hazırlanıyor…';}
    try {
      await studioExport(format,
        document.getElementById('exportOnlySelected')?.checked && sourceEl.value==='design',
        document.getElementById('exportResolution')?.value || '2400x1500',
        sourceEl?.value || 'design');
      closeExportDialog();
    } catch(error) {
      if(message)message.textContent=error?.message||'Dışa aktarma başarısız.';
    } finally {
      if(button){button.textContent='Dosyayı Dışa Aktar';}
      updateProfessionalExportDialogState();
    }
  });
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !modal.classList.contains('hidden')) {
      e.preventDefault();e.stopImmediatePropagation();closeExportDialog();
    }
  },true);
  updateProfessionalExportDialogState();
}

/* ---------------- Bootstrap ---------------- */
function init() {
  if (!autosaved) applyDefaultPriceTemplate();
  document.getElementById('btnFloatActiveDocker')?.addEventListener('click', () => {
    const active = store.get().activeWorkspace;
    detachWorkspaceToFloat(active, Math.max(36, window.innerWidth - 670), 100);
  });
  document.getElementById('btnResetDockLayout')?.addEventListener('click', () => {
    wsLayout.floating = []; wsLayout.dockedUnder = {}; wsLayout.tabOrder = WS_META.map(m => m.id);
    store.update(s => { s.ui.stackMode = 'tabs'; });
    saveWsLayout(); renderActiveWorkspace();
  });
  document.getElementById('inspectorPanelSelect')?.addEventListener('change', e => {
    const id = e.target.value;
    restoreWorkspaceToTab(id);
    store.update(s => { s.activeWorkspace = id; s.ui.stackMode = 'tabs'; });
    renderActiveWorkspace();
  });
  document.getElementById('btnToggleStackMode')?.addEventListener('click', () => {
    store.update(s => { s.ui.stackMode = s.ui.stackMode === 'stacked' ? 'tabs' : 'stacked'; });
    renderActiveWorkspace();
  });
  document.getElementById('btnSaveDefaults')?.addEventListener('click', () => {
    const s = store.get();
    localStorage.setItem(USER_DEFAULTS_KEY, JSON.stringify({
      materials: s.materials,
      materialOverrides: s.materialOverrides,
      lighting: s.lighting,
      render: s.render,
    }));
    const w = document.getElementById('stageWarning');
    if (w) { w.textContent = 'Renk, materyal ve aydınlatma ayarlarınız varsayılan olarak kaydedildi.'; w.classList.remove('hidden'); setTimeout(() => w.classList.add('hidden'), 2500); }
  });
  document.getElementById('inspectorQuickColors')?.addEventListener('click', e => {
    if (e.target.closest('#btnOpenRalPalette')) { openMaterialPalette(); return; }
    const btn = e.target.closest('[data-quick-hex]');
    if (!btn) return;
    const color = btn.dataset.quickHex;
    mutate('Hızlı renk paleti', s => {
      applyRalCoating(s, color, 'face', 'Özel Renk');
    });
    renderQuickPalette(store.get());
  });
  document.getElementById('btnOpenBackgroundPanel')?.addEventListener('click', () => {
    restoreWorkspaceToTab('background');
    store.update(s => { s.activeWorkspace = 'background'; s.ui.stackMode = 'tabs'; });
    renderActiveWorkspace();
    document.getElementById('inspectorCol')?.classList.add('mobile-open');
  });
  document.getElementById('btnToggleRail')?.addEventListener('click', () => {
    document.querySelector('.studio-body')?.classList.toggle('rail-expanded');
  });
  document.getElementById('btnFullscreen')?.addEventListener('click', () => {
    document.querySelector('.app-shell')?.classList.toggle('stage-fullscreen');
  });
  const threeContainer = document.getElementById('threeContainer');
  ensureSignEngine=()=>{
    if(signEngine)return signEngine;
    signEngine = new SignEngine(threeContainer, {
    onTransformStart: () => {
      dragBeforeState = structuredCloneSafe(store.get());
    },
    onTransformCancel: () => {
      if (dragBeforeState) {
        store.set(dragBeforeState);
        dragBeforeState = null;
        scheduleRebuild(true);
        updateNumericBar(store.get());
        updateStageChrome(store.get());
      }
    },
    onTransformLive: (layerId, mode, delta, commit) => {
      if (commit) {
        if (dragBeforeState && delta?.moved) {
          history.push(dragBeforeState, `Sahne ${mode}`);
          docManager.markDirty();
        }
        dragBeforeState = null;
        updateUndoRedoButtons();
        scheduleRebuild(true);
        return;
      }
      store.updateObject(layerId,o=>{
        if (mode === 'move') {
          o.xMm = Math.round((o.xMm || 0) + delta.dxMm);
          o.yMm = Math.round((o.yMm || 0) + delta.dyMm);
        } else if (mode === 'rotate') {
          o.rotXDeg = Math.round(((o.rotXDeg || 0) + (delta.dRotX || 0)) * 10) / 10;
          o.rotYDeg = Math.round(((o.rotYDeg || 0) + (delta.dRotY || 0)) * 10) / 10;
          o.rotationDeg = Math.round(((o.rotationDeg || 0) + (delta.dRotZ || 0)) * 10) / 10;
        } else if (mode === 'scale') {
          o.scaleX = Math.max(0.05, Math.min(20, (o.scaleX ?? 1) * delta.factor));
          o.scaleY = Math.max(0.05, Math.min(20, (o.scaleY ?? 1) * delta.factor));
        }
      });
      // The live mesh is already transformed. Rebuild manufacturing geometry only on release.
      scheduleLiveUi();
    },
    onMoveObject_unused: (layerId, dxMm, dyMm, commit) => {
      if (commit) {
        history.push(store.get(), 'Sahne taşıma');
        updateUndoRedoButtons();
        return;
      }
      store.update(s => {
        const o = s.objects.find(x => x.id === layerId);
        if (o && !o.locked) {
          o.xMm = Math.round((o.xMm || 0) + dxMm);
          o.yMm = Math.round((o.yMm || 0) + dyMm);
        }
      });
      scheduleRebuild(false);
    },
    onFrame: () => positionCanvasTransformHud(store.get()),
    onSelectObject: (layerId, additive) => {
      store.updateScoped(['selectedIds'],s => { s.selectedIds = selectLayer(s, layerId, additive); });
      signEngine.updateSelectionBox(store.get());
      updateStageChrome(store.get());
      updateNumericBar(store.get());
      if (store.get().activeWorkspace === 'layers') renderActiveWorkspace();
    },
    onSelectObjects: (ids, additive) => {
      const candidates = new Set(ids);
      store.updateScoped(['selectedIds'],s => {
        const existing = additive ? s.selectedIds : [];
        const valid = s.objects.filter(o => candidates.has(o.id) && o.visible && !o.locked).map(o => o.id);
        s.selectedIds = [...new Set([...existing, ...valid])];
      });
      signEngine.updateSelectionBox(store.get());
      updateStageChrome(store.get()); updateNumericBar(store.get());
      renderActiveWorkspace();
    },
    onDeselectObject: () => {
      if(!store.get().selectedIds.length)return;
      store.updateScoped([],s => { s.selectedIds = []; });
      signEngine.updateSelectionBox(store.get());
      updateStageChrome(store.get()); updateNumericBar(store.get());
      renderActiveWorkspace();
    },
    onConfirmTool: () => activateTool('select'),
    onAutoMoveTool: (layerId) => {
      store.update(s => {
        s.selectedIds = [layerId];
        s.activeTool = 'move';
      });
      document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'move'));
      signEngine.updateSelectionBox(store.get());
      updateStageChrome(store.get());
      updateNumericBar(store.get());
    },
  });
    return signEngine;
  };

  photomontageOverlay = new PhotomontageOverlay(document.getElementById('photomontageLayer'), (corners) => {
    store.update(s => { s.photomontage.cornersNorm = corners; });
  });

  // Workspace tabs (click to switch, drag to tear-off floating window or dock under another tab)
  document.querySelectorAll('#workspaceTabs button').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.skipNextClick) { delete b.dataset.skipNextClick; return; }
      store.update(s => { s.activeWorkspace = b.dataset.ws; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
    });
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const wsId = b.dataset.ws;
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;
      let ghost = null;
      const dockZone = document.getElementById('dockDropZone');

      const onMove = (mv) => {
        const dist = Math.hypot(mv.clientX - startX, mv.clientY - startY);
        if (!dragging && dist > 16) {
          dragging = true;
          ghost = document.createElement('div');
          ghost.className = 'drag-ghost-pill';
          ghost.textContent = b.textContent.trim();
          document.body.appendChild(ghost);
          dockZone?.classList.remove('hidden');
        }
        if (dragging && ghost) {
          ghost.style.left = `${mv.clientX}px`;
          ghost.style.top = `${mv.clientY}px`;
          document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => {
            const r = tb.getBoundingClientRect();
            const over = mv.clientX >= r.left && mv.clientX <= r.right && mv.clientY >= r.top && mv.clientY <= r.bottom;
            tb.classList.toggle('drag-over', over && tb.dataset.ws !== wsId);
          });
        }
      };

      const onUp = (up) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        ghost?.remove();
        dockZone?.classList.add('hidden');
        document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => tb.classList.remove('drag-over'));

        if (!dragging) {
          b.dataset.skipNextClick = '1';
          store.update(s => { s.activeWorkspace = wsId; });
          updateStageChrome(store.get());
          renderActiveWorkspace();
          return;
        }

        // 1. Dropped on another tab -> reorder tabs, preserving each panel's content
        let targetTab = null;
        document.querySelectorAll('#workspaceTabs button[data-ws]').forEach(tb => {
          const r = tb.getBoundingClientRect();
          if (up.clientX >= r.left && up.clientX <= r.right && up.clientY >= r.top && up.clientY <= r.bottom && tb.dataset.ws !== wsId) {
            targetTab = tb.dataset.ws;
          }
        });
        if (targetTab) {
          restoreWorkspaceToTab(wsId);
          reorderDockerTab(wsId, targetTab);
          store.update(s => { s.activeWorkspace = wsId; s.ui.stackMode = 'tabs'; });
          renderActiveWorkspace();
          return;
        }

        // 2. Dropped on right inspector -> dock as an accessible tab.
        const wc = document.getElementById('inspectorCol');
        const wcRect = wc?.getBoundingClientRect();
        if (wcRect && up.clientX >= wcRect.left && up.clientX <= wcRect.right && up.clientY >= wcRect.top && up.clientY <= wcRect.bottom) {
          if (store.get().activeWorkspace !== wsId) {
            dockFloatingIntoTabs(wsId);
          }
          return;
        }

        // 3. Dropped anywhere else over project -> open as floating draggable window
        detachWorkspaceToFloat(wsId, up.clientX - 165, up.clientY - 18);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // Camera view presets
  document.querySelectorAll('.stage-views button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.stage-views button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    signEngine?.setCameraPreset(b.dataset.view);
  });

  // Day/Night & Light & Walls
  document.getElementById('btnDay').onclick = () => mutate('Gündüz modu', s => { s.scene.night = false; });
  document.getElementById('btnNight').onclick = () => mutate('Gece modu', s => { s.scene.night = true; });
  document.getElementById('btnLightToggle').onclick = () => mutate('Işık aç/kapat', s => { s.lighting.enabled = !s.lighting.enabled; });
  document.querySelectorAll('#quickWallSeg button').forEach(b => b.onclick = () => mutate('Duvar seçimi', s => { s.scene.wallId = b.dataset.wall; }));

  const quickWallSelect=document.getElementById('quickWallSelect');
  if(quickWallSelect){quickWallSelect.innerHTML=BACKGROUND_SCENES.map(b=>`<option value="${b.id}">${escapeHtml(b.label)}</option>`).join('');quickWallSelect.value=store.get().scene.wallId;quickWallSelect.onchange=e=>{if(BACKGROUND_SCENES.some(b=>b.id===e.target.value))mutate('Arka plan seçimi',s=>{s.scene.wallId=e.target.value;});};}
  // Project Name & Quality
  if (document.getElementById('projectNameInput')) document.getElementById('projectNameInput').onchange = (e) => store.update(s => { s.projectName = e.target.value; });
  document.getElementById('qualitySelect').onchange = (e) => {
    if (!QUALITY_PROFILES[e.target.value]) return;
    mutate('Gerçek render kalitesi', s => { s.quality = e.target.value; }, false);
  };

  // Undo / Redo
  document.getElementById('btnUndo').onclick = () => {
    const prev = history.undo(store.get());
    if (prev) { store.set(prev); scheduleRebuild(true); renderActiveWorkspace(); updateUndoRedoButtons(); }
  };
  document.getElementById('btnRedo').onclick = () => {
    const next = history.redo(store.get());
    if (next) { store.set(next); scheduleRebuild(true); renderActiveWorkspace(); updateUndoRedoButtons(); }
  };

  // Every toolbar/menu export uses the same non-destructive scope engine.
  document.getElementById('btnExportPng').onclick = () => studioExport('png');
  document.getElementById('btnExportTransparentPng').onclick = () => studioExport('transparentPng');
  document.getElementById('btnExportSvg').onclick = () => studioExport('svg');
  document.getElementById('btnExportDxf').onclick = () => studioExport('dxf');
  document.getElementById('btnSaveJson').onclick = () => studioExport('json');
  bindExportDialog();

  // Shortcuts Help Modal (Categorized CorelDRAW + CAD Reference)
  const modal = document.getElementById('shortcutsModal');
  document.getElementById('shortcutsBody').innerHTML = SHORTCUT_GROUPS.map(g => `
    <div class="shortcut-group-title">${g.title}</div>
    ${g.items.map(s => `<div class="shortcut-row"><span>${s.label}</span><kbd>${s.keys}</kbd></div>`).join('')}
  `).join('');
  const openShortcuts = () => modal.classList.remove('hidden');
  document.getElementById('btnShortcutsHelp').onclick = openShortcuts;
  const railSc = document.getElementById('btnRailShortcuts');
  if (railSc) railSc.onclick = openShortcuts;
  document.getElementById('btnCloseShortcuts').onclick = () => modal.classList.add('hidden');

  // Left CAD Rail Tools & Actions
  document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.onclick = () => activateTool(b.dataset.tool));
  document.querySelectorAll('.cad-rail [data-action]').forEach(b => b.onclick = () => runCadAction(b.dataset.action));

  // PropertyBar owns numeric events.

  // Interactive CAD Overlay (Pen + Live Hover/Drag Measure)
  const overlay = document.getElementById('cadOverlay');
  const getOverlayPt = (e) => {
    const rect = overlay.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wallPt = signEngine ? signEngine.screenToWallMm(e.clientX, e.clientY) : { xMm: (sx - overlay.width / 2) * 2, yMm: (overlay.height / 2 - sy) * 2 };
    return { sx, sy, mmX: wallPt.xMm, mmY: wallPt.yMm };
  };

  overlay.addEventListener('pointermove', (e) => {
    const tool = store.get().activeTool;
    if (tool !== 'measure') return;
    measureHover = getOverlayPt(e);
    if (measureDragging && measurePoints.length) {
      measurePoints[1] = measureHover;
    }
    drawCadOverlay(store.get());
  });

  overlay.addEventListener('pointerdown', (e) => {
    const tool = store.get().activeTool;
    if (tool !== 'measure' || e.button !== 0) return;
    const pt = getOverlayPt(e);
    measurePoints = [pt];
    measureDragging = true;
    measureHover = pt;
    drawCadOverlay(store.get());
  });

  overlay.addEventListener('pointerup', (e) => {
    const tool = store.get().activeTool;
    if (tool !== 'measure' || !measureDragging) return;
    const pt = getOverlayPt(e);
    measureDragging = false;
    if (measurePoints.length && Math.hypot(pt.sx - measurePoints[0].sx, pt.sy - measurePoints[0].sy) > 6) {
      measurePoints[1] = pt;
    }
    drawCadOverlay(store.get());
  });

  overlay.addEventListener('click', (e) => {
    const tool = store.get().activeTool;
    if (tool === 'pen') {
      const pt = getOverlayPt(e);
      if (penPoints.length >= 3 && Math.hypot(pt.sx - penPoints[0].sx, pt.sy - penPoints[0].sy) < 14) {
        const cx = penPoints.reduce((a, p) => a + p.mmX, 0) / penPoints.length;
        const cy = penPoints.reduce((a, p) => a + p.mmY, 0) / penPoints.length;
        const outer = penPoints.map(p => ({ x: p.mmX - cx, y: p.mmY - cy }));
        penPoints = [];
        mutate('Çokgen çizildi', s => {
          const obj = createShapeObject('polygon', s, { name: 'Kalem Şekli', xMm: Math.round(cx), yMm: Math.round(cy), polygonsMm: [{ outer, holes: [] }] });
          s.objects.push(obj);
          s.selectedIds = [obj.id];
          s.activeTool = 'select';
        });
      } else {
        penPoints.push(pt);
        drawCadOverlay(store.get());
      }
    }
  });

  // Keyboard Shortcuts
  attachShortcuts({
    onTool: activateTool,
    onFitCamera: () => signEngine?.setCameraPreset('fit'),
    onToCurves: () => runCadAction('toCurves'),
    onBreakApart: () => runCadAction('breakApart'),
    onCombine: () => runCadAction('combine'),
    onNewDoc: () => document.getElementById('btnNewDocTab')?.click(),
    onExport: () => store.get().mainWorkspace === 'nesting' ? openNestingVectorImport(true) : openExportDialog(),
    onCenterOnPage: () => {if(store.get().mainWorkspace==='nesting')return;mutate('Sayfaya ortala', s => {
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) { o.xMm = 0; o.yMm = 0; }
    });},
    onDuplicate: () => runCadAction('duplicate'),
    onUndo: () => document.getElementById('btnUndo').click(),
    onRedo: () => document.getElementById('btnRedo').click(),
    onDelete: () => runCadAction('delete'),
    onCopy: () => copySelectionToClipboard(),
    onCut: cutSelectionToClipboard,
    onPaste: pasteSelectionFromClipboard,
    onSave: () => {
      saveProjectToBrowser(store.get().projectName, store.get());
    },
    onSelectAll: () => {
      if(store.get().mainWorkspace==='nesting')return;
      store.update(s => { s.selectedIds = s.objects.map(o => o.id); });
      renderActiveWorkspace();
    },
    onGroup: () => {if(store.get().mainWorkspace!=='nesting')mutate('Grupla', s => groupSelectedLayers(s));},
    onUngroup: () => {if(store.get().mainWorkspace!=='nesting')mutate('Grubu çöz', s => ungroupSelectedLayers(s));},
    onEscape: () => {
      if(store.get().mainWorkspace==='nesting'){nestingGesture?.cancel?.();nestingTool='select';syncWorkspaceRail('nesting');selectNestingPart(null);return;}
      if (signEngine?.cancelActiveDrag?.()) {
        // Reverted pre-drag state via onTransformCancel
      }
      penPoints = [];
      measurePoints = [];
      measureDragging = false;
      if (signEngine) signEngine.activeTool = 'select';
      store.update(s => { s.activeTool = 'select'; });
      document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
      drawCadOverlay(store.get());
      renderCanvasTransformHud(store.get());
    },
    onNudge: (dx, dy) => {
      if(store.get().mainWorkspace==='nesting'){const p=getNestingSelection();if(p)editSelectedNesting('move',{x:p.xMm+dx,y:p.yMm+dy});return;}
      mutate('Taşı', s => {
        for (const o of s.objects) {
          if (s.selectedIds.includes(o.id) && !o.locked) {
            o.xMm = (o.xMm || 0) + dx;
            o.yMm = (o.yMm || 0) + dy;
          }
        }
      }, false);
    },
  });

  contextMenu = new ContextMenu();
  const vecWrap = document.getElementById('vector2DWrap');
  if (vecWrap) {
    vector2D = new Vector2DCanvas(vecWrap, {
      onSelectObjects: (ids, additive) => {
        store.update(s => {
          const existing = additive ? s.selectedIds : [];
          s.selectedIds = [...new Set([...existing, ...ids])];
        });
        updateNumericBar(store.get());
        vector2D.render(store.get(), fontMap);
        renderActiveWorkspace();
      },
      onSelectObject: (id, additive) => {
        store.updateScoped(['selectedIds'],s => { s.selectedIds = id ? selectLayer(s, id, additive) : []; });
        updateNumericBar(store.get());
        vector2D.render(store.get(), fontMap);
      },
      onTransformStart: () => { dragBeforeState = structuredCloneSafe(store.get()); },
      onLiveMove: (id, x, y) => {
        store.updateObject(id,o=>{o.xMm=x;o.yMm=y;});
        vector2D.render(store.get(), fontMap);
        updateNumericBar(store.get());
      },
      onLiveScale: (id, sx, sy) => {
        store.updateObject(id,o=>{o.scaleX=sx;o.scaleY=sy;});
        vector2D.render(store.get(), fontMap);
        updateNumericBar(store.get());
      },
      onLiveNodeMove: (id, pIdx, nIdx, wx, wy) => {
        store.updateObject(id,o=>{
          if (o.polygonsMm?.[pIdx]?.outer?.[nIdx]) {
            o.polygonsMm[pIdx].outer[nIdx].x = (wx - (o.xMm || 0)) / (o.scaleX ?? 1);
            o.polygonsMm[pIdx].outer[nIdx].y = (wy - (o.yMm || 0)) / (o.scaleY ?? 1);
          }
        },true);
        vector2D.render(store.get(), fontMap);
      },
      onTransformCommit: () => {
        if (dragBeforeState) { history.push(dragBeforeState, '2D Düzenleme'); dragBeforeState = null; docManager.markDirty(); }
        scheduleRebuild(true);
      },
      onAddNode: (id) => {
        mutate('Düğüm eklendi', s => {
          const o = s.objects.find(k => k.id === id);
          if (o) addNodeToPolygon(o, 0, 0);
        });
      },
      onFinishFreehand: (pts) => {
        const cx = pts.reduce((a, p) => a + p.xMm, 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p.yMm, 0) / pts.length;
        mutate('Serbest çizim', s => {
          const obj = createShapeObject('polygon', s, {
            name: 'Serbest Çizim',
            xMm: Math.round(cx),
            yMm: Math.round(cy),
            polygonsMm: [{ outer: pts.map(p => ({ x: p.xMm - cx, y: p.yMm - cy })), holes: [] }],
          });
          s.objects.push(obj);
          s.selectedIds = [obj.id];
          s.activeTool = 'select';
        });
      },
      onContextMenu: (e, id) => showObjectContextMenu(e, id),
    });
  }

  threeContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showObjectContextMenu(e, store.get().selectedIds?.[0] || null);
  });

  document.getElementById('btnCopyBetweenTabs')?.addEventListener('click', () => copySelectionToClipboard());
  document.getElementById('btnPasteBetweenTabs')?.addEventListener('click', pasteSelectionFromClipboard);
  document.getElementById('btnNewDocTab')?.addEventListener('click', () => {
    docManager.newDocument();
    applySavedMaterialDefaults(docManager.getActiveStore());
    applyDefaultPriceTemplate();
    renderDocumentTabs();
    setMainWorkspace(store.get().mainWorkspace || 'model3d');
    scheduleRebuild(true);
    renderActiveWorkspace();
  });
  document.getElementById('btnQuickSaveDoc')?.addEventListener('click', () => {
    saveProjectToBrowser(store.get().projectName, store.get());
    docManager.markSaved();
  });
  document.getElementById('btnAddPage')?.addEventListener('click', () => {
    docManager.addPage();
    scheduleRebuild(true);
    renderActiveWorkspace();
  });
  document.getElementById('btnDupPage')?.addEventListener('click', () => {
    docManager.duplicatePage(store.get().activePageId);
    scheduleRebuild(true);
    renderActiveWorkspace();
  });
  document.getElementById('btnDelPage')?.addEventListener('click', () => {
    if (docManager.deletePage(store.get().activePageId)) {
      scheduleRebuild(true);
      renderActiveWorkspace();
    }
  });
  document.querySelectorAll('#mainWorkspaceTabs button').forEach(b => b.onclick = () => setMainWorkspace(b.dataset.mainWs));

  document.getElementById('btnToggleMobileInspector')?.addEventListener('click', () => {
    document.getElementById('inspectorCol')?.classList.toggle('mobile-open');
  });
  const resizer = document.getElementById('dockerResizer');
  if (resizer) {
    resizer.onpointerdown = (e) => {
      e.preventDefault();
      const onMv = (mv) => {
        const w = Math.max(280, Math.min(620, window.innerWidth - mv.clientX));
        const sb = document.getElementById('studioBody');
        if (sb) sb.style.gridTemplateColumns = `82px minmax(0, 1fr) 5px ${w}px`;
      };
      const onUp = () => { window.removeEventListener('pointermove', onMv); window.removeEventListener('pointerup', onUp); };
      window.addEventListener('pointermove', onMv);
      window.addEventListener('pointerup', onUp);
    };
  }

  attachMenuBar({
    newDoc: () => document.getElementById('btnNewDocTab')?.click(),
    openJson: () => { setMainWorkspace('model3d'); store.update(s => { s.activeWorkspace = 'projects'; }); renderActiveWorkspace(); },
    saveDoc: () => document.getElementById('btnQuickSaveDoc')?.click(),
    saveJsonFile: () => document.getElementById('btnSaveJson')?.click(),
    openExport: () => store.get().mainWorkspace === 'nesting' ? openNestingVectorImport(true) : openExportDialog(),
    exportPng: () => document.getElementById('btnExportPng')?.click(),
    exportSvg: () => document.getElementById('btnExportSvg')?.click(),
    exportDxf: () => document.getElementById('btnExportDxf')?.click(),
    undo: () => document.getElementById('btnUndo')?.click(),
    redo: () => document.getElementById('btnRedo')?.click(),
    cut: cutSelectionToClipboard,
    copy: () => copySelectionToClipboard(),
    paste: () => runCadAction('paste'),
    duplicate: () => runCadAction('duplicate'),
    selectAll: () => { if(store.get().mainWorkspace==='nesting')return;store.update(s => { s.selectedIds = s.objects.map(o => o.id); }); scheduleRebuild(true); },
    del: () => runCadAction('delete'),
    setMainWs: (ws) => setMainWorkspace(ws),
    fitView: () => { if (store.get().mainWorkspace === 'design2d') vector2D?.fitAll(store.get()); else signEngine?.setCameraPreset('fit'); },
    toggleGrid: (k) => { store.update(s => { s.grid[k] = !s.grid[k]; }); scheduleRebuild(true); },
    togglePageFrame: () => { store.update(s => { s.pageLayout.visible = !s.pageLayout.visible; }); scheduleRebuild(true); },
    toggleFullscreen: () => document.getElementById('btnFullscreen')?.click(),
    cadAction: (act) => runCadAction(act),
    centerOnPage: () => {if(store.get().mainWorkspace==='nesting')return;mutate('Sayfaya ortala', s => { const o = getSelectedOrFirst(s); if (o && !o.locked) { o.xMm = 0; o.yMm = 0; } });},
    toggleLockSelected: () => {if(store.get().mainWorkspace==='nesting')editSelectedNesting('toggleLock');else mutate('Kilit', s => { const o = getSelectedOrFirst(s); if (o) toggleLayerLock(s, o.id); });},
    addPage: () => document.getElementById('btnAddPage')?.click(),
    dupPage: () => document.getElementById('btnDupPage')?.click(),
    delPage: () => document.getElementById('btnDelPage')?.click(),
    tool: (t) => activateTool(t),
    setConstruction: (c) => mutate('Yapı tipi', s => { s.constructionType = c; const o = getSelectedOrFirst(s); if (o) o.constructionType = c; }),
    setLightingMode: (m) => mutate('Aydınlatma', s => { s.lighting.mode = m; const o = getSelectedOrFirst(s); if (o) o.lightingMode = m; }),
    toggleNight: () => mutate('Ortam', s => { s.scene.night = !s.scene.night; }),
    runNesting: () => { setMainWorkspace('nesting'); runAutoNesting(); },
    setDocker: (d) => { store.update(s => { s.activeWorkspace = d; }); renderActiveWorkspace(); },
    showShortcuts: () => document.getElementById('shortcutsModal')?.classList.remove('hidden'),
    resetDefaults: resetMaterialDefaults,
  });

  document.getElementById('threeContainer')?.addEventListener('click', e => {
    if (e.target.closest('#khsSwitch2D')) setMainWorkspace('design2d');
  });
  setMainWorkspace(store.get().mainWorkspace || 'model3d');
  updateUndoRedoButtons();
  scheduleRebuild(true);
  renderActiveWorkspace();
}

let placingObjId = null;
function startMousePlacement(tool) {
  // Cancel any prior unfinished placement
  if (placingObjId) {
    store.update(s => { s.objects = s.objects.filter(o => o.id !== placingObjId); });
    placingObjId = null;
  }
  const s0 = store.get();
  const obj = createShapeObject(tool, s0, { xMm: 0, yMm: 0 });
  placingObjId = obj.id;
  store.update(s => {
    s.objects.push(obj);
    s.selectedIds = [obj.id];
    s.activeTool = tool;
  });
  scheduleRebuild(true);
  const stage = document.getElementById('stageWrap');
  const warnEl = document.getElementById('stageWarning');
  if (stage) stage.style.cursor = 'crosshair';
  if (warnEl) {
    warnEl.textContent = 'Nesneyi yerleştirmek istediğiniz noktaya tıklayın (İptal: Esc)';
    warnEl.classList.remove('hidden');
  }

  const onMovePlace = (mv) => {
    if (!placingObjId || !signEngine) return;
    const pt = signEngine.screenToWallMm(mv.clientX, mv.clientY);
    store.updateObject(placingObjId,o=>{o.xMm=pt.xMm;o.yMm=pt.yMm;});
    const mesh=signEngine.signGroup?.children.find(c=>c.userData?.layerId===placingObjId);
    if(mesh){mesh.position.x=pt.xMm*.001;mesh.position.y=pt.yMm*.001;signEngine.invalidate(true);}
    scheduleLiveUi();
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', onMovePlace);
    document.getElementById('threeContainer')?.removeEventListener('pointerdown', onClickPlace, true);
    window.removeEventListener('keydown', onKeyCancel);
    if (stage) stage.style.cursor = '';
    warnEl?.classList.add('hidden');
  };

  const onClickPlace = (e) => {
    if (e.button !== 0 || !placingObjId) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = signEngine.screenToWallMm(e.clientX, e.clientY);
    const placedId = placingObjId;
    placingObjId = null;
    cleanup();
    mutate(`${tool} yerleştirildi`, s => {
      const o = s.objects.find(x => x.id === placedId);
      if (o) { o.xMm = pt.xMm; o.yMm = pt.yMm; }
      s.selectedIds = [placedId];
      s.activeTool = 'move';
    });
    document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'move'));
  };

  const onKeyCancel = (e) => {
    if (e.key === 'Escape' && placingObjId) {
      const cancelId = placingObjId;
      placingObjId = null;
      cleanup();
      store.update(s => {
        s.objects = s.objects.filter(o => o.id !== cancelId);
        s.selectedIds = s.objects.length ? [s.objects[0].id] : [];
        s.activeTool = 'select';
      });
      scheduleRebuild(true);
      document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
    }
  };

  window.addEventListener('pointermove', onMovePlace);
  document.getElementById('threeContainer')?.addEventListener('pointerdown', onClickPlace, true);
  window.addEventListener('keydown', onKeyCancel);
}

function activateTool(tool) {
  if(store.get().mainWorkspace==='nesting'){
    if(tool==='logo'){openNestingVectorImport(true);return;}
    if(['select','move','rotate','scale'].includes(tool)){nestingTool=tool;syncWorkspaceRail('nesting');return;}
    if(tool==='zoom'||tool==='pan')return;
    return;
  }
  document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'rect' || tool === 'ellipse' || tool === 'text' || tool === 'polygon') {
    startMousePlacement(tool);
    return;
  }
  if (tool === 'logo') {
    document.querySelector('[data-ws="design"]').click();
    setTimeout(() => document.getElementById('logoFileInput')?.click(), 50);
    return;
  }
  if (tool === 'zoom') {
    signEngine?.zoomBy(0.85);
    return;
  }
  if (signEngine) signEngine.activeTool = tool;
  store.update(s => {
    s.activeTool = tool;
    if (!s.selectedIds.length && s.objects.length && ['move', 'scale', 'rotate'].includes(tool)) {
      s.selectedIds = [s.objects[0].id];
    }
  });
  signEngine?.updateSelectionBox?.(store.get());
  drawCadOverlay(store.get());
  renderCanvasTransformHud(store.get());
}

function runCadAction(action) {
  if(store.get().mainWorkspace==='nesting'){if(action==='delete')editSelectedNesting('delete');return;}
  if (action === 'duplicate') mutate('Çoğalt', s => duplicateSelectedLayers(s));
  else if (action === 'delete') mutate('Sil', s => deleteSelectedLayers(s));
  else if (action === 'mirrorX') mutate('Yatay aynala', s => mirrorSelectedObjects(s, 'x'));
  else if (action === 'mirrorY') mutate('Dikey aynala', s => mirrorSelectedObjects(s, 'y'));
  else if (action === 'toCurves') {
    mutate('Eğriye çevir', s => {
      s.objects = s.objects.map(o => (s.selectedIds.includes(o.id) ? (convertObjectToCurves(o, fontMap) || o) : o));
    });
  } else if (action === 'breakApart') {
    mutate('Harflere ayır', s => {
      const target = getSelectedOrFirst(s);
      if (!target) return;
      const res = breakApartObjectToLetters(target, s, fontMap);
      if (res.ok && res.letters?.length) {
        const idx = s.objects.findIndex(o => o.id === target.id);
        s.objects.splice(idx, 1, ...res.letters);
        s.selectedIds = [res.letters[0].id];
      }
    });
  } else if (action === 'combine') {
    mutate('Bileşik yol', s => combineSelectedToCompound(s, fontMap));
  } else if (action === 'addNode') {
    mutate('Düğüm ekle', s => {
      const o = getSelectedOrFirst(s);
      if (o) addNodeToPolygon(o, vector2D?.selectedNode?.polyIdx || 0, vector2D?.selectedNode?.nodeIdx || 0);
    });
  } else if (action === 'delNode') {
    mutate('Düğüm sil', s => {
      const o = getSelectedOrFirst(s);
      if (o) deleteNodeFromPolygon(o, vector2D?.selectedNode?.polyIdx || 0, vector2D?.selectedNode?.nodeIdx || 0);
    });
  } else if (action === 'reversePath') {
    mutate('Yolu çevir', s => { const o = getSelectedOrFirst(s); if (o) reversePolygonPath(o); });
  } else if (action === 'union' || action === 'difference' || action === 'intersection') {
    mutate('Boolean', s => applyBooleanToSelected(s, action, fontMap));
  } else if (action === 'paste' && objectClipboard) {
    pasteSelectionFromClipboard();
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

init();
