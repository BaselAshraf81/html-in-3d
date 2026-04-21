import * as THREE from "three";

export interface AutoFitUV {
  uvOffset: [number, number];
  uvRepeat: [number, number];
}

/**
 * Compute UV offset and repeat values that map a texture to exactly cover
 * the UV bounding box of a mesh's geometry.
 */
export function computeAutoFitUV(geometry: THREE.BufferGeometry): AutoFitUV {
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uvAttr || uvAttr.count === 0) {
    return { uvOffset: [0, 0], uvRepeat: [1, 1] };
  }

  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;

  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const rangeU = maxU - minU;
  const rangeV = maxV - minV;

  if (rangeU < 1e-6 || rangeV < 1e-6) {
    return { uvOffset: [0, 0], uvRepeat: [1, 1] };
  }
  if (Math.abs(minU) < 0.01 && Math.abs(minV) < 0.01 &&
      Math.abs(maxU - 1) < 0.01 && Math.abs(maxV - 1) < 0.01) {
    return { uvOffset: [0, 0], uvRepeat: [1, 1] };
  }

  const repeatU = 1 / rangeU;
  const repeatV = 1 / rangeV;
  return {
    uvOffset: [-minU * repeatU, -minV * repeatV],
    uvRepeat: [repeatU, repeatV],
  };
}

// ── Planar projection ────────────────────────────────────────────────────

/** Original geometry saved per mesh for clean restore. */
const savedGeometries = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();
const projectedMeshes = new WeakSet<THREE.Mesh>();

/**
 * Detect which local axis is the "thin" axis of the geometry (the thickness
 * direction) by finding the axis with the smallest bounding-box extent.
 * Returns the two axes to use for U and V projection, plus the thin axis
 * index for the front/back face test.
 *
 * Example: a paper modeled in XZ with thin Y returns { uAxis:0, vAxis:2, thinAxis:1 }
 */
