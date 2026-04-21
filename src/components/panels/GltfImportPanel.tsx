import { useCallback, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  fileToDataUrl,
  loadGltfFromDataUrl,
  discoverMeshNodes,
  isGltfFile,
} from "@/lib/gltfLoader";

export default function GltfImportPanel() {
  const addGltfModel = useStore((s) => s.addGltfModel);
  const gltfModels = useStore((s) => s.gltfModels);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const selectGltf = useStore((s) => s.selectGltf);
  const removeGltfModel = useStore((s) => s.removeGltfModel);
  const updateGltfProperty = useStore((s) => s.updateGltfProperty);
  const toggleGltfExpanded = useStore((s) => s.toggleGltfExpanded);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = useCallback(
    async (file: File) => {
      if (!isGltfFile(file)) return;
      setIsLoading(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        const gltf = await loadGltfFromDataUrl(dataUrl);
        const meshNodes = discoverMeshNodes(gltf.scene);
        // Shell geometry is extracted at import time — dataUrl is no longer needed
        addGltfModel({
          name: file.name.replace(/\.(glb|gltf)$/i, ""),
          fileName: file.name,
          dataUrl: "",
          meshNodes,
        });
      } catch (err) {
        console.error("GLTF import failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [addGltfModel]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImport(file);
    },
    [handleImport]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImport(file);
      e.target.value = "";
    },
    [handleImport]
  );

  return (
    <aside className="flex-1 glass-panel ghost-border rounded-lg soft-focus-shadow flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/20 bg-surface-container-low/50">
        <h2 className="text-sm font-semibold text-on-surface tracking-tight uppercase">
          Asset Manager
        </h2>
      </div>

      <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-6">
        {/* Drop Zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors group ${
            isDragOver
              ? "border-primary bg-primary/10"
              : "border-outline-variant/50 hover:border-primary hover:bg-primary/5 bg-surface-container-lowest/50"
          }`}
        >
          <span
            className={`material-symbols-outlined text-3xl mb-2 transition-colors ${
              isDragOver
                ? "text-primary"
                : "text-on-surface-variant group-hover:text-primary"
            }`}
          >
            {isLoading ? "hourglass_empty" : "cloud_upload"}
          </span>
          <p className="text-sm font-medium text-on-surface">
            {isLoading ? "Loading..." : "Drop .GLB file here"}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            or click to browse local files
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={onFileSelect}
            className="hidden"
          />
        </div>

        {/* Imported Models */}
        {gltfModels.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3 ml-2">
              Imported Models
            </h3>
            <div className="flex flex-col gap-3">
              {gltfModels.map((model) => {
                const isSelected = selectedGltfId === model.id;
                return (
                  <div key={model.id}>
                    {/* Model Card */}
                    <div
                      onClick={() => selectGltf(model.id)}
                      className={`p-3 rounded-lg ghost-border transition-colors cursor-pointer group ${
                        isSelected
                          ? "bg-primary/10 border-primary/30"
                          : "bg-surface-container-lowest hover:bg-surface-container-highest"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center flex-shrink-0">
                          <span
                            className={`material-symbols-outlined text-lg ${
                              isSelected ? "text-primary" : "text-on-surface-variant"
                            }`}
                            style={
                              isSelected
                                ? { fontVariationSettings: "'FILL' 1" }
                                : undefined
                            }
                          >
                            view_in_ar
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? "text-primary" : "text-on-surface"
                            }`}
                          >
                            {model.name}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {model.meshNodes.length} mesh
                            {model.meshNodes.length !== 1 ? "es" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Visibility */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateGltfProperty(model.id, {
                                visible: !model.visible,
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-all p-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {model.visible ? "visibility" : "visibility_off"}
                            </span>
                          </button>
                          {/* Lock */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateGltfProperty(model.id, {
                                locked: !model.locked,
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-all p-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {model.locked ? "lock" : "lock_open"}
                            </span>
                          </button>
                          {/* Delete */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeGltfModel(model.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all p-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable mesh list */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGltfExpanded(model.id);
                        }}
                        className="flex items-center gap-1 mt-2 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">
                          {model.expanded ? "expand_less" : "expand_more"}
                        </span>
                        {model.expanded ? "Hide" : "Show"} meshes
                      </button>

                      {model.expanded && (
                        <div className="mt-2 pl-2 flex flex-col gap-1 border-l border-outline-variant/20 ml-1">
                          {model.meshNodes.map((mesh) => (
                            <div
                              key={mesh.uuid}
                              className="flex items-center gap-2 text-xs text-on-surface-variant py-0.5"
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                category
                              </span>
                              <span className="truncate flex-1">
                                {mesh.name}
                              </span>
                              <span className="text-[10px] font-mono opacity-60">
                                {mesh.vertexCount}v
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
