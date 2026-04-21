import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useStore, type GltfModel } from "@/store/useStore";
import { useHtmlTextureMap } from "@/contexts/HtmlTextureContext";
import { loadGltfFromDataUrl } from "@/lib/gltfLoader";
import { deserializeShellGeometry } from "@/lib/meshOptimizer";

/**
 * Renders a GLTF model in two layers:
 * 1. The original GLTF scene with its native materials/colors/textures
 * 2. A transparent shell overlay for any assigned HTML textures
 *
 * This preserves the original look of the GLB while allowing HTML
 * content to be projected onto specific surfaces.
 */
function GltfModelObject({ model }: { model: GltfModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectGltf = useStore((s) => s.selectGltf);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const isSelected = selectedGltfId === model.id;
  const textureMap = useHtmlTextureMap();

  // Load and cache the original GLTF scene
  const [originalScene, setOriginalScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (!model.dataUrl) return;
    let cancelled = false;
    loadGltfFromDataUrl(model.dataUrl).then((gltf) => {
      if (cancelled) return;
      // Clone the scene so each instance is independent
      const scene = gltf.scene.clone(true);
      setOriginalScene(scene);
    }).catch((err) => {
      console.warn("[GltfSceneObjects] Failed to load original GLTF:", err);
    });
    return () => { cancelled = true; };
  }, [model.dataUrl]);

  // Build shell overlay geometries for HTML texture assignments
  const shellEntries = useMemo(() => {
    return model.meshNodes.map((node) => ({
      name: node.meshName,
      geometry: deserializeShellGeometry(node.shell),
    }));
  }, [model.meshNodes]);

  // Check if any mesh in this model has an HTML texture assigned
  const hasAnyTexture = useMemo(() => {
    return model.meshNodes.some((node) => {
      const key = `${model.id}:${node.meshName}`;
      return textureMap.has(key);
    });
  }, [model.id, model.meshNodes, textureMap]);

  // Apply selection highlight to original scene meshes
  useEffect(() => {
    if (!originalScene) return;
    originalScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mat = (child as THREE.Mesh).material;
      const applyEmissive = (m: THREE.Material) => {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
          m.emissive.set(isSelected ? "#0053db" : "#000000");
          m.emissiveIntensity = isSelected ? 0.08 : 0;
        }
      };
      if (Array.isArray(mat)) mat.forEach(applyEmissive);
      else applyEmissive(mat);
    });
  }, [originalScene, isSelected]);

  // Update overlay textures
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Find overlay meshes (they have the "overlay-" prefix in userData)
    group.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.userData.isOverlay) return;

      const key = `${model.id}:${mesh.name}`;
      const entry = textureMap.get(key);
      const mat = mesh.material as THREE.MeshBasicMaterial;

      if (entry) {
        const tex = entry.texture;
        tex.offset.set(entry.uvOffset[0], entry.uvOffset[1]);
        tex.repeat.set(entry.uvRepeat[0], entry.uvRepeat[1]);
        tex.rotation = entry.uvRotation;
        tex.center.set(0.5, 0.5);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        mat.map = tex;
        mat.visible = true;
        mat.needsUpdate = true;
      } else {
        mat.map = null;
        mat.visible = false;
        mat.needsUpdate = true;
      }
    });
  }, [textureMap, model.id]);

  // Keep textures updating each frame
  useFrame(() => {
    for (const node of model.meshNodes) {
      const key = `${model.id}:${node.meshName}`;
      const entry = textureMap.get(key);
      if (entry) entry.texture.needsUpdate = true;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!model.locked) selectGltf(model.id);
    },
    [model.id, model.locked, selectGltf]
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const hit = e.object;
      openContextMenu(
        e.nativeEvent.clientX, e.nativeEvent.clientY,
        "gltfMesh", model.id,
        hit instanceof THREE.Mesh ? hit.name : undefined
      );
    },
    [model.id, openContextMenu]
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
      {/* Layer 1: Original GLTF with native materials */}
      {originalScene && <primitive object={originalScene} />}

      {/* Layer 2: Shell overlay — invisible until HTML texture assigned */}
      {shellEntries.map((entry) => (
        <mesh
          key={`overlay-${entry.name}`}
          name={entry.name}
          geometry={entry.geometry}
          userData={{ isOverlay: true }}
          renderOrder={1}
        >
          <meshBasicMaterial
            visible={false}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function GltfSceneObjects() {
  const gltfModels = useStore((s) => s.gltfModels);
  return <>{gltfModels.map((m) => <GltfModelObject key={m.id} model={m} />)}</>;
}
