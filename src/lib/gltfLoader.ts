import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { GltfMeshNode } from "@/store/useStore";
import { extractLeanGeometry, serializeShellGeometry } from "./meshOptimizer";

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
 * Traverse a GLTF scene, discover all mesh nodes, merge them into a single
 * combined geometry, and extract lightweight shell data.
 *
 * Merging ensures the entire model is treated as one surface for texture
 * projection — no split materials, no per-mesh assignment needed.
 * All mesh transforms are baked relative to the GLTF scene root so the
 * shell aligns with the original model when both are rendered in the same group.
 */
export function discoverMeshNodes(scene: THREE.Group): GltfMeshNode[] {
  const allMeshes: THREE.Mesh[] = [];
  scene.updateWorldMatrix(true, true);
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      allMeshes.push(child as THREE.Mesh);
    }
  });

  if (allMeshes.length === 0) return [];

  // Merge all meshes into one, baking transforms relative to scene root
  try {
    const merged = mergeGltfMeshes(allMeshes, scene);
    const meshName = "Merged_Mesh";

    let shell;
    try {
      const result = extractLeanGeometry(merged);
      shell = serializeShellGeometry(result.geometry);
      console.log(
        `[Import] ${meshName}: merged ${allMeshes.length} meshes → ${result.keptTriangles} tris`
      );
    } catch (err) {
      console.warn(`[Import] Lean extraction failed for merged mesh, using raw:`, err);
      const pos = merged.attributes.position as THREE.BufferAttribute;
      const norm = merged.attributes.normal as THREE.BufferAttribute | undefined;
      const uv = merged.attributes.uv as THREE.BufferAttribute | undefined;
      shell = {
        position: Array.from(pos.array as Float32Array),
        normal: norm ? Array.from(norm.array as Float32Array) : [],
        uv: uv ? Array.from(uv.array as Float32Array) : [],
        index: merged.index ? Array.from(merged.index.array) : [],
        vertexCount: pos.count,
      };
    }

    return [{
      name: meshName,
      uuid: crypto.randomUUID(),
      meshName,
      vertexCount: shell.vertexCount,
      shell,
    }];
  } catch (err) {
    console.warn(`[Import] Merge failed:`, err);
    return [];
  }
}

/**
 * Merge GLTF meshes into a single BufferGeometry.
 * Transforms are baked relative to the scene root so the result
 * aligns with the original GLTF when rendered in the same parent group.
 */
function mergeGltfMeshes(meshes: THREE.Mesh[], sceneRoot: THREE.Group): THREE.BufferGeometry {
  const rootInverse = new THREE.Matrix4().copy(sceneRoot.matrixWorld).invert();

  let totalVerts = 0;
  const geos: { pos: Float32Array; norm: Float32Array | null; count: number; relativeMatrix: THREE.Matrix4; normalMatrix: THREE.Matrix3 }[] = [];

  for (const mesh of meshes) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;

    // Transform relative to scene root (not absolute world)
    const relativeMatrix = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(relativeMatrix);

    geos.push({
      pos: pos.array as Float32Array,
      norm: norm ? (norm.array as Float32Array) : null,
      count: pos.count,
      relativeMatrix,
      normalMatrix,
    });
    totalVerts += pos.count;
  }

  const mergedPos = new Float32Array(totalVerts * 3);
  const mergedNorm = new Float32Array(totalVerts * 3);
  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();

  let offset = 0;
  for (const g of geos) {
    for (let i = 0; i < g.count; i++) {
      _v.set(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
      _v.applyMatrix4(g.relativeMatrix);
      mergedPos[(offset + i) * 3] = _v.x;
      mergedPos[(offset + i) * 3 + 1] = _v.y;
      mergedPos[(offset + i) * 3 + 2] = _v.z;

      if (g.norm) {
        _n.set(g.norm[i * 3], g.norm[i * 3 + 1], g.norm[i * 3 + 2]);
        _n.applyMatrix3(g.normalMatrix).normalize();
      } else {
        _n.set(0, 1, 0);
      }
      mergedNorm[(offset + i) * 3] = _n.x;
      mergedNorm[(offset + i) * 3 + 1] = _n.y;
      mergedNorm[(offset + i) * 3 + 2] = _n.z;
    }
    offset += g.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(mergedNorm, 3));
  return merged;
}

/** Validate that a file is a GLTF/GLB */
export function isGltfFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "glb" || ext === "gltf";
}
