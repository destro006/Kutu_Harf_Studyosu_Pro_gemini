import {ALIGN_COMMANDS,alignmentIcon,alignmentPlan,applyAlignmentPlan,contourBounds} from './cad/Alignment.js';
import {resolveObjectLighting,selectedLightingObjects,setLightingValue} from './core/ObjectLighting.js';
import {editableTextObject,applyTextEdit} from './cad/TextEditing.js';
import THREE from './vendor/three.js';
import { buildChannelComponent } from './geometry/ChannelLetterGeometry.js';
import { StateStore, createDefaultState, createObjectId, structuredCloneSafe } from './core/state.js';
import { DocumentManager } from './core/DocumentManager.js';
import { Vector2DCanvas } from './cad/Vector2DCanvas.js?v=qa8';
import { ContextMenu } from './ui/ContextMenu.js';
import { renderPropertyBar } from './ui/PropertyBar.js?v=20261125-v15';
import { polygonSize, nominalSize, roundMm, resizeObjectToMm } from './core/ObjectDimensions.js';
import { PAGE_SIZE_PRESETS, normalizeDisplayUnit, formatMmAsUnit, displayToMm, formatDimensions, formatPresetLabel, formatAreaM2 } from './core/units.js';
import { attachMenuBar } from './ui/MenuBar.js?v=qa8';
import { renderNestingCenter, renderCncCenter, renderCostCenter } from './ui/CentralWorkspaces.js?v=20261125-v15';
import {nextNestingSelection,deleteNestingParts,moveNestingParts} from './manufacturing/NestingSelection.js?v=nest7';
import { generateNestedGcode, generateNestedHpgl,validateNestedProduction,MACHINE_PROFILES,getMachineProfile } from './export/CncGcodeExporter.js';
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
import { FontManager } from './geometry/FontManager.js?v=qa8';
import { generateCutoutPreview, parseSvgLogo, traceRasterLogo } from './geometry/LogoTracer.js';
import { SignEngine, QUALITY_PROFILES } from './render/SignEngine.js?v=20261125-v15';
import { ACRYLIC_PALETTE, MATERIAL_PRESETS, PAINT_PALETTE } from './render/MaterialLibrary.js';
import { RAL_COLORS, RAL_GROUPS } from './render/RalColors.js';
import { ENVIRONMENT_PRESETS } from './render/EnvironmentManager.js';
import { LIGHT_COLOR_PRESETS, LIGHTING_MODES } from './render/LightingSystem.js';
import {detectVectorFormat} from './manufacturing/VectorFormatDetect.js';
import { BACKGROUND_SCENES } from './photomontage/BackgroundLibrary.js';
import { PhotomontageOverlay } from './ui/PhotomontageOverlay.js?v=20261125-v15';
import { renderNestingSvg } from './ui/NestingView.js';
import { applySurfaceMaterialPreset, getDisplayedSurfaceMaterial } from './core/MaterialActions.js';
import { getExportSelection } from './export/ExportScope.js';
import { EXPORT_FORMAT_GROUPS, getExportFormat, formatSupportsSource } from './export/ExportFormatCatalog.js';
import { runProfessionalExport } from './export/ProfessionalExportController.js';
import {
  buildCorelNestingPayload,
  generateCorelColoredSvg,
  generateCorelVbaMacro,
  generateCorelBridgeLauncherBat,
  checkCorelBridgeStatus,
  sendNestingToCorel,
} from './export/CorelDrawBridge.js';
import {
  CNC_TRANSPORT_MODES,
  loadMachineConnection,
  saveMachineConnection,
  buildMachineUploadPayload,
  generateCncBridgeLauncherBat,
  checkCncBridgeStatus,
  uploadToCncMachine,
} from './export/CncMachineBridge.js';
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
import { SHORTCUT_LIST, SHORTCUT_GROUPS, attachShortcuts } from './cad/Shortcuts.js?v=nest7';
import { captureObjectClipboard, pasteObjectClipboard } from './core/ObjectClipboard.js';
import { calculateManufacturingMetrics } from './manufacturing/MetricsCalculator.js';
import { SHEET_PRESETS, extractNestingItems, runTrueShapeNesting, validateSheetLayout, editNestingPlacement, refreshNestingSheet } from './manufacturing/NestingEngine.js';
import { importVectorText } from './manufacturing/VectorFileImport.js';
import { importPdfFile } from './manufacturing/PdfVectorImport.js';
import { runVectorImportJob } from './manufacturing/AsyncVectorImport.js?v=pro3-fast3';
import {
  createNestingImportedTab, getActiveNestingImportedItems, openNestingImportTab,
  switchNestingTab, closeNestingImportedTab, syncActiveNestingTab, applyNestingPartOverrides,
} from './manufacturing/NestingTabs.js';
import { calculateProjectCosts, formatMoney, getPriceCard, listPriceCatalog, changeRateCurrency } from './manufacturing/CostEngine.js';
import { buildQuoteHtml } from './manufacturing/QuoteGenerator.js?v=units6';
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
let nestingAdvancedOpen = false;
const fontManager = new FontManager();
const fontMap = new Map();
window.__khsFontMap = fontMap;

let signEngine = null;
let ensureSignEngine=()=>signEngine;
const is3DWorkspace=state=>['model3d','materials'].includes(state.mainWorkspace||'model3d');
let sceneDataKey=null;
let photomontageOverlay = null;
let traceStudioReady = false;
let pendingTracerImage = null;
function flushPendingTracerImage() {
  if (!pendingTracerImage) return false;
  const frame = document.getElementById('traceStudioFrame');
  if (!frame?.contentWindow || !traceStudioReady) return false;
  frame.contentWindow.postMessage({
    type: 'SIGNAGE_STUDIO_LOAD_IMAGE',
    dataUrl: pendingTracerImage.dataUrl,
    fileName: pendingTracerImage.fileName,
  }, '*');
  pendingTracerImage = null;
  return true;
}
function handlePhotomontagePhotoFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    lastPhotomontageScene = null;
    lastPhotomontageUrl = null;
    lastPhotomontageHaloUrl = null;
    mutate('Müşteri fotoğrafı', s => {
      s.photomontage.photoUrl = reader.result;
      s.photomontage.photoName = file.name;
      s.photomontage.visible = true;
      s.photomontage.confirmed = false;
    });
  };
  reader.readAsDataURL(file);
}
async function sendPhotomontageToTracer() {
  const s = store.get();
  if (!s.photomontage?.photoUrl || !photomontageOverlay) return false;
  const dataUrl = await photomontageOverlay.buildCompositeDataUrl(s, signEngine);
  if (!dataUrl) {
    studioToast('Perspektif görüntüsü oluşturulamadı.', true);
    return false;
  }
  const fileName = `${(s.projectName || 'fotomontaj').replace(/\s+/g, '_')}_perspektif`;
  pendingTracerImage = { dataUrl, fileName };
  setMainWorkspace('tracer');
  flushPendingTracerImage();
  studioToast('✓ Perspektif onaylandı ve görüntü Image Tracer sekmesine gönderildi!');
  return true;
}
let lastSceneResult = { sizeM: { w: 2, h: 0.4 }, metricsList: [], warnings: [] };
let lastMetrics = calculateManufacturingMetrics([], store.get());
let lastCosts = calculateProjectCosts(lastMetrics, store.get());
let lastNesting = null;
let lastPhotomontageScene=null,lastPhotomontageUrl=null,lastPhotomontageHaloUrl=null;
let selectedNestingId = null;
let selectedNestingIds=new Set(),nestingSelectionAnchor=null,nestingSelectionScope=null;
function clearNestingSelection(){selectedNestingId=null;selectedNestingIds.clear();nestingSelectionAnchor=null;}
function syncNestingSelectionScope(state){
 const key=JSON.stringify([docManager.activeDocId,state.activePageId,state.nesting.activeTabId||'design',activeSheetIdx]);
 if(key!==nestingSelectionScope){clearNestingSelection();nestingSelectionScope=key;}
 const ids=new Set((state.nesting.sheets?.[activeSheetIdx]?.placements||[]).map(p=>p.id));
 selectedNestingIds=new Set([...selectedNestingIds].filter(id=>ids.has(id)));
 if(!selectedNestingIds.has(selectedNestingId))selectedNestingId=[...selectedNestingIds].at(-1)??null;
 if(!ids.has(nestingSelectionAnchor))nestingSelectionAnchor=null;
}
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
  if (renderWorkspace && store.get().mainWorkspace!=='nesting') renderActiveWorkspace();
}
function mutateData(label,fn,renderWorkspace=false){return mutate(label,fn,renderWorkspace,false);}
function mutateRender(label, fn, renderWorkspace = false) {
  history.push(store.get(), label);
  store.update(s => {
    fn(s);
    syncActiveNestingTab(s.nesting);
  });
  docManager.markDirty();
  updateUndoRedoButtons();
  const state = store.get();
  if (is3DWorkspace(state) && signEngine && !signEngine.isDisposed && typeof signEngine.updateRenderSettings === 'function') {
    signEngine.updateRenderSettings(state);
    updateStageChrome(state);
    updateNumericBar(state);
    writeAutosave(state);
  } else {
    scheduleRebuild(true);
  }
  if (renderWorkspace && state.mainWorkspace !== 'nesting') renderActiveWorkspace();
}

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

  // Day/Night & Light buttons
  document.getElementById('btnDay').classList.toggle('on', !state.scene.night);
  document.getElementById('btnNight').classList.toggle('on', state.scene.night);
  const lightBtn = document.getElementById('btnLightToggle');
  lightBtn.classList.toggle('on', state.lighting.enabled);
  const selLight = resolveObjectLighting(selObj, state);
  const dotColor = selLight.mode === 'front' ? selLight.frontColor : selLight.backColor;
  document.getElementById('lightDot').style.setProperty('--c', dotColor || state.lighting.colorHex);
  document.getElementById('lightToggleLabel').textContent = state.lighting.enabled ? 'Işık açık' : 'Işık kapalı';

  // Wall buttons
  const quickWallSelect=document.getElementById('quickWallSelect');if(quickWallSelect)quickWallSelect.value=state.scene.wallId;
  syncWallScaleControls(state.scene.wallScale ?? 1.0);
  document.querySelectorAll('#quickWallSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.wall === state.scene.wallId);
  });

  // Photomontage preview sync (visible across all 3D tabs when photo is loaded and visible)
  if (is3DWorkspace(state) && state.photomontage?.photoUrl && state.photomontage.visible !== false && signEngine && !signEngine.isDisposed) {
    const pmKey = pmRenderKey(state);
    if (!dragBeforeState && (lastPhotomontageScene !== pmKey || !lastPhotomontageUrl)) {
      const cap = capturePhotomontageSign(state);
      lastPhotomontageUrl = cap.signUrl;
      lastPhotomontageHaloUrl = cap.haloUrl;
      lastPhotomontageScene = pmKey;
    }
    if (lastPhotomontageUrl) photomontageOverlay?.render(state, lastPhotomontageUrl, lastPhotomontageHaloUrl);
  } else {
    photomontageOverlay?.render({ photomontage: { photoUrl: null } }, null, null);
  }
}

function pmRenderKey(state) {
  const l = state.lighting || {};
  const objs = (state.objects || []).map(o => `${o.id}:${o.visible}:${o.constructionType || state.constructionType}:${o.text}:${o.fontId}:${o.faceMaterial}:${o.faceColor}:${o.acrylicMaterial}:${o.acrylicColor}:${o.lightingMode}:${o.lightSettings?.frontColor ?? ''}:${o.lightSettings?.frontIntensity ?? ''}:${o.lightSettings?.backColor ?? ''}:${o.lightSettings?.backIntensity ?? ''}:${o.xMm}:${o.yMm}:${o.scaleX}:${o.scaleY}`).join('|');
  return [state.scene?.night, l.enabled, l.mode, l.colorHex, l.frontColor, l.frontIntensity, l.backColor, l.backIntensity, l.haloSpread, l.wallDistanceMm, objs].join('~');
}

function capturePhotomontageSign(state) {
  const sz = lastSceneResult?.sizeM || signEngine?.lastSizeM || { w: 2.0, h: 0.45 };
  const capW = 1400;
  const capH = Math.max(380, Math.min(1000, Math.round(capW * ((sz.h + 0.30) / Math.max(0.5, sz.w + 0.36)))));
  const hasActiveHalo = Boolean(signEngine?.signGroup?.children?.some(c => c.userData?.isHalo && c.visible && c.material?.opacity > 0));
  const signUrl = signEngine.capturePng(capW, capH, {
    transparent: true,
    fitToSign: true,
    haloMode: hasActiveHalo ? 'exclude' : 'include',
  });
  const haloUrl = hasActiveHalo
    ? signEngine.capturePng(capW, capH, { transparent: true, fitToSign: true, haloMode: 'only' })
    : null;
  return { signUrl, haloUrl };
}

function applyConstructionType(s, ctype) {
  s.constructionType = ctype;
  // The inspector shows the first object when nothing is selected.
  const ids = new Set((s.selectedIds || []).length ? s.selectedIds : [s.objects[0]?.id].filter(Boolean));
  for (const o of s.objects) {
    if (ids.has(o.id) && !o.locked) o.constructionType = ctype;
  }
  if (ctype === 'metal' || ctype === 'isiksiz') {
    s.lighting.enabled = false;
    s.lighting.mode = 'none';
    for (const o of s.objects) if (ids.has(o.id) && !o.locked) o.lightingMode = 'none';
  } else if (ctype === 'fileli' || ctype === 'pleksi') {
    const wasOff = s.lighting.enabled === false;
    s.lighting.enabled = true;
    if (wasOff || !s.lighting.mode || s.lighting.mode === 'none') s.lighting.mode = 'front';
    for (const o of s.objects) {
      if (ids.has(o.id) && !o.locked && (wasOff || !o.lightingMode || o.lightingMode === 'none')) {
        o.lightingMode = 'front';
      }
    }
  } else if (ctype === 'halo') {
    const wasOff = s.lighting.enabled === false;
    s.lighting.enabled = true;
    if (wasOff || !s.lighting.mode || s.lighting.mode === 'none') s.lighting.mode = 'halo';
    for (const o of s.objects) {
      if (ids.has(o.id) && !o.locked && (wasOff || !o.lightingMode || o.lightingMode === 'none')) {
        o.lightingMode = 'halo';
      }
    }
  }
}

function previewLightingColor(key, value) {
  const state = store.get(), selected = selectedLightingObjects(state);
  if (selected.length && selected.every(o => o.locked)) return;
  store.updateScoped(selected.length ? ['objects'] : ['lighting'], s => setLightingValue(s, key, value));
  const next = store.get();
  if (is3DWorkspace(next)) signEngine?.updateLightAppearance(next);
}

