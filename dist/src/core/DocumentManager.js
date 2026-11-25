import { createDefaultState, createObjectId, StateStore, structuredCloneSafe } from './state.js';
import { HistoryManager } from './history.js';
import { serializeProject } from './projectSerializer.js';

/**
 * Multi-Document & Multi-Page Manager (CorelDRAW-style Document Tabs + Page Tabs)
 * Each open document tab has its own independent StateStore, HistoryManager, pages,
 * objects, layers, nesting sheets, materials, and dirty flag.
 */
export class DocumentManager {
  constructor() {
    this.documents = [];
    this.activeDocId = null;
    this.listeners = new Set();

    const first = this._createDocEntry(createDefaultState(), 'Yeni Tabela Projesi');
    this.documents.push(first);
    this.activeDocId = first.id;
  }

  _createDocEntry(initialState, title) {
    const id = createObjectId('doc');
    const state = initialState || createDefaultState();
    state.projectName = title || state.projectName || 'Yeni Tabela Projesi';
    if (state.pages?.[0] && !state.pages[0].objects) {
      state.pages[0].objects = state.objects || [];
    }
    const store = new StateStore(state);
    const history = new HistoryManager(60);
    return {
      id,
      title: state.projectName,
      dirty: false,
      store,
      history,
      lastSavedJson: serializeProject(state),
    };
  }

  getActiveDoc() {
    return this.documents.find(d => d.id === this.activeDocId) || this.documents[0];
  }

  getActiveStore() {
    return this.getActiveDoc().store;
  }

  getActiveHistory() {
    return this.getActiveDoc().history;
  }

