import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useStore, type GltfModel } from "@/store/useStore";
import { useHtmlTextureMap } from "@/contexts/HtmlTextureContext";
import { deserializeShellGeometry } from "@/lib/meshOptimizer";

/**
 * Renders a GLTF model from its stored shell geometry data.
 * No GLTF re-loading — meshes are reconstructed from the compact
 * position/normal/uv arrays extracted at import time.
 */
function GltfModelObject({ model }: { model: GltfModel }) {
  const groupRef = useRef<THREE.Group>(null);
  const selectGltf = useStore((s) => s.selectGltf);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const isSelected = selectedGltfId === model.id;
  const textureMap = useHtmlTextureMap();

  // Build Three.js geometries from stored shell data (once, memoized)
  const meshEntries = useMemo(() => {
    return model.meshNodes.map((node) => ({
      name: node.meshName,
      geometry: deserializeShellGeometry(node.shell),
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
      const entry = textureMap.get(key);
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
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }

      if (mat.emissive) {
        mat.emissive.set(isSelected ? "#0053db" : "#000000");
        mat.emissiveIntensity = isSelected ? 0.08 : 0;
      }
    });
  }, [isSelected, textureMap, model.id]);

  // Keep textures updating each frame
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const key = `${model.id}:${child.name}`;
      const entry = textureMap.get(key);
      if (entry) entry.texture.needsUpdate = true;
    });
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
      {meshEntries.map((entry) => (
        <mesh key={entry.name} name={entry.name} geometry={entry.geometry}>
          <meshStandardMaterial
            color="#e1e9ee"
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
  return <>{gltfModels.map((m) => <GltfModelObject key={m.id} model={m} />)}</>;
}
