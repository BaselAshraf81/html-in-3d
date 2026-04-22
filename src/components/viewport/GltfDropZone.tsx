import { useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  fileToDataUrl,
  loadGltfFromDataUrl,
  loadGltfFromFiles,
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
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const gltfFile = fileArray.find((f) => isGltfFile(f));
      if (!gltfFile) return;
      try {
        const ext = gltfFile.name.split(".").pop()?.toLowerCase();
        let gltf;
        let cleanup: (() => void) | undefined;

        if (ext === "gltf" && fileArray.length > 1) {
          const siblings = fileArray.filter((f) => f !== gltfFile);
          const result = await loadGltfFromFiles(gltfFile, siblings);
          gltf = result.gltf;
          cleanup = result.cleanup;
        } else {
          const dataUrl = await fileToDataUrl(gltfFile);
          gltf = await loadGltfFromDataUrl(dataUrl);
        }

        const meshNodes = discoverMeshNodes(gltf.scene);
        addGltfModel({
          name: gltfFile.name.replace(/\.(glb|gltf)$/i, ""),
          fileName: gltfFile.name,
          dataUrl: "",
          meshNodes,
          importMode: "texturable",
        });
        cleanup?.();
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
      const files = e.dataTransfer.files;
      if (files.length > 0) handleImport(files);
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
