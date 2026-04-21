import * as THREE from "three";

/**
 * Mesh Optimizer — two-stage approach:
 *
 * 1. **Import time** (`extractLeanGeometry`): Keeps ALL triangles, preserves
 *    the index buffer (no seam gaps), strips to position + normal + uv.
 *
 * 2. **Export time** (`extractShellGeometry`): Additionally culls back-facing
 *    triangles for thick meshes to reduce export file size.
 */

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

export interface ShellResult {
  geometry: THREE.BufferGeometry;
  keptTriangles: number;
  originalTriangles: number;
  savedBytes: number;
}

function detectThinAxis(geometry: THREE.BufferGeometry): {
  uAxis: number; vAxis: number; thinAxis: number;
  isThinSurface: boolean;
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

  const others = [0, 1, 2].filter((a) => a !== thinAxis);
  const [a, b] = others;
  const ea = extents[a];
  const eb = extents[b];
  const maxExtent = Math.max(...extents);
  const isThinSurface = minExtent < maxExtent * 0.15;

  return ea >= eb
    ? { uAxis: a, vAxis: b, thinAxis, isThinSurface }
    : { uAxis: b, vAxis: a, thinAxis, isThinSurface };
}

function getComponent(attr: THREE.BufferAttribute, index: number, axis: number): number {
  if (axis === 0) return attr.getX(index);
  if (axis === 1) return attr.getY(index);
  return attr.getZ(index);
}

function getVec3Component(v: THREE.Vector3, axis: number): number {
  if (axis === 0) return v.x;
  if (axis === 1) return v.y;
  return v.z;
}

// ── Import-time: lean geometry (keep all triangles, preserve index) ──────

/**
 * Strip a geometry down to position + normal + projected UVs.
 * Keeps ALL triangles and PRESERVES the index buffer to avoid seam gaps.
 * Drops tangents, morph targets, skinning, vertex colors, etc.
 */
export function extractLeanGeometry(srcGeometry: THREE.BufferGeometry): ShellResult {
  const { uAxis, vAxis } = detectThinAxis(srcGeometry);

  const pos = srcGeometry.attributes.position as THREE.BufferAttribute;
  const norm = srcGeometry.attributes.normal as THREE.BufferAttribute | undefined;
  const totalVerts = pos.count;

  // Compute projection bounds for UVs
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < totalVerts; i++) {
    const u = getComponent(pos, i, uAxis);
    const v = getComponent(pos, i, vAxis);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const rangeU = maxU - minU || 1;
  const rangeV = maxV - minV || 1;

  const newPositions = new Float32Array(totalVerts * 3);
  const newNormals = norm ? new Float32Array(totalVerts * 3) : null;
  const newUVs = new Float32Array(totalVerts * 2);

  for (let i = 0; i < totalVerts; i++) {
    newPositions[i * 3] = pos.getX(i);
    newPositions[i * 3 + 1] = pos.getY(i);
    newPositions[i * 3 + 2] = pos.getZ(i);

    if (newNormals && norm) {
      newNormals[i * 3] = norm.getX(i);
      newNormals[i * 3 + 1] = norm.getY(i);
      newNormals[i * 3 + 2] = norm.getZ(i);
    }

    newUVs[i * 2] = (getComponent(pos, i, uAxis) - minU) / rangeU;
    newUVs[i * 2 + 1] = (getComponent(pos, i, vAxis) - minV) / rangeV;
  }

  const leanGeo = new THREE.BufferGeometry();
  leanGeo.setAttribute("position", new THREE.BufferAttribute(newPositions, 3));
  if (newNormals) {
    leanGeo.setAttribute("normal", new THREE.BufferAttribute(newNormals, 3));
  } else {
    leanGeo.computeVertexNormals();
  }
  leanGeo.setAttribute("uv", new THREE.BufferAttribute(newUVs, 2));

  // Preserve index buffer to avoid seam gaps
  if (srcGeometry.index) {
    leanGeo.setIndex(srcGeometry.index.clone());
  }

  const totalTris = srcGeometry.index
    ? srcGeometry.index.count / 3
    : totalVerts / 3;

  const originalBytes = estimateGeometryBytes(srcGeometry);
  const leanBytes = estimateGeometryBytes(leanGeo);

  return {
    geometry: leanGeo,
    keptTriangles: totalTris,
    originalTriangles: totalTris,
    savedBytes: originalBytes - leanBytes,
  };
}

