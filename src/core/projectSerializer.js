import { createDefaultState, structuredCloneSafe } from './state.js';

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

export function writeAutosave(state) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(state));
  } catch {
    // Ignore storage quota
  }
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserializeProject(raw) : null;
  } catch {
    return null;
  }
}
