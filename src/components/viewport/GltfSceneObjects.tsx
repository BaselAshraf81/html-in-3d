import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useStore, type GltfModel } from "@/store/useStore";
import { useHtmlTextureMap } from "@/contexts/HtmlTextureContext";
import { deserializeShellGeometry } from "@/lib/meshOptimizer";
import { loadGltfFromDataUrl } from "@/lib/gltfLoader";

/**
 * Create an overlay mesh that renders the HTML texture on top of the source
 * mesh without touching the source's material. Uses polygonOffset to float
 * the overlay just in front of the original surface in screen-space.
 *
 * The overlay is transparent — only pixels where the HTML canvas has alpha > 0
 * are visible. If the HTML panel has a solid background, the overlay covers
 * the mesh fully (expected). If the HTML has transparent regions (e.g.
 * background: transparent), the original GLTF material shows through.
 */
function createHtmlOverlay(
  sourceMesh: THREE.Mesh,
  texture: THREE.CanvasTexture,
  side: THREE.Side = THREE.FrontSide,
): THREE.Mesh {
  // Ensure the texture preserves alpha from the canvas
  texture.premultiplyAlpha = false;

  const overlayMat = new THREE.MeshStandardMaterial({
    map: texture,
    color: "#ffffff",
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side,
  });
  const overlay = new THREE.Mesh(sourceMesh.geometry, overlayMat);
  overlay.name = `${sourceMesh.name}__html_overlay`;
  overlay.position.set(0, 0, 0);
  overlay.rotation.set(0, 0, 0);
  overlay.scale.set(1, 1, 1);
  overlay.renderOrder = 1;
  sourceMesh.add(overlay);
  return overlay;
}

/** Dispose overlay material and remove from parent */
function disposeOverlay(overlay: THREE.Mesh): void {
  overlay.parent?.remove(overlay);
  (overlay.material as THREE.Material).dispose();
}

/**
 * Renders a GLTF model in "environment" mode — loads the full GLTF scene
 * with original materials and textures intact. HTML textures are rendered
 * on overlay meshes so the original GLTF materials are never modified.
 */
function EnvironmentGltfModel({ model }: { model: GltfModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectGltf = useStore((s) => s.selectGltf);
  const selectMesh = useStore((s) => s.selectMesh);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const selectedMeshName = useStore((s) => s.selectedMeshName);
  const toolMode = useStore((s) => s.toolMode);
  const isSelected = selectedGltfId === model.id;
  const textureMap = useHtmlTextureMap();
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const overlaysRef = useRef<THREE.Mesh[]>([]);

  // Load the full GLTF with textures
  useEffect(() => {
    if (!model.dataUrl) return;
    let cancelled = false;
    loadGltfFromDataUrl(model.dataUrl).then((gltf) => {
      if (cancelled) return;
      setLoadedScene(gltf.scene);
    }).catch((err) => {
      console.error("[Environment GLTF] Load failed:", err);
    });
    return () => { cancelled = true; };
  }, [model.dataUrl]);

  // Attach loaded scene to group
  useEffect(() => {
    const group = groupRef.current;
    if (!group || !loadedScene) return;
    while (group.children.length > 0) group.remove(group.children[0]);
    const clone = loadedScene.clone();
    group.add(clone);
    return () => {
      while (group.children.length > 0) group.remove(group.children[0]);
    };
  }, [loadedScene]);

  // Create/update overlay meshes for HTML textures + selection highlight
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clean up previous overlays
    for (const ov of overlaysRef.current) disposeOverlay(ov);
    overlaysRef.current = [];

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.name.endsWith("__html_overlay")) return;
      const mat = child.material;
      if (!mat || Array.isArray(mat)) return;
      const m = mat as THREE.MeshStandardMaterial;

      // Create overlay if this mesh has an HTML texture assigned
      const key = `${model.id}:${child.name}`;
      const entry = textureMap.get(key);
      if (entry) {
        const tex = entry.texture;
        tex.offset.set(entry.uvOffset[0], entry.uvOffset[1]);
        tex.repeat.set(entry.uvRepeat[0], entry.uvRepeat[1]);
        tex.rotation = entry.uvRotation;
        tex.center.set(0.5, 0.5);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        const overlay = createHtmlOverlay(child, tex, m.side ?? THREE.FrontSide);
        overlaysRef.current.push(overlay);
      }

      // Selection highlight on the ORIGINAL material (not the overlay)
      if (m.emissive) {
        const isMeshHighlighted = isSelected && selectedMeshName === child.name;
        const isModelHighlighted = isSelected && !selectedMeshName;
        m.emissive.set(isMeshHighlighted ? "#ff6600" : isModelHighlighted ? "#0053db" : "#000000");
        m.emissiveIntensity = isMeshHighlighted ? 0.25 : isModelHighlighted ? 0.05 : 0;
      }
    });

    return () => {
      for (const ov of overlaysRef.current) disposeOverlay(ov);
      overlaysRef.current = [];
    };
  }, [isSelected, selectedMeshName, loadedScene, textureMap, model.id]);

  // Keep overlay textures updating each frame
  useFrame(() => {
    for (const ov of overlaysRef.current) {
      const mat = ov.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.needsUpdate = true;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (model.locked) return;
      const hit = e.object;
      // If user clicked an overlay, resolve to the parent mesh name
      const meshName = hit.name.endsWith("__html_overlay")
        ? hit.parent?.name
        : hit instanceof THREE.Mesh ? hit.name : undefined;
      if (toolMode === "pointer" && meshName) {
        selectMesh(model.id, meshName);
      } else {
        selectGltf(model.id);
      }
    },
    [model.id, model.locked, selectGltf, selectMesh, toolMode]
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const hit = e.object;
      const meshName = hit.name.endsWith("__html_overlay")
        ? hit.parent?.name
        : hit instanceof THREE.Mesh ? hit.name : undefined;
      if (meshName) selectMesh(model.id, meshName);
      openContextMenu(
        e.nativeEvent.clientX, e.nativeEvent.clientY,
        "gltfMesh", model.id, meshName
      );
    },
    [model.id, openContextMenu, selectMesh]
  );

  if (!model.visible) return null;

  return (
    <group
      ref={groupRef}
      name={model.id}
      position={model.position}
      rotation={model.rotation}
      scale={model.scale}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    />
  );
}

