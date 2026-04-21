import { useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  fileToDataUrl,
  loadGltfFromDataUrl,
  discoverMeshNodes,
  isGltfFile,
} from "@/lib/gltfLoader";

/** Wraps the viewport area and handles GLTF drag-and-drop */
export default function GltfDropZone({
  children,
}: {
  children: React.ReactNode;
}) {
  const addGltfModel = useStore((s) => s.addGltfModel);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImport = useCallback(
    async (file: File) => {
      if (!isGltfFile(file)) return;
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
        console.error("GLTF drop import failed:", err);
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

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only trigger if leaving the container itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className="w-full h-full relative"
    >
      {children}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="glass-panel ghost-border rounded-lg px-8 py-6 soft-focus-shadow flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-4xl text-primary">
              cloud_upload
            </span>
            <p className="text-sm font-medium text-on-surface">
              Drop GLTF/GLB to import
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
