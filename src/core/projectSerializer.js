import { createDefaultState, structuredCloneSafe, markImmutableGeometry } from './state.js';

/**
 * Versioned Project Serialization, Migration, Autosave & Local Project Library
 */

const CURRENT_SCHEMA_VERSION = 2;
const PROJECTS_STORAGE_KEY = 'khs_saved_projects_v2';
const AUTOSAVE_KEY = 'khs_autosave_v2';

export function serializeProject(state) {
  const payload = structuredCloneSafe(state);
  payload.schemaVersion = CURRENT_SCHEMA_VERSION;
  payload.savedAt = new Date().toISOString();
  return JSON.stringify(payload, null, 2);
}

/**
 * Validates and migrates older project JSON formats without losing unknown fields or uploaded assets.
 */
export function deserializeProject(jsonText) {
  let raw;
  try {
    raw = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch {
    throw new Error('Geçersiz proje JSON dosyası.');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Proje verisi okunamadı.');
  }

  const defaults = createDefaultState();
  const version = Number(raw.schemaVersion || 1);

  // Migrate v1 (legacy single-sign format) -> v2 (object-layer format)
  if (version < 2 && !Array.isArray(raw.objects)) {
    const migrated = { ...defaults, ...raw, schemaVersion: CURRENT_SCHEMA_VERSION };
    migrated.objects = [
      {
        ...defaults.objects[0],
        text: raw.text ?? defaults.objects[0].text,
        fontId: raw.fontId ?? defaults.objects[0].fontId,
        heightMm: raw.height ? Number(raw.height) * 10 : defaults.objects[0].heightMm,
        depthMm: raw.depthMm ?? defaults.objects[0].depthMm,
        faceMaterial: raw.faceId ?? defaults.objects[0].faceMaterial,
        sideMaterial: raw.sideId ?? defaults.objects[0].sideMaterial,
      },
    ];
    return migrated;
  }

  // Deep merge defaults while preserving all existing & unknown fields from raw
  const merged = deepMergePreserveUnknown(defaults, raw);
  merged.schemaVersion = CURRENT_SCHEMA_VERSION;
  for(const tab of merged.nesting?.importedTabs||[])if(Array.isArray(tab.items))markImmutableGeometry(tab.items);
  if (!Array.isArray(merged.objects)) merged.objects = defaults.objects;
  if (!Array.isArray(merged.selectedIds)) merged.selectedIds = [];
  return merged;
}

function deepMergePreserveUnknown(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      out[k] = deepMergePreserveUnknown(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function listSavedProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProjectToBrowser(name, state) {
  const projects = listSavedProjects();
  const id = state.projectId || 'proj_' + Date.now().toString(36);
  const entry = {
    id,
    name: name || state.projectName || 'Adsız Proje',
    savedAt: new Date().toISOString(),
    data: serializeProject({ ...state, projectId: id, projectName: name || state.projectName }),
  };
  const idx = projects.findIndex(p => p.id === id);
  if (idx >= 0) projects[idx] = entry;
  else projects.unshift(entry);
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, 30)));
  return entry;
}

export function deleteSavedProject(id) {
  const projects = listSavedProjects().filter(p => p.id !== id);
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  return projects;
}

const IDB_DB = 'khs_native_workspace_v3';
const IDB_STORE = 'autosave';
let autosaveTimer = null, pendingAutosave = null, dbPromise = null;
function openAutosaveDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IDB_STORE)) {
          request.result.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB açılamadı.'));
    }).catch(error => {
      console.warn('Nesting yerel depolama kullanılamıyor:', error);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}
/** Read locally stored large CAD jobs without localStorage's small quota. */
export async function readAutosaveIndexedDb() {
  try {
    const db = await openAutosaveDb();
    if (!db) return null;
    const data = await new Promise((resolve,reject) => {
      const tx = db.transaction(IDB_STORE,'readonly');
      const req = tx.objectStore(IDB_STORE).get('latest');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return data?.state ? deserializeProject(data.state) : null;
  } catch(error) {
    console.warn('Yerel otomatik kayıt okunamadı:', error);
    return null;
  }
}
async function persistAutosave(state) {
  const db = await openAutosaveDb();
  if (!db) {
    // Compatibility fallback when IndexedDB is unavailable (e.g. file://).
    try {localStorage.setItem(AUTOSAVE_KEY, serializeProject(state));}
    catch(error) {console.warn('Otomatik kayıt yapılamadı; proje JSON dosyasını dışa aktarın.',error);}
    return;
  }
  await new Promise((resolve,reject) => {
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put({savedAt:Date.now(),state},'latest');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error || new Error('IndexedDB otomatik kayıt hatası.'));
    tx.onabort=()=>reject(tx.error || new Error('IndexedDB otomatik kayıt iptal edildi.'));
  });
}
export function writeAutosave(state) {
  pendingAutosave=state;
  clearTimeout(autosaveTimer);
  // Do not JSON stringify megabytes of vector geometry on each scene render.
  autosaveTimer=setTimeout(() => {
    const snapshot=pendingAutosave;pendingAutosave=null;
    if(snapshot)persistAutosave(snapshot).catch(error => {
      console.warn('Nesting otomatik kayıt hatası; projeyi dosya olarak da kaydedin.',error);
    });
  },500);
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserializeProject(raw) : null;
  } catch {
    return null;
  }
}
