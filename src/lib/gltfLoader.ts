import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { GltfMeshNode } from "@/store/useStore";
import { extractLeanGeometry } from "./uvUtils";
import { serializeShellGeometry } from "./meshOptimizer";

// ─── KHR_materials_pbrSpecularGlossiness plugin ────────────────────────────
// Three.js ≥0.163 dropped built-in support for this archived Khronos extension.
// Many older models (Sketchfab exports, etc.) still use it. This lightweight
// plugin reads the spec-gloss data and converts it to MeshStandardMaterial
// (metal-rough) properties at parse time — no external dependencies needed.
//
// Conversion is approximate: spec-gloss → metal-rough is lossy, but the result
// is visually close for the vast majority of real-world models.
// ────────────────────────────────────────────────────────────────────────────

function specGlossPlugin(parser: any) {
  return {
    name: "KHR_materials_pbrSpecularGlossiness",

    extendMaterialParams(materialIndex: number, materialParams: any) {
      const materialDef = parser.json.materials?.[materialIndex];
      if (!materialDef?.extensions?.KHR_materials_pbrSpecularGlossiness) {
        return Promise.resolve();
      }

      const sg = materialDef.extensions.KHR_materials_pbrSpecularGlossiness;
      const pending: Promise<void>[] = [];

      // Diffuse color → color + opacity
      if (sg.diffuseFactor) {
        const d = sg.diffuseFactor;
        materialParams.color = new THREE.Color(d[0], d[1], d[2]);
        if (d[3] !== undefined && d[3] < 1) {
          materialParams.opacity = d[3];
          materialParams.transparent = true;
        }
      }

      // Diffuse texture → map
      if (sg.diffuseTexture !== undefined) {
        pending.push(
          parser.assignTexture(materialParams, "map", sg.diffuseTexture)
        );
      }

      // Specular-glossiness → approximate metalness/roughness
      // High specular + high glossiness ≈ metallic; low specular ≈ dielectric
      const specFactor = sg.specularFactor || [1, 1, 1];
      const glossiness = sg.glossinessFactor !== undefined ? sg.glossinessFactor : 1;

      const specLuminance =
        specFactor[0] * 0.2126 + specFactor[1] * 0.7152 + specFactor[2] * 0.0722;
      // Approximate conversion: metals have high specular, dielectrics ~0.04
      materialParams.metalness = Math.min(1, Math.max(0, (specLuminance - 0.04) / 0.96));
      materialParams.roughness = 1 - glossiness;

      // Specular-glossiness texture → approximate roughness map
      if (sg.specularGlossinessTexture !== undefined) {
        pending.push(
          parser.assignTexture(materialParams, "roughnessMap", sg.specularGlossinessTexture)
        );
      }

      return Promise.all(pending);
    },
  };
}

const loader = new GLTFLoader();
loader.register(specGlossPlugin);

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
 * Load a multi-file .gltf (with external .bin / textures) by creating
 * object URLs for every companion file so GLTFLoader.parse() can resolve
 * relative paths correctly.
 *
 * @param gltfFile  The main .gltf JSON file
 * @param siblings  All other files from the same upload (bin, textures, etc.)
 * @returns  The parsed GLTF result and a cleanup function to revoke object URLs
 */
export async function loadGltfFromFiles(
  gltfFile: File,
  siblings: File[],
): Promise<{ gltf: GLTF; cleanup: () => void }> {
  // Build a map of relative-path → object URL for every companion file
  const blobUrls: string[] = [];
  const manager = new THREE.LoadingManager();

  // Map companion filenames to blob URLs
  const fileMap = new Map<string, string>();
  for (const f of siblings) {
    const url = URL.createObjectURL(f);
    blobUrls.push(url);
    // Store under the plain filename and also under common sub-paths
    // e.g. "textures/foo.png" if the file's webkitRelativePath provides it
    const relativePath = f.webkitRelativePath
      ? f.webkitRelativePath.split("/").slice(1).join("/") // strip top-level folder
      : f.name;
    fileMap.set(relativePath, url);
    fileMap.set(f.name, url);
  }

  // Override URL resolution so the loader finds companion files
  manager.setURLModifier((url: string) => {
    // url may be an absolute blob: URL already — pass through
    if (url.startsWith("blob:")) return url;
    // Try to match the relative path the GLTF references
    // Strip any leading ./ and try both the full path and just the filename
    const clean = url.replace(/^\.\//, "");
    if (fileMap.has(clean)) return fileMap.get(clean)!;
    const basename = clean.split("/").pop()!;
    if (fileMap.has(basename)) return fileMap.get(basename)!;
    return url; // fallback — let the loader try as-is
  });

  const multiLoader = new GLTFLoader(manager);
  multiLoader.register(specGlossPlugin);

  // Read the .gltf JSON as an ArrayBuffer so we can use parse()
  const arrayBuffer = await gltfFile.arrayBuffer();

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    multiLoader.parse(arrayBuffer, "", resolve, reject);
  });

  const cleanup = () => blobUrls.forEach((u) => URL.revokeObjectURL(u));
  return { gltf, cleanup };
}

/**
 * Re-export a parsed GLTF scene as a self-contained GLB data URL.
 * This bakes all textures and geometry into a single binary so the result
 * can be loaded later from a data URL without needing companion files.
 */
export async function sceneToGlbDataUrl(scene: THREE.Group): Promise<string> {
  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      reject,
      { binary: true }
    );
  });
  // Convert ArrayBuffer → base64 data URL
  const bytes = new Uint8Array(glbBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:application/octet-stream;base64," + btoa(binary);
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