// ── Export-time: shell geometry (cull back faces for thick meshes) ────────

export function extractShellGeometry(srcGeometry: THREE.BufferGeometry): ShellResult {
  const { uAxis, vAxis, thinAxis, isThinSurface } = detectThinAxis(srcGeometry);

  // Must de-index for per-triangle culling
  const geo = srcGeometry.index ? srcGeometry.toNonIndexed() : srcGeometry.clone();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const totalVerts = pos.count;
  const totalTris = totalVerts / 3;

  const keepTriangle: boolean[] = [];
  let keptCount = 0;

  for (let i = 0; i < totalVerts; i += 3) {
    if (isThinSurface) {
      keepTriangle.push(true);
      keptCount++;
    } else {
      _vA.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      _vB.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
      _vC.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);

      const nComponent = getVec3Component(_fn, thinAxis);
      if (nComponent >= 0) {
        keepTriangle.push(true);
        keptCount++;
      } else {
        keepTriangle.push(false);
      }
    }
  }

  const keptVerts = keptCount * 3;
  const newPositions = new Float32Array(keptVerts * 3);
  const newNormals = norm ? new Float32Array(keptVerts * 3) : null;
  const newUVs = new Float32Array(keptVerts * 2);

  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < totalVerts; i++) {
    const u = getComponent(pos, i, uAxis);
    const v = getComponent(pos, i, vAxis);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const rangeU = maxU - minU || 1;
  const rangeV = maxV - minV || 1;

  let writeIdx = 0;
  for (let tri = 0; tri < totalTris; tri++) {
    if (!keepTriangle[tri]) continue;
    const srcBase = tri * 3;
    for (let v = 0; v < 3; v++) {
      const si = srcBase + v;
      const di = writeIdx;
      newPositions[di * 3] = pos.getX(si);
      newPositions[di * 3 + 1] = pos.getY(si);
      newPositions[di * 3 + 2] = pos.getZ(si);
      if (newNormals && norm) {
        newNormals[di * 3] = norm.getX(si);
        newNormals[di * 3 + 1] = norm.getY(si);
        newNormals[di * 3 + 2] = norm.getZ(si);
      }
      newUVs[di * 2] = (getComponent(pos, si, uAxis) - minU) / rangeU;
      newUVs[di * 2 + 1] = (getComponent(pos, si, vAxis) - minV) / rangeV;
      writeIdx++;
    }
  }

  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute("position", new THREE.BufferAttribute(newPositions, 3));
  if (newNormals) {
    shellGeo.setAttribute("normal", new THREE.BufferAttribute(newNormals, 3));
  } else {
    shellGeo.computeVertexNormals();
  }
  shellGeo.setAttribute("uv", new THREE.BufferAttribute(newUVs, 2));

  const originalBytes = estimateGeometryBytes(srcGeometry);
  const shellBytes = estimateGeometryBytes(shellGeo);

  return {
    geometry: shellGeo,
    keptTriangles: keptCount,
    originalTriangles: totalTris,
    savedBytes: originalBytes - shellBytes,
  };
}

// ── Serialization ────────────────────────────────────────────────────────

function estimateGeometryBytes(geo: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.attributes[key] as THREE.BufferAttribute;
    bytes += attr.array.byteLength;
  }
  if (geo.index) bytes += geo.index.array.byteLength;
  return bytes;
}

export function serializeShellGeometry(geo: THREE.BufferGeometry): {
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
  vertexCount: number;
} {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  return {
    position: Array.from(pos.array as Float32Array),
    normal: norm ? Array.from(norm.array as Float32Array) : [],
    uv: uv ? Array.from(uv.array as Float32Array) : [],
    index: geo.index ? Array.from(geo.index.array) : [],
    vertexCount: pos.count,
  };
}

export function deserializeShellGeometry(data: {
  position: number[];
  normal: number[];
  uv: number[];
  index?: number[];
  vertexCount: number;
}): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.position), 3));
  if (data.normal.length > 0) {
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(data.normal), 3));
  }
  if (data.uv.length > 0) {
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(data.uv), 2));
  }
  if (data.index && data.index.length > 0) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index), 1));
  }
  return geo;
}
