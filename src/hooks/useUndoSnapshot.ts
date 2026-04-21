import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { pushSnapshot } from "@/store/undoRedo";

/**
 * Auto-captures undo snapshots when scene state changes meaningfully.
 * Debounces rapid changes (e.g. dragging transforms) to avoid flooding history.
 */
export function useUndoSnapshot() {
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const textureAssignments = useStore((s) => s.textureAssignments);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(true);

  useEffect(() => {
    // Skip initial render
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }

    // Debounce: only snapshot after 500ms of no changes
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pushSnapshot();
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [objects, gltfModels, htmlPanels, textureAssignments]);
}
