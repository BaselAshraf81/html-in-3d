import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useStore, type GltfModel } from "@/store/useStore";
import { useHtmlTextureMap } from "@/contexts/HtmlTextureContext";
import { deserializeShellGeometry } from "@/lib/meshOptimizer";
import { loadGltfFromDataUrl } from "@/lib/gltfLoader";

/**
 * Renders a GLTF model in "environment" mode — loads the full GLTF scene
 * with original materials and textures intact. No HTML texturing.
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
    // Clear previous children
    while (group.children.length > 0) group.remove(group.children[0]);
    // Clone the scene so we don't mutate the cached GLTF
    const clone = loadedScene.clone();
    group.add(clone);

    return () => {
      while (group.children.length > 0) group.remove(group.children[0]);
    };
  }, [loadedScene]);

  // Selection highlight + per-mesh HTML texture overlay
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material;
      if (!mat || Array.isArray(mat)) return;
      const m = mat as THREE.MeshStandardMaterial;

      // Apply HTML texture if assigned to this specific mesh
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
        m.map = tex;
        m.color.set("#ffffff");
        m.needsUpdate = true;
      }

      if (m.emissive) {
        const isMeshHighlighted = isSelected && selectedMeshName === child.name;
        const isModelHighlighted = isSelected && !selectedMeshName;
        m.emissive.set(isMeshHighlighted ? "#ff6600" : isModelHighlighted ? "#0053db" : "#000000");
        m.emissiveIntensity = isMeshHighlighted ? 0.25 : isModelHighlighted ? 0.05 : 0;
      }
    });
  }, [isSelected, selectedMeshName, loadedScene, textureMap, model.id]);

  // Keep HTML textures updating each frame
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const key = `${model.id}:${child.name}`;
      const entry = textureMap.get(key);
      if (entry) entry.texture.needsUpdate = true;
    });
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (model.locked) return;
      const hit = e.object;
      if (toolMode === "pointer" && hit instanceof THREE.Mesh && hit.name) {
        selectMesh(model.id, hit.name);
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
      const meshName = hit instanceof THREE.Mesh ? hit.name : undefined;
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
 * Meshes can receive HTML textures via the texture assignment system.
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

  // Build Three.js geometries from stored shell data (once, memoized)
  const meshEntries = useMemo(() => {
    return model.meshNodes.map((node) => ({
      name: node.meshName,
      geometry: deserializeShellGeometry(node.shell),
      originalColor: node.originalColor || "#e1e9ee",
    }));
  }, [model.meshNodes]);

  // Apply textures and selection highlight
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child;
      const key = `${model.id}:${mesh.name}`;
      // Check for per-mesh assignment first, then whole-model assignment
      const entry = textureMap.get(key) || textureMap.get(model.id);
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (entry) {
        const tex = entry.texture;
        tex.offset.set(entry.uvOffset[0], entry.uvOffset[1]);
        tex.repeat.set(entry.uvRepeat[0], entry.uvRepeat[1]);
        tex.rotation = entry.uvRotation;
        tex.center.set(0.5, 0.5);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        mat.map = tex;
        mat.color.set("#ffffff");
        mat.roughness = 0.95;
        mat.metalness = 0;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      } else if (mat.map) {
        mat.map = null;
        // Restore original color for environment models
        const node = model.meshNodes.find((n) => n.meshName === mesh.name);
        if (node?.originalColor) mat.color.set(node.originalColor);
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }

      if (mat.emissive) {
        const isMeshHighlighted = isSelected && selectedMeshName === mesh.name;
        const isModelHighlighted = isSelected && !selectedMeshName;
        mat.emissive.set(isMeshHighlighted ? "#ff6600" : isModelHighlighted ? "#0053db" : "#000000");
        mat.emissiveIntensity = isMeshHighlighted ? 0.25 : isModelHighlighted ? 0.08 : 0;
      }
    });
  }, [isSelected, selectedMeshName, textureMap, model.id]);

  // Keep textures updating each frame
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const key = `${model.id}:${child.name}`;
      const entry = textureMap.get(key) || textureMap.get(model.id);
      if (entry) entry.texture.needsUpdate = true;
    });
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (model.locked) return;
      const hit = e.object;
      if (toolMode === "pointer" && hit instanceof THREE.Mesh && hit.name) {
        selectMesh(model.id, hit.name);
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
      const meshName = hit instanceof THREE.Mesh ? hit.name : undefined;
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