/**
 * Renders a GLTF model in "texturable" mode from stored shell geometry.
 * Meshes can receive HTML textures via overlay meshes.
 */
function GltfModelObject({ model }: { model: GltfModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectGltf = useStore((s) => s.selectGltf);
  const selectMesh = useStore((s) => s.selectMesh);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const selectedMeshName = useStore((s) => s.selectedMeshName);
  const toolMode = useStore((s) => s.toolMode);
  const isSelected = selectedGltfId === model.id;
  const textureMap = useHtmlTextureMap();
  const overlaysRef = useRef<THREE.Mesh[]>([]);

  // Build Three.js geometries from stored shell data (once, memoized)
  const meshEntries = useMemo(() => {
    return model.meshNodes.map((node) => ({
      name: node.meshName,
      geometry: deserializeShellGeometry(node.shell),
      originalColor: node.originalColor || "#e1e9ee",
    }));
  }, [model.meshNodes]);

  // Apply textures via overlay and selection highlight
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clean up previous overlays
    for (const ov of overlaysRef.current) disposeOverlay(ov);
    overlaysRef.current = [];

    group.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.name.endsWith("__html_overlay")) return;
      const mesh = child;
      const key = `${model.id}:${mesh.name}`;
      const entry = textureMap.get(key);
      const wholeModelEntry = !entry ? textureMap.get(model.id) : undefined;
      const activeEntry = entry || wholeModelEntry;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (activeEntry) {
        const tex = activeEntry.texture;
        tex.offset.set(activeEntry.uvOffset[0], activeEntry.uvOffset[1]);
        tex.repeat.set(activeEntry.uvRepeat[0], activeEntry.uvRepeat[1]);
        tex.rotation = activeEntry.uvRotation;
        tex.center.set(0.5, 0.5);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        const overlay = createHtmlOverlay(mesh, tex, THREE.DoubleSide);
        overlaysRef.current.push(overlay);
      }

      if (mat.emissive) {
        const isMeshHighlighted = isSelected && selectedMeshName === mesh.name;
        const isModelHighlighted = isSelected && !selectedMeshName;
        mat.emissive.set(isMeshHighlighted ? "#ff6600" : isModelHighlighted ? "#0053db" : "#000000");
        mat.emissiveIntensity = isMeshHighlighted ? 0.25 : isModelHighlighted ? 0.08 : 0;
      }
    });

    return () => {
      for (const ov of overlaysRef.current) disposeOverlay(ov);
      overlaysRef.current = [];
    };
  }, [isSelected, selectedMeshName, textureMap, model.id]);

  useFrame(() => {
    for (const ov of overlaysRef.current) {
      const mat = ov.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.needsUpdate = true;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (model.locked) return;
      const hit = e.object;
      const meshName = hit.name.endsWith("__html_overlay")
        ? hit.parent?.name
        : hit instanceof THREE.Mesh ? hit.name : undefined;
      if (toolMode === "pointer" && meshName) {
        selectMesh(model.id, meshName);
      } else {
        selectGltf(model.id);
      }
    },
    [model.id, model.locked, selectGltf, selectMesh, toolMode]
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const hit = e.object;
      const meshName = hit.name.endsWith("__html_overlay")
        ? hit.parent?.name
        : hit instanceof THREE.Mesh ? hit.name : undefined;
      if (meshName) selectMesh(model.id, meshName);
      openContextMenu(
        e.nativeEvent.clientX, e.nativeEvent.clientY,
        "gltfMesh", model.id, meshName
      );
    },
    [model.id, openContextMenu, selectMesh]
  );

  if (!model.visible) return null;

  return (
    <group
      ref={groupRef}
      name={model.id}
      position={model.position}
      rotation={model.rotation}
      scale={model.scale}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {meshEntries.map((entry) => (
        <mesh key={entry.name} name={entry.name} geometry={entry.geometry}>
          <meshStandardMaterial
            color={entry.originalColor}
            roughness={0.6}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function GltfSceneObjects() {
  const gltfModels = useStore((s) => s.gltfModels);
  return (
    <>
      {gltfModels.map((m) =>
        m.importMode === "environment" && m.dataUrl ? (
          <EnvironmentGltfModel key={m.id} model={m} />
        ) : (
          <GltfModelObject key={m.id} model={m} />
        )
      )}
    </>
  );
}
