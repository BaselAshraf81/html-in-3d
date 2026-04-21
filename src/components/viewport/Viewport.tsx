import { useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import SceneObjects from "./SceneObjects";
import GltfSceneObjects from "./GltfSceneObjects";
import TransformGizmo from "./TransformGizmo";
import ViewportOverlay from "./ViewportOverlay";
import MeshCreationBar from "./MeshCreationBar";
import GltfDropZone from "./GltfDropZone";
import MeshContextMenu from "./MeshContextMenu";
import { CameraPresetsInner } from "./CameraPresets";
import { useStore } from "@/store/useStore";
import { useHtmlTextures } from "@/hooks/useHtmlTextures";
import { HtmlTextureContext } from "@/contexts/HtmlTextureContext";

export default function Viewport() {
  const selectObject = useStore((s) => s.selectObject);
  const selectGltf = useStore((s) => s.selectGltf);
  const closeContextMenu = useStore((s) => s.closeContextMenu);
  const textureMap = useHtmlTextures();

  const handlePointerMissed = useCallback(() => {
    selectObject(null);
    selectGltf(null);
    closeContextMenu();
  }, [selectObject, selectGltf, closeContextMenu]);

  return (
    <GltfDropZone>
      <div
        className="w-full h-full relative grid-bg"
        onContextMenu={(e) => e.preventDefault()}
      >
        <Canvas
          camera={{ position: [5, 4, 5], fov: 50, near: 0.1, far: 1000 }}
          onPointerMissed={handlePointerMissed}
          gl={{ antialias: true, alpha: false }}
          style={{ background: "#f7f9fb" }}
        >
          <HtmlTextureContext.Provider value={textureMap}>
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[8, 10, 5]}
              intensity={1}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            <Environment preset="city" background={false} />

            <Grid
              args={[100, 100]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#a9b4b9"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#717c82"
              fadeDistance={50}
              fadeStrength={1}
              followCamera={false}
              infiniteGrid
            />

            <SceneObjects />
            <GltfSceneObjects />
            <TransformGizmo />
            <CameraPresetsInner />

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.1}
              minDistance={1}
              maxDistance={100}
            />
          </HtmlTextureContext.Provider>
        </Canvas>

        <ViewportOverlay />
        <MeshCreationBar />
        <MeshContextMenu />
      </div>
    </GltfDropZone>
  );
}