function editLighting(key,value){
  const state=store.get(),selected=selectedLightingObjects(state);
  if(selected.length&&selected.every(o=>o.locked))return;
  const appearance=['frontColor','backColor','frontIntensity','backIntensity'].includes(key);
  if(!appearance){mutate('Aydınlatma ayarı',s=>setLightingValue(s,key,value));return;}
  history.push(state,'Işık ayarı');
  store.updateScoped(selected.length?['objects']:['lighting'],s=>setLightingValue(s,key,value));
  docManager.markDirty();updateUndoRedoButtons();
  const next=store.get();
  if(is3DWorkspace(next)&&signEngine?.updateLightAppearance(next)){updateNumericBar(next);renderActiveWorkspace();writeAutosave(next);if(next.photomontage?.photoUrl&&next.photomontage.visible!==false)updateStageChrome(next);}
  else scheduleRebuild(true);
}
function runAlignment(command){
 const s=store.get();if(!['model3d','materials','design2d'].includes(s.mainWorkspace||'model3d'))return;
 const plan=alignmentPlan(s,command,o=>contourBounds(Vector2DCanvas.prototype._getObjectPolysWorld(o,fontMap)));
 if(!plan.length)return;
 mutate('Hizalama · '+(ALIGN_COMMANDS.find(c=>c[0]===command)?.[1]||command),draft=>applyAlignmentPlan(draft,plan));
}
function updateAlignmentRail(state){
 const button=document.getElementById('btnAlignmentRail'),panel=document.getElementById('alignmentFlyout');
 if(!button||!panel)return;
 const enabled=['model3d','materials','design2d'].includes(state.mainWorkspace||'model3d');
 const count=state.objects.filter(o=>(state.selectedIds||[]).includes(o.id)&&!o.locked&&o.visible!==false).length;
 button.disabled=!enabled;if(!enabled){panel.classList.add('hidden');button.setAttribute('aria-expanded','false');}
 for(const el of panel.querySelectorAll('[data-align-command]'))el.disabled=!enabled||count<(el.dataset.alignCommand==='page'?1:el.dataset.alignCommand.startsWith('dist')?3:2);
}
function bindAlignmentRail(){
 const btn=document.getElementById('btnAlignmentRail'),panel=document.getElementById('alignmentFlyout');if(!btn||!panel)return;
 btn.querySelector('.align-rail-icon').innerHTML=alignmentIcon('left');
 panel.innerHTML='<div class="align-flyout-title">Hizalama</div><div class="align-icon-grid">'+ALIGN_COMMANDS.slice(0,7).map(iconButton).join('')+'</div><div class="align-flyout-title">Dağıtma</div><div class="align-icon-grid">'+ALIGN_COMMANDS.slice(7).map(iconButton).join('')+'</div>';
 function iconButton([cmd,label,key]){return '<button type="button" data-align-command="'+cmd+'" title="'+label+' ('+key+')" aria-label="'+label+' ('+key+')">'+alignmentIcon(cmd)+'</button>';}
 function close(){panel.classList.add('hidden');btn.setAttribute('aria-expanded','false');}
 function place(){const box=btn.getBoundingClientRect();panel.style.left=Math.max(4,Math.min(box.right+6,window.innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(box.top,window.innerHeight-panel.offsetHeight-8))+'px';}
 btn.onclick=()=>{if(!panel.classList.contains('hidden')){close();return;}updateAlignmentRail(store.get());panel.classList.remove('hidden');btn.setAttribute('aria-expanded','true');place();};
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-align-command]');if(b&&!b.disabled){runAlignment(b.dataset.alignCommand);updateAlignmentRail(store.get());}});
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&!btn.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 window.addEventListener('resize',()=>{if(!panel.classList.contains('hidden'))place();});
 document.getElementById('cadRail')?.addEventListener('scroll',close,{passive:true});
 updateAlignmentRail(store.get());
}
function updateNumericBar(state) {
  if(state.mainWorkspace==='nesting')syncNestingSelectionScope(state);
  updateAlignmentRail(state);
  renderPropertyBar(state, {
    activeSheetIdx,
    selectedPlacementId: selectedNestingId,
    fonts: fontManager.getAllFontMetas(),
    onLightingEdit:editLighting,
    onSetConstruction: (c) => mutate('Yapı tipi değiştirildi', s => applyConstructionType(s, c)),
    getObjectSize: objectPhysicalSize,
    onEditSelected: (fn) => mutate('Özellik düzenlendi', s => {
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) fn(o);
    }),
    onCadAction: (act) => runCadAction(act),
    onTool: (t) => activateTool(t),
    onAlign:runAlignment,
    onDistribute:ax=>runAlignment(ax==='x'?'distGapX':'distGapY'),
    onRefreshBar: () => updateNumericBar(store.get()),
    onDisplayUnit: unit => {
      const safeUnit = normalizeDisplayUnit(unit);
      store.updateScoped(['pageLayout'],s => { s.pageLayout.displayUnit = safeUnit; });
      // Unit switching only changes the presentation of dimensions; the model remains in mm.
      updateStageChrome(store.get());
      updateNumericBar(store.get());
      renderActiveWorkspace();
      updateCenterWorkspaces(store.get());
      drawCadOverlay(store.get());
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
      nestingRepackController?.abort();
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
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const canvas = document.getElementById('cadOverlay');
  const wrap = document.getElementById('stageWrap');
  if (!canvas || !wrap) return;
  const tool = state.activeTool;
  const needsOverlay = state.scene.showRuler || tool === 'pen' || tool === 'measure' || tool === 'node';
  canvas.classList.toggle('interactive', ['pen', 'node', 'measure'].includes(tool));
  if (!needsOverlay && canvas.dataset.clean === '1') return;
  if (canvas.width !== wrap.clientWidth) canvas.width = wrap.clientWidth;
  if (canvas.height !== wrap.clientHeight) canvas.height = wrap.clientHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.clean = needsOverlay ? '0' : '1';

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
      const lbl = `X: ${show(mmX)} ${unit}  Y: ${show(mmY)} ${unit}`;
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
        const lbl = `📏 ${show(dist)} ${unit}  (ΔX: ${show(Math.abs(dx))}  ΔY: ${show(Math.abs(dy))})`;
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
  { id: 'properties', label: 'Metin & Yapı', fn: renderDesignWs },
  { id: 'layers', label: 'Katmanlar', fn: renderLayersWs },
  { id: 'materials', label: 'Malzeme & Renk', fn: renderMaterialsWs },
  { id: 'lighting', label: 'Aydınlatma', fn: renderLightingWs },
  { id: 'manufacturing', label: 'İmalat', fn: renderManufacturingDocker },
  { id: 'align', label: 'Vektör & Gruplama', fn: renderAlignDocker },
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
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const obj = getSelectedOrFirst(state);
  const fw = obj?.fileWidthMm ?? state.fileli?.fileWidthMm ?? 5;
  return `
    <section class="sec">
      <h3 class="sec-title">Fileli &amp; İmalat Parametreleri</h3>
      <div class="field-row"><label>File Genişliği (${unit})</label><input id="mfgFileW" type="number" step="any" min="${show(0)}" max="${show(40)}" value="${show(fw)}"></div>
      <div class="field-row"><label>Kenar Çıta Ebatı (${unit})</label><input id="mfgDepth" type="number" step="any" min="${show(10)}" max="${show(400)}" value="${show(obj?.depthMm ?? 80)}"></div>
      <div class="field-row"><label>Pleksi Kalınlığı (${unit})</label><input id="mfgAcThick" type="number" min="${show(1)}" max="${show(20)}" step="${show(0.5)}" value="${show(state.fileli?.acrylicThicknessMm ?? 3)}"></div>
      <div class="field-row"><label>Pleksi İçe Çökme (${unit})</label><input id="mfgAcInset" type="number" min="${show(0)}" max="${show(20)}" step="${show(0.5)}" value="${show(state.fileli?.acrylicInsetMm ?? 2.5)}"></div>
      <div class="field-row"><label>Ön File Metal Yüksekliği (${unit})</label><input id="mfgMetThick" type="number" min="${show(0.5)}" max="${show(5)}" step="${show(0.1)}" value="${show(state.fileli?.fileThicknessMm ?? 2)}"></div>
      <div class="field-row"><label>Yanak Sac Kalınlığı (${unit})</label><input id="mfgWallThickness" type="number" min="${show(0.2)}" max="${show(3)}" step="${show(0.1)}" value="${show(state.fileli?.metalThicknessMm ?? 1)}"></div>
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
      <h3 class="sec-title">Vektör &amp; Gruplama</h3>
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
  const ids = ['layers','objects','projects'];
  wsLayout.tabOrder = ['layers',...new Set([...wsLayout.tabOrder,...ids].filter(id=>id!=='layers'&&ids.includes(id)))];
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
  document.activeElement?.blur?.();
  const root=document.getElementById('workspaceContent');if(root)root.dataset.layoutKey='';
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
  layer.innerHTML = wsLayout.floating.filter(fw=>sideIds.has(fw.id)).map(fw => {
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

const ribbonIds=new Set(['properties','materials','lighting','manufacturing','align','background']);
const sideIds=new Set(['objects','layers','projects']);
let sideWorkspace='layers';
const inspectorIds=new Set([...sideIds,...ribbonIds]);
let ribbonSuppressed=null;
function renderRibbon(state){
  const root=document.getElementById('ribbonPanelContent'),panel=document.getElementById('ribbonPanel'),host=document.getElementById('studioRibbon');
  if(!root||!panel||!host)return;
  const allowed=['model3d','materials','design2d'].includes(state.mainWorkspace||'model3d');
  host.classList.toggle('hidden',!allowed);
  const ws=state.activeWorkspace==='design'?'properties':state.activeWorkspace;
  const open=allowed&&ribbonIds.has(ws)&&ribbonSuppressed!==ws;
  panel.classList.toggle('hidden',!open);
  document.querySelectorAll('[data-ribbon]').forEach(b=>{const active=open&&b.dataset.ribbon===ws;b.classList.toggle('on',active);b.setAttribute('aria-expanded',String(active));});
  if(!open){if(root.childElementCount)root.innerHTML='';root.dataset.ribbonKey='';return;}
  const meta=WS_META.find(x=>x.id===ws);if(!meta)return;
  document.getElementById('ribbonPanelTitle').textContent=meta.label;
  const key=[ws,(state.selectedIds||[]).join(','),state.pageLayout?.displayUnit,resolveObjectLighting(selectedLightingObjects(state)[0],state).mode].join('|');
  if(!root._ribbonFocusBound){root._ribbonFocusBound=true;root.addEventListener('focusout',()=>setTimeout(()=>{if(root.dataset.pendingRefresh==='1'&&!root.contains(document.activeElement))renderRibbon(store.get());},0));}
  if(root.dataset.ribbonKey===key&&root.contains(document.activeElement)&&/^(INPUT|SELECT|TEXTAREA)$/i.test(document.activeElement?.tagName||'')){root.dataset.pendingRefresh='1';return;}
  root.dataset.ribbonKey=key;root.dataset.pendingRefresh='0';
  root.classList.toggle('material-ribbon-content',ws==='materials');
  root.classList.toggle('lighting-ribbon-content',ws==='lighting');
  const html=meta.fn(state);if(root._ribbonHtml===html&&root.childElementCount)return;
  root._ribbonHtml=html;const scroll=root.scrollTop;root.innerHTML=html;bindWorkspaceEvents(ws,root);root.scrollTop=scroll;
}
function closeRibbon(){
  ribbonSuppressed=store.get().activeWorkspace;
  store.updateScoped([],s=>{s.activeWorkspace=sideWorkspace;});
  renderActiveWorkspace();updateStageChrome(store.get());
}
function bindRibbon(){
  document.querySelectorAll('[data-ribbon]').forEach(b=>b.addEventListener('click',()=>{
    if(b.classList.contains('on')){closeRibbon();return;}
    if(ribbonIds.has(sideWorkspace))sideWorkspace='layers';
    ribbonSuppressed=null;store.updateScoped([],s=>{s.activeWorkspace=b.dataset.ribbon;});renderActiveWorkspace();updateStageChrome(store.get());
  }));
  document.getElementById('ribbonClose')?.addEventListener('click',closeRibbon);
  document.getElementById('ribbonPanel')?.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeRibbon();}});
}
function renderActiveWorkspace() {
  const state = store.get();
  renderRibbon(state);
  if(state.mainWorkspace==='nesting')return;
  const active=state.activeWorkspace==='design'?'properties':state.activeWorkspace;
  const ribbonOpen=ribbonIds.has(active)&&ribbonSuppressed!==active&&['model3d','materials','design2d'].includes(state.mainWorkspace||'model3d');
  if(sideIds.has(active))sideWorkspace=active;
  // Advanced tools have exactly one DOM owner, avoiding duplicate control IDs.
  const ws=ribbonOpen&&ribbonIds.has(sideWorkspace)?'layers':sideWorkspace;
  const stackMode = state.ui?.stackMode === 'stacked' && sideIds.has(ws);
  arrangeDockerTabs();
  const tabsEl = document.getElementById('workspaceTabs');
  const panelSelect = document.getElementById('inspectorPanelSelect');
  if (panelSelect) panelSelect.value = ws;
  const stackBtn = document.getElementById('btnToggleStackMode');
  if (tabsEl) tabsEl.classList.toggle('hidden', stackMode);
  if (stackBtn) {stackBtn.textContent = stackMode ? '⊟ Sekme Modu' : '⊞ Alt Alta Aç';stackBtn.disabled=!sideIds.has(ws);stackBtn.title=stackMode?'Panelleri sekme moduna al':'Panelleri alt alta aç';}
  const floatBtn=document.getElementById('btnFloatActiveDocker');if(floatBtn)floatBtn.disabled=!sideIds.has(ws);

  const floatIds = new Set(wsLayout.floating.filter(f=>sideIds.has(f.id)).map(f => f.id));
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
    JSON.stringify(wsLayout.dockedUnder),ws==='lighting'?state.selectedIds.join(',')+'|'+resolveObjectLighting(selectedLightingObjects(state)[0],state).mode:''].join('|');
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
    const dockedList = (wsLayout.dockedUnder[ws] || []).filter(id => id !== ws && sideIds.has(id));
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
    const openSet = new Set((state.ui?.openSections||[]).filter(id=>sideIds.has(id)));
    if(!openSet.size)openSet.add(ws);
    root.innerHTML = WS_META.filter(m=>sideIds.has(m.id)).map(m => {
      const isOpen = openSet.has(m.id)&&!floatIds.has(m.id);
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

    for (const m of WS_META.filter(m=>sideIds.has(m.id))) {
      if (openSet.has(m.id)&&!floatIds.has(m.id)) {
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
      ${(obj.kind === 'logo' && obj.logoData?.parts?.some(p => p.color)) ? `
      <div class="field-row" style="margin-top:8px">
        <label>Logo Yüzey Rengi</label>
        <div class="chips" style="margin:0">
          <button type="button" class="chip ${(obj.logoColorMode || 'finish') === 'finish' ? 'on' : ''}" data-logo-cmode="finish">Harflerle aynı kaplama</button>
          <button type="button" class="chip ${obj.logoColorMode === 'original' ? 'on' : ''}" data-logo-cmode="original">Orijinal SVG renkleri</button>
        </div>
      </div>` : ''}
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
        ${FILELI_PRESET_WIDTHS.map(w => `<button type="button" class="chip ${fw === w ? 'on' : ''}" data-fw="${w}">${show(w)} ${unit}</button>`).join('')}
      </div>
      <div class="field-row">
        <label>Özel File Genişliği (${unit})</label>
        <input id="wsFileWidthMm" type="number" min="${show(1)}" max="${show(60)}" step="${show(0.5)}" value="${show(fw)}">
      </div>
      <div class="field-row">
        <label>File Kalınlığı (${unit})</label>
        <input id="wsFileThickMm" type="number" min="${show(0.8)}" max="${show(10)}" step="${show(0.2)}" value="${show(state.fileli.fileThicknessMm)}">
      </div>
      <div class="field-row">
        <label>Yanak Sac Kalınlığı (${unit})</label>
        <input id="wsWallThicknessMm" type="number" min="${show(0.2)}" max="${show(3)}" step="${show(0.1)}" value="${show(state.fileli.metalThicknessMm ?? 1)}">
      </div>
      <div class="field-row">
        <label>File Pahı (${unit})</label>
        <input id="wsBorderBevelMm" type="number" min="${show(0)}" max="${show(4)}" step="${show(0.2)}" value="${show(state.fileli.borderBevelMm)}">
      </div>
      <div class="field-row">
        <label>Pleksi İçe Girinti (${unit})</label>
        <input id="wsAcrylicInsetMm" type="number" min="${show(0)}" max="${show(25)}" step="${show(0.5)}" value="${show(state.fileli.acrylicInsetMm)}">
      </div>
      <div class="field-row">
        <label>Pleksi Kalınlığı (${unit})</label>
        <input id="wsAcrylicThickMm" type="number" min="${show(1.5)}" max="${show(15)}" step="${show(0.5)}" value="${show(state.fileli.acrylicThicknessMm)}">
      </div>
    </section>
    ` : ''}

    <section class="sec">
      <h3 class="sec-title">${cType==='fileli'?'5':'4'}. Logo İçe Aktarma &amp; Vektörizasyon</h3>
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
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
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
    <div class="material-ribbon-column">
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

    </div><div class="material-ribbon-column">
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
      ${(facePreset.brushed || MATERIAL_PRESETS[fileId]?.brushed || MATERIAL_PRESETS[sideId]?.brushed) ? (() => {
        const bInt = state.materialOverrides.brushIntensity ?? 1.0;
        const bScale = state.materialOverrides.brushScale ?? 6;
        const bDir = state.materialOverrides.brushDirection ?? 0;
        return `
      <div class="brush-detail-box" style="margin:8px 0;padding:8px;border-radius:7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
        <div style="font-size:11.5px;font-weight:600;margin-bottom:6px;color:var(--accent)">Fırça Detay Ayarları</div>
        <div class="field-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <label for="ovrBrushIntRange" style="margin:0">Fırça Belirginliği <b id="ovrBrushIntVal">${Math.round(bInt * 100)}%</b></label>
            <input id="ovrBrushInt" type="number" min="0" max="2" step="0.05" value="${bInt}" style="width:68px">
          </div>
          <input id="ovrBrushIntRange" type="range" min="0" max="2" step="0.05" value="${bInt}" style="width:100%;accent-color:var(--accent)">
        </div>
        <div class="field-row" style="flex-direction:column;align-items:stretch;gap:4px;margin-top:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <label for="ovrBrushScaleRange" style="margin:0">Fırça Çizgi Sıklığı</label>
            <input id="ovrBrushScale" type="number" min="1" max="24" step="1" value="${bScale}" style="width:68px">
          </div>
          <input id="ovrBrushScaleRange" type="range" min="1" max="24" step="1" value="${bScale}" style="width:100%;accent-color:var(--accent)">
        </div>
        <div class="field-row" style="margin-top:6px">
          <label>Fırçalama Yönü (°)</label>
          <input id="ovrBrushDir" type="number" min="0" max="180" step="15" value="${bDir}" style="width:68px">
        </div>
        <div class="chips" style="margin-top:4px;gap:4px">
          <button type="button" class="chip ${bDir === 0 ? 'on' : ''}" data-brush-dir="0">0° Yatay</button>
          <button type="button" class="chip ${bDir === 45 ? 'on' : ''}" data-brush-dir="45">45° Çapraz</button>
          <button type="button" class="chip ${bDir === 90 ? 'on' : ''}" data-brush-dir="90">90° Dikey</button>
        </div>
      </div>`;
      })() : ''}
      <div class="field-row"><label>Patlatılmış Katman Görünümü (3D Kesit)</label><input id="chkExploded" type="checkbox" ${state.render.explodedView ? 'checked' : ''}></div>
      <div class="field-row"><label>Pah Genişliği (${unit})</label><input id="ovrBevel" type="number" min="${show(0)}" max="${show(6)}" step="${show(0.2)}" value="${show(state.materialOverrides.bevelMm)}"></div>
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
    </div>
  `;
}

function renderLightingWs(state) {
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const selection=selectedLightingObjects(state),obj=selection[0],light=resolveObjectLighting(obj,state);
  const mode=light.mode,enabled=light.enabled;
  const hasFront=mode==='front'||mode==='both',hasHalo=mode==='halo'||mode==='both';
  const colorControls=(key,label)=>`<div class="field-row"><label>${label}</label><input type="color" data-light-color="${key}" value="${light[key]}" aria-label="${label}"></div><div class="swatches">${LIGHT_COLOR_PRESETS.map(c=>`<button type="button" class="sw ${String(light[key]||'').toLowerCase()===c.hex.toLowerCase()?'on':''}" style="--c:${c.hex}" data-light-key="${key}" data-lhex="${c.hex}" title="${c.label}"></button>`).join('')}</div>`;

  return `
    <div class="lighting-column">
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

    <p class="lighting-selection-note">${selection.length?selection.length+' seçili nesne · bağımsız ışık ayarı':'Nesne seçilmedi · proje varsayılanları'}${!enabled?' · Genel ışık kapalı':''}</p>
    ${hasFront ? `
    <section class="sec">
      <h3 class="sec-title">Ön Yüzey Işık Ayarları</h3>
      ${colorControls('frontColor','Ön ışık rengi')}
      <div class="field-row">
        <label>Ön Yüz Işık Şiddeti</label>
        <input id="lFrontIntRange" type="range" min="0" max="3" step="0.1" value="${light.frontIntensity}">
        <input id="lFrontInt" type="number" min="0" max="3" step="0.1" value="${light.frontIntensity}" style="width:62px">
      </div>
    </section>
    ` : ''}

    </div>
    ${hasHalo ? `
    <div class="lighting-column">
    <section class="sec">
      <h3 class="sec-title">Arka (Halo) Duvar Işığı Ayarları</h3>
      ${colorControls('backColor','Arka ışık rengi')}
      <div class="field-row">
        <label>Arka Halo Şiddeti</label>
        <input id="lBackIntRange" type="range" min="0" max="3" step="0.1" value="${light.backIntensity}">
        <input id="lBackInt" type="number" min="0" max="3" step="0.1" value="${light.backIntensity}" style="width:62px">
      </div>
      <div class="field-row">
        <label>Duvardan Uzaklık (${unit})</label>
        <input id="lWallDistRange" type="range" min="${show(5)}" max="${show(150)}" step="${show(5)}" value="${show(light.wallDistanceMm)}">
        <input id="lWallDist" type="number" min="${show(5)}" max="${show(150)}" step="${show(5)}" value="${show(light.wallDistanceMm)}" style="width:62px">
      </div>
      <div class="field-row">
        <label>Halo Yayılımı</label>
        <input id="lHaloSpread" type="number" min="0.3" max="2.5" step="0.1" value="${light.haloSpread}">
      </div>
      <div class="field-row">
        <label>Işık Sönümlemesi (Falloff)</label>
        <input id="lFalloff" type="number" min="0.3" max="2.5" step="0.1" value="${light.falloff}">
      </div>
    </section>
    </div>
    ` : ''}
  `;
}

function renderLayersWs(state) {
  const pm = state.photomontage;
  return `
    <section class="sec">
      <h3 class="sec-title">Katman Yöneticisi <small>${state.objects.length + (pm?.photoUrl ? 1 : 0)} öğe</small></h3>
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
        ${pm?.photoUrl ? `
          <div class="layer-item ${pm.visible !== false ? 'on' : ''}" id="pmLayerRow" data-pm-layer="true" style="margin-top:8px;border-color:rgba(255,181,71,.3)">
            <button type="button" class="icon-btn" id="btnLayerPmVis" title="Arka Plan Görünürlüğü">${pm.visible !== false ? '👁' : '🚫'}</button>
            <button type="button" class="icon-btn" id="btnLayerPmPersp" title="${pm.confirmed ? 'Perspektifi Düzenle' : 'Perspektifi Onayla (Enter)'}">${pm.confirmed ? '⤢' : '✓'}</button>
            <span class="layer-name" title="${escapeAttr(pm.photoName || 'Cephe Arka Plan Fotoğrafı')}">🖼 Arka Plan: ${escapeHtml(pm.photoName || 'Cephe Fotoğrafı')}</span>
            <button type="button" class="icon-btn" id="btnLayerPmDel" title="Arka Plan Fotoğrafını Kaldır" style="color:var(--danger)">🗑</button>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderBackgroundWs(state) {
  const pm = state.photomontage;
  const wallScale = Math.max(0.08, Math.min(2.5, Number(state.scene.wallScale ?? 1.0) || 1.0));
  return `
    <section class="sec">
      <h3 class="sec-title">Hazır Mimari Sahneler</h3>
      <p class="dock-helper">Bir duvar veya cephe seçerek 3D arka planı güncelleyin.</p>
      <div class="bg-scale-control" style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;font-size:12px">
          <label for="bgWallScaleRange" style="margin:0">Arka Plan Desen Boyutu: <b id="bgWallScaleVal" style="color:var(--accent)">${Math.round(wallScale * 100)}%</b></label>
          <button type="button" id="bgWallScaleReset" class="sec-btn" style="padding:2px 8px;font-size:11px">Sıfırla</button>
        </div>
        <input id="bgWallScaleRange" type="range" min="0.08" max="2.5" step="0.02" value="${wallScale}" style="width:100%;accent-color:var(--accent)">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:2px">
          <span>Çok Küçük (%8)</span>
          <span>Normal (%100)</span>
          <span>Büyük (%250)</span>
        </div>
      </div>
      <div class="background-preset-grid">
        ${BACKGROUND_SCENES.map(b => `
          <button type="button" class="background-preset ${state.scene.wallId === b.id ? 'on' : ''}" data-bg-wall="${b.id}" title="${b.label}">
            <span class="background-preview background-preview-${b.id}" style="background-image:url(./public/wall-previews/${b.id}.png)"></span>
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
        <p style="font-size:12px;color:var(--ok);margin:0 0 8px">Yüklü: ${escapeHtml(pm.photoName)} · ${pm.confirmed ? '<b>Perspektif Onaylı</b>' : '4 sarı köşeyi sürükleyip Enter ile onaylayın.'}</p>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <button type="button" id="btnTogglePmConfirm" class="${pm.confirmed ? 'sec-btn' : 'cta-btn'}">${pm.confirmed ? '⤢ Perspektifi Düzenle' : '✓ Perspektifi Onayla (Enter)'}</button>
        </div>
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
  const unit=normalizeDisplayUnit(state.pageLayout?.displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const n = state.nesting;
  return `
    <section class="sec">
      <h3 class="sec-title">Gerçek Şekil Plaka Nesting Motoru</h3>
      <div class="field-row">
        <label>Plaka Önayarı</label>
        <select id="nestPreset">
          ${SHEET_PRESETS.map(p => `<option value="${p.id}" ${n.sheetWidthMm === p.w && n.sheetHeightMm === p.h ? 'selected' : ''}>${formatPresetLabel(p,unit)}</option>`).join('')}
          <option value="custom">Özel Ölçü</option>
        </select>
      </div>
      <div class="field-row"><label>Plaka Genişliği (${unit})</label><input id="nestW" type="number" min="${show(200)}" max="${show(6000)}" step="${show(50)}" value="${show(n.sheetWidthMm)}"></div>
      <div class="field-row"><label>Plaka Yüksekliği (${unit})</label><input id="nestH" type="number" min="${show(200)}" max="${show(4000)}" step="${show(50)}" value="${show(n.sheetHeightMm)}"></div>
      <div class="field-row"><label>Kenar Payı (${unit})</label><input id="nestMargin" type="number" min="${show(0)}" max="${show(100)}" step="${show(1)}" value="${show(n.marginMm)}"></div>
      <div class="field-row"><label>Kesim Boşluğu (${unit})</label><input id="nestClear" type="number" min="${show(1)}" max="${show(50)}" step="${show(0.5)}" value="${show(n.clearanceMm)}"></div>
      <div class="field-row"><label>Kerf / Lazer Payı (${unit})</label><input id="nestKerf" type="number" min="${show(0)}" max="${show(5)}" step="${show(0.1)}" value="${show(n.kerfMm)}"></div>
      <div class="field-row"><label>Kopya Adedi</label><input id="nestCopies" type="number" min="1" max="50" step="1" value="${n.copies}"></div>
      <div class="field-row"><label>Delik İçi Yerleştirme (O/D)</label><input id="nestHole" type="checkbox" ${n.allowHoleNesting !== false ? 'checked' : ''}></div>
      <div class="field-row"><label>Malzemeye Göre Ayır</label><input id="nestGroupMat" type="checkbox" ${n.groupByMaterial !== false ? 'checked' : ''}></div>
      <div class="field-row">
        <label>Doku / Fırça Yönü</label>
        <select id="nestGrain">
          <option value="none" ${n.grainDirection === 'none' ? 'selected' : ''}>Serbest (Otomatik)</option>
          <option value="horizontal" ${n.grainDirection === 'horizontal' ? 'selected' : ''}>Yatay Doku (0° Sabit)</option>
          <option value="vertical" ${n.grainDirection === 'vertical' ? 'selected' : ''}>Dikey Doku (0° Sabit)</option>
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
        Fire: <strong>${formatAreaM2(lastNesting.totalScrapM2,unit)}</strong> ·
        İç İçe Geçme: <strong>${lastNesting.interlockedPairs} çift</strong>
      </p>
      ${lastNesting.unplaced.length ? `<div style="background:rgba(239,68,68,0.14);border:1px solid #ef4444;padding:6px 8px;border-radius:6px;font-size:11.5px;margin-bottom:8px">Yerleştirilemeyen (${lastNesting.unplaced.length}): ${lastNesting.unplaced.map(u => escapeHtml(u.item.label + " — " + u.reason)).join(", ")}</div>` : ''}
      ${lastNesting.sheets.map(sh => `
        <div style="margin-bottom:10px">
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">
            Plaka #${sh.index} [${escapeHtml(sh.materialGroup)}] (${formatDimensions(sh.widthMm,sh.heightMm,unit)}) — %${sh.utilizationPct.toFixed(1)} dolu · ${sh.placements.length} parça
          </div>
          ${renderNestingSvg(sh, selectedNestingId,{},unit)}
        </div>
      `).join('')}
      ${selectedNestingId ? `
        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="sec-btn" data-nest-nudge="-20,0">← ${show(20)} ${unit}</button>
          <button type="button" class="sec-btn" data-nest-nudge="20,0">${show(20)} ${unit} →</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,20">↑ ${show(20)} ${unit}</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,-20">↓ ${show(20)} ${unit}</button>
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
      mutate('Yapı tipi değiştirildi', s => applyConstructionType(s, b.dataset.ctype));
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

    root.querySelectorAll('[data-logo-cmode]').forEach(b => b.onclick = () => {
      mutate('Logo renk modu', s => {
        const o = getSelectedOrFirst(s);
        if (o && o.kind === 'logo' && !o.locked) o.logoColorMode = b.dataset.logoCmode;
      });
    });

    const bindNum = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => {
      const units=['wsHeightMm','wsWidthMm','wsDepthMm','wsSpacingMm','wsFileWidthMm','wsFileThickMm','wsWallThicknessMm','wsBorderBevelMm','wsAcrylicInsetMm','wsAcrylicThickMm'];
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

    const bindOvr = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('Materyal ayarı', s => fn(s, id==='ovrBevel'?displayToMm(e.target.value,store.get().pageLayout?.displayUnit):Number(e.target.value)), false));
    const bindRenderOvr = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutateRender('Görünüm ayarı', s => fn(s, Number(e.target.value)), false));
    bindOvr('ovrMetalness', (s, v) => { s.materialOverrides.metalness = v; });
    bindOvr('ovrRoughness', (s, v) => { s.materialOverrides.roughness = v; });
    bindOvr('ovrRefl', (s, v) => { s.render.reflectionIntensity = v; });
    bindRenderOvr('ovrExposure', (s, v) => { s.render.exposure = v; });
    bindOvr('ovrBrushDir', (s, v) => { s.materialOverrides.brushDirection = v; });
    bindOvr('ovrBrushScale', (s, v) => {
      const clamped = Math.max(1, Math.min(24, Number(v) || 6));
      s.materialOverrides.brushScale = clamped;
      const r = root.querySelector('#ovrBrushScaleRange'); if (r) r.value = String(clamped);
    });
    bindOvr('ovrBrushInt', (s, v) => {
      const clamped = Math.max(0, Math.min(2, Number.isFinite(v) ? v : 1));
      s.materialOverrides.brushIntensity = clamped;
      const r = root.querySelector('#ovrBrushIntRange'); if (r) r.value = String(clamped);
      const lbl = root.querySelector('#ovrBrushIntVal'); if (lbl) lbl.textContent = `${Math.round(clamped * 100)}%`;
    });
    root.querySelector('#ovrBrushIntRange')?.addEventListener('input', e => {
      const val = Math.max(0, Math.min(2, Number(e.target.value) || 0));
      const numEl = root.querySelector('#ovrBrushInt'); if (numEl) numEl.value = String(val);
      const lbl = root.querySelector('#ovrBrushIntVal'); if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
      store.update(s => { s.materialOverrides.brushIntensity = val; });
      scheduleRebuild(true);
    });
    root.querySelector('#ovrBrushIntRange')?.addEventListener('change', e => {
      const val = Math.max(0, Math.min(2, Number(e.target.value) || 0));
      mutate('Fırça belirginliği', s => { s.materialOverrides.brushIntensity = val; }, false);
    });
    root.querySelector('#ovrBrushScaleRange')?.addEventListener('input', e => {
      const val = Math.max(1, Math.min(24, Number(e.target.value) || 6));
      const numEl = root.querySelector('#ovrBrushScale'); if (numEl) numEl.value = String(val);
      store.update(s => { s.materialOverrides.brushScale = val; });
      scheduleRebuild(true);
    });
    root.querySelector('#ovrBrushScaleRange')?.addEventListener('change', e => {
      const val = Math.max(1, Math.min(24, Number(e.target.value) || 6));
      mutate('Fırça çizgi sıklığı', s => { s.materialOverrides.brushScale = val; }, false);
    });
    root.querySelectorAll('[data-brush-dir]').forEach(b => b.onclick = () => {
      const deg = Number(b.dataset.brushDir) || 0;
      mutate('Fırçalama yönü', s => { s.materialOverrides.brushDirection = deg; }, true);
    });
    root.querySelector('#chkExploded')?.addEventListener('change', e => mutate('Patlatılmış görünüm', s => { s.render.explodedView = e.target.checked; }, false));
    bindOvr('ovrBevel', (s, v) => { s.materialOverrides.bevelMm = v; });
    bindOvr('ovrAcOpacity', (s, v) => { s.materialOverrides.acrylicOpacity = v; });
    bindRenderOvr('ovrEnvRot', (s, v) => { s.render.envRotationDeg = v; });
    bindRenderOvr('ovrEnvPitch', (s, v) => { s.render.envPitchDeg = v; });
    root.querySelector('#ovrCardScale')?.addEventListener('change', e => {
      const val = Math.max(0.3, Math.min(2.5, Number(e.target.value) || 1.0));
      store.update(st => { st.render.customCardScale = val; });
      if (store.get().render.useCustomEnv && is3DWorkspace(store.get())) {
        const eng = ensureSignEngine();
        eng?.envManager?.rebuildCustomCardEnvironment({ areaScale: val });
        eng?.updateRenderSettings(store.get());
      } else {
        scheduleRebuild(true);
      }
    });

    root.querySelectorAll('[data-env]').forEach(b => b.onclick = () => {
      mutateRender('Yansıma ortamı', s => {
        s.render.envPreset = b.dataset.env;
        s.render.useCustomEnv = false;
      }, true);
    });
    root.querySelector('#customEnvUpload')?.addEventListener('change', async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      if(!is3DWorkspace(store.get()))setMainWorkspace('materials');
      await ensureSignEngine()?.envManager?.loadCustomEnvironment(f);
      mutate('Özel yansıma ortamı', s => { s.render.useCustomEnv = true; });
    });
  } else if (ws === 'lighting') {
    root.querySelectorAll('[data-lmode]').forEach(b=>b.onclick=()=>editLighting('mode',b.dataset.lmode));
    root.querySelector('#chkLightEnabled')?.addEventListener('change',e=>mutate('Işık durumu',s=>{s.lighting.enabled=e.target.checked;}));
    root.querySelectorAll('[data-lhex]').forEach(b=>b.onclick=()=>editLighting(b.dataset.lightKey,b.dataset.lhex));
    root.querySelectorAll('[data-light-color]').forEach(el => {
      el.addEventListener('input', e => previewLightingColor(el.dataset.lightColor, e.target.value));
      el.addEventListener('change', e => editLighting(el.dataset.lightColor, e.target.value));
    });
    const bindL=(id,key,mirrorId=null)=>{
      const el=root.querySelector('#'+id);if(!el)return;
      el.addEventListener('input',e=>{const mirror=mirrorId&&root.querySelector('#'+mirrorId);if(mirror)mirror.value=e.target.value;});
      el.addEventListener('change',e=>editLighting(key,key==='wallDistanceMm'?displayToMm(e.target.value,store.get().pageLayout?.displayUnit):Number(e.target.value)));
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
    const bindM = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('İmalat ayarı', s => fn(s, displayToMm(e.target.value,store.get().pageLayout?.displayUnit))));
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
    root.querySelector('#btnLayerPmVis')?.addEventListener('click', () => {
      store.update(s => { s.photomontage.visible = s.photomontage.visible === false; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
    });
    root.querySelector('#btnLayerPmPersp')?.addEventListener('click', () => {
      store.update(s => { s.photomontage.confirmed = !s.photomontage.confirmed; s.photomontage.visible = true; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
    });
    root.querySelector('#btnLayerPmDel')?.addEventListener('click', () => mutate('Arka plan fotoğrafı kaldır', s => {
      s.photomontage.photoUrl = null;
      s.photomontage.confirmed = false;
      s.photomontage.visible = true;
    }));
  } else if (ws === 'background') {
    root.querySelector('#bgWallScaleRange')?.addEventListener('input', e => applyWallScaleChange(e.target.value, false));
    root.querySelector('#bgWallScaleRange')?.addEventListener('change', e => applyWallScaleChange(e.target.value, true));
    root.querySelector('#bgWallScaleReset')?.addEventListener('click', () => applyWallScaleChange(1.0, true));
    root.querySelectorAll('[data-bg-wall]').forEach(b => b.onclick = () => {
      selectWall(b.dataset.bgWall);
    });
    root.querySelector('#pmPhotoUpload')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) handlePhotomontagePhotoFile(f);
      e.target.value = '';
    });
    root.querySelector('#btnTogglePmConfirm')?.addEventListener('click', () => {
      const next = !store.get().photomontage?.confirmed;
      store.update(s => { s.photomontage.confirmed = next; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
      if (next) studioToast('✓ Perspektif onaylandı.');
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
      store.update(s => { s.nesting[key] = key==='copies'?Number(e.target.value):displayToMm(e.target.value,s.pageLayout?.displayUnit); });
    });
    root.querySelector('#nestW')?.addEventListener('change', e => applyNestingSheetSize(displayToMm(e.target.value,store.get().pageLayout?.displayUnit), store.get().nesting.sheetHeightMm));
    root.querySelector('#nestH')?.addEventListener('change', e => applyNestingSheetSize(store.get().nesting.sheetWidthMm, displayToMm(e.target.value,store.get().pageLayout?.displayUnit)));
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
        `Ölçü: ${formatDimensions(lastMetrics.totalWidthMm,lastMetrics.totalHeightMm,s.pageLayout?.displayUnit)}`,
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
    studioToast('Logoda biçim algılanamadı. Toleransı ayarlayın.',true);
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
  studioToast('Logo içe aktarıldı.');
  if (statusEl) statusEl.textContent = `${parsed.parts.length} bağımsız logo parçası 3D olarak eklendi.`;
}


/* ---------------- On-Canvas Floating CAD Transform HUD ---------------- */
function positionCanvasTransformHud(state){
 const hud=document.getElementById('canvasTransformHud');if(!hud||hud.classList.contains('hidden'))return;
 hud.style.left='12px';hud.style.top='auto';hud.style.bottom='72px';hud.style.transform='none';
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
        <label class="hud-field"><span>Genişlik (${unit})</span><input id="hudScaleW" type="number" min="0" step="any" value="${curW}"></label>
        <label class="hud-field"><span>Yükseklik (${unit})</span><input id="hudScaleH" type="number" min="0" step="any" value="${curH}"></label>
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
        <label class="hud-field"><span>Genişlik (${unit})</span><input id="hudScaleW" type="number" min="0" step="any" value="${curW}"></label>
        <label class="hud-field"><span>Yükseklik (${unit})</span><input id="hudScaleH" type="number" min="0" step="any" value="${curH}"></label>
        <label class="hud-field"><span>Çıta (${unit})</span><input id="hudDepthMm" type="number" min="0" step="any" value="${show(sel.depthMm || 80)}"></label>
      </div>
      <div class="hud-row">
        <label class="hud-field"><span>X Konumu (${unit})</span><input id="hudMoveX" type="number" step="any" value="${show(sel.xMm || 0)}"></label>
        <label class="hud-field"><span>Y Konumu (${unit})</span><input id="hudMoveY" type="number" step="any" value="${show(sel.yMm || 0)}"></label>
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

let wallProgressTimer;
function renderWallLoading({id,phase,percent=0,message=''}){
  clearTimeout(wallProgressTimer);
  const root=document.getElementById('wallLoading');
  if(!root)return;
  if(phase==='idle'||phase==='done'||(phase!=='error'&&percent>=100)){root.classList.add('hidden');return;}
  root.classList.remove('hidden');root.classList.toggle('wall-load-error',phase==='error');
  const label=BACKGROUND_SCENES.find(b=>b.id===id)?.label||'Arka plan';
  document.getElementById('wallLoadingLabel').textContent=phase==='error'?label+' · '+message:label+(phase==='done'?' · Hazır':' · Hazırlanıyor');
  document.getElementById('wallLoadingPercent').textContent=phase==='error'?'':Math.round(percent)+'%';
  document.getElementById('wallLoadingProgress').value=percent;
  document.getElementById('wallLoadingRetry').classList.toggle('hidden',phase!=='error');

}
function syncWallScaleControls(val = 1.0) {
  const sc = Math.max(0.08, Math.min(2.5, Number(val) || 1.0));
  const pct = `${Math.round(sc * 100)}%`;
  const stageRng = document.getElementById('stageWallScaleRange');
  if (stageRng) stageRng.value = String(sc);
  const stageLbl = document.getElementById('stageWallScaleVal');
  if (stageLbl) stageLbl.textContent = pct;
  const bgRng = document.getElementById('bgWallScaleRange');
  if (bgRng) bgRng.value = String(sc);
  const bgLbl = document.getElementById('bgWallScaleVal');
  if (bgLbl) bgLbl.textContent = pct;
  return sc;
}
function applyWallScaleChange(rawVal, commitUndo = false) {
  const sc = syncWallScaleControls(rawVal);
  if (commitUndo) mutate('Arka plan desen boyutu', s => { s.scene.wallScale = sc; }, false, false);
  else store.update(s => { s.scene.wallScale = sc; });
  if (is3DWorkspace(store.get()) && signEngine && !signEngine.isDisposed) signEngine.updateWallScale(sc);
}
function selectWall(id){
  if(!BACKGROUND_SCENES.some(b=>b.id===id))return;
  if(store.get().scene.wallId!==id)mutate('Arka plan seçimi',s=>{s.scene.wallId=id;},true,false);
  const state=store.get();
  if(is3DWorkspace(state)&&signEngine&&!signEngine.isDisposed)signEngine.requestWall(id,signEngine.lastSizeM,!!state.scene.transparentBg,state.scene.wallScale??1.0);
}
function setMainWorkspace(ws) {
  const previous=store.get().mainWorkspace;
  if(previous!==ws){nestingGesture?.cancel?.();nestingGesture=null;signEngine?.cancelActiveDrag?.();cancelShapePlacement?.();ribbonSuppressed=store.get().activeWorkspace;store.updateScoped([],s=>{s.activeWorkspace=sideWorkspace;});window.dispatchEvent(new Event('studio-close-menus'));}
  document.getElementById('studioBody')?.classList.toggle('nesting-isolated',ws==='nesting');
  document.getElementById('studioBody')?.classList.toggle('tracer-isolated',ws==='tracer');
  store.updateScoped([],s => { s.mainWorkspace = ws; });
  document.querySelectorAll('#mainWorkspaceTabs button').forEach(b => b.classList.toggle('on', b.dataset.mainWs === ws));

  const is3D = ws === 'model3d' || ws === 'materials';
  document.getElementById('threeContainer')?.classList.toggle('hidden', !is3D);
  document.getElementById('stageViewsBar')?.classList.toggle('hidden', !is3D);
  document.getElementById('stageBottomTools')?.classList.toggle('hidden', !is3D);
  document.getElementById('vector2DWrap')?.classList.toggle('hidden', ws !== 'design2d');
  const tracerWrap = document.getElementById('tracerCenterWrap');
  tracerWrap?.classList.toggle('hidden', ws !== 'tracer');
  if (ws === 'tracer' && tracerWrap) {
    if (!tracerWrap.querySelector('#traceStudioFrame')) {
      traceStudioReady = false;
      tracerWrap.innerHTML = '<iframe id="traceStudioFrame" class="tracer-iframe" src="./public/trace-studio/index.html?v=20261125-v8" title="Image Tracer Stüdyosu"></iframe>';
      tracerWrap.querySelector('#traceStudioFrame')?.addEventListener('load', () => {
        setTimeout(() => {
          if (pendingTracerImage) {
            traceStudioReady = true;
            flushPendingTracerImage();
          }
        }, 120);
      });
    } else {
      flushPendingTracerImage();
    }
  }
  document.getElementById('nestingCenterWrap')?.classList.toggle('hidden', ws !== 'nesting');
  document.getElementById('cncCenterWrap')?.classList.toggle('hidden', ws !== 'cnc');
  document.getElementById('costCenterWrap')?.classList.toggle('hidden', ws !== 'cost');
  if(is3D){const engine=ensureSignEngine();engine?.setActive?.(true);if(previous!==ws)scheduleRebuild(true);}
  else signEngine?.setActive?.(false);
  syncWorkspaceRail(ws);

  if (ws === 'materials') {
    ribbonSuppressed=null;
    store.updateScoped([],s => { s.activeWorkspace = 'materials'; });
    renderActiveWorkspace();
  }
  if (ws === 'design2d' && vector2D) {
    vector2D.render(store.get(), fontMap);
    if(previous!==ws)requestAnimationFrame(()=>{if(store.get().mainWorkspace==='design2d')vector2D.fitAll(store.get());});
  }
  updateCenterWorkspaces(store.get());
  updateNumericBar(store.get());
  renderRibbon(store.get());
}

// Keep the Nesting sheet-size editor mounted. Replacing the entire workspace DOM
// on every mutation closes native <select> menus and discards input focus.
function syncNestingSettingsControls(sidebar, nesting, displayUnit) {
  const unit=normalizeDisplayUnit(displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  if (!sidebar) return;
  const values = {
    cwsNestPreset: SHEET_PRESETS.find(p => p.w === nesting.sheetWidthMm && p.h === nesting.sheetHeightMm)?.id || 'custom',
    cwsNestW: show(nesting.sheetWidthMm),
    cwsNestH: show(nesting.sheetHeightMm),
    cwsNestSp: show(nesting.clearanceMm),
    cwsNestMg: show(nesting.marginLeftMm),
    cwsNestRot: nesting.rotationStepDeg ?? 'auto',
    cwsNestStrategy: nesting.placementStrategy || 'auto',
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
  const rotSel = sidebar.querySelector('#cwsNestRot');
  if (rotSel) {
    rotSel.disabled = Boolean(nesting.enforceGrainDirection);
    rotSel.title = nesting.enforceGrainDirection ? 'Fırça yönü kısıtı açıkken parçalar 0° sabit kalır' : '';
  }
  const advBadge = sidebar.querySelector('#cwsNestAdvancedBadge');
  if (advBadge) {
    advBadge.textContent = nesting.enforceGrainDirection
      ? '0° Sabit · Otomatik'
      : (nesting.rotationStepDeg === 'auto' || nesting.rotationStepDeg == null ? 'Otomatik · En İyi Geçirme' : `${nesting.rotationStepDeg}° Adım`);
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
      syncNestingSelectionScope(state);
      const html=renderNestingCenter(state,{activeSheetIdx,selectedPlacementId:selectedNestingId,selectedPlacementIds:[...selectedNestingIds],advancedOpen:nestingAdvancedOpen});
      if(el._lastHtml===html)return;
      el._lastHtml=html;
      if (grid && currentTabId === targetTabId && el.querySelector('.nesting-workspace')?.dataset.displayUnit===normalizeDisplayUnit(state.pageLayout?.displayUnit) && grid.querySelector('.cws-side-r')) {
        // Replace only changing parts; preserve the exact right-panel DOM node.
        const template = document.createElement('template');
        template.innerHTML = html;
        for (const cls of ['cws-side', 'cws-main', 'cws-bottom']) {
          const current = grid.querySelector(':scope > .' + cls);
          const next = template.content.querySelector('.' + cls);
          if (current && next) {const scroll=current.scrollTop;current.replaceWith(next);next.scrollTop=scroll;}
        }
        const tabs = el.querySelector('.nesting-source-tabs');
        const nextTabs = template.content.querySelector('.nesting-source-tabs');
        if (tabs && nextTabs) tabs.replaceWith(nextTabs);
        syncNestingSettingsControls(grid.querySelector('.cws-side-r'), state.nesting,state.pageLayout?.displayUnit);
        const oldCnc=grid.querySelector('#nestCncPanel'),newCnc=template.content.querySelector('#nestCncPanel');
        for(const id of ['cwsExpCorel','cwsExpSvg','cwsExpDxf','cwsExpCsv']){const old=grid.querySelector('#'+id),fresh=template.content.querySelector('#'+id);if(old&&fresh)old.disabled=fresh.disabled;}
        if(oldCnc&&newCnc){
          for(const fresh of newCnc.querySelectorAll('input,select')){const el=oldCnc.querySelector('#'+fresh.id);if(!el||el===document.activeElement)continue;if(el.type==='checkbox')el.checked=fresh.checked;else el.value=fresh.value;}
          const oldStatus=oldCnc.querySelector('#nestCncStatus'),newStatus=newCnc.querySelector('#nestCncStatus');if(oldStatus&&newStatus)oldStatus.replaceWith(newStatus);
          const oldBtn=oldCnc.querySelector('#nestCncExport'),newBtn=newCnc.querySelector('#nestCncExport');if(oldBtn&&newBtn){oldBtn.disabled=newBtn.disabled;oldBtn.textContent=newBtn.textContent;}
          const oldSend=oldCnc.querySelector('#nestCncSendMachine'),newSend=newCnc.querySelector('#nestCncSendMachine');if(oldSend&&newSend){oldSend.disabled=newSend.disabled;}
        }
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
    let result={sheets:[],unplaced:[],sheetCount:0,overallUtilizationPct:0,totalScrapM2:0,interlockedPairs:0,totalCutLengthM:0,minSep:nestingSeparation(next)};
    if(items.length){const out=await runVectorImportJob({jobId:Date.now(),operation:'nest',imported:{items},nesting:{...Object.fromEntries(Object.entries(next).filter(([key])=>!['sheets','unplaced','importedTabs','designTabSnapshot'].includes(key))),quickImport},lockedSheets:next.sheets?.filter(sh=>sh.placements.some(p=>p.locked))||[]},{signal:controller.signal,onStatus:status=>{const b=document.getElementById('cwsRunNesting');if(b&&nestingRepackController===controller)b.textContent=status+' · İptal';}});result=out.nesting;}
    if(controller.signal.aborted||docManager.activeDocId!==docId||store.get().activePageId!==pageId||(store.get().nesting.activeTabId||'design')!==tab)return;
    lastNesting=result;activeSheetIdx=0;clearNestingSelection();
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
  clearNestingSelection();
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
  const tolerance = displayToMm(root.querySelector('#nestImportTolerance')?.value || formatMmAsUnit(1,store.get().pageLayout?.displayUnit),store.get().pageLayout?.displayUnit);
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
        const kind=detectVectorFormat(new Uint8Array(await file.slice(0,65536).arrayBuffer()),file.name);
        if(kind==='pdf'){
          const output=await importPdfFile(file,options,text=>say(file.name+': '+text),controller.signal);
          if(controller.signal.aborted)break;
          job={jobId:j,operation:'importPdfPages',pages:output.pages,ops:output.ops,warnings:output.warnings,
               filename:file.name,options,nesting};
        }else{
          if(kind==='svgz'){
            if(typeof DecompressionStream!=='function')throw Error('Bu tarayıcı SVGZ gzip desteğine sahip değil.');
            const text=await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
            filename=filename.replace(/\.[^.]+$/i,'.svg');
            job={jobId:j,operation:'importText',text,filename,options,nesting};
          }else{
            const bytes=await file.arrayBuffer();
            if(controller.signal.aborted)break;
            job={jobId:j,operation:'importBinary',bytes,filename,options,nesting};
          }
        }
        let output=await runVectorImportJob(job,{
          signal:controller.signal,onStatus:msg=>say(file.name+': '+msg)});
        if(output.convertedPdf){
          const pdfFile=new File([output.convertedPdf],file.name,{type:'application/pdf'});
          const parsed=await importPdfFile(pdfFile,options,msg=>say(file.name+': '+msg),controller.signal);
          output=await runVectorImportJob({jobId:j,operation:'importPdfPages',pages:parsed.pages,ops:parsed.ops,warnings:['AI/EPS: PostScript yerel PDF vektörlerine dönüştürüldü.',...parsed.warnings],filename:file.name,options,nesting},{signal:controller.signal,onStatus:msg=>say(file.name+': '+msg)});
        }
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
          state.nesting.optimizationInfo=job.nesting.optimization||null;
          syncActiveNestingTab(state.nesting);
        }
      },false);
      activeSheetIdx=0;clearNestingSelection();
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
  if(action==='rot'&&n.enforceGrainDirection&&Math.abs(value)>1e-6)return false;
  return editNestingPlacement(p,action,value);
}
function editSelectedNesting(action,value){
  if(action==='delete'){removeNestingSelection();return;}
  const current=getNestingSelection();if(!current||current.locked&&action!=='toggleLock')return;
  nestingRepackController?.abort();
  const id=current.id;
  mutateData('Nesting parça '+action,s=>{
    const n=s.nesting,sh=n.sheets[activeSheetIdx],p=sh?.placements.find(x=>x.id===id);
    if(!p)return;
    if(action==='toggleLock')p.locked=!p.locked;
    else if(action==='move'){applyNestingEdit(n,p,'x',value.x);applyNestingEdit(n,p,'y',value.y);}
    else applyNestingEdit(n,p,action,value);
    refreshNestingSheet(sh,nestingSeparation(n));
  },false);
}
function syncWorkspaceRail(ws){
  updateAlignmentRail(store.get());
  const isNest=ws==='nesting',supported=new Set(['select','move','scale','rotate','logo']);
  for(const b of document.querySelectorAll('.cad-rail [data-tool]')){
    b.disabled=isNest&&!supported.has(b.dataset.tool);
    b.classList.toggle('active',b.dataset.tool===(isNest?nestingTool:store.get().activeTool));
  }
  for(const b of document.querySelectorAll('.cad-rail [data-action]'))b.disabled=isNest&&b.dataset.action!=='delete';
}
function removeNestingSelection(singleId=null){
 const state=store.get();syncNestingSelectionScope(state);
 const ids=singleId==null?[...selectedNestingIds]:[singleId];
 const wanted=new Set(ids);
 const removable=(state.nesting.sheets?.[activeSheetIdx]?.placements||[]).filter(p=>wanted.has(p.id)&&!p.locked).map(p=>p.id);
 if(!removable.length)return;
 nestingRepackController?.abort();
 for(const id of removable)selectedNestingIds.delete(id);
 if(!selectedNestingIds.has(selectedNestingId))selectedNestingId=[...selectedNestingIds].at(-1)??null;
 if(removable.includes(nestingSelectionAnchor))nestingSelectionAnchor=null;
 mutateData(removable.length+' nesting parçası silindi',s=>deleteNestingParts(s.nesting,activeSheetIdx,removable,nestingSeparation(s.nesting)),false);
}
function selectNestingPart(id,{toggle=false,range=false,addRange=false,preserve=false}={}){
 const state=store.get();syncNestingSelectionScope(state);
 const ordered=(state.nesting.sheets?.[activeSheetIdx]?.placements||[]).map(p=>p.id);
 const previous=selectedNestingIds;
 const next=nextNestingSelection(ordered,previous,nestingSelectionAnchor,id,{toggle,range,addRange,preserve});
 selectedNestingIds=new Set(next.ids);selectedNestingId=next.primary;nestingSelectionAnchor=next.anchor;
 const root=document.getElementById('nestingCenterWrap');
 const paint=(pid,on)=>{
  if(!root)return;
  const g=root.querySelector('[data-pid="'+CSS.escape(pid)+'"]');
  if(g){g.classList.toggle('nest-picked',on);const path=g.querySelector('[data-nest-body]');if(path&&!g.classList.contains('nest-collision')){path.setAttribute('stroke',on?'#ffffff':(state.nesting.previewColors?.body||'#c89343'));path.setAttribute('stroke-width',on?'4':'2');path.setAttribute('fill-opacity',on?'0.83':'0.55');}if(!on)g.querySelector('text')?.remove();}
  const row=root.querySelector('[data-cws-pid="'+CSS.escape(pid)+'"]');
  if(row){row.classList.toggle('on',on);row.setAttribute('aria-selected',String(on));const cb=row.querySelector('[data-cws-check]');if(cb)cb.checked=on;}
 };
 for(const pid of new Set([...previous,...selectedNestingIds]))if(previous.has(pid)!==selectedNestingIds.has(pid))paint(pid,selectedNestingIds.has(pid));
 if(root)root._lastHtml=null;
 const btn=root?.querySelector('#cwsDeletePart');
 const count=(state.nesting.sheets?.[activeSheetIdx]?.placements||[]).filter(p=>selectedNestingIds.has(p.id)&&!p.locked).length;
 if(btn){btn.disabled=!count;btn.textContent=count>1?'Seçilenleri Sil ('+count+')':'Parçayı Sil';}
 const label=root?.querySelector('#nestingSelectedCount');if(label)label.textContent=selectedNestingIds.size?selectedNestingIds.size+' seçili':'';
 updateNumericBar(state);
}

function moveNestingSelection(dx,dy,ids=[...selectedNestingIds]){
 const state=store.get();syncNestingSelectionScope(state);
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return;
 const wanted=new Set(ids);
 if(!(state.nesting.sheets?.[activeSheetIdx]?.placements||[]).some(p=>wanted.has(p.id)&&!p.locked))return;
 nestingRepackController?.abort();
 mutateData('Nesting seçili parçaları taşı',s=>moveNestingParts(s.nesting,activeSheetIdx,ids,dx,dy,nestingSeparation(s.nesting)),false);
}
function bindNestingGestures(root){
  const svg=root.querySelector('.nesting-sheet-svg');if(!svg||svg._gestureBound)return;
  svg._gestureBound=true;svg.style.touchAction='none';
  const point=e=>{const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse());};
  let drag=null;
  const cancel=()=>{if(!drag)return;for(const g of drag.groups||[drag.group])g?.removeAttribute('transform');drag=null;if(nestingGesture)nestingGesture.active=false;};
  nestingGesture={active:false,cancel};
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0||!['select','move','rotate','scale'].includes(nestingTool))return;
    const group=e.target.closest('[data-pid]');if(!group){selectNestingPart(null);return;}
    e.preventDefault();e.stopPropagation();
    const part=store.get().nesting.sheets?.[activeSheetIdx]?.placements.find(p=>p.id===group.dataset.pid);
    if(!part)return;
    if(nestingTool==='select'&&(e.ctrlKey||e.metaKey||e.shiftKey)){selectNestingPart(part.id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey,addRange:e.ctrlKey||e.metaKey});return;}
    const start=point(e),h=store.get().nesting.sheets[activeSheetIdx].heightMm;
    const center={x:(part.bounds.minX+part.bounds.maxX)/2,y:h-(part.bounds.minY+part.bounds.maxY)/2};
    const tool=nestingTool==='select'?'move':nestingTool;
    nestingGesture.active=true;
    selectNestingPart(part.id,{preserve:tool==='move'});
    const ids=tool==='move'?(store.get().nesting.sheets[activeSheetIdx].placements||[]).filter(p=>selectedNestingIds.has(p.id)&&!p.locked).map(p=>p.id):part.locked?[]:[part.id];
    const groups=ids.map(id=>svg.querySelector('[data-pid="'+CSS.escape(id)+'"]')).filter(Boolean);
    drag={part,group,groups,ids,start,center,h,tool,pointer:e.pointerId,moved:false,dx:0,dy:0,factor:1,angle:0};
    svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    if(!drag||drag.pointer!==e.pointerId||!drag.ids.length)return;
    const p=point(e),d=drag;d.dx=p.x-d.start.x;d.dy=p.y-d.start.y;
    if(Math.hypot(d.dx,d.dy)<.5&&!d.moved)return;
    d.moved=true;
    if(d.tool==='move')for(const g of d.groups)g.setAttribute('transform','translate('+d.dx+' '+d.dy+')');
    if(d.tool==='rotate'){
      let a=(Math.atan2(p.y-d.center.y,p.x-d.center.x)-Math.atan2(d.start.y-d.center.y,d.start.x-d.center.x))*180/Math.PI;
      if(e.shiftKey)a=Math.round(a/15)*15;
      if(store.get().nesting.enforceGrainDirection)a=0;
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
    if(d.moved&&d.ids.length){
      if(d.tool==='move')moveNestingSelection(d.dx,-d.dy,d.ids);
      else if(d.tool==='rotate')editSelectedNesting('rot',(d.part.angleDeg||0)-d.angle);
      else if(d.tool==='scale')editSelectedNesting('scale',d.factor);
    }else selectNestingPart(d.part.id,{preserve:d.tool==='move'});
  });
  svg.addEventListener('pointercancel',()=>{cancel();updateCenterWorkspaces(store.get());});
  svg.addEventListener('lostpointercapture',()=>{cancel();});
}
function bindNestingCenterEvents(root) {
  bindNestingGestures(root);
  bindNestedCncPanel(root);
  root.querySelectorAll('[data-nest-tab]').forEach(b => b.onclick = () => {
    nestingRepackController?.abort();currentNestingImportController?.abort();
    mutateData('Nesting iş sekmesi', s => switchNestingTab(s.nesting,b.dataset.nestTab), false);
    activeSheetIdx=0;clearNestingSelection();
    updateCenterWorkspaces(store.get());
  });
  root.querySelectorAll('[data-nest-close]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    mutateData('Nesting dosya sekmesini kapat', s => closeNestingImportedTab(s.nesting,b.dataset.nestClose), false);
    activeSheetIdx=0;clearNestingSelection();
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
    clearNestingSelection();
    updateCenterWorkspaces(store.get());
    updateNumericBar(store.get());
  });
  root.querySelectorAll('[data-cws-pid]').forEach(el => {
    el.onclick=e=>{
      if(e.target.closest('[data-cws-delete]'))return;
      const checkbox=Boolean(e.target.closest('[data-cws-check]'));
      selectNestingPart(el.dataset.cwsPid,{toggle:checkbox||e.ctrlKey||e.metaKey,range:e.shiftKey,addRange:e.ctrlKey||e.metaKey});
      const cb=el.querySelector('[data-cws-check]');if(cb)cb.checked=selectedNestingIds.has(el.dataset.cwsPid);
    };
    const del=el.querySelector('[data-cws-delete]');if(del)del.onclick=e=>{e.stopPropagation();removeNestingSelection(el.dataset.cwsPid);};
  });
  root.querySelectorAll('#cwsNestSvgBox [data-pid]').forEach(g => {
    g.onclick = e=>{e.stopPropagation();};
    g.oncontextmenu = (e) => {
      e.preventDefault();
      selectNestingPart(g.getAttribute('data-pid'));
      showNestingPartContextMenu(e, selectedNestingId);
    };
  });
  // A click on empty sheet space only clears the selected part. It must never
  // dismiss or rebuild the sheet-size and optimization settings sidebar.
  root.querySelector('#cwsNestSvgBox')?.addEventListener('click', e => {
    if (e.target.closest('[data-pid]') || !selectedNestingId) return;
    selectNestingPart(null);
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
  root.querySelector('#cwsSendCorel')?.addEventListener('click', () => triggerSendToCorel(true));
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
  root.querySelector('#cwsNestW')?.addEventListener('change', e => applyNestingSheetSize(displayToMm(e.target.value,store.get().pageLayout?.displayUnit), store.get().nesting.sheetHeightMm));
  root.querySelector('#cwsNestH')?.addEventListener('change', e => applyNestingSheetSize(store.get().nesting.sheetWidthMm, displayToMm(e.target.value,store.get().pageLayout?.displayUnit)));
  root.querySelector('#cwsNestSp')?.addEventListener('change', e => {
    const v = displayToMm(e.target.value,store.get().pageLayout?.displayUnit);
    if (Number.isFinite(v) && v >= 0) repackNestingSettings('Parça aralığı', n => { n.clearanceMm = v; });
  });
  root.querySelector('#cwsNestMg')?.addEventListener('change', e => {
    const v = displayToMm(e.target.value,store.get().pageLayout?.displayUnit);
    if (Number.isFinite(v) && v >= 0) repackNestingSettings('Levha kenar payı', n => {
      n.marginMm = n.marginLeftMm = n.marginRightMm = n.marginTopMm = n.marginBottomMm = v;
    });
  });
  root.querySelector('#cwsNestHoles')?.addEventListener('change', e =>
    repackNestingSettings('Delik içi yerleşim', n => { n.allowHoleNesting = e.target.checked; }));
  root.querySelector('#cwsNestAdvanced')?.addEventListener('toggle', e => {
    nestingAdvancedOpen = Boolean(e.target.open);
  });
  root.querySelector('#cwsNestGrain')?.addEventListener('change', e =>
    repackNestingSettings('Fırça yönü kısıtı', n => { n.enforceGrainDirection = e.target.checked; }));
  root.querySelector('#cwsNestRot')?.addEventListener('change', e =>
    repackNestingSettings('Dönüş adımı', n => { n.rotationStepDeg = e.target.value === 'auto' ? 'auto' : Number(e.target.value); }));
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
  root.querySelector('#cwsExpCorel')?.addEventListener('click', () => triggerSendToCorel(true));
  root.querySelector('#cwsCorelSetup')?.addEventListener('click', () => openCorelBridgeModal());
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

function bindNestedCncPanel(root){
 const panel=root.querySelector('#nestCncPanel');if(!panel||panel.dataset.bound)return;
 panel.dataset.bound='true';
 const fields={Profile:'profile',Kerf:'kerfMm',ToolDia:'toolDiameterMm',Comp:'compensation',Seq:'sequence',LeadIn:'leadInMm',Tabs:'microTabs',Tol:'curveTolMm'};
 for(const [suffix,key] of Object.entries(fields)){
  const el=panel.querySelector('#nestCnc'+suffix);if(!el)continue;
  el.addEventListener('change',()=>{
    const state=store.get(),v=el.type==='checkbox'?el.checked:key.endsWith('Mm')?displayToMm(el.value,state.pageLayout?.displayUnit):el.value;
    if(key.endsWith('Mm')&&(!Number.isFinite(v)||v<0)){el.value=formatMmAsUnit(state.cnc[key],state.pageLayout?.displayUnit);return;}
    mutateData('CNC ayarı',s=>{s.cnc[key]=v;});
  });
 }
 panel.querySelector('#nestCncApplyDefaults')?.addEventListener('click',()=>{
  const s=store.get(),p=getMachineProfile(s.cnc?.profile);
  mutateData('Profil varsayılanları',st=>{st.cnc.kerfMm=p.defaultKerfMm??st.cnc.kerfMm;st.cnc.toolDiameterMm=p.defaultToolDiaMm??st.cnc.toolDiameterMm;});
  studioToast(`${p.label} varsayılan kerf ve takım çapı uygulandı.`);
 });
 panel.querySelector('#nestCncSendMachine')?.addEventListener('click', () => {
  const sh = store.get().nesting.sheets?.[activeSheetIdx];
  triggerSendToCncMachine(sh ? [sh] : []);
 });
 panel.querySelector('#nestCncMachineConfig')?.addEventListener('click', () => {
  const sh = store.get().nesting.sheets?.[activeSheetIdx];
  openCncMachineModal(sh ? [sh] : []);
 });
 panel.querySelector('#nestCncExport')?.addEventListener('click',()=>{
  const s=store.get(),sh=s.nesting.sheets?.[activeSheetIdx],profile=getMachineProfile(s.cnc.profile);
  if(!sh||!profile||!validateNestedProduction([sh],s.cnc).valid)return;
  const base=s.projectName+'_levha'+(activeSheetIdx+1);
  if(profile.kind==='dxf')downloadBlob(base+'.dxf',generateNestedDxf([sh]),'application/dxf');
  else if(profile.kind==='svg')downloadBlob(base+'.svg',generateNestedSvg([sh]),'image/svg+xml');
  else if(profile.kind==='plt')downloadBlob(base+'.plt',generateNestedHpgl([sh],s.cnc),'text/plain');
  else if(profile.kind==='gcode'){
    if(!window.confirm('G-code taslağı: mevcut post-processor seçili makine profilinin hız, güç ve Z değerlerini kullanır. Kerf/takım telafisi, giriş/çıkış ve mikro köprüler otomatik uygulanmaz. Makinenize uygun CAM doğrulaması olmadan çalıştırmayın. Taslağı indir?'))return;
    downloadBlob(`${base}_CAM_kontrol.${profile.ext||'nc'}`,generateNestedGcode([sh],s.cnc),'text/plain');
  }
 });
}
function bindCncCenterEvents(root) {
  const upd = (id, fn, isChk = false) => root.querySelector('#' + id)?.addEventListener('change', e => {
    mutateData('CNC ayarı', s => fn(s.cnc, isChk ? e.target.checked : ['cncKerf','cncToolDia','cncLeadIn','cncTol'].includes(id)?displayToMm(e.target.value,s.pageLayout?.displayUnit):e.target.value));
  });
  upd('cncProfile', (c, v) => { c.profile = v; });
  root.querySelector('#cncApplyDefaults')?.addEventListener('click', () => {
    const s = store.get(), p = getMachineProfile(s.cnc?.profile);
    mutateData('Profil varsayılanları', st => {
      st.cnc.kerfMm = p.defaultKerfMm ?? st.cnc.kerfMm;
      st.cnc.toolDiameterMm = p.defaultToolDiaMm ?? st.cnc.toolDiameterMm;
    });
    studioToast(`${p.label} varsayılan kerf ve takım çapı uygulandı.`);
  });
  upd('cncKerf', (c, v) => { c.kerfMm = Number(v); });
  upd('cncToolDia', (c, v) => { c.toolDiameterMm = Number(v); });
  upd('cncComp', (c, v) => { c.compensation = v; });
  upd('cncSeq', (c, v) => { c.sequence = v; });
  upd('cncLeadIn', (c, v) => { c.leadInMm = Number(v); });
  upd('cncTabs', (c, v) => { c.microTabs = v; }, true);
  upd('cncTol', (c, v) => { c.curveTolMm = Number(v); });

  root.querySelector('#cncBtnSendMachine')?.addEventListener('click', () => {
    triggerSendToCncMachine(store.get().nesting.sheets || []);
  });
  root.querySelector('#cncBtnMachineConfig')?.addEventListener('click', () => {
    openCncMachineModal(store.get().nesting.sheets || []);
  });
  root.querySelector('#cncBtnNestNow')?.addEventListener('click', () => runAutoNesting());
  root.querySelector('#cncBtnExportDxf')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_nesting_1to1.dxf`, generateNestedDxf(s.nesting.sheets || []), 'application/dxf');
  });
  root.querySelector('#cncBtnExportGcode')?.addEventListener('click', () => {
    const s = store.get(), p = getMachineProfile(s.cnc?.profile);
    const ext = p.kind === 'gcode' ? (p.ext || 'nc') : 'nc';
    downloadBlob(`${s.projectName}_cnc.${ext}`, generateNestedGcode(s.nesting.sheets || [], s.cnc), 'text/plain');
  });
  root.querySelector('#cncBtnExportSvg')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_nesting.svg`, generateNestedSvg(s.nesting.sheets || []), 'image/svg+xml');
  });
  root.querySelector('#cncBtnExportPlt')?.addEventListener('click', () => {
    const s = store.get();
    downloadBlob(`${s.projectName}_plotter.plt`, generateNestedHpgl(s.nesting.sheets || [], s.cnc), 'text/plain');
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

let toastTimer;
function studioToast(message,error=false){
 const el=document.getElementById('studioToast');if(!el)return;
 clearTimeout(toastTimer);el.textContent=message;el.hidden=false;el.classList.toggle('toast-error',error);
 toastTimer=setTimeout(()=>{el.hidden=true;},3500);
}
async function copyStudioText(text){
 try{
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);studioToast('WhatsApp özeti panoya kopyalandı');return;}catch{}}
  const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(input);
  try{input.select();if(!document.execCommand('copy'))throw Error('copy');}finally{input.remove();}
  studioToast('WhatsApp özeti panoya kopyalandı');
 }catch{studioToast('Panoya kopyalanamadı. Tarayıcı izinlerini kontrol edin.',true);}
}
function openCustomerQuote(print = false) {
  const state = store.get();
  const preview = is3DWorkspace(state)&&signEngine&&!signEngine.isDisposed ? signEngine.capturePng(1200, 750) : null;
  const html = buildQuoteHtml(state, lastMetrics, lastCosts, preview);
  const modal=document.getElementById('quotePreviewModal'),frame=document.getElementById('quotePreviewFrame');
  if(!modal||!frame){downloadBlob(state.projectName+'_teklif.html',html,'text/html');return;}
  frame.srcdoc=html;modal.classList.remove('hidden');
  const printFrame=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch{studioToast('Yazdırma açılamadı. Yeni sekmede açmayı deneyin.',true);}};
  document.getElementById('quoteClose').onclick=()=>modal.classList.add('hidden');
  document.getElementById('quotePrint').onclick=printFrame;
  document.getElementById('quoteNewTab').onclick=()=>{const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
  if(print)studioToast('Yazdır / PDF düğmesi ile teklifinizi yazdırabilirsiniz.');
}
function customerQuoteText() {
  const s=store.get();
  const cost=s.quote?.locked && s.quote?.lockedSnapshot?.costs ? s.quote.lockedSnapshot.costs : lastCosts;
  const metrics=s.quote?.locked && s.quote?.lockedSnapshot?.metrics ? s.quote.lockedSnapshot.metrics : lastMetrics;
  return [
    `*${s.quote?.companyName || 'Tabela Teklifi'}*`,
    `Proje: ${s.projectName}`,
    `Müşteri: ${s.quote?.customerCompany || s.quote?.customerName || '—'}`,
    `Ölçü: ${formatDimensions(metrics.totalWidthMm,metrics.totalHeightMm,s.pageLayout?.displayUnit)}`,
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
  root.querySelector('#costCenterCopyBtn')?.addEventListener('click',()=>copyStudioText(customerQuoteText()));
  root.querySelectorAll('#costExportInternalCsv').forEach(b=>b.addEventListener('click',exportInternalCostCsv));
}

let textEditTarget=null;
function openTextEditor(id){
 const state=store.get(),obj=editableTextObject(state,id);
 const dialog=document.getElementById('textEditDialog'),input=document.getElementById('textEditInput');
 if(!obj||!dialog||!input)return false;
 if(dialog.open)return true;
 textEditTarget={id,docId:docManager.activeDocId,pageId:state.activePageId};
 store.updateScoped([],s=>{s.selectedIds=[id];});
 if(is3DWorkspace(state))signEngine?.updateSelectionBox(store.get());
 updateNumericBar(store.get());
 input.value=obj.text||'';
 dialog.showModal();input.focus();input.select();return true;
}
function bindTextEditor(){
 const dialog=document.getElementById('textEditDialog'),input=document.getElementById('textEditInput'),form=document.getElementById('textEditForm');
 if(!dialog||!input||!form)return;
 const close=()=>{textEditTarget=null;dialog.close();};
 document.getElementById('textEditCancel').onclick=close;
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('close',()=>{textEditTarget=null;});
 dialog.addEventListener('keydown',e=>{
   e.stopPropagation();
   if(e.key==='Escape'){e.preventDefault();close();}
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target===input){e.preventDefault();form.requestSubmit();}
 });
 form.addEventListener('submit',e=>{
   e.preventDefault();const target=textEditTarget,value=input.value,state=store.get();
   if(!target||target.docId!==docManager.activeDocId||target.pageId!==state.activePageId||!editableTextObject(state,target.id)){close();return;}
   if(!value.trim()){input.setCustomValidity('Metin boş olamaz.');input.reportValidity();return;}
   if(editableTextObject(state,target.id).text!==value)mutate('Metin düzenlendi',s=>applyTextEdit(s,target.id,value));
   close();
 });
 input.addEventListener('input',()=>input.setCustomValidity(''));
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
      ...(editableTextObject(store.get(),objId||store.get().selectedIds[0])?[{label:'Metni Düzenle',action:()=>openTextEditor(objId||store.get().selectedIds[0])},{sep:true}]:[]),
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
    { label: 'Parçayı Sil',kbd:'Del',danger:true,action:()=>removeNestingSelection(pid) },
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
  if(source==='design'&&['png','transparentPng','jpg','webp','bmp','stl','stla','glb','gltf','ply','3mf','obj'].includes(format)&&!is3DWorkspace(store.get()))throw Error('3D model veya görsel çıktı için önce 3D Kutu Harf sekmesini açın.');
  return runProfessionalExport({
    format,source,selectedOnly,resolution,state:store.get(),
    metricsList:lastSceneResult?.metricsList || [],signEngine,activeSheetIdx,
    confirmCnc:message=>window.confirm(message),
  });
}

function openImportDialog(){
  if(store.get().mainWorkspace==='nesting')return openNestingVectorImport(true);
  if(['cnc','cost'].includes(store.get().mainWorkspace))setMainWorkspace('design2d');
  activateTool('logo');
}
function openExportDialog() {
  const modal=document.getElementById('exportDialog');
  if (!modal) return;
  const source=document.getElementById('exportSource');
  if(source)source.value=['nesting','cnc'].includes(store.get().mainWorkspace)?'nestingActive':'design';
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
  document.getElementById('btnOpenImport')?.addEventListener('click',openImportDialog);
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
  sideWorkspace='layers';ribbonSuppressed='layers';
  store.updateScoped([],s=>{s.activeWorkspace='layers';});
  bindRibbon();
  document.getElementById('globalLogoImport')?.addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';if(file){if(/\.(svg|png|jpe?g|webp)$/i.test(file.name))handleLogoUpload(file);else{openNestingVectorImport(false);importNestingVectorFiles([file],document.getElementById('nestingCenterWrap'));}}});
  window.addEventListener('message', async (e) => {
    if (e.origin && e.origin !== window.location.origin && e.origin !== 'null') return;
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'TRACE_STUDIO_READY') {
      traceStudioReady = true;
      flushPendingTracerImage();
      return;
    }
    if (msg.type === 'SIGNAGE_STUDIO_IMPORT_VECTOR' && msg.svgText) {
      const name = String(msg.fileName || 'trace_vektor').replace(/\.svg$/i, '') + '.svg';
      const file = new File([msg.svgText], name, { type: 'image/svg+xml' });
      setMainWorkspace('model3d');
      await handleLogoUpload(file);
      studioToast('Image Tracer vektörü 3D sahneye aktarıldı.');
    } else if (msg.type === 'SIGNAGE_STUDIO_IMPORT_NESTING' && (msg.svgText || msg.dxfText)) {
      const useSvg = Boolean(msg.svgText);
      const rawName = String(msg.fileName || 'trace_vektor').replace(/\.(svg|dxf)$/i, '');
      const file = new File([useSvg ? msg.svgText : msg.dxfText], rawName + (useSvg ? '.svg' : '.dxf'), {
        type: useSvg ? 'image/svg+xml' : 'application/dxf',
      });
      openNestingVectorImport(false);
      await importNestingVectorFiles([file], document.getElementById('nestingCenterWrap'));
    }
  });
  const menuToggle=document.getElementById('mobileMenuToggle'),railToggle=document.getElementById('mobileRailToggle');
  menuToggle?.addEventListener('click',()=>{const on=document.getElementById('mainMenuBar').classList.toggle('mobile-menu-open');menuToggle.setAttribute('aria-expanded',String(on));});
  railToggle?.addEventListener('click',()=>{const on=document.getElementById('studioBody').classList.toggle('mobile-rail-open');railToggle.setAttribute('aria-expanded',String(on));});
  window.addEventListener('studio-close-menus',()=>{document.getElementById('mainMenuBar')?.classList.remove('mobile-menu-open');menuToggle?.setAttribute('aria-expanded','false');});
  window.addEventListener('keydown',e=>{if(e.key!=='Escape')return;for(const id of ['quotePreviewModal','shortcutsModal']){const el=document.getElementById(id);if(el&&!el.classList.contains('hidden')){el.classList.add('hidden');e.preventDefault();e.stopImmediatePropagation();return;}}},true);
  document.getElementById('btnFloatActiveDocker')?.addEventListener('click', () => {
    const active = sideWorkspace;
    if(!sideIds.has(active))return;
    detachWorkspaceToFloat(active, Math.max(36, window.innerWidth - 670), 100);
  });
  document.getElementById('btnResetDockLayout')?.addEventListener('click', () => {
    wsLayout.floating = []; wsLayout.dockedUnder = {}; wsLayout.tabOrder = WS_META.map(m => m.id);
    store.update(s => { s.ui.stackMode = 'tabs'; });
    saveWsLayout(); renderActiveWorkspace();
  });
  document.getElementById('inspectorPanelSelect')?.addEventListener('change', e => {
    const id=e.target.value;if(!inspectorIds.has(id))return;
    // Close the ribbon before mounting the same controls in the inspector.
    sideWorkspace=id;ribbonSuppressed=id;
    wsLayout.floating=wsLayout.floating.filter(f=>f.id!==id);
    for(const host of Object.keys(wsLayout.dockedUnder))wsLayout.dockedUnder[host]=(wsLayout.dockedUnder[host]||[]).filter(x=>x!==id);
    saveWsLayout();
    store.updateScoped(['ui'],s=>{s.activeWorkspace=id;s.ui.stackMode='tabs';});
    renderActiveWorkspace();updateStageChrome(store.get());
  });
  document.getElementById('btnToggleStackMode')?.addEventListener('click', () => {
    store.update(s => { s.ui.stackMode = s.ui.stackMode === 'stacked' ? 'tabs' : 'stacked'; });
    renderActiveWorkspace();
  });
  document.getElementById('btnSaveDefaults')?.addEventListener('click', () => {
    const s = store.get();
    try{localStorage.setItem(USER_DEFAULTS_KEY, JSON.stringify({
      materials: s.materials,
      materialOverrides: s.materialOverrides,
      lighting: s.lighting,
      render: s.render,
    }));studioToast('Varsayılan ayarlar kaydedildi.');}catch{studioToast('Varsayılan ayarlar kaydedilemedi.',true);}
  });
  document.getElementById('btnOpenBackgroundPanel')?.addEventListener('click', () => {
    ribbonSuppressed=null;
    restoreWorkspaceToTab('background');
    store.update(s => { s.activeWorkspace = 'background'; s.ui.stackMode = 'tabs'; });
    renderActiveWorkspace();
    document.getElementById('inspectorCol')?.classList.add('mobile-open');
  });
  document.getElementById('stagePmPhotoUpload')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) handlePhotomontagePhotoFile(f);
    e.target.value = '';
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
    onWallLoad: renderWallLoading,
    onEditText:openTextEditor,
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
        if(delta?.moved){updateUndoRedoButtons();scheduleRebuild(true);}
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
      renderActiveWorkspace();
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

  photomontageOverlay = new PhotomontageOverlay(document.getElementById('photomontageLayer'), {
    onCornersChange: (corners) => {
      store.update(s => { s.photomontage.cornersNorm = corners; });
    },
    onConfirm: async () => {
      store.update(s => { s.photomontage.confirmed = true; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
      await sendPhotomontageToTracer();
    },
    onSendToTracer: async () => {
      await sendPhotomontageToTracer();
    },
    onEdit: () => {
      store.update(s => { s.photomontage.confirmed = false; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
    },
    onResetCorners: () => {
      store.update(s => {
        s.photomontage.cornersNorm = [
          { x: 0.22, y: 0.28 },
          { x: 0.78, y: 0.28 },
          { x: 0.78, y: 0.62 },
          { x: 0.22, y: 0.62 },
        ];
      });
      updateStageChrome(store.get());
    },
    onExport: () => photomontageOverlay.exportComposite(store.get(), signEngine),
    onClose: () => {
      store.update(s => { s.photomontage.visible = false; });
      updateStageChrome(store.get());
      renderActiveWorkspace();
      studioToast('3D sahneye dönüldü. Fotoğrafı tekrar açmak için Katmanlar panelindeki göz simgesine tıklayabilirsiniz.');
    },
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
  document.querySelectorAll('#quickWallSeg button').forEach(b => b.onclick = () => selectWall(b.dataset.wall));
  document.getElementById('wallLoadingRetry')?.addEventListener('click',()=>selectWall(store.get().scene.wallId));

  const quickWallSelect=document.getElementById('quickWallSelect');
  if(quickWallSelect){quickWallSelect.innerHTML=BACKGROUND_SCENES.map(b=>`<option value="${b.id}">${escapeHtml(b.label)}</option>`).join('');quickWallSelect.value=store.get().scene.wallId;quickWallSelect.onchange=e=>selectWall(e.target.value);}
  const stageWallScaleRange=document.getElementById('stageWallScaleRange');
  if(stageWallScaleRange){
    stageWallScaleRange.addEventListener('input',e=>applyWallScaleChange(e.target.value,false));
    stageWallScaleRange.addEventListener('change',e=>applyWallScaleChange(e.target.value,true));
  }
  document.getElementById('stageWallScaleReset')?.addEventListener('click',()=>applyWallScaleChange(1.0,true));
  syncWallScaleControls(store.get().scene.wallScale??1.0);
  // Project Name & Quality
  if (document.getElementById('projectNameInput')) document.getElementById('projectNameInput').onchange = (e) => store.update(s => { s.projectName = e.target.value; });
  document.getElementById('qualitySelect').onchange = (e) => {
    if (!QUALITY_PROFILES[e.target.value]) return;
    mutateRender('Gerçek render kalitesi', s => { s.quality = e.target.value; }, false);
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

  bindCorelBridgeModal();
  bindCncMachineModal();
  bindAlignmentRail();
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
    onFitCamera: () => store.get().mainWorkspace==='design2d'?vector2D?.fitAll(store.get()):signEngine?.setCameraPreset('fit'),
    onToCurves: () => runCadAction('toCurves'),
    onBreakApart: () => runCadAction('breakApart'),
    onCombine: () => runCadAction('combine'),
    onNewDoc: () => document.getElementById('btnNewDocTab')?.click(),
    onExport: openExportDialog,
    onImport: openImportDialog,
    onAlignment:runAlignment,
    onCenterOnPage:()=>runAlignment('page'),
    onDuplicate: () => runCadAction('duplicate'),
    onUndo: () => document.getElementById('btnUndo').click(),
    onRedo: () => document.getElementById('btnRedo').click(),
    isNesting:()=>store.get().mainWorkspace==='nesting',
    onDelete: () => {if(store.get().mainWorkspace==='nesting'){nestingGesture?.cancel?.();removeNestingSelection();}else runCadAction('delete');},
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
      if(store.get().mainWorkspace==='nesting'){moveNestingSelection(dx,dy);return;}
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
  bindTextEditor();
  const vecWrap = document.getElementById('vector2DWrap');
  if (vecWrap) {
    vector2D = new Vector2DCanvas(vecWrap, {
      onEditText:openTextEditor,
      onTransformNoop:()=>{dragBeforeState=null;},
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
        renderActiveWorkspace();
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
    openExport: openExportDialog,
    openImport: openImportDialog,
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
    centerOnPage:()=>runAlignment('page'),
    toggleLockSelected: () => {if(store.get().mainWorkspace==='nesting')editSelectedNesting('toggleLock');else mutate('Kilit', s => { const o = getSelectedOrFirst(s); if (o) toggleLayerLock(s, o.id); });},
    addPage: () => document.getElementById('btnAddPage')?.click(),
    dupPage: () => document.getElementById('btnDupPage')?.click(),
    delPage: () => document.getElementById('btnDelPage')?.click(),
    tool: (t) => activateTool(t),
    setConstruction: (c) => mutate('Yapı tipi', s => applyConstructionType(s, c)),
    setLightingMode: (m) => mutate('Aydınlatma', s => { s.lighting.mode = m; const o = getSelectedOrFirst(s); if (o) o.lightingMode = m; }),
    toggleNight: () => mutate('Ortam', s => { s.scene.night = !s.scene.night; }),
    runNesting: () => { setMainWorkspace('nesting'); runAutoNesting(); },
    setDocker: (d) => { ribbonSuppressed=null;store.updateScoped([],s => { s.activeWorkspace = d; }); renderActiveWorkspace(); },
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
let cancelShapePlacement=null;
function startMousePlacement(tool) {
  cancelShapePlacement?.();
  if(store.get().mainWorkspace==='design2d'&&vector2D){
    const pos={xMm:vector2D.view.cx,yMm:vector2D.view.cy};
    mutate('2D '+tool+' eklendi',s=>{const o=createShapeObject(tool,s,pos);s.objects.push(o);s.selectedIds=[o.id];s.activeTool='move';});
    vector2D.render(store.get(),fontMap);updateNumericBar(store.get());renderActiveWorkspace();
    document.querySelectorAll('.cad-rail [data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='move'));return;
  }
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
  scheduleRebuild(true);renderActiveWorkspace();
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
    warnEl?.classList.add('hidden');cancelShapePlacement=null;
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
      scheduleRebuild(true);renderActiveWorkspace();
      document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
    }
  };

  cancelShapePlacement=()=>onKeyCancel({key:'Escape'});
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
    document.getElementById('globalLogoImport')?.click();
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

async function refreshCorelBridgeStatusUI() {
  const badge = document.getElementById('corelBridgeStatusBadge');
  if (!badge) return { online: false };
  badge.textContent = 'Köprü kontrol ediliyor...';
  badge.className = 'corel-status-pill';
  const status = await checkCorelBridgeStatus(900);
  if (status.online) {
    badge.textContent = status.corelRunning
      ? '✓ Canlı Köprü Bağlı · CorelDRAW Açık'
      : '✓ Canlı Köprü Bağlı (CorelDRAW Hazır)';
    badge.className = 'corel-status-pill online';
  } else {
    badge.textContent = '○ Yerel Köprü Kapalı (Tek Seferlik .bat Başlatın)';
    badge.className = 'corel-status-pill offline';
  }
  return status;
}

function openCorelBridgeModal() {
  const modal = document.getElementById('corelBridgeModal');
  if (!modal) return;
  const s = store.get();
  const sheets = s.nesting?.sheets || [];
  const partsCount = sheets.reduce((sum, sh) => sum + (sh.placements?.length || 0), 0);
  const summary = document.getElementById('corelBridgeSummary');
  if (summary) {
    const bodyHex = s.nesting?.previewColors?.body || '#c89343';
    const holeHex = s.nesting?.previewColors?.holes || '#c89343';
    summary.textContent = `${sheets.length} levha · ${partsCount} parça · Gövde: ${bodyHex} · İç Boşluk: ${holeHex} (1:1 mm CorelDRAW aktarımı)`;
  }
  modal.classList.remove('hidden');
  refreshCorelBridgeStatusUI();
}

async function triggerSendToCorel(openModalOnOffline = true) {
  const s = store.get();
  const sheets = (s.nesting?.sheets || []).filter(sh => (sh.placements?.length || 0) > 0);
  if (!sheets.length) {
    studioToast('CorelDRAW’a göndermek için önce en az bir yerleştirilmiş levha gerekir.', true);
    return;
  }
  const res = await sendNestingToCorel(sheets, s.nesting?.previewColors || {}, s.projectName || 'KutuHarf_Nesting');
  if (res.ok) {
    document.getElementById('corelBridgeModal')?.classList.add('hidden');
    studioToast(`✓ CorelDRAW'a aktarıldı: ${res.sheetsImported} levha, ${res.partsImported} parça (plaka ebatı + seçili renkler)!`);
    return;
  }
  if (res.bridgeOffline && openModalOnOffline) {
    openCorelBridgeModal();
  } else {
    studioToast(res.error || 'CorelDRAW aktarımı başarısız.', true);
    if (openModalOnOffline) openCorelBridgeModal();
  }
}

function bindCorelBridgeModal() {
  const modal = document.getElementById('corelBridgeModal');
  if (!modal) return;
  document.getElementById('btnCloseCorelModal')?.addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('btnCorelCheckStatus')?.addEventListener('click', () => refreshCorelBridgeStatusUI());
  document.getElementById('btnCorelDownloadBat')?.addEventListener('click', () => {
    downloadBlob('KutuHarf_CorelDRAW_Kopru.bat', generateCorelBridgeLauncherBat(), 'application/x-bat');
    studioToast('İndirilen KutuHarf_CorelDRAW_Kopru.bat dosyasına çift tıklayıp köprüyü başlatın.');
  });
  document.getElementById('btnCorelRetrySend')?.addEventListener('click', () => triggerSendToCorel(true));
  document.getElementById('btnCorelDownloadSvg')?.addEventListener('click', () => {
    const s = store.get();
    const sheets = s.nesting?.sheets || [];
    if (!sheets.length) return;
    downloadBlob(`${s.projectName || 'KutuHarf'}_CorelDRAW.svg`, generateCorelColoredSvg(sheets, s.nesting?.previewColors, s.projectName), 'image/svg+xml');
  });
  document.getElementById('btnCorelCopySvg')?.addEventListener('click', async () => {
    const s = store.get();
    const sheets = s.nesting?.sheets || [];
    if (!sheets.length) return;
    const svg = generateCorelColoredSvg(sheets, s.nesting?.previewColors, s.projectName);
    try {
      await navigator.clipboard.writeText(svg);
      studioToast('✓ CorelDRAW Renkli 1:1 mm SVG panoya kopyalandı — CorelDRAW içinde Ctrl+V yapabilirsiniz.');
    } catch {
      downloadBlob(`${s.projectName || 'KutuHarf'}_CorelDRAW.svg`, svg, 'image/svg+xml');
    }
  });
  document.getElementById('btnCorelDownloadBas')?.addEventListener('click', () => {
    const s = store.get();
    const sheets = s.nesting?.sheets || [];
    if (!sheets.length) return;
    const payload = buildCorelNestingPayload(sheets, s.nesting?.previewColors, s.projectName);
    downloadBlob(`${s.projectName || 'KutuHarf'}_CorelMakro.bas`, generateCorelVbaMacro(payload), 'text/plain');
  });
}

let cncModalTargetSheets = null;

function toggleCncModalFieldGroups(transport) {
  const folderG = document.getElementById('cncModalFolderGroup');
  const netG = document.getElementById('cncModalNetGroup');
  const ftpF = document.getElementById('cncModalFtpFields');
  const serG = document.getElementById('cncModalSerialGroup');
  const comRow = document.getElementById('cncModalComRow');
  const comChips = document.getElementById('cncModalComPorts');
  folderG?.classList.toggle('hidden', transport !== 'folder' && transport !== 'lightburn');
  netG?.classList.toggle('hidden', transport !== 'ftp' && transport !== 'tcp' && transport !== 'lightburn');
  ftpF?.classList.toggle('hidden', transport !== 'ftp');
  serG?.classList.toggle('hidden', transport !== 'webserial' && transport !== 'serial');
  comRow?.classList.toggle('hidden', transport !== 'serial');
  comChips?.classList.toggle('hidden', transport !== 'serial');
}

function readCncModalConnection() {
  return {
    transport: document.getElementById('cncModalTransport')?.value || 'folder',
    folderPath: document.getElementById('cncModalFolder')?.value || '',
    autoOpen: Boolean(document.getElementById('cncModalAutoOpen')?.checked),
    host: document.getElementById('cncModalHost')?.value || '127.0.0.1',
    port: Number(document.getElementById('cncModalPort')?.value) || 0,
    remoteDir: document.getElementById('cncModalRemoteDir')?.value || '',
    user: document.getElementById('cncModalUser')?.value || '',
    pass: document.getElementById('cncModalPass')?.value || '',
    comPort: document.getElementById('cncModalComPort')?.value || '',
    baudRate: Number(document.getElementById('cncModalBaud')?.value) || 115200,
    protocol: document.getElementById('cncModalProtocol')?.value || 'raw',
  };
}

async function refreshCncBridgeStatusUI() {
  const badge = document.getElementById('cncBridgeStatusBadge');
  if (!badge) return { online: false, comPorts: [], drives: [] };
  badge.textContent = 'CNC Köprüsü kontrol ediliyor...';
  badge.className = 'corel-status-pill';
  const status = await checkCncBridgeStatus(900);
  const drivesHost = document.getElementById('cncModalDrives');
  const comHost = document.getElementById('cncModalComPorts');
  if (status.online) {
    badge.textContent = `✓ CNC Köprüsü Aktif (${status.comPorts.length} COM · ${status.drives.length} sürücü)`;
    badge.className = 'corel-status-pill online';
    if (drivesHost) {
      drivesHost.innerHTML = status.drives.map(d => `<button type="button" class="cnc-chip" data-cnc-drive="${escapeAttr(d)}">💾 ${escapeHtml(d)}KutuHarf_CNC</button>`).join('');
      drivesHost.querySelectorAll('[data-cnc-drive]').forEach(b => {
        b.onclick = () => { const inp = document.getElementById('cncModalFolder'); if (inp) inp.value = b.dataset.cncDrive + 'KutuHarf_CNC'; };
      });
    }
    if (comHost) {
      comHost.innerHTML = status.comPorts.map(c => `<button type="button" class="cnc-chip" data-cnc-com="${escapeAttr(c)}">🔌 ${escapeHtml(c)}</button>`).join('');
      comHost.querySelectorAll('[data-cnc-com]').forEach(b => {
        b.onclick = () => { const inp = document.getElementById('cncModalComPort'); if (inp) inp.value = b.dataset.cncCom; };
      });
    }
  } else {
    badge.textContent = '○ Yerel CNC Köprüsü Kapalı (USB/Web Serial kurulumsuz çalışır)';
    badge.className = 'corel-status-pill offline';
    if (drivesHost) drivesHost.innerHTML = '';
    if (comHost) comHost.innerHTML = '';
  }
  return status;
}

function openCncMachineModal(targetSheets = null) {
  const modal = document.getElementById('cncMachineModal');
  if (!modal) return;
  const s = store.get();
  cncModalTargetSheets = targetSheets && targetSheets.length ? targetSheets : (s.nesting?.sheets || []);
  const profile = getMachineProfile(s.cnc?.profile);
  const conn = loadMachineConnection(profile);

  const summary = document.getElementById('cncModalProfileSummary');
  if (summary) {
    summary.innerHTML = `Seçili Makine: <b>${escapeHtml(profile.label)}</b> · Çıktı: <code>.${escapeHtml(profile.ext || 'nc')}</code> · Önerilen: ${escapeHtml(conn.hint || '')}`;
  }
  const tSel = document.getElementById('cncModalTransport');
  if (tSel) {
    if (!tSel.options.length) {
      tSel.innerHTML = CNC_TRANSPORT_MODES.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('');
    }
    tSel.value = conn.transport;
  }
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  setVal('cncModalFolder', conn.folderPath || '');
  const autoEl = document.getElementById('cncModalAutoOpen');
  if (autoEl) autoEl.checked = Boolean(conn.autoOpen);
  setVal('cncModalHost', conn.host || '127.0.0.1');
  setVal('cncModalPort', conn.port || (conn.transport === 'lightburn' ? 19840 : conn.transport === 'tcp' ? 9100 : 21));
  setVal('cncModalRemoteDir', conn.remoteDir || '/jobs');
  setVal('cncModalUser', conn.user || 'anonymous');
  setVal('cncModalPass', conn.pass || '');
  setVal('cncModalComPort', conn.comPort || 'COM3');
  setVal('cncModalBaud', conn.baudRate || 115200);
  setVal('cncModalProtocol', conn.protocol || 'raw');

  const prog = document.getElementById('cncModalProgress');
  if (prog) { prog.classList.add('hidden'); prog.textContent = ''; }

  toggleCncModalFieldGroups(conn.transport);
  modal.classList.remove('hidden');
  refreshCncBridgeStatusUI();
}

async function triggerSendToCncMachine(sheets = [], overrideConn = null) {
  const s = store.get();
  const activeSheets = (sheets && sheets.length ? sheets : (s.nesting?.sheets || [])).filter(sh => (sh.placements?.length || 0) > 0);
  const check = buildMachineUploadPayload(activeSheets, s.cnc, s.projectName);
  if (!check.valid) {
    studioToast(check.issues[0]?.msg || 'Makineye yüklemek için geçerli yerleşmiş levha gerekir.', true);
    return;
  }
  const prog = document.getElementById('cncModalProgress');
  try {
    const res = await uploadToCncMachine(activeSheets, s.cnc, s.projectName, overrideConn, p => {
      if (prog) {
        prog.classList.remove('hidden');
        prog.textContent = `Gönderiliyor: %${p.pct} (${p.sent}/${p.total})`;
      }
    });
    if (res.ok) {
      document.getElementById('cncMachineModal')?.classList.add('hidden');
      studioToast(res.message || `✓ ${check.profile.label} makineye yüklendi.`);
      return;
    }
    if (res.bridgeOffline) {
      openCncMachineModal(activeSheets);
      studioToast('Yerel CNC köprüsü kapalı — köprüyü başlatın veya kurulumsuz Tarayıcı USB/Klasör yöntemini seçin.');
      return;
    }
    studioToast(res.error || 'Makine yüklemesi başarısız.', true);
  } catch (err) {
    if (err?.name !== 'AbortError') studioToast(String(err?.message || err), true);
  }
}

function bindCncMachineModal() {
  const modal = document.getElementById('cncMachineModal');
  if (!modal) return;
  document.getElementById('btnCloseCncModal')?.addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('btnCncCheckStatus')?.addEventListener('click', () => refreshCncBridgeStatusUI());
  document.getElementById('cncModalTransport')?.addEventListener('change', e => toggleCncModalFieldGroups(e.target.value));
  document.getElementById('btnCncDownloadBat')?.addEventListener('click', () => {
    downloadBlob('KutuHarf_CNC_Kopru.bat', generateCncBridgeLauncherBat(), 'application/x-bat');
    studioToast('İndirilen KutuHarf_CNC_Kopru.bat dosyasına çift tıklayıp köprüyü başlatın.');
  });
  document.getElementById('btnCncSaveConn')?.addEventListener('click', () => {
    const profile = getMachineProfile(store.get().cnc?.profile);
    saveMachineConnection(profile.id, readCncModalConnection());
    studioToast(`✓ ${profile.label} bağlantı ayarları kaydedildi.`);
  });
  document.getElementById('btnCncSendNow')?.addEventListener('click', () => {
    const profile = getMachineProfile(store.get().cnc?.profile);
    const conn = saveMachineConnection(profile.id, readCncModalConnection());
    triggerSendToCncMachine(cncModalTargetSheets || store.get().nesting?.sheets || [], conn);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

init();
