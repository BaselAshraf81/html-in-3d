import { create } from "zustand";
import { initUndoRedo, pushSnapshot, undo, redo } from "./undoRedo";

export type MeshType = "box" | "sphere" | "plane" | "cylinder" | "torus" | "cone";
export type TransformMode = "translate" | "rotate" | "scale";
export type ToolMode = "select" | "translate" | "rotate" | "scale" | "geometry" | "material";

export interface SceneObject {
  id: string;
  name: string;
  type: MeshType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  visible: boolean;
  locked: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

// --- GLTF types ---
export interface ShellGeometryData {
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
  vertexCount: number;
}

export interface GltfMeshNode {
  name: string;
  uuid: string;
  meshName: string; // stable identifier (preserved across clones, unlike uuid)
  vertexCount: number;
  /** Shell geometry extracted at import time — only front-facing triangles with projected UVs */
  shell: ShellGeometryData;
}

export interface GltfModel {
  id: string;
  name: string;
  fileName: string;
  dataUrl: string; // kept empty after shell extraction — only populated for legacy/project loads
  meshNodes: GltfMeshNode[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  visible: boolean;
  locked: boolean;
  expanded: boolean; // UI state for hierarchy
}

// --- HTML Texture types ---
export interface HtmlPanel {
  id: string;
  name: string;
  htmlContent: string;
  width: number;
  height: number;
}

export type TextureMappingMode = "uv" | "projected";

/**
 * A texture assignment links an HtmlPanel to a target mesh.
 * targetType: "primitive" for SceneObject, "gltfMesh" for a mesh inside a GltfModel.
 * targetId: the SceneObject.id or GltfModel.id
 * meshName: only for gltfMesh — the mesh name within the GLTF (stable across clones)
 * mappingMode: "uv" uses the mesh's existing UV coordinates,
 *              "projected" generates planar-projected UVs from the front face
 */
export interface TextureAssignment {
  id: string;
  panelId: string;
  targetType: "primitive" | "gltfMesh";
  targetId: string;
  meshName?: string; // for gltfMesh targets — uses name, not uuid
  uvOffset: [number, number];
  uvRepeat: [number, number];
  uvRotation: number;
  mappingMode: TextureMappingMode;
}

interface StoreState {
  // Scene objects
  objects: SceneObject[];
  selectedObjectId: string | null;

  // GLTF models
  gltfModels: GltfModel[];
  selectedGltfId: string | null;

  // HTML texture panels & assignments
  htmlPanels: HtmlPanel[];
  textureAssignments: TextureAssignment[];
  selectedPanelId: string | null;

  // Context menu
  contextMenu: { x: number; y: number; targetType: "primitive" | "gltfMesh"; targetId: string; meshName?: string } | null;

  // Tool state
  toolMode: ToolMode;
  transformMode: TransformMode;

