import { useThree } from "@react-three/fiber";
import { useCallback } from "react";
import * as THREE from "three";

interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

/** Inner component that lives inside the Canvas to access useThree */
export function CameraPresetsInner() {
  const { camera, controls } = useThree();

  const applyPreset = useCallback(
    (preset: CameraPreset) => {
      camera.position.set(...preset.position);
      camera.lookAt(new THREE.Vector3(...preset.target));
      if (controls && "target" in controls) {
        (controls as any).target.set(...preset.target);
        (controls as any).update();
      }
    },
    [camera, controls]
  );

  // Expose via global ref so overlay and keyboard shortcuts can trigger it
  (window as any).__vibecanvas_applyPreset = applyPreset;

  return null;
}
