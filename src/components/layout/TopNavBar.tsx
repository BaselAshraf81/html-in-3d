import { useCallback, useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { saveProject, loadProject } from "@/lib/projectIO";

type MenuKey = "File" | "Edit" | "View" | "Export" | "Help";

const menuItems: Record<MenuKey, { label: string; action: string; shortcut?: string }[]> = {
  File: [
    { label: "New Project", action: "new", shortcut: "Ctrl+N" },
    { label: "Open Project…", action: "open", shortcut: "Ctrl+O" },
    { label: "Save Project…", action: "save", shortcut: "Ctrl+S" },
  ],
  Edit: [
    { label: "Undo", action: "undo", shortcut: "Ctrl+Z" },
    { label: "Redo", action: "redo", shortcut: "Ctrl+Shift+Z" },
  ],
  View: [
    { label: "Front Camera", action: "cam-front", shortcut: "1" },
    { label: "Right Camera", action: "cam-right", shortcut: "3" },
    { label: "Top Camera", action: "cam-top", shortcut: "7" },
    { label: "Perspective Camera", action: "cam-perspective", shortcut: "0" },
  ],
  Export: [
    { label: "Export…", action: "export-html", shortcut: "Ctrl+E" },
  ],
  Help: [
    { label: "Keyboard Shortcuts", action: "shortcuts", shortcut: "?" },
  ],
};

export default function TopNavBar() {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undoAction = useStore((s) => s.undo);
  const redoAction = useStore((s) => s.redo);
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const textureAssignments = useStore((s) => s.textureAssignments);
  const loadProjectData = useStore((s) => s.loadProjectData);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoAction();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redoAction();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoAction, redoAction, objects, gltfModels, htmlPanels, textureAssignments]);

  const handleSave = useCallback(async () => {
    try {
      await saveProject("untitled", objects, gltfModels, htmlPanels, textureAssignments);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [objects, gltfModels, htmlPanels, textureAssignments]);

  const handleOpen = useCallback(async () => {
    try {
      const project = await loadProject();
      if (project) {
        loadProjectData(project.scene);
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
  }, [loadProjectData]);

  const handleAction = useCallback(
    (action: string) => {
      setOpenMenu(null);
      switch (action) {
        case "new":
          loadProjectData({ objects: [], gltfModels: [], htmlPanels: [], textureAssignments: [] });
          break;
        case "open":
          handleOpen();
          break;
        case "save":
          handleSave();
          break;
        case "undo":
          undoAction();
          break;
        case "redo":
          redoAction();
          break;
        case "cam-front":
        case "cam-right":
        case "cam-top":
        case "cam-perspective": {
          const presetMap: Record<string, [number, number, number]> = {
            "cam-front": [0, 1, 8],
            "cam-right": [8, 1, 0],
            "cam-top": [0, 10, 0.01],
            "cam-perspective": [5, 4, 5],
          };
          const fn = (window as any).__vibecanvas_applyPreset;
          if (fn) {
            const pos = presetMap[action];
            const target: [number, number, number] = action === "cam-front" || action === "cam-right" ? [0, 1, 0] : [0, 0, 0];
            fn({ position: pos, target });
          }
          break;
        }
        case "shortcuts": {
          const toggleHelp = (window as any).__vibecanvas_toggleHelp;
          if (toggleHelp) toggleHelp();
          break;
        }
        case "export-html": {
          const toggleExport = (window as any).__vibecanvas_toggleExport;
          if (toggleExport) toggleExport();
          break;
        }
      }
    },
    [undoAction, redoAction, handleSave, handleOpen, loadProjectData]
  );

  return (
    <header className="fixed top-0 left-0 w-full z-[100] flex items-center justify-between px-6 h-12 bg-slate-50/70 backdrop-blur-xl border-b border-slate-900/10">
      <div className="flex items-center gap-6" ref={menuRef}>
        <div className="text-base font-bold tracking-tighter text-slate-900 uppercase select-none">
          VibeCanvas Studio
        </div>
        <nav className="flex items-center gap-1 relative">
          {(Object.keys(menuItems) as MenuKey[]).map((key) => (
            <div key={key} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === key ? null : key)}
                onMouseEnter={() => openMenu && setOpenMenu(key)}
                className={`text-sm tracking-tight px-2 py-1 rounded transition-colors active:scale-95 duration-75 ${
                  openMenu === key
                    ? "text-primary bg-primary/5 font-medium"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"
                }`}
              >
                {key}
              </button>
              {openMenu === key && (
                <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-white/90 backdrop-blur-xl rounded shadow-lg border border-slate-200/60 py-1 z-[200]">
                  {menuItems[key].map((item) => (
                    <button
                      key={item.action}
                      onClick={() => handleAction(item.action)}
                      disabled={
                        (item.action === "undo" && !canUndo) ||
                        (item.action === "redo" && !canRedo)
                      }
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-default flex justify-between items-center"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] font-mono text-slate-400 ml-4">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {/* Undo/Redo quick buttons */}
        <button
          onClick={undoAction}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-1.5 rounded hover:bg-slate-900/5 transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px] text-slate-600">undo</span>
        </button>
        <button
          onClick={redoAction}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="p-1.5 rounded hover:bg-slate-900/5 transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px] text-slate-600">redo</span>
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <button
          onClick={handleSave}
          title="Save Project (Ctrl+S)"
          className="p-1.5 rounded hover:bg-slate-900/5 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px] text-slate-600">save</span>
        </button>
      </div>
    </header>
  );
}
