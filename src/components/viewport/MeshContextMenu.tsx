import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";

export default function MeshContextMenu() {
  const contextMenu = useStore((s) => s.contextMenu);
  const closeContextMenu = useStore((s) => s.closeContextMenu);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const addHtmlPanel = useStore((s) => s.addHtmlPanel);
  const assignTexture = useStore((s) => s.assignTexture);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu, closeContextMenu]);

  // Close on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const isGltfMesh = contextMenu.targetType === "gltfMesh";
  const hasSpecificMesh = isGltfMesh && contextMenu.meshName;

  const handleAssignExisting = (panelId: string, allMeshes?: boolean) => {
    assignTexture(
      panelId,
      contextMenu.targetType,
      contextMenu.targetId,
      allMeshes ? undefined : contextMenu.meshName
    );
    closeContextMenu();
  };

  const handleAssignNew = (allMeshes?: boolean) => {
    const panelId = addHtmlPanel("New_Panel");
    assignTexture(
      panelId,
      contextMenu.targetType,
      contextMenu.targetId,
      allMeshes ? undefined : contextMenu.meshName
    );
    closeContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] glass-panel ghost-border rounded-lg soft-focus-shadow py-1 min-w-[220px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {/* Per-mesh assignment */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
        {hasSpecificMesh ? `Assign to "${contextMenu.meshName}"` : "Assign HTML Texture"}
      </div>

      {htmlPanels.length > 0 && (
        <>
          {htmlPanels.map((panel) => (
            <button
              key={panel.id}
              onClick={() => handleAssignExisting(panel.id)}
              className="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                texture
              </span>
              {panel.name}
            </button>
          ))}
          <div className="border-t border-outline-variant/20 my-1" />
        </>
      )}

      <button
        onClick={() => handleAssignNew()}
        className="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">add</span>
        New HTML Panel...
      </button>

      {/* Whole-model assignment (only for GLTF with specific mesh selected) */}
      {hasSpecificMesh && (
        <>
          <div className="border-t border-outline-variant/20 my-1" />
          <div className="px-3 py-1.5 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
            Assign to All Meshes
          </div>
          {htmlPanels.length > 0 && htmlPanels.map((panel) => (
            <button
              key={`all-${panel.id}`}
              onClick={() => handleAssignExisting(panel.id, true)}
              className="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[14px] text-primary">select_all</span>
              {panel.name}
            </button>
          ))}
          <button
            onClick={() => handleAssignNew(true)}
            className="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">add</span>
            New Panel (all meshes)...
          </button>
        </>
      )}
    </div>
  );
}
