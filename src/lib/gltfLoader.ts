import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GltfMeshNode } from "@/store/useStore";
import { extractLeanGeometry } from "./uvUtils";
import { serializeShellGeometry } from "./meshOptimizer";

const loader = new GLTFLoader();

/** Convert a File to a base64 data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load a GLTF/GLB from a data URL string */
export function loadGltfFromDataUrl(dataUrl: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(dataUrl, resolve, undefined, reject);
  });
}

/**
 * Traverse a GLTF scene, discover all mesh nodes, and extract lightweight
 * shell geometry for each mesh at import time.
 *
 * Shell extraction keeps only front-facing triangles with projected UVs,
 * dramatically reducing memory footprint (a 32MB model → a few hundred KB).
 * The heavy original GLTF data can then be discarded.
 */
export function discoverMeshNodes(scene: THREE.Group): GltfMeshNode[] {
  const meshes: GltfMeshNode[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry;
      const meshName = mesh.name || `Mesh_${meshes.length}`;

      // Extract original material color for environment/decorative mode
      let originalColor = "#e1e9ee";
      const mat = mesh.material;
      if (mat && !Array.isArray(mat) && (mat as THREE.MeshStandardMaterial).color) {
        originalColor = "#" + (mat as THREE.MeshStandardMaterial).color.getHexString();
      }

      // Extract lean geometry — keeps all triangles but strips to position + normal + uv only.
      let shell;
      try {
        const result = extractLeanGeometry(geo);
        shell = serializeShellGeometry(result.geometry);
        console.log(
          `[Import] ${meshName}: ${result.keptTriangles} tris, stripped to pos+norm+uv ` +
          `(saved ~${(result.savedBytes / 1024).toFixed(0)}KB)`
        );
      } catch (err) {
        console.warn(`[Import] Shell extraction failed for ${meshName}, using raw geometry:`, err);
        const pos = geo.attributes.position as THREE.BufferAttribute;
        const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
        const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
        shell = {
          position: Array.from((pos.array as Float32Array)),
          normal: norm ? Array.from((norm.array as Float32Array)) : [],
          uv: uv ? Array.from((uv.array as Float32Array)) : [],
          index: geo.index ? Array.from(geo.index.array) : [],
          vertexCount: pos.count,
        };
      }

      meshes.push({
        name: meshName,
        uuid: mesh.uuid,
        meshName,
        vertexCount: shell.vertexCount,
        shell,
        originalColor,
      });
    }
  });
  return meshes;
}

/** Validate that a file is a GLTF/GLB */
export function isGltfFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "glb" || ext === "gltf";
}
