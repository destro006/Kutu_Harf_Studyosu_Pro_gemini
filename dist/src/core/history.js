import { structuredCloneSafe } from './state.js';

/**
 * Command-History Undo / Redo Manager
 * Maintains clean, deterministic snapshots for Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
 */
export class HistoryManager {
  constructor(maxEntries = 60) {
    this.maxEntries = maxEntries;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Captures a snapshot before a mutating action, coalescing rapid bursts
   * with the same label (< 400 ms) to keep undo crisp and memory bounded.
   */
  push(state, label = 'İşlem') {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.label === label && now - top.timestamp < 400) {
      top.timestamp = now;
      this.redoStack.length = 0;
      return;
    }
    const snap = {
      label,
      timestamp: now,
      state: structuredCloneSafe(state),
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(currentState) {
    if (!this.undoStack.length) return null;
    const prev = this.undoStack.pop();
    this.redoStack.push({
      label: prev.label,
      timestamp: Date.now(),
      state: structuredCloneSafe(currentState),
    });
    return prev.state;
  }

  redo(currentState) {
    if (!this.redoStack.length) return null;
    const next = this.redoStack.pop();
    this.undoStack.push({
      label: next.label,
      timestamp: Date.now(),
      state: structuredCloneSafe(currentState),
    });
    return next.state;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
