import { StateStore, createObjectId, structuredCloneSafe } from './core/state.js';
import { HistoryManager } from './core/history.js';
import {
  deserializeProject,
  deleteSavedProject,
  listSavedProjects,
  readAutosave,
  saveProjectToBrowser,
  serializeProject,
  writeAutosave,
} from './core/projectSerializer.js';
import { FontManager } from './geometry/FontManager.js';
import { generateCutoutPreview, parseSvgLogo, traceRasterLogo } from './geometry/LogoTracer.js';
import { SignEngine } from './render/SignEngine.js';
import { ACRYLIC_PALETTE, MATERIAL_PRESETS, PAINT_PALETTE } from './render/MaterialLibrary.js';
import { ENVIRONMENT_PRESETS } from './render/EnvironmentManager.js';
import { LIGHT_COLOR_PRESETS, LIGHTING_MODES } from './render/LightingSystem.js';
import { BACKGROUND_SCENES } from './photomontage/BackgroundLibrary.js';
import { PhotomontageOverlay } from './ui/PhotomontageOverlay.js';
import { renderNestingSvg } from './ui/NestingView.js';
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
} from './cad/CadTools.js';
import { SHORTCUT_LIST, attachShortcuts } from './cad/Shortcuts.js';
import { calculateManufacturingMetrics } from './manufacturing/MetricsCalculator.js';
import { extractNestingItems, runTrueShapeNesting } from './manufacturing/NestingEngine.js';
import { calculateProjectCosts, formatMoney } from './manufacturing/CostEngine.js';
import { buildQuoteHtml } from './manufacturing/QuoteGenerator.js';
import {
  downloadBlob,
  downloadDataUrl,
  generateManufacturingDxf,
  generateManufacturingSvg,
} from './export/ExportService.js';

const FILELI_PRESET_WIDTHS = [3, 5, 8, 10, 12, 15, 20, 25, 30];

const CONSTRUCTION_TYPES = [
  { id: 'fileli', label: 'Fileli Kutu Harf', desc: 'İçe dönük metal file çerçeve + içeride pleksi yüz, opak yan bant.' },
  { id: 'pleksi', label: 'Pleksi Kutu Harf', desc: 'Tam pleksi yüz, içten LED. Yüz seçtiğiniz ışık rengiyle parlar.' },
  { id: 'metal', label: 'Krom / Metal Kutu Harf', desc: 'Ayna veya mat krom, fırçalı altın-gümüş. İsteğe bağlı halo ışık.' },
  { id: 'halo', label: 'Arkadan Işıklı (Halo)', desc: 'Yüz kapalı, LED ışığı harfin arkasından duvara vurur.' },
  { id: 'isiksiz', label: 'Işıksız Kutu Harf', desc: 'Boyalı alüminyum veya metal, aydınlatmasız ekonomik seçenek.' },
];

const store = new StateStore(readAutosave() || undefined);
const history = new HistoryManager(60);
const fontManager = new FontManager();
const fontMap = new Map();
window.__khsFontMap = fontMap;

let signEngine = null;
let photomontageOverlay = null;
let lastSceneResult = { sizeM: { w: 2, h: 0.4 }, metricsList: [], warnings: [] };
let lastMetrics = calculateManufacturingMetrics([], store.get());
let lastCosts = calculateProjectCosts(lastMetrics, store.get());
let lastNesting = null;
let selectedNestingId = null;
let clipboardObjects = [];
let fontSearchQuery = '';
let localFontStatus = '';
let logoTraceOptions = { threshold: 0.5, bgTolerance: 45, smoothPasses: 1, removeBackground: true };
let penPoints = [];
let measurePoints = [];
let editingNodeIdx = -1;

// Debounced scene rebuild
let rebuildTimer = null;
function scheduleRebuild(immediate = false) {
  clearTimeout(rebuildTimer);
  const run = async () => {
    const state = store.get();
    // Ensure all needed fonts are loaded
    const neededFonts = new Set(state.objects.filter(o => o.kind === 'text').map(o => o.fontId || 'cinzel'));
    for (const fid of neededFonts) {
      if (!fontMap.has(fid)) {
        try {
          fontMap.set(fid, await fontManager.loadFont(fid));
        } catch {
          // ignore
        }
      }
    }

    lastSceneResult = signEngine.updateScene(state, fontMap);
    lastMetrics = calculateManufacturingMetrics(lastSceneResult.metricsList, state);
    lastCosts = calculateProjectCosts(lastMetrics, state);

    updateStageChrome(state);
    updateNumericBar(state);
    writeAutosave(state);
    drawCadOverlay(state);
  };
  if (immediate) run();
  else rebuildTimer = setTimeout(run, 40);
}

function mutate(label, fn, renderWorkspace = true) {
  history.push(store.get(), label);
  store.update(fn);
  updateUndoRedoButtons();
  scheduleRebuild(true);
  if (renderWorkspace) renderActiveWorkspace();
}

function updateUndoRedoButtons() {
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if (u) u.disabled = !history.canUndo();
  if (r) r.disabled = !history.canRedo();
}