function detectProjectionAxes(geometry: THREE.BufferGeometry): {
  uAxis: number; vAxis: number; thinAxis: number;
} {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);

  const extents = [size.x, size.y, size.z];
  let thinAxis = 0;
  let minExtent = extents[0];
  for (let i = 1; i < 3; i++) {
    if (extents[i] < minExtent) {
      minExtent = extents[i];
      thinAxis = i;
    }
  }

  // The two remaining axes become U and V.
  // Order them so the wider one is U (horizontal) for a natural mapping.
  const others = [0, 1, 2].filter((a) => a !== thinAxis);
  const [a, b] = others;
  const ea = extents[a];
  const eb = extents[b];
  return ea >= eb
    ? { uAxis: a, vAxis: b, thinAxis }
    : { uAxis: b, vAxis: a, thinAxis };
}

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Smart planar projection for HTML textures on 3D meshes.
 *
 * 1. Auto-detects the mesh's principal plane by finding the thinnest
 *    bounding-box axis (e.g. a wavy paper modeled in XZ with thin Y).
 * 2. Projects front-facing vertices onto that plane, normalised to 0→1.
 * 3. Back-facing triangles are placed in geometry group 1 so a separate
 *    material (the mesh's original color) can be applied to them.
 *    Front-facing triangles are in group 0 (textured).
 * 4. Preserves the original smooth normals from the GLTF so lighting
 *    stays correct — no plastic/faceted look.
 *
 * The mesh's original geometry is saved and can be fully restored.
 */
export function applyPlanarProjection(mesh: THREE.Mesh): void {
  if (projectedMeshes.has(mesh)) return;

  const srcGeo = mesh.geometry;
  if (!srcGeo?.attributes?.position) return;

  // Save original once
  if (!savedGeometries.has(mesh)) {
    savedGeometries.set(mesh, srcGeo.clone());
  }

  const original = savedGeometries.get(mesh)!;
  const { uAxis, vAxis, thinAxis } = detectProjectionAxes(original);

  // De-index so each triangle owns its vertices (needed for per-face UV control)
  const geo = original.index ? original.toNonIndexed() : original.clone();

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;

  // Compute bounds on the projection axes
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < count; i++) {
    const u = getComponent(pos, i, uAxis);
    const v = getComponent(pos, i, vAxis);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const rangeU = maxU - minU || 1;
  const rangeV = maxV - minV || 1;

  // Determine if this is a thin single-surface mesh or a thick closed mesh.
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  const extents = [size.x, size.y, size.z];
  const thinExtent = extents[thinAxis];
  const maxExtent = Math.max(...extents);
  const isThinSurface = thinExtent < maxExtent * 0.15;

  const uvs = new Float32Array(count * 2);

  // Reorder triangles: front faces first, then back faces
  const frontIndices: number[] = [];
  const backIndices: number[] = [];

  for (let i = 0; i < count; i += 3) {
    let isFront = true;

    if (!isThinSurface) {
      _vA.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      _vB.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
      _vC.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      const nComponent = thinAxis === 0 ? _fn.x : thinAxis === 1 ? _fn.y : _fn.z;
      isFront = nComponent >= 0;
    }

    if (isFront) {
      frontIndices.push(i, i + 1, i + 2);
    } else {
      backIndices.push(i, i + 1, i + 2);
    }
  }

  // Build reordered geometry: front triangles first, then back triangles
  const reorderedIndices = [...frontIndices, ...backIndices];
  const newPos = new Float32Array(count * 3);
  const newUvs = new Float32Array(count * 2);
  let hasNormals = !!geo.attributes.normal;
  const newNormals = hasNormals ? new Float32Array(count * 3) : null;
  const oldNormals = hasNormals ? (geo.attributes.normal as THREE.BufferAttribute) : null;

  for (let newIdx = 0; newIdx < count; newIdx++) {
    const oldIdx = reorderedIndices[newIdx];
    newPos[newIdx * 3]     = pos.getX(oldIdx);
    newPos[newIdx * 3 + 1] = pos.getY(oldIdx);
    newPos[newIdx * 3 + 2] = pos.getZ(oldIdx);

    if (newNormals && oldNormals) {
      newNormals[newIdx * 3]     = oldNormals.getX(oldIdx);
      newNormals[newIdx * 3 + 1] = oldNormals.getY(oldIdx);
      newNormals[newIdx * 3 + 2] = oldNormals.getZ(oldIdx);
    }

    // Compute UV for this vertex
    const isFrontVertex = newIdx < frontIndices.length;
    if (isFrontVertex) {
      const uComp = getComponent(pos, oldIdx, uAxis);
      const vComp = getComponent(pos, oldIdx, vAxis);
      newUvs[newIdx * 2]     = (uComp - minU) / rangeU;
      newUvs[newIdx * 2 + 1] = (vComp - minV) / rangeV;
    } else {
      // Back faces get 0,0 UVs — won't matter since they use a different material
      newUvs[newIdx * 2]     = 0;
      newUvs[newIdx * 2 + 1] = 0;
    }
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  newGeo.setAttribute("uv", new THREE.BufferAttribute(newUvs, 2));
  if (newNormals) {
    newGeo.setAttribute("normal", new THREE.BufferAttribute(newNormals, 3));
  } else {
    newGeo.computeVertexNormals();
  }

  // Material groups: group 0 = front (textured), group 1 = back (mesh color)
  newGeo.addGroup(0, frontIndices.length, 0);
  if (backIndices.length > 0) {
    newGeo.addGroup(frontIndices.length, backIndices.length, 1);
  }

  mesh.geometry = newGeo;
  projectedMeshes.add(mesh);
}

/**
 * Restore the mesh's original geometry (before projection was applied).
 */
export function restoreOriginalGeometry(mesh: THREE.Mesh): void {
  if (!projectedMeshes.has(mesh)) return;

  const saved = savedGeometries.get(mesh);
  if (saved) {
    mesh.geometry = saved.clone();
    savedGeometries.delete(mesh);
  }
  projectedMeshes.delete(mesh);
}

// ── Tiny helpers ─────────────────────────────────────────────────────────

/** Read the x/y/z component of a BufferAttribute by axis index (0/1/2). */
function getComponent(attr: THREE.BufferAttribute, index: number, axis: number): number {
  if (axis === 0) return attr.getX(index);
  if (axis === 1) return attr.getY(index);
  return attr.getZ(index);
}