  markDirty(docId = this.activeDocId) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return;
    doc.title = doc.store.get().projectName || doc.title;
    doc.dirty = true;
    this._notify();
  }

  markSaved(docId = this.activeDocId) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return;
    doc.title = doc.store.get().projectName || doc.title;
    doc.lastSavedJson = serializeProject(doc.store.get());
    doc.dirty = false;
    this._notify();
  }

  newDocument(title = null) {
    const idx = this.documents.length + 1;
    const name = title || `Yeni Proje ${idx}`;
    const st = createDefaultState();
    st.projectName = name;
    const entry = this._createDocEntry(st, name);
    this.documents.push(entry);
    this.activeDocId = entry.id;
    this._notify();
    return entry;
  }

  openDocumentState(state, title = null) {
    const name = title || state.projectName || `Açılan Proje ${this.documents.length + 1}`;
    state.projectName = name;
    const entry = this._createDocEntry(state, name);
    this.documents.push(entry);
    this.activeDocId = entry.id;
    this._notify();
    return entry;
  }

  switchDocument(docId) {
    if (!this.documents.some(d => d.id === docId)) return false;
    this.activeDocId = docId;
    this._notify();
    return true;
  }

  renameDocument(docId, newTitle) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc || !newTitle?.trim()) return;
    doc.title = newTitle.trim();
    doc.store.update(s => { s.projectName = doc.title; });
    doc.dirty = true;
    this._notify();
  }

  closeDocument(docId, force = false) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return { closed: false };
    if (doc.dirty && !force) {
      return { closed: false, needsConfirm: true, title: doc.title };
    }
    if (this.documents.length <= 1) {
      const fresh = this._createDocEntry(createDefaultState(), 'Yeni Tabela Projesi');
      this.documents = [fresh];
      this.activeDocId = fresh.id;
      this._notify();
      return { closed: true };
    }
    const idx = this.documents.indexOf(doc);
    this.documents = this.documents.filter(d => d.id !== docId);
    if (this.activeDocId === docId) {
      this.activeDocId = this.documents[Math.max(0, idx - 1)].id;
    }
    this._notify();
    return { closed: true };
  }

  // ---- Page Operations within Active Document ----
  switchPage(pageId) {
    const doc = this.getActiveDoc();
    const st = doc.store.get();
    const target = st.pages.find(p => p.id === pageId);
    if (!target || st.activePageId === pageId) return false;
    doc.store.update(s => {
      // Save current objects into current page
      const cur = s.pages.find(p => p.id === s.activePageId);
      if (cur) cur.objects = structuredCloneSafe(s.objects);
      s.activePageId = pageId;
      const nextP = s.pages.find(p => p.id === pageId);
      s.objects = structuredCloneSafe(nextP.objects || []);
      s.selectedIds = s.objects.length ? [s.objects[0].id] : [];
      s.pageLayout.widthMm = nextP.widthMm || 2000;
      s.pageLayout.heightMm = nextP.heightMm || 1000;
    });
    this.markDirty();
    return true;
  }

  addPage(name = null) {
    const doc = this.getActiveDoc();
    doc.history.push(doc.store.get(), 'Sayfa eklendi');
    const newId = createObjectId('page');
    doc.store.update(s => {
      const cur = s.pages.find(p => p.id === s.activePageId);
      if (cur) cur.objects = structuredCloneSafe(s.objects);
      const n = s.pages.length + 1;
      const page = {
        id: newId,
        name: name || `Sayfa ${n}`,
        widthMm: s.pageLayout?.widthMm || 2000,
        heightMm: s.pageLayout?.heightMm || 1000,
        orientation: 'landscape',
        layers: [{ id: createObjectId('layer'), name: 'Katman 1', visible: true, locked: false, exportable: true }],
        objects: [],
      };
      s.pages.push(page);
      s.activePageId = newId;
      s.objects = [];
      s.selectedIds = [];
    });
    this.markDirty();
    return newId;
  }

  duplicatePage(pageId) {
    const doc = this.getActiveDoc();
    doc.history.push(doc.store.get(), 'Sayfa çoğaltıldı');
    const newId = createObjectId('page');
    doc.store.update(s => {
      const cur = s.pages.find(p => p.id === s.activePageId);
      if (cur) cur.objects = structuredCloneSafe(s.objects);
      const src = s.pages.find(p => p.id === pageId) || cur;
      if (!src) return;
      const clonedObjs = structuredCloneSafe(src.objects || []).map(o => ({ ...o, id: createObjectId('obj') }));
      const copy = {
        ...structuredCloneSafe(src),
        id: newId,
        name: `${src.name} (Kopya)`,
        objects: clonedObjs,
      };
      s.pages.push(copy);
      s.activePageId = newId;
      s.objects = clonedObjs;
      s.selectedIds = clonedObjs.length ? [clonedObjs[0].id] : [];
    });
    this.markDirty();
    return newId;
  }

  renamePage(pageId, newName) {
    if (!newName?.trim()) return;
    const doc = this.getActiveDoc();
    doc.history.push(doc.store.get(), 'Sayfa adı değiştirildi');
    doc.store.update(s => {
      const p = s.pages.find(x => x.id === pageId);
      if (p) p.name = newName.trim();
    });
    this.markDirty();
  }

  deletePage(pageId) {
    const doc = this.getActiveDoc();
    const st = doc.store.get();
    if (st.pages.length <= 1) return false;
    doc.history.push(st, 'Sayfa silindi');
    doc.store.update(s => {
      const idx = s.pages.findIndex(p => p.id === pageId);
      s.pages = s.pages.filter(p => p.id !== pageId);
      if (s.activePageId === pageId) {
        const next = s.pages[Math.max(0, idx - 1)];
        s.activePageId = next.id;
        s.objects = structuredCloneSafe(next.objects || []);
        s.selectedIds = s.objects.length ? [s.objects[0].id] : [];
      }
    });
    this.markDirty();
    return true;
  }

  moveSelectedToPage(targetPageId, copy = false) {
    const doc = this.getActiveDoc();
    const st = doc.store.get();
    if (st.activePageId === targetPageId || !st.selectedIds.length) return false;
    doc.history.push(st, copy ? 'Nesne sayfaya kopyalandı' : 'Nesne sayfaya taşındı');
    doc.store.update(s => {
      const target = s.pages.find(p => p.id === targetPageId);
      if (!target) return;
      const selSet = new Set(s.selectedIds);
      const moving = structuredCloneSafe(s.objects.filter(o => selSet.has(o.id)));
      if (copy) {
        moving.forEach(o => { o.id = createObjectId('obj'); });
      } else {
        s.objects = s.objects.filter(o => !selSet.has(o.id));
        s.selectedIds = s.objects.length ? [s.objects[0].id] : [];
      }
      target.objects = [...(target.objects || []), ...moving];
    });
    this.markDirty();
    return true;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn(this);
  }
}