function updateStageChrome(state) {
  const selObj = state.objects.find(o => state.selectedIds.includes(o.id)) || state.objects[0];
  document.getElementById('dimHeight').textContent = `${Math.round(selObj?.heightMm || state.dimensions.heightMm)} mm`;
  document.getElementById('dimTotal').textContent = `${lastMetrics.totalWidthMm} × ${lastMetrics.totalHeightMm} mm`;

  const fileBadge = document.getElementById('dimFileBadge');
  const isFileli = (selObj?.constructionType || state.constructionType) === 'fileli';
  fileBadge.classList.toggle('hidden', !isFileli);
  document.getElementById('dimFile').textContent = `${selObj?.fileWidthMm ?? state.fileli.fileWidthMm} mm`;

  document.getElementById('headerTotalBadge').textContent = formatMoney(lastCosts.grandTotal, lastCosts.currency);
  document.getElementById('projectNameInput').value = state.projectName;

  // Warning banner
  const warnEl = document.getElementById('stageWarning');
  if (lastSceneResult.warnings.length) {
    warnEl.textContent = lastSceneResult.warnings[0];
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }

  // Day/Night & Light buttons
  document.getElementById('btnDay').classList.toggle('on', !state.scene.night);
  document.getElementById('btnNight').classList.toggle('on', state.scene.night);
  const lightBtn = document.getElementById('btnLightToggle');
  lightBtn.classList.toggle('on', state.lighting.enabled);
  document.getElementById('lightDot').style.setProperty('--c', state.lighting.colorHex);
  document.getElementById('lightToggleLabel').textContent = state.lighting.enabled ? 'Işık açık' : 'Işık kapalı';

  // Wall buttons
  document.querySelectorAll('#quickWallSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.wall === state.scene.wallId);
  });

  // Photomontage preview sync
  if (state.activeWorkspace === 'background' && state.photomontage.photoUrl) {
    const prevT = state.scene.transparentBg;
    state.scene.transparentBg = true;
    signEngine.updateScene(state, fontMap);
    const signUrl = signEngine.capturePng(1200, 750);
    state.scene.transparentBg = prevT;
    signEngine.updateScene(state, fontMap);
    photomontageOverlay.render(state, signUrl);
  } else {
    photomontageOverlay.container.classList.add('hidden');
  }
}

