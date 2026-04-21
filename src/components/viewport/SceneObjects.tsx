import { useRef, useCallback, useEffect } from "react";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore, type SceneObject, type MeshType } from "@/store/useStore";
import { useHtmlTextureMap } from "@/contexts/HtmlTextureContext";
import { applyPlanarProjection, restoreOriginalGeometry } from "@/lib/uvUtils";

function MeshGeometry({ type }: { type: MeshType }) {
  switch (type) {
    case "box":      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":   return <sphereGeometry args={[0.5, 32, 32]} />;
    case "plane":    return <planeGeometry args={[2, 2]} />;
    case "cylinder": return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case "torus":    return <torusGeometry args={[0.4, 0.15, 16, 48]} />;
    case "cone":     return <coneGeometry args={[0.5, 1, 32]} />;
    default:         return <boxGeometry args={[1, 1, 1]} />;
  }
}

function SceneMesh({ obj }: { obj: SceneObject }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  // Cache materials for projected mode to avoid recreating every frame
  const projMatsRef = useRef<[THREE.MeshStandardMaterial, THREE.MeshStandardMaterial] | null>(null);
  const selectObject = useStore((s) => s.selectObject);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const isSelected = selectedObjectId === obj.id;
  const textureMap = useHtmlTextureMap();
  const entry = textureMap.get(obj.id);

  // Handle geometry projection changes (only when entry/mappingMode changes)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (!entry) {
      restoreOriginalGeometry(mesh);
      // Dispose cached projected materials
      if (projMatsRef.current) {
        projMatsRef.current[0].dispose();
        projMatsRef.current[1].dispose();
        projMatsRef.current = null;
      }
      // Restore single declarative material
      if (matRef.current) mesh.material = matRef.current;
      return;
    }

    if (entry.mappingMode === "projected") {
      applyPlanarProjection(mesh);
      // Create projected materials only once (or reuse)
      if (!projMatsRef.current) {
        projMatsRef.current = [
          new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
          new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
        ];
      }
      mesh.material = projMatsRef.current;
    } else {
      restoreOriginalGeometry(mesh);
      if (projMatsRef.current) {
        projMatsRef.current[0].dispose();
        projMatsRef.current[1].dispose();
        projMatsRef.current = null;
      }
      if (matRef.current) mesh.material = matRef.current;
    }
  }, [entry?.mappingMode, !!entry]);

  // Update material properties reactively (no new allocations)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const emissiveColor = isSelected ? "#0053db" : "#000000";
    const emissiveIntensity = isSelected ? 0.05 : 0;

    if (!entry) {
      // No texture — update the declarative material via ref
      const mat = matRef.current;
      if (mat) {
        mat.color.set(obj.color);
        mat.emissive.set(emissiveColor);
        mat.emissiveIntensity = emissiveIntensity;
        mat.needsUpdate = true;
      }
      return;
    }

    const tex = entry.texture;
    tex.offset.set(entry.uvOffset[0], entry.uvOffset[1]);
    tex.repeat.set(entry.uvRepeat[0], entry.uvRepeat[1]);
    tex.rotation = entry.uvRotation;
    tex.center.set(0.5, 0.5);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    if (entry.mappingMode === "projected" && projMatsRef.current) {
      // Update projected materials in-place
      const [front, back] = projMatsRef.current;
      front.color.set("#ffffff");
      front.map = tex;
      front.roughness = 0.3;
      front.metalness = 0.05;
      front.emissive.set(emissiveColor);
      front.emissiveIntensity = emissiveIntensity;
      front.needsUpdate = true;

      back.color.set(obj.color);
      back.map = null;
      back.roughness = 0.4;
      back.metalness = 0.1;
      back.emissive.set(emissiveColor);
      back.emissiveIntensity = emissiveIntensity;
      back.needsUpdate = true;
    } else {
      // UV mode — update the declarative material
      const mat = matRef.current;
      if (mat) {
        mat.color.set("#ffffff");
        mat.map = tex;
        mat.roughness = 0.3;
        mat.metalness = 0.05;
        mat.emissive.set(emissiveColor);
        mat.emissiveIntensity = emissiveIntensity;
        mat.needsUpdate = true;
      }
    }
  }, [entry, obj.color, isSelected]);

  useFrame(() => {
    if (entry) entry.texture.needsUpdate = true;
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!obj.locked) selectObject(obj.id);
    },
    [obj.id, obj.locked, selectObject]
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      openContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY, "primitive", obj.id);
    },
    [obj.id, openContextMenu]
  );

  if (!obj.visible) return null;

  return (
    <mesh
      ref={meshRef}
      name={obj.id}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      castShadow={obj.castShadow}
      receiveShadow={obj.receiveShadow}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <MeshGeometry type={obj.type} />
      <meshStandardMaterial
        ref={matRef}
        color={obj.color}
        roughness={0.4}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function SceneObjects() {
  const objects = useStore((s) => s.objects);
  return <>{objects.map((obj) => <SceneMesh key={obj.id} obj={obj} />)}</>;
}
