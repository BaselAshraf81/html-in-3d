import * as THREE from "three";

/**
 * Mesh Optimizer — serialization/deserialization for compact geometry storage.
 */

// ── Serialization ────────────────────────────────────────────────────────

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