function updateNumericBar(state) {
  const sel = state.objects.find(o => state.selectedIds.includes(o.id));
  const dis = !sel || sel.locked;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.activeElement !== el) el.value = val ?? '';
    el.disabled = dis;
  };
  setVal('numX', Math.round(sel?.xMm ?? 0));
  setVal('numY', Math.round(sel?.yMm ?? 0));
  setVal('numH', Math.round(sel?.heightMm ?? 400));
  setVal('numD', Math.round(sel?.depthMm ?? 80));
  setVal('numRot', Math.round(sel?.rotationDeg ?? 0));
  setVal('numScale', Number((sel?.scaleX ?? 1).toFixed(2)));
  setVal('numSpacing', Math.round(sel?.letterSpacingMm ?? 8));
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

  // Measure tool preview
  if (tool === 'measure' && measurePoints.length) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(measurePoints[0].sx, measurePoints[0].sy);
    const end = measurePoints[1] || measurePoints[0];
    ctx.lineTo(end.sx, end.sy);
    ctx.stroke();
    if (measurePoints.length === 2) {
      const dx = measurePoints[1].mmX - measurePoints[0].mmX;
      const dy = measurePoints[1].mmY - measurePoints[0].mmY;
      const dist = Math.hypot(dx, dy);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect((measurePoints[0].sx + end.sx) / 2 - 45, (measurePoints[0].sy + end.sy) / 2 - 12, 90, 20);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${dist.toFixed(1)} mm`, (measurePoints[0].sx + end.sx) / 2 - 36, (measurePoints[0].sy + end.sy) / 2 + 2);
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
function renderActiveWorkspace() {
  const state = store.get();
  const ws = state.activeWorkspace;
  document.querySelectorAll('#workspaceTabs button').forEach(b => b.classList.toggle('on', b.dataset.ws === ws));

  const root = document.getElementById('workspaceContent');
  if (!root) return;

  if (ws === 'design') root.innerHTML = renderDesignWs(state);
  else if (ws === 'materials') root.innerHTML = renderMaterialsWs(state);
  else if (ws === 'lighting') root.innerHTML = renderLightingWs(state);
  else if (ws === 'layers') root.innerHTML = renderLayersWs(state);
  else if (ws === 'background') root.innerHTML = renderBackgroundWs(state);
  else if (ws === 'nesting') root.innerHTML = renderNestingWs(state);
  else if (ws === 'cost') root.innerHTML = renderCostWs(state);
  else if (ws === 'quote') root.innerHTML = renderQuoteWs(state);
  else if (ws === 'projects') root.innerHTML = renderProjectsWs(state);

  bindWorkspaceEvents(ws, root);
}

function getSelectedOrFirst(state) {
  return state.objects.find(o => state.selectedIds.includes(o.id)) || state.objects[0];
}

function renderDesignWs(state) {
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

    <section class="sec">
      <h3 class="sec-title">2. Yazı ve Yazı Tipi <small>Türkçe ŞİĞÜÇÖ tam destekli</small></h3>
      <input id="wsTextIn" class="text-in" type="text" value="${escapeAttr(obj?.kind === 'text' ? obj.text : '')}" placeholder="Tabela yazısını girin..." ${obj?.kind !== 'text' ? 'disabled' : ''}>
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
    </section>

    <section class="sec">
      <h3 class="sec-title">3. Ölçüler (mm)</h3>
      <div class="field-row">
        <label>Harf Yüksekliği (mm)</label>
        <input id="wsHeightMm" type="number" min="50" max="2500" step="10" value="${Math.round(obj?.heightMm || state.dimensions.heightMm)}">
      </div>
      <div class="field-row">
        <label>Kutu Derinliği (mm)</label>
        <input id="wsDepthMm" type="number" min="15" max="300" step="5" value="${Math.round(obj?.depthMm || state.dimensions.depthMm)}">
      </div>
      <div class="field-row">
        <label>Harf Aralığı (mm)</label>
        <input id="wsSpacingMm" type="number" min="-20" max="150" step="1" value="${Math.round(obj?.letterSpacingMm ?? state.dimensions.letterSpacingMm)}">
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

function renderMaterialsWs(state) {
  const obj = getSelectedOrFirst(state);
  const faceId = obj?.faceMaterial || state.materials.faceId;
  const sideId = obj?.sideMaterial || state.materials.sideId;
  const fileId = obj?.fileMaterial || state.fileli.fileMaterial;
  const facePreset = MATERIAL_PRESETS[faceId] || MATERIAL_PRESETS.aynaAltin;
  const sideFollows = obj?.sideFollowsFace ?? state.materials.sideFollowsFace;

  return `
    <section class="sec">
      <h3 class="sec-title">Ön Yüzey / File Materyali</h3>
      <div class="mat-grid">
        ${Object.values(MATERIAL_PRESETS).map(m => `
          <button type="button" class="mat-btn ${faceId === m.id ? 'on' : ''}" data-face-mat="${m.id}">
            <i style="background:${m.swatch}"></i>
            <span>${m.shortLabel}</span>
          </button>
        `).join('')}
      </div>
      <div class="field-row" style="margin-top:8px">
        <label>Özel Yüzey Rengi</label>
        <input id="faceColorPicker" type="color" value="${obj?.faceColor || facePreset.color}">
      </div>
      ${facePreset.colorable ? `
        <div class="swatches">
          ${(facePreset.palette === 'pleksi' ? ACRYLIC_PALETTE : PAINT_PALETTE).map(p => `
            <button type="button" class="sw" style="--c:${p.hex}" data-face-hex="${p.hex}" title="${p.label}"></button>
          `).join('')}
        </div>
      ` : ''}
    </section>

    <section class="sec">
      <h3 class="sec-title">Yan Bant (Dönüş) &amp; File Çerçeve</h3>
      <div class="field-row">
        <label>Yan bant ön yüzeyle aynı olsun</label>
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
      <div class="field-row"><label>Fırçalama Yönü (°)</label><input id="ovrBrushDir" type="number" min="0" max="180" step="15" value="${state.materialOverrides.brushDirection}"></div>
      <div class="field-row"><label>Fırçalama Ölçeği</label><input id="ovrBrushScale" type="number" min="1" max="20" step="1" value="${state.materialOverrides.brushScale}"></div>
      <div class="field-row"><label>Fırçalama Yoğunluğu</label><input id="ovrBrushInt" type="number" min="0" max="1.5" step="0.05" value="${state.materialOverrides.brushIntensity}"></div>
      <div class="field-row"><label>Pah Genişliği (mm)</label><input id="ovrBevel" type="number" min="0" max="6" step="0.2" value="${state.materialOverrides.bevelMm}"></div>
      <div class="field-row"><label>Pleksi Opaklık</label><input id="ovrAcOpacity" type="number" min="0.2" max="1" step="0.02" value="${state.materialOverrides.acrylicOpacity}"></div>
    </section>

    <section class="sec">
      <h3 class="sec-title">HDR / Stüdyo Yansıma Ortamı</h3>
      <div class="chips" style="margin-bottom:8px">
        ${Object.values(ENVIRONMENT_PRESETS).map(e => `
          <button type="button" class="chip ${state.render.envPreset === e.id && !state.render.useCustomEnv ? 'on' : ''}" data-env="${e.id}">${e.label}</button>
        `).join('')}
      </div>
      <div class="field-row"><label>Ortam Döndürme (°)</label><input id="ovrEnvRot" type="number" min="0" max="360" step="15" value="${state.render.envRotationDeg}"></div>
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
        <input id="chkLightEnabled" type="checkbox" ${state.lighting.enabled ? 'checked' : ''}>
      </div>
    </section>

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

    <section class="sec">
      <h3 class="sec-title">Gelişmiş Işık &amp; Halo Ayarları</h3>
      <div class="field-row"><label>Ön Yüz Işık Şiddeti</label><input id="lFrontInt" type="number" min="0" max="3" step="0.1" value="${state.lighting.frontIntensity}"></div>
      <div class="field-row"><label>Arka Halo Şiddeti</label><input id="lBackInt" type="number" min="0" max="3" step="0.1" value="${state.lighting.backIntensity}"></div>
      <div class="field-row"><label>Duvardan Uzaklık (mm)</label><input id="lWallDist" type="number" min="5" max="150" step="5" value="${state.lighting.wallDistanceMm}"></div>
      <div class="field-row"><label>Halo Yayılımı</label><input id="lHaloSpread" type="number" min="0.3" max="2.5" step="0.1" value="${state.lighting.haloSpread}"></div>
      <div class="field-row"><label>Işık Sönümlemesi (Falloff)</label><input id="lFalloff" type="number" min="0.3" max="2.5" step="0.1" value="${state.lighting.falloff}"></div>
    </section>
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
      <div class="chips">
        ${BACKGROUND_SCENES.map(b => `
          <button type="button" class="chip ${state.scene.wallId === b.id ? 'on' : ''}" data-bg-wall="${b.id}">${b.label}</button>
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
          <button type="button" id="btnExportPm" class="cta-btn">Fotomontaj Sunum PNG İndir</button>
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
      <div class="field-row"><label>Plaka Genişliği (mm)</label><input id="nestW" type="number" min="300" max="6000" step="50" value="${n.sheetWidthMm}"></div>
      <div class="field-row"><label>Plaka Yüksekliği (mm)</label><input id="nestH" type="number" min="300" max="4000" step="50" value="${n.sheetHeightMm}"></div>
      <div class="field-row"><label>Kenar Payı (mm)</label><input id="nestMargin" type="number" min="0" max="100" step="1" value="${n.marginMm}"></div>
      <div class="field-row"><label>Kesim Boşluğu (mm)</label><input id="nestClear" type="number" min="1" max="50" step="0.5" value="${n.clearanceMm}"></div>
      <div class="field-row"><label>Kerf / Lazer Payı (mm)</label><input id="nestKerf" type="number" min="0" max="5" step="0.1" value="${n.kerfMm}"></div>
      <div class="field-row"><label>Kopya Adedi</label><input id="nestCopies" type="number" min="1" max="50" step="1" value="${n.copies}"></div>
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
          <option value="all" ${n.targetPart === 'all' ? 'selected' : ''}>Tüm Parçalar</option>
          <option value="acrylic" ${n.targetPart === 'acrylic' ? 'selected' : ''}>Yalnız Pleksi</option>
          <option value="file" ${n.targetPart === 'file' ? 'selected' : ''}>Yalnız File</option>
          <option value="outer" ${n.targetPart === 'outer' ? 'selected' : ''}>Yalnız Ana Gövde</option>
        </select>
      </div>
      <button type="button" id="btnRunNesting" class="cta-btn">Gerçek Şekil Nesting Hesapla</button>
    </section>

    ${lastNesting ? `
    <section class="sec">
      <h3 class="sec-title">Nesting Sonuçları <small>${lastNesting.sheetCount} Plaka</small></h3>
      <p style="font-size:12px;margin:0 0 8px">
        Verimlilik: <strong>%${lastNesting.overallUtilizationPct.toFixed(1)}</strong> ·
        Fire: <strong>${lastNesting.totalScrapM2.toFixed(2)} m²</strong> ·
        İç İçe Geçme: <strong>${lastNesting.interlockedPairs} çift</strong>
      </p>
      ${lastNesting.sheets.map(sh => `
        <div style="margin-bottom:10px">
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">
            Plaka #${sh.index} (${sh.widthMm}×${sh.heightMm} mm) — %${sh.utilizationPct.toFixed(1)} dolu · ${sh.placements.length} parça
          </div>
          ${renderNestingSvg(sh, selectedNestingId)}
        </div>
      `).join('')}
      ${selectedNestingId ? `
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" class="sec-btn" data-nest-nudge="-20,0">← 20mm</button>
          <button type="button" class="sec-btn" data-nest-nudge="20,0">20mm →</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,20">↑ 20mm</button>
          <button type="button" class="sec-btn" data-nest-nudge="0,-20">↓ 20mm</button>
        </div>
      ` : '<p style="font-size:11px;color:var(--muted);margin:4px 0 0">Manuel kaydırmak için plaka üzerindeki bir parçaya tıklayın.</p>'}
    </section>
    ` : ''}
  `;
}

function renderCostWs(state) {
  const cfg = state.costConfig;
  const curr = lastCosts.currency;
  return `
    <section class="sec">
      <h3 class="sec-title">İmalat Metrajı (Gerçek Geometri)</h3>
      <table class="cost-table">
        <tr><td>Toplam Ölçü</td><td>${lastMetrics.totalWidthMm} × ${lastMetrics.totalHeightMm} mm</td></tr>
        <tr><td>Pleksi Alanı</td><td>${lastMetrics.acrylicAreaM2.toFixed(3)} m²</td></tr>
        <tr><td>File Alanı</td><td>${lastMetrics.fileAreaM2.toFixed(3)} m²</td></tr>
        <tr><td>Yan Bant Alanı</td><td>${lastMetrics.sidewallAreaM2.toFixed(3)} m²</td></tr>
        <tr><td>Toplam Kesim Metrajı</td><td>${lastMetrics.cuttingLengthM.toFixed(2)} m</td></tr>
        <tr><td>LED Modül / Trafo</td><td>${lastMetrics.totalLedModules} adet / ${lastMetrics.powerSupplies} trafo</td></tr>
      </table>
    </section>

    <section class="sec">
      <h3 class="sec-title">Para Birimi, Kar &amp; Montaj</h3>
      <div class="field-row">
        <label>Para Birimi</label>
        <select id="costCurrency">
          <option value="TRY" ${cfg.currency === 'TRY' ? 'selected' : ''}>TRY (₺)</option>
          <option value="USD" ${cfg.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="EUR" ${cfg.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
        </select>
      </div>
      <div class="field-row"><label>USD Kuru (₺)</label><input id="rateUsd" type="number" step="0.1" value="${cfg.rates.USD}"></div>
      <div class="field-row"><label>EUR Kuru (₺)</label><input id="rateEur" type="number" step="0.1" value="${cfg.rates.EUR}"></div>
      <div class="field-row">
        <label>Fiyatlandırma Yöntemi</label>
        <select id="pricingMode">
          <option value="markup" ${cfg.pricingMode === 'markup' ? 'selected' : ''}>Kar Payı (Markup %)</option>
          <option value="margin" ${cfg.pricingMode === 'margin' ? 'selected' : ''}>Kar Marjı (Margin %)</option>
        </select>
      </div>
      <div class="field-row">
        <label>${cfg.pricingMode === 'margin' ? 'Kar Marjı (%)' : 'Kar Payı (%)'}</label>
        <input id="profitPct" type="number" min="0" max="90" step="1" value="${cfg.pricingMode === 'margin' ? cfg.marginPct : cfg.markupPct}">
      </div>
      <div class="field-row"><label>Genel Gider (%)</label><input id="overheadPct" type="number" min="0" max="100" value="${cfg.overheadPct}"></div>
      <div class="field-row"><label>İndirim (%)</label><input id="discountPct" type="number" min="0" max="80" value="${cfg.discountPct}"></div>
      <div class="field-row">
        <label>Montaj Tipi</label>
        <select id="mountingId">
          <option value="duvar" ${cfg.mountingId === 'duvar' ? 'selected' : ''}>Duvara Direkt Montaj</option>
          <option value="profil" ${cfg.mountingId === 'profil' ? 'selected' : ''}>Arka Profil (Ray) Üzerine</option>
          <option value="yok" ${cfg.mountingId === 'yok' ? 'selected' : ''}>Montajsız (Sadece Üretim)</option>
        </select>
      </div>
    </section>

    <section class="sec">
      <h3 class="sec-title">Maliyet Kalemleri</h3>
      <table class="cost-table">
        ${lastCosts.lines.map(l => `<tr><td>${l.label} <small style="color:var(--muted)">(${l.qty})</small></td><td>${formatMoney(l.amount, curr)}</td></tr>`).join('')}
        <tr><td><strong>Toplam Üretim Maliyeti</strong></td><td><strong>${formatMoney(lastCosts.totalCost, curr)}</strong></td></tr>
        <tr><td>Kar (${cfg.pricingMode === 'margin' ? 'Marj' : 'Markup'})</td><td>${formatMoney(lastCosts.profitAmount, curr)}</td></tr>
        <tr><td>KDV (%${Math.round(cfg.vatRate * 100)})</td><td>${formatMoney(lastCosts.vatAmount, curr)}</td></tr>
        <tr><td><strong>Genel Toplam</strong></td><td><strong style="color:var(--accent)">${formatMoney(lastCosts.grandTotal, curr)}</strong></td></tr>
      </table>
    </section>
  `;
}

function renderQuoteWs(state) {
  const q = state.quote;
  return `
    <section class="sec">
      <h3 class="sec-title">Müşteri Teklif Formu</h3>
      <div class="field-row"><label>Firma Adınız</label><input id="qCompName" type="text" value="${escapeAttr(q.companyName)}"></div>
      <div class="field-row"><label>Müşteri Adı</label><input id="qCustName" type="text" value="${escapeAttr(q.customerName)}"></div>
      <div class="field-row"><label>Müşteri Firma</label><input id="qCustComp" type="text" value="${escapeAttr(q.customerCompany)}"></div>
      <div class="field-row"><label>Teslimat Şartı</label><input id="qDelivery" type="text" value="${escapeAttr(q.deliveryTerms)}"></div>
      <div class="field-row"><label>Üretim Süresi (Gün)</label><input id="qDays" type="number" min="1" max="90" value="${q.productionDays}"></div>
      <div class="field-row"><label>Geçerlilik (Gün)</label><input id="qValid" type="number" min="1" max="90" value="${q.validityDays}"></div>
      <div class="field-row">
        <label>Teklif Fiyatını Kilitle</label>
        <input id="qLock" type="checkbox" ${q.locked ? 'checked' : ''}>
      </div>
      <button type="button" id="btnPrintQuote" class="cta-btn">PDF Müşteri Teklifi Oluştur</button>
    </section>
  `;
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
  if (ws === 'design') {
    root.querySelectorAll('[data-ctype]').forEach(b => b.onclick = () => {
      mutate('Yapı tipi değiştirildi', s => {
        s.constructionType = b.dataset.ctype;
        const o = getSelectedOrFirst(s);
        if (o && !o.locked) o.constructionType = b.dataset.ctype;
      });
    });

    const textIn = root.querySelector('#wsTextIn');
    if (textIn) textIn.oninput = (e) => {
      mutate('Yazı güncellendi', s => {
        const o = getSelectedOrFirst(s);
        if (o && o.kind === 'text' && !o.locked) o.text = e.target.value;
      }, false);
    };

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
      if (res.fonts.length) {
        const entry = await fontManager.activateBrowserLocalFont(res.fonts[0].fontData);
        mutate('Sistem fontu seçildi', s => {
          const o = getSelectedOrFirst(s);
          if (o && o.kind === 'text' && !o.locked) o.fontId = entry.id;
        });
      } else {
        renderActiveWorkspace();
      }
    });

    const bindNum = (id, fn) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('Ölçü değiştirildi', s => fn(s, Number(e.target.value))));
    bindNum('wsHeightMm', (s, v) => {
      const val = Math.max(30, Math.min(3000, v || 400));
      s.dimensions.heightMm = val;
      const o = getSelectedOrFirst(s);
      if (o && !o.locked) o.heightMm = val;
    });
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
    bindNum('wsBorderBevelMm', (s, v) => { s.fileli.borderBevelMm = Math.max(0, v || 0); });
    bindNum('wsAcrylicInsetMm', (s, v) => { s.fileli.acrylicInsetMm = Math.max(0, v || 0); });
    bindNum('wsAcrylicThickMm', (s, v) => { s.fileli.acrylicThicknessMm = Math.max(1, v || 3); });

    root.querySelector('#logoThreshold')?.addEventListener('input', e => { logoTraceOptions.threshold = Number(e.target.value); });
    root.querySelector('#logoBgTol')?.addEventListener('input', e => { logoTraceOptions.bgTolerance = Number(e.target.value); });
    root.querySelector('#logoSmooth')?.addEventListener('change', e => { logoTraceOptions.smoothPasses = Number(e.target.value); });
    root.querySelector('#logoFileInput')?.addEventListener('change', e => handleLogoUpload(e.target.files?.[0]));
  } else if (ws === 'materials') {
    root.querySelectorAll('[data-face-mat]').forEach(b => b.onclick = () => {
      const id = b.dataset.faceMat;
      const preset = MATERIAL_PRESETS[id];
      mutate('Yüz materyali', s => {
        s.materials.faceId = id;
        s.materials.faceColor = preset.color;
        s.materialOverrides.metalness = null;
        s.materialOverrides.roughness = null;
        assignMaterialToSelected(s, { faceMaterial: id, faceColor: preset.color });
      });
    });
    root.querySelector('#faceColorPicker')?.addEventListener('input', e => {
      mutate('Yüz rengi', s => {
        s.materials.faceColor = e.target.value;
        assignMaterialToSelected(s, { faceColor: e.target.value });
      }, false);
    });
    root.querySelectorAll('[data-face-hex]').forEach(b => b.onclick = () => {
      mutate('Yüz rengi', s => {
        s.materials.faceColor = b.dataset.faceHex;
        assignMaterialToSelected(s, { faceColor: b.dataset.faceHex });
      });
    });
    root.querySelector('#chkSideFollows')?.addEventListener('change', e => {
      mutate('Yan yüzey senkronizasyonu', s => {
        s.materials.sideFollowsFace = e.target.checked;
        assignMaterialToSelected(s, { sideFollowsFace: e.target.checked });
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
    bindOvr('ovrBevel', (s, v) => { s.materialOverrides.bevelMm = v; });
    bindOvr('ovrAcOpacity', (s, v) => { s.materialOverrides.acrylicOpacity = v; });
    bindOvr('ovrEnvRot', (s, v) => { s.render.envRotationDeg = v; });

    root.querySelectorAll('[data-env]').forEach(b => b.onclick = () => {
      mutate('Yansıma ortamı', s => {
        s.render.envPreset = b.dataset.env;
        s.render.useCustomEnv = false;
      });
    });
    root.querySelector('#customEnvUpload')?.addEventListener('change', async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      await signEngine.envManager.loadCustomEnvironment(f);
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
    const bindL = (id, key) => root.querySelector('#' + id)?.addEventListener('change', e => mutate('Işık ayarı', s => { s.lighting[key] = Number(e.target.value); }, false));
    bindL('lFrontInt', 'frontIntensity');
    bindL('lBackInt', 'backIntensity');
    bindL('lWallDist', 'wallDistanceMm');
    bindL('lHaloSpread', 'haloSpread');
    bindL('lFalloff', 'falloff');
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
    bindN('nestW', 'sheetWidthMm');
    bindN('nestH', 'sheetHeightMm');
    bindN('nestMargin', 'marginMm');
    bindN('nestClear', 'clearanceMm');
    bindN('nestKerf', 'kerfMm');
    bindN('nestCopies', 'copies');
    root.querySelector('#nestAngleStep')?.addEventListener('change', e => store.update(s => { s.nesting.fineAngleStep = Number(e.target.value); }));
    root.querySelector('#nestTarget')?.addEventListener('change', e => store.update(s => { s.nesting.targetPart = e.target.value; }));
    root.querySelector('#btnRunNesting')?.addEventListener('click', () => {
      const s = store.get();
      const items = extractNestingItems(lastSceneResult.metricsList, s);
      lastNesting = runTrueShapeNesting(items, s.nesting);
      selectedNestingId = null;
      renderActiveWorkspace();
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
        }
      }
      renderActiveWorkspace();
    });
  } else if (ws === 'cost') {
    root.querySelector('#costCurrency')?.addEventListener('change', e => mutate('Para birimi', s => { s.costConfig.currency = e.target.value; }));
    root.querySelector('#rateUsd')?.addEventListener('change', e => mutate('USD kuru', s => { s.costConfig.rates.USD = Number(e.target.value); }));
    root.querySelector('#rateEur')?.addEventListener('change', e => mutate('EUR kuru', s => { s.costConfig.rates.EUR = Number(e.target.value); }));
    root.querySelector('#pricingMode')?.addEventListener('change', e => mutate('Fiyatlandırma yöntemi', s => { s.costConfig.pricingMode = e.target.value; }));
    root.querySelector('#profitPct')?.addEventListener('change', e => mutate('Kar oranı', s => {
      if (s.costConfig.pricingMode === 'margin') s.costConfig.marginPct = Number(e.target.value);
      else s.costConfig.markupPct = Number(e.target.value);
    }));
    root.querySelector('#overheadPct')?.addEventListener('change', e => mutate('Genel gider', s => { s.costConfig.overheadPct = Number(e.target.value); }));
    root.querySelector('#discountPct')?.addEventListener('change', e => mutate('İndirim', s => { s.costConfig.discountPct = Number(e.target.value); }));
    root.querySelector('#mountingId')?.addEventListener('change', e => mutate('Montaj tipi', s => { s.costConfig.mountingId = e.target.value; }));
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
    root.querySelector('#btnPrintQuote')?.addEventListener('click', () => {
      const previewUrl = signEngine.capturePng(1200, 750);
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
      const loaded = deserializeProject(await f.text());
      history.push(store.get(), 'Proje yükle');
      store.set(loaded);
      scheduleRebuild(true);
      renderActiveWorkspace();
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

/* ---------------- Bootstrap ---------------- */
function init() {
  const threeContainer = document.getElementById('threeContainer');
  signEngine = new SignEngine(threeContainer, {
    onSelectObject: (layerId, additive) => {
      store.update(s => { s.selectedIds = selectLayer(s, layerId, additive); });
      updateNumericBar(store.get());
      if (store.get().activeWorkspace === 'layers') renderActiveWorkspace();
    },
  });

  photomontageOverlay = new PhotomontageOverlay(document.getElementById('photomontageLayer'), (corners) => {
    store.update(s => { s.photomontage.cornersNorm = corners; });
  });

  // Workspace tabs
  document.querySelectorAll('#workspaceTabs button').forEach(b => b.onclick = () => {
    store.update(s => { s.activeWorkspace = b.dataset.ws; });
    updateStageChrome(store.get());
    renderActiveWorkspace();
  });

  // Camera view presets
  document.querySelectorAll('.stage-views button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.stage-views button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    signEngine.setCameraPreset(b.dataset.view);
  });

  // Day/Night & Light & Walls
  document.getElementById('btnDay').onclick = () => mutate('Gündüz modu', s => { s.scene.night = false; });
  document.getElementById('btnNight').onclick = () => mutate('Gece modu', s => { s.scene.night = true; });
  document.getElementById('btnLightToggle').onclick = () => mutate('Işık aç/kapat', s => { s.lighting.enabled = !s.lighting.enabled; });
  document.querySelectorAll('#quickWallSeg button').forEach(b => b.onclick = () => mutate('Duvar seçimi', s => { s.scene.wallId = b.dataset.wall; }));

  // Project Name & Quality
  document.getElementById('projectNameInput').onchange = (e) => store.update(s => { s.projectName = e.target.value; });
  document.getElementById('qualitySelect').onchange = (e) => mutate('Kalite ayarı', s => { s.quality = e.target.value; }, false);

  // Undo / Redo
  document.getElementById('btnUndo').onclick = () => {
    const prev = history.undo(store.get());
    if (prev) { store.set(prev); scheduleRebuild(true); renderActiveWorkspace(); updateUndoRedoButtons(); }
  };
  document.getElementById('btnRedo').onclick = () => {
    const next = history.redo(store.get());
    if (next) { store.set(next); scheduleRebuild(true); renderActiveWorkspace(); updateUndoRedoButtons(); }
  };

  // Exports
  document.getElementById('btnExportPng').onclick = () => {
    downloadDataUrl(`${store.get().projectName || 'tabela'}.png`, signEngine.capturePng(2400, 1500));
  };
  document.getElementById('btnExportTransparentPng').onclick = () => {
    const s = store.get();
    s.scene.transparentBg = true;
    signEngine.updateScene(s, fontMap);
    const url = signEngine.capturePng(2400, 1500);
    s.scene.transparentBg = false;
    signEngine.updateScene(s, fontMap);
    downloadDataUrl(`${s.projectName || 'tabela'}_seffaf.png`, url);
  };
  document.getElementById('btnExportSvg').onclick = () => {
    downloadBlob(`${store.get().projectName || 'tabela'}.svg`, generateManufacturingSvg(lastSceneResult.metricsList), 'image/svg+xml');
  };
  document.getElementById('btnExportDxf').onclick = () => {
    const { dxfText, cncWarning } = generateManufacturingDxf(lastSceneResult.metricsList);
    downloadBlob(`${store.get().projectName || 'tabela'}.dxf`, dxfText, 'application/dxf');
    const warnEl = document.getElementById('stageWarning');
    warnEl.textContent = cncWarning;
    warnEl.classList.remove('hidden');
  };
  document.getElementById('btnSaveJson').onclick = () => {
    downloadBlob(`${store.get().projectName || 'tabela'}.khs.json`, serializeProject(store.get()), 'application/json');
  };

  // Shortcuts Help Modal
  const modal = document.getElementById('shortcutsModal');
  document.getElementById('shortcutsBody').innerHTML = SHORTCUT_LIST.map(s => `
    <div class="shortcut-row"><span>${s.label}</span><kbd>${s.keys}</kbd></div>
  `).join('');
  document.getElementById('btnShortcutsHelp').onclick = () => modal.classList.remove('hidden');
  document.getElementById('btnCloseShortcuts').onclick = () => modal.classList.add('hidden');

  // Left CAD Rail Tools & Actions
  document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.onclick = () => activateTool(b.dataset.tool));
  document.querySelectorAll('.cad-rail [data-action]').forEach(b => b.onclick = () => runCadAction(b.dataset.action));

  // Numeric Property Bar
  const bindProp = (id, fn) => document.getElementById(id).onchange = (e) => mutate('Sayısal düzenleme', s => {
    const o = getSelectedOrFirst(s);
    if (o && !o.locked) fn(o, Number(e.target.value));
  });
  bindProp('numX', (o, v) => { o.xMm = v; });
  bindProp('numY', (o, v) => { o.yMm = v; });
  bindProp('numH', (o, v) => { o.heightMm = Math.max(20, v); });
  bindProp('numD', (o, v) => { o.depthMm = Math.max(10, v); });
  bindProp('numRot', (o, v) => { o.rotationDeg = v; });
  bindProp('numScale', (o, v) => {
    const val = Math.max(0.1, v);
    o.scaleX = val;
    if (o.proportionalLock) o.scaleY = val;
  });
  bindProp('numSpacing', (o, v) => { o.letterSpacingMm = v; });

  document.querySelectorAll('[data-align]').forEach(b => b.onclick = () => mutate('Hizalama', s => alignSelectedObjects(s, b.dataset.align)));
  document.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => mutate('Dağıtma', s => distributeSelectedObjects(s, b.dataset.dist)));

  // Interactive CAD Overlay clicks (Pen, Node, Measure)
  const overlay = document.getElementById('cadOverlay');
  overlay.addEventListener('click', (e) => {
    const rect = overlay.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const mmX = (sx - overlay.width / 2) * 2;
    const mmY = (overlay.height / 2 - sy) * 2;
    const tool = store.get().activeTool;

    if (tool === 'pen') {
      if (penPoints.length >= 3 && Math.hypot(sx - penPoints[0].sx, sy - penPoints[0].sy) < 14) {
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
        penPoints.push({ sx, sy, mmX, mmY });
        drawCadOverlay(store.get());
      }
    } else if (tool === 'measure') {
      if (measurePoints.length >= 2) measurePoints = [];
      measurePoints.push({ sx, sy, mmX, mmY });
      drawCadOverlay(store.get());
    }
  });

  // Keyboard Shortcuts
  attachShortcuts({
    onTool: activateTool,
    onDuplicate: () => runCadAction('duplicate'),
    onUndo: () => document.getElementById('btnUndo').click(),
    onRedo: () => document.getElementById('btnRedo').click(),
    onDelete: () => runCadAction('delete'),
    onCopy: () => {
      const s = store.get();
      clipboardObjects = s.objects.filter(o => s.selectedIds.includes(o.id)).map(structuredCloneSafe);
    },
    onCut: () => {
      const s = store.get();
      clipboardObjects = s.objects.filter(o => s.selectedIds.includes(o.id) && !o.locked).map(structuredCloneSafe);
      mutate('Kes', st => deleteSelectedLayers(st));
    },
    onPaste: () => {
      if (!clipboardObjects.length) return;
      mutate('Yapıştır', s => {
        const ids = [];
        for (const c of clipboardObjects) {
          const copy = structuredCloneSafe(c);
          copy.id = createObjectId('obj');
          copy.xMm = (copy.xMm || 0) + 40;
          copy.yMm = (copy.yMm || 0) - 40;
          s.objects.push(copy);
          ids.push(copy.id);
        }
        s.selectedIds = ids;
      });
    },
    onSave: () => {
      saveProjectToBrowser(store.get().projectName, store.get());
    },
    onSelectAll: () => {
      store.update(s => { s.selectedIds = s.objects.map(o => o.id); });
      renderActiveWorkspace();
    },
    onEscape: () => {
      penPoints = [];
      measurePoints = [];
      store.update(s => { s.activeTool = 'select'; });
      drawCadOverlay(store.get());
    },
    onNudge: (dx, dy) => {
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

  updateUndoRedoButtons();
  scheduleRebuild(true);
  renderActiveWorkspace();
}

function activateTool(tool) {
  document.querySelectorAll('.cad-rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'rect' || tool === 'ellipse' || tool === 'text') {
    mutate(`${tool} eklendi`, s => {
      const obj = createShapeObject(tool, s, { xMm: (s.objects.length % 4) * 80 - 80, yMm: -180 });
      s.objects.push(obj);
      s.selectedIds = [obj.id];
      s.activeTool = 'select';
    });
    return;
  }
  if (tool === 'logo') {
    document.querySelector('[data-ws="design"]').click();
    setTimeout(() => document.getElementById('logoFileInput')?.click(), 50);
    return;
  }
  if (tool === 'zoom') {
    signEngine.zoomBy(0.85);
    return;
  }
  store.update(s => { s.activeTool = tool; });
  drawCadOverlay(store.get());
}

function runCadAction(action) {
  if (action === 'duplicate') mutate('Çoğalt', s => duplicateSelectedLayers(s));
  else if (action === 'delete') mutate('Sil', s => deleteSelectedLayers(s));
  else if (action === 'mirrorX') mutate('Yatay aynala', s => mirrorSelectedObjects(s, 'x'));
  else if (action === 'mirrorY') mutate('Dikey aynala', s => mirrorSelectedObjects(s, 'y'));
  else if (action === 'toCurves') {
    mutate('Eğriye çevir', s => {
      s.objects = s.objects.map(o => (s.selectedIds.includes(o.id) ? (convertObjectToCurves(o, fontMap) || o) : o));
    });
  } else if (action === 'union' || action === 'difference' || action === 'intersection') {
    mutate('Boolean', s => applyBooleanToSelected(s, action, fontMap));
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

init();
