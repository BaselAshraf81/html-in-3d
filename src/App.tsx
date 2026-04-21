import TopNavBar from "./components/layout/TopNavBar";
import SideNavBar from "./components/layout/SideNavBar";
import Footer from "./components/layout/Footer";
import Viewport from "./components/viewport/Viewport";
import PropertiesPanel from "./components/panels/PropertiesPanel";
import GltfImportPanel from "./components/panels/GltfImportPanel";
import HtmlTexturePanel from "./components/panels/HtmlTexturePanel";
import SceneHierarchy from "./components/panels/SceneHierarchy";
import HelpModal from "./components/HelpModal";
import ExportModal from "./components/ExportModal";
import { useStore } from "./store/useStore";
import { useUndoSnapshot } from "./hooks/useUndoSnapshot";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useState, useEffect, useCallback } from "react";

type RightPanelTab = "properties" | "assets" | "textures";

export default function App() {
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const [rightTab, setRightTab] = useState<RightPanelTab>("assets");
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Auto-snapshot for undo/redo
  useUndoSnapshot();

  // Professional keyboard shortcuts
  useKeyboardShortcuts();

  // "?" key toggles help modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Expose help toggle for TopNavBar menu
  const toggleHelp = useCallback(() => setHelpOpen((prev) => !prev), []);
  const toggleExport = useCallback(() => setExportOpen((prev) => !prev), []);
  useEffect(() => {
    (window as any).__vibecanvas_toggleHelp = toggleHelp;
    (window as any).__vibecanvas_toggleExport = toggleExport;
    return () => {
      delete (window as any).__vibecanvas_toggleHelp;
      delete (window as any).__vibecanvas_toggleExport;
    };
  }, [toggleHelp, toggleExport]);

  // Auto-switch: show properties when a primitive is selected
  const effectiveTab = selectedObjectId ? "properties" : rightTab;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-on-surface antialiased">
      <TopNavBar />
      <div className="flex-1 flex mt-12 mb-6 relative">
        <SideNavBar />
        <SceneHierarchy />
        <main className="flex-1 ml-[320px] mr-[320px] relative">
          <Viewport />
        </main>

        {/* Right panel with tab switcher */}
        <div className="fixed right-4 top-16 bottom-10 w-[300px] z-40 flex flex-col">
          {/* Tab bar */}
          {!selectedObjectId && (
            <div className="flex mb-1 gap-1 justify-end">
              <button
                onClick={() => setRightTab("assets")}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-t transition-colors ${
                  effectiveTab === "assets"
                    ? "bg-white/70 text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Assets
              </button>
              <button
                onClick={() => setRightTab("textures")}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-t transition-colors flex items-center gap-1 ${
                  effectiveTab === "textures"
                    ? "bg-white/70 text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Textures
                {htmlPanels.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
              </button>
            </div>
          )}

          {/* Panel content */}
          {effectiveTab === "properties" && <PropertiesPanel />}
          {effectiveTab === "assets" && <GltfImportPanel />}
          {effectiveTab === "textures" && <HtmlTexturePanel />}
        </div>
      </div>
      <Footer />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
