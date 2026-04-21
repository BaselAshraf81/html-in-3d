import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useStore, type TextureMappingMode } from "@/store/useStore";
import { getLiveTextureManager } from "@/lib/LiveTextureManager";

export interface TextureWithUV {
  texture: THREE.CanvasTexture;
  uvOffset: [number, number];
  uvRepeat: [number, number];
  uvRotation: number;
  mappingMode: TextureMappingMode;
}

/**
 * Manages LiveTextureManager instances for all active texture assignments.
 * Each assignment gets its own independent texture pipeline.
 *
 * Returns a map of target key -> TextureWithUV.
 * Key: "targetId" for primitives, "targetId:meshName" for GLTF meshes.
 */
export function useHtmlTextures(): Map<string, TextureWithUV> {
  const textureAssignments = useStore((s) => s.textureAssignments);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const manager = useRef(getLiveTextureManager());
  const createdIds = useRef(new Set<string>());
  const [textureMap, setTextureMap] = useState<Map<string, TextureWithUV>>(
    () => new Map()
  );

  useEffect(() => {
    const mgr = manager.current;
    const activeIds = new Set(textureAssignments.map((a) => a.id));

    for (const id of createdIds.current) {
      if (!activeIds.has(id)) {
        mgr.destroyTexture(id);
        createdIds.current.delete(id);
      }
    }

    for (const assignment of textureAssignments) {
      const panel = htmlPanels.find((p) => p.id === assignment.panelId);
      if (!panel) continue;

      if (!createdIds.current.has(assignment.id)) {
        mgr.createTexture(assignment.id, panel.id, panel.htmlContent, panel.width, panel.height);
        createdIds.current.add(assignment.id);
      } else {
        mgr.updateContent(assignment.id, panel.htmlContent);
        mgr.updateResolution(assignment.id, panel.width, panel.height);
      }
    }

    const newMap = new Map<string, TextureWithUV>();
    for (const assignment of textureAssignments) {
      const tex = mgr.getTexture(assignment.id);
      if (!tex) continue;
      const key = assignment.meshName
        ? `${assignment.targetId}:${assignment.meshName}`
        : assignment.targetId;
      newMap.set(key, {
        texture: tex,
        uvOffset: assignment.uvOffset,
        uvRepeat: assignment.uvRepeat,
        uvRotation: assignment.uvRotation,
        mappingMode: assignment.mappingMode,
      });
    }
    setTextureMap(newMap);
  }, [textureAssignments, htmlPanels]);

  return textureMap;
}