  // Primitive actions
  addObject: (type: MeshType) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  updateObjectTransform: (
    id: string,
    transform: Partial<Pick<SceneObject, "position" | "rotation" | "scale">>
  ) => void;
  updateObjectProperty: (
    id: string,
    props: Partial<SceneObject>
  ) => void;
  setToolMode: (mode: ToolMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  duplicateObject: (id: string) => void;

  // GLTF actions
  addGltfModel: (model: Omit<GltfModel, "id" | "position" | "rotation" | "scale" | "visible" | "locked" | "expanded">) => void;
  removeGltfModel: (id: string) => void;
  selectGltf: (id: string | null) => void;
  updateGltfTransform: (
    id: string,
    transform: Partial<Pick<GltfModel, "position" | "rotation" | "scale">>
  ) => void;
  updateGltfProperty: (id: string, props: Partial<GltfModel>) => void;
  toggleGltfExpanded: (id: string) => void;

  // HTML panel actions
  addHtmlPanel: (name: string, htmlContent?: string) => string;
  removeHtmlPanel: (id: string) => void;
  updateHtmlPanel: (id: string, updates: Partial<Pick<HtmlPanel, "name" | "htmlContent" | "width" | "height">>) => void;
  selectPanel: (id: string | null) => void;

  // Texture assignment actions
  assignTexture: (panelId: string, targetType: "primitive" | "gltfMesh", targetId: string, meshName?: string) => string;
  removeAssignment: (id: string) => void;
  updateAssignmentUV: (id: string, uv: Partial<Pick<TextureAssignment, "uvOffset" | "uvRepeat" | "uvRotation" | "mappingMode">>) => void;
  getAssignmentsForTarget: (targetId: string, meshName?: string) => TextureAssignment[];
  getAssignmentsForPanel: (panelId: string) => TextureAssignment[];

  // GLTF duplicate
  duplicateGltfModel: (id: string) => void;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  snapshot: () => void;

  // Project persistence
  loadProjectData: (data: { objects: SceneObject[]; gltfModels: GltfModel[]; htmlPanels: HtmlPanel[]; textureAssignments: TextureAssignment[] }) => void;

  // Context menu
  openContextMenu: (x: number, y: number, targetType: "primitive" | "gltfMesh", targetId: string, meshName?: string) => void;
  closeContextMenu: () => void;
}

let objectCounter = 0;

const defaultColors = [
  "#e1e9ee", "#c7d3ff", "#dfd5f7", "#d9e4ea", "#dbe1ff", "#e4e2e6",
];

export const useStore = create<StoreState>((set, get) => ({
  objects: [],
  selectedObjectId: null,
  gltfModels: [],
  selectedGltfId: null,
  htmlPanels: [],
  textureAssignments: [],
  selectedPanelId: null,
  contextMenu: null,
  toolMode: "select",
  transformMode: "translate",

  addObject: (type) => {
    objectCounter++;
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)}_${String(objectCounter).padStart(3, "0")}`;
    const color = defaultColors[objectCounter % defaultColors.length];

    const newObject: SceneObject = {
      id: crypto.randomUUID(),
      name,
      type,
      position: [0, type === "plane" ? 0 : 0.5, 0],
      rotation: [type === "plane" ? -Math.PI / 2 : 0, 0, 0],
      scale: [1, 1, 1],
      color,
      visible: true,
      locked: false,
      castShadow: true,
      receiveShadow: true,
    };

    set((state) => ({
      objects: [...state.objects, newObject],
      selectedObjectId: newObject.id,
    }));
  },

  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      textureAssignments: state.textureAssignments.filter((a) => a.targetId !== id),
      selectedObjectId:
        state.selectedObjectId === id ? null : state.selectedObjectId,
    })),

  selectObject: (id) => set({ selectedObjectId: id, selectedGltfId: null }),

  updateObjectTransform: (id, transform) =>
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, ...transform } : o
      ),
    })),

  updateObjectProperty: (id, props) =>
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, ...props } : o
      ),
    })),

  setToolMode: (mode) => {
    const transformMap: Record<string, TransformMode | undefined> = {
      translate: "translate",
      rotate: "rotate",
      scale: "scale",
    };
    const transformMode = transformMap[mode];
    set({
      toolMode: mode,
      ...(transformMode ? { transformMode } : {}),
    });
  },

  setTransformMode: (mode) => set({ transformMode: mode }),

  duplicateObject: (id) => {
    const state = get();
    const obj = state.objects.find((o) => o.id === id);
    if (!obj) return;
    objectCounter++;
    const newObj: SceneObject = {
      ...obj,
      id: crypto.randomUUID(),
      name: `${obj.name}_copy`,
      position: [obj.position[0] + 1, obj.position[1], obj.position[2]],
    };
    set((state) => ({
      objects: [...state.objects, newObj],
      selectedObjectId: newObj.id,
    }));
  },

  // --- GLTF actions ---
  addGltfModel: (model) => {
    const id = crypto.randomUUID();
    const newModel: GltfModel = {
      ...model,
      id,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      locked: false,
      expanded: true,
    };
    set((state) => ({
      gltfModels: [...state.gltfModels, newModel],
      selectedGltfId: id,
      selectedObjectId: null,
    }));
  },

  removeGltfModel: (id) =>
    set((state) => ({
      gltfModels: state.gltfModels.filter((m) => m.id !== id),
      textureAssignments: state.textureAssignments.filter((a) => a.targetId !== id),
      selectedGltfId: state.selectedGltfId === id ? null : state.selectedGltfId,
    })),

  selectGltf: (id) => set({ selectedGltfId: id, selectedObjectId: null }),

  updateGltfTransform: (id, transform) =>
    set((state) => ({
      gltfModels: state.gltfModels.map((m) =>
        m.id === id ? { ...m, ...transform } : m
      ),
    })),

  updateGltfProperty: (id, props) =>
    set((state) => ({
      gltfModels: state.gltfModels.map((m) =>
        m.id === id ? { ...m, ...props } : m
      ),
    })),

  toggleGltfExpanded: (id) =>
    set((state) => ({
      gltfModels: state.gltfModels.map((m) =>
        m.id === id ? { ...m, expanded: !m.expanded } : m
      ),
    })),

  // --- HTML panel actions ---
  addHtmlPanel: (name, htmlContent) => {
    const id = crypto.randomUUID();
    const panel: HtmlPanel = {
      id,
      name,
      htmlContent: htmlContent ?? DEFAULT_HTML,
      width: 1024,
      height: 1024,
    };
    set((state) => ({
      htmlPanels: [...state.htmlPanels, panel],
      selectedPanelId: id,
    }));
    return id;
  },

  removeHtmlPanel: (id) =>
    set((state) => ({
      htmlPanels: state.htmlPanels.filter((p) => p.id !== id),
      textureAssignments: state.textureAssignments.filter((a) => a.panelId !== id),
      selectedPanelId: state.selectedPanelId === id ? null : state.selectedPanelId,
    })),

  updateHtmlPanel: (id, updates) =>
    set((state) => ({
      htmlPanels: state.htmlPanels.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  selectPanel: (id) => set({ selectedPanelId: id }),

  // --- Texture assignment actions ---
  assignTexture: (panelId, targetType, targetId, meshName) => {
    const id = crypto.randomUUID();
    const assignment: TextureAssignment = {
      id,
      panelId,
      targetType,
      targetId,
      meshName,
      uvOffset: [0, 0],
      uvRepeat: [1, 1],
      uvRotation: 0,
      mappingMode: "projected",
    };
    set((state) => ({
      textureAssignments: [...state.textureAssignments, assignment],
    }));
    return id;
  },

  removeAssignment: (id) =>
    set((state) => ({
      textureAssignments: state.textureAssignments.filter((a) => a.id !== id),
    })),

  updateAssignmentUV: (id, uv) =>
    set((state) => ({
      textureAssignments: state.textureAssignments.map((a) =>
        a.id === id ? { ...a, ...uv } : a
      ),
    })),

  getAssignmentsForTarget: (targetId, meshName) => {
    const state = get();
    return state.textureAssignments.filter(
      (a) =>
        a.targetId === targetId &&
        (meshName ? a.meshName === meshName : true)
    );
  },

  getAssignmentsForPanel: (panelId) => {
    const state = get();
    return state.textureAssignments.filter((a) => a.panelId === panelId);
  },

  // --- Context menu ---
  openContextMenu: (x, y, targetType, targetId, meshName) =>
    set({ contextMenu: { x, y, targetType, targetId, meshName } }),

  closeContextMenu: () => set({ contextMenu: null }),

  // --- GLTF duplicate ---
  duplicateGltfModel: (id) => {
    const state = get();
    const model = state.gltfModels.find((m) => m.id === id);
    if (!model) return;
    const newModel: GltfModel = {
      ...model,
      id: crypto.randomUUID(),
      name: `${model.name}_copy`,
      position: [model.position[0] + 1, model.position[1], model.position[2]],
      meshNodes: model.meshNodes.map((n) => ({ ...n, uuid: crypto.randomUUID() })),
    };
    set((state) => ({
      gltfModels: [...state.gltfModels, newModel],
      selectedGltfId: newModel.id,
      selectedObjectId: null,
    }));
  },

  // --- Undo/Redo ---
  canUndo: false,
  canRedo: false,
  undo: () => undo(),
  redo: () => redo(),
  snapshot: () => pushSnapshot(),

  // --- Project persistence ---
  loadProjectData: (data) => {
    set({
      objects: data.objects,
      gltfModels: data.gltfModels,
      htmlPanels: data.htmlPanels,
      textureAssignments: data.textureAssignments,
      selectedObjectId: null,
      selectedGltfId: null,
      selectedPanelId: null,
      contextMenu: null,
    });
  },
}));

const DEFAULT_HTML = `<div style="
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f7f9fb, #e1e9ee);
  font-family: 'Inter', sans-serif;
  color: #2a3439;
">
  <div style="text-align: center;">
    <h2 style="margin: 0 0 8px; font-size: 24px; font-weight: 600;">HTML Texture</h2>
    <p style="margin: 0; font-size: 14px; color: #566166;">Edit this content in the panel</p>
  </div>
</div>`;

// Initialize undo/redo system
initUndoRedo(useStore as any);
