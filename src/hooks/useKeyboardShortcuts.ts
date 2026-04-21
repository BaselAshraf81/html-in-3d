import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/**
 * Professional studio keyboard shortcuts.
 * Only fires when no input/textarea is focused.
 */
export function useKeyboardShortcuts() {
  const setTransformMode = useStore((s) => s.setTransformMode);
  const selectObject = useStore((s) => s.selectObject);
  const selectGltf = useStore((s) => s.selectGltf);
  const removeObject = useStore((s) => s.removeObject);
  const removeGltfModel = useStore((s) => s.removeGltfModel);
  const duplicateObject = useStore((s) => s.duplicateObject);
  const duplicateGltfModel = useStore((s) => s.duplicateGltfModel);
  const snapshot = useStore((s) => s.snapshot);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Skip if modifier keys are held (those are handled in TopNavBar)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // --- Transform modes ---
      if (key === "v" || key === "w") {
        e.preventDefault();
        setTransformMode("translate");
        return;
      }
      if (key === "r") {
        e.preventDefault();
        setTransformMode("rotate");
        return;
      }
      if (key === "s") {
        e.preventDefault();
        setTransformMode("scale");
        return;
      }

      // --- Selection ---
      if (key === "escape") {
        selectObject(null);
        selectGltf(null);
        return;
      }

      // --- Delete selected ---
      if (key === "delete" || key === "x") {
        const state = useStore.getState();
        if (state.selectedObjectId) {
          snapshot();
          removeObject(state.selectedObjectId);
        } else if (state.selectedGltfId) {
          snapshot();
          removeGltfModel(state.selectedGltfId);
        }
        return;
      }

      // --- Duplicate selected ---
      if (key === "d") {
        e.preventDefault();
        const state = useStore.getState();
        if (state.selectedObjectId) {
          snapshot();
          duplicateObject(state.selectedObjectId);
        } else if (state.selectedGltfId) {
          snapshot();
          duplicateGltfModel(state.selectedGltfId);
        }
        return;
      }

      // --- Camera presets via numpad ---
      const applyPreset = (window as any).__vibecanvas_applyPreset;
      if (!applyPreset) return;

      // Numpad 0 or regular 0 → Perspective
      if (e.code === "Numpad0" || key === "0") {
        applyPreset({ position: [5, 4, 5], target: [0, 0, 0] });
        return;
      }
      // Numpad 1 or regular 1 → Front
      if (e.code === "Numpad1" || key === "1") {
        applyPreset({ position: [0, 1, 8], target: [0, 1, 0] });
        return;
      }
      // Numpad 3 or regular 3 → Right
      if (e.code === "Numpad3" || key === "3") {
        applyPreset({ position: [8, 1, 0], target: [0, 1, 0] });
        return;
      }
      // Numpad 7 or regular 7 → Top
      if (e.code === "Numpad7" || key === "7") {
        applyPreset({ position: [0, 10, 0.01], target: [0, 0, 0] });
        return;
      }

      // --- Focus selected (F) ---
      if (key === "f") {
        // Numpad period or F → reset orbit to origin
        applyPreset({ position: [5, 4, 5], target: [0, 0, 0] });
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    setTransformMode, selectObject, selectGltf,
    removeObject, removeGltfModel, duplicateObject,
    duplicateGltfModel, snapshot,
  ]);
}
