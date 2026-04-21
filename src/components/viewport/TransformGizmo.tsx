import { useEffect, useRef } from "react";
import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/store/useStore";

export default function TransformGizmo() {
  const { scene } = useThree();
  const transformRef = useRef<any>(null);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const transformMode = useStore((s) => s.transformMode);
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const updateObjectTransform = useStore((s) => s.updateObjectTransform);
  const updateGltfTransform = useStore((s) => s.updateGltfTransform);

  const selectedObj = objects.find((o) => o.id === selectedObjectId);
  const selectedGltf = gltfModels.find((m) => m.id === selectedGltfId);

  // Determine which ID and updater to use
  const activeId = selectedObjectId || selectedGltfId;
  const isLocked = selectedObj?.locked || selectedGltf?.locked;

  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const handleChange = () => {
      const obj = controls.object;
      if (!obj || !activeId) return;

      const transform = {
        position: [obj.position.x, obj.position.y, obj.position.z] as [number, number, number],
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z] as [number, number, number],
      };

      if (selectedObjectId) {
        updateObjectTransform(selectedObjectId, transform);
      } else if (selectedGltfId) {
        updateGltfTransform(selectedGltfId, transform);
      }
    };

    controls.addEventListener("objectChange", handleChange);
    return () => controls.removeEventListener("objectChange", handleChange);
  }, [activeId, selectedObjectId, selectedGltfId, updateObjectTransform, updateGltfTransform]);

  if (!activeId || isLocked) return null;

  // Find the target object in the scene by name (we use id as name)
  const target = scene.getObjectByName(activeId);
  if (!target) return null;

  return (
    <TransformControls
      ref={transformRef}
      object={target}
      mode={transformMode}
      size={0.75}
    />
  );
}
