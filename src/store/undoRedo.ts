import type { StoreApi } from "zustand";

/**
 * Lightweight undo/redo middleware for Zustand.
 * Tracks snapshots of serializable state slices (objects, gltfModels, htmlPanels, textureAssignments).
 */

export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushSnapshot: () => void;
}

interface Snapshot {
  objects: unknown[];
  gltfModels: unknown[];
  htmlPanels: unknown[];
  textureAssignments: unknown[];
}

const MAX_HISTORY = 50;

let past: Snapshot[] = [];
let future: Snapshot[] = [];
let storeRef: StoreApi<any> | null = null;

function takeSnapshot(state: any): Snapshot {
  return {
    objects: JSON.parse(JSON.stringify(state.objects)),
    gltfModels: JSON.parse(JSON.stringify(state.gltfModels)),
    htmlPanels: JSON.parse(JSON.stringify(state.htmlPanels)),
    textureAssignments: JSON.parse(JSON.stringify(state.textureAssignments)),
  };
}

function applySnapshot(snapshot: Snapshot) {
  if (!storeRef) return;
  storeRef.setState({
    objects: snapshot.objects,
    gltfModels: snapshot.gltfModels,
    htmlPanels: snapshot.htmlPanels,
    textureAssignments: snapshot.textureAssignments,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  });
}

export function initUndoRedo(store: StoreApi<any>) {
  storeRef = store;
  past = [];
  future = [];
  // Take initial snapshot
  past.push(takeSnapshot(store.getState()));
}

export function pushSnapshot() {
  if (!storeRef) return;
  const current = takeSnapshot(storeRef.getState());
  past.push(current);
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
  storeRef.setState({ canUndo: past.length > 1, canRedo: false });
}

export function undo() {
  if (!storeRef || past.length <= 1) return;
  const current = past.pop()!;
  future.push(current);
  const prev = past[past.length - 1];
  applySnapshot(prev);
}

export function redo() {
  if (!storeRef || future.length === 0) return;
  const next = future.pop()!;
  past.push(next);
  applySnapshot(next);
}
