import type {
  SceneObject,
  GltfModel,
  HtmlPanel,
  TextureAssignment,
} from "@/store/useStore";

export interface ExportOptions {
  format: "standalone";
  resolution: "responsive" | "1080p" | "4k";
}

export const defaultExportOptions: ExportOptions = {
  format: "standalone",
  resolution: "responsive",
};

/**
 * Prepare HTML panel content for embedding in the export document.
 *
 * Scripts are PRESERVED for interactivity (forms, animations, etc.).
 * Uses DOMParser only to extract body{} CSS rules for the wrapper div.
 * The actual HTML content is passed through with minimal string processing
 * to avoid DOMParser's innerHTML serialization mangling scripts.
 */
function prepareHtmlForExport(html: string, scopeSelector: string): {
  contentHtml: string;
  headHtml: string;
  bodyStyle: string;
} {
  // Use DOMParser only to extract body{} CSS rules — not for content output
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Extract body style attribute
  const bodyStyleAttr = doc.body?.getAttribute("style") || "";

  // Extract body{} CSS rules from <style> blocks
  let extractedBodyCss = "";
  for (const styleEl of doc.querySelectorAll("style")) {
    const cssText = styleEl.textContent || "";
    const { bodyRules } = extractBodyRules(cssText);
    extractedBodyCss += bodyRules;
  }

  const bodyStyle = [extractedBodyCss, bodyStyleAttr].filter(Boolean).join("; ");

  // --- Build content from the raw HTML string (not DOMParser output) ---
  // This preserves scripts exactly as authored.
  const isFullDoc = /<html[\s>]/i.test(html) || /<!DOCTYPE/i.test(html);
  let contentHtml: string;
  // headParts: <style> and <link> tags that MUST live in the document <head>.
  // Browsers don't process <style>/<link> inside <canvas> elements — even with
  // layoutsubtree the CSS engine ignores them. The LiveTextureManager preview
  // pipeline already handles this by injecting styles into document.head;
  // the export must do the same statically.
  const headParts: string[] = [];

  if (!isFullDoc) {
    // For fragment HTML, extract any <style> and <link> tags out of the content
    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) {
      for (const styleTag of styleMatches) {
        const scoped = scopeStyleTag(styleTag, scopeSelector);
        headParts.push(scoped);
      }
    }
    const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi);
    if (linkMatches) headParts.push(linkMatches.join("\n"));

    // Remove <style> and <link> from content — they'll be in <head>
    contentHtml = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");

    // Wrap inline scripts in IIFEs to prevent variable collisions with the
    // export's own Three.js script (e.g. both declaring `const canvas`).
    contentHtml = wrapScriptsInIIFE(contentHtml);
  } else {
    const bodyParts: string[] = [];

    // Collect <style> blocks from the entire document and scope them → head
    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) {
      for (const styleTag of styleMatches) {
        const scoped = scopeStyleTag(styleTag, scopeSelector);
        headParts.push(scoped);
      }
    }

    // Collect <link rel="stylesheet"> tags → head
    const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi);
    if (linkMatches) headParts.push(linkMatches.join("\n"));

    // Collect <script> tags from <head> (e.g. Tailwind CDN, external libs)
    // These go into the body content since they need to run in context
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      const headScripts = headMatch[1].match(/<script[\s\S]*?<\/script>/gi);
      if (headScripts) bodyParts.push(headScripts.join("\n"));
    }

    // Extract body content (includes body scripts for interactivity)
    const bodyMatch = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      let bodyContent = bodyMatch[2];
      // Remove <style> and <link> from body (already collected above)
      bodyContent = bodyContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      bodyContent = bodyContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
      bodyParts.push(bodyContent);
    } else {
      let c = html
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<\/?html[^>]*>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?body[^>]*>/gi, "");
      bodyParts.push(c);
    }

    // Wrap inline scripts in IIFEs to prevent variable collisions
    contentHtml = wrapScriptsInIIFE(bodyParts.join("\n"));
  }

  return { contentHtml, headHtml: headParts.join("\n"), bodyStyle };
}

/**
 * Scope a <style> tag's CSS content with @scope, handling @import rules
 * which MUST stay at the top level (CSS spec forbids @import inside @scope).
 */
function scopeStyleTag(styleTag: string, scopeSelector: string): string {
  return styleTag.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) => {
      // Extract @import rules — they must be at the top, outside @scope
      const imports: string[] = [];
      const rest = css.replace(/@import\s+[^;]+;/g, (imp) => {
        imports.push(imp);
        return "";
      });
      const importBlock = imports.length ? imports.join("\n") + "\n" : "";
      return `${open}${importBlock}@scope (${scopeSelector}) { ${rest} }${close}`;
    }
  );
}

/**
 * Wrap inline <script> tags in IIFEs to isolate their scope.
 * This prevents variable collisions between panel scripts and the export's
 * own Three.js script (e.g. both declaring `const canvas`).
 *
 * - Regular inline scripts: wrapped in `(function(){...})()`
 * - Module scripts: converted to regular scripts with IIFE wrapper
 *   (modules inside <canvas> elements may not execute reliably)
 * - External scripts (with src=): left untouched
 */
function wrapScriptsInIIFE(html: string): string {
  return html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, attrs: string, body: string) => {
      // Skip external scripts (they have src="...")
      if (/\bsrc\s*=/i.test(attrs)) return full;
      // Skip empty scripts
      if (!body.trim()) return full;
      // Skip importmap / json scripts
      if (/type\s*=\s*["']importmap["']/i.test(attrs) || /type\s*=\s*["']application\/json["']/i.test(attrs)) return full;

      // Use async IIFE to support top-level await (common in module scripts)
      const isModule = /type\s*=\s*["']module["']/i.test(attrs);
      // Strip type="module" — convert to regular script with async IIFE
      const cleanAttrs = attrs.replace(/\s*type\s*=\s*["']module["']/gi, "");
      // Always use async IIFE: module scripts commonly use top-level await,
      // and even regular scripts might use it in newer patterns
      return `<script${cleanAttrs}>(async function(){${body}})()</script>`;
    }
  );
}

/**
 * Extract `body` and `html` rule properties from a CSS string.
 * Returns the extracted properties as inline CSS text, and the remaining
 * CSS with those rules removed.
 *
 * Uses a temporary CSSStyleSheet for proper CSS parsing — no regex on CSS.
 * Shared logic with LiveTextureManager's preview pipeline.
 */
function extractBodyRules(cssText: string): { bodyRules: string; otherCss: string } {
  let bodyRules = "";
  let otherCss = "";

  const tempStyle = document.createElement("style");
  tempStyle.textContent = cssText;
  document.head.appendChild(tempStyle);
  const sheet = tempStyle.sheet;

  if (sheet) {
    try {
      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        if (rule instanceof CSSStyleRule) {
          const sel = rule.selectorText.trim().toLowerCase();
          const selParts = sel.split(",").map((s) => s.trim());
          const isBodyOrHtml = selParts.every(
            (s) => s === "body" || s === "html" || s === "html body" || s === ":root"
          );
          if (isBodyOrHtml && !sel.includes("::") && !sel.includes(":not")) {
            bodyRules += rule.style.cssText;
          } else {
            otherCss += rule.cssText + "\n";
          }
        } else {
          otherCss += rule.cssText + "\n";
        }
      }
    } catch {
      otherCss = cssText;
    }
  } else {
    otherCss = cssText;
  }

  tempStyle.remove();
  return { bodyRules, otherCss };
}

function escapeForScript(str: string): string {
  return str
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}

/**
 * Generate a standalone HTML file using the native CanvasDrawElementImage API.
 *
 * HTML panel content is placed DIRECTLY in the DOM as children of staging canvases.
 * Scripts are preserved — they run in the export's own document context (isolated).
 * Raycasting + hit testing enables form interactivity on 3D surfaces.
 *
 * Requires the HTML-in-Canvas API flag to be enabled in the browser.
 */
export function generateStandaloneHtml(
  objects: SceneObject[],
  gltfModels: GltfModel[],
  htmlPanels: HtmlPanel[],
  textureAssignments: TextureAssignment[],
  _options: ExportOptions,
  shellGeometries: Record<string, { position: number[]; normal: number[]; uv: number[]; vertexCount: number }> = {}
): string {
  const leanModels = gltfModels.map((m) => ({
    ...m,
    dataUrl: "",
    meshNodes: m.meshNodes.map((n) => ({ ...n, shell: undefined })),
  }));

  const sceneData = {
    objects,
    gltfModels: leanModels,
    textureAssignments,
    shellGeometries,
    panelIds: htmlPanels.map((p) => ({ id: p.id, width: p.width, height: p.height })),
  };

  const sceneJson = escapeForScript(JSON.stringify(sceneData));
  const resolutionStyle = getResolutionStyle(_options.resolution);

  // Build staging canvases with HTML content directly in the DOM.
  // Uses DOMParser-based preparation — same as live preview but with scripts preserved.
  //
  // CRITICAL: <style> and <link> tags MUST go in the document <head>, NOT inside
  // the <canvas> element. Browsers don't process CSS inside <canvas> — even with
  // layoutsubtree. The LiveTextureManager preview pipeline already does this
  // (injecting styles into document.head); the export must do the same statically.
  const panelHeadStyles: string[] = [];
  const stagingCanvases = htmlPanels.map((p) => {
    const scopeSelector = `#content-${p.id}`;
    const { contentHtml, headHtml, bodyStyle } = prepareHtmlForExport(p.htmlContent, scopeSelector);
    if (headHtml) panelHeadStyles.push(headHtml);
    // Escape double quotes in bodyStyle — CSS values like font-family: "Courier New"
    // contain quotes that would break the HTML style="..." attribute delimiter.
    // Also strip width/height/overflow — we set those explicitly on the content div
    // to match the panel resolution. Body rules like "height: 100vh" would override
    // our explicit pixel dimensions and cause a mismatch between the rendered texture
    // (which captures at panel.width × panel.height) and the DOM layout.
    const sanitizedBodyStyle = bodyStyle
      .replace(/\b(width|height|overflow|min-width|min-height|max-width|max-height)\s*:[^;]*(;|$)/gi, "")
      .replace(/"/g, "&quot;");
    const styleAttr = sanitizedBodyStyle.trim()
      ? `style="width:${p.width}px;height:${p.height}px;overflow:hidden;position:relative;box-sizing:border-box;${sanitizedBodyStyle}"`
      : `style="width:${p.width}px;height:${p.height}px;overflow:hidden;position:relative;box-sizing:border-box;"`;
    return `<canvas id="stg-${p.id}" class="staging" width="${p.width}" height="${p.height}" style="width:${p.width}px;height:${p.height}px;" layoutsubtree><div id="content-${p.id}" ${styleAttr}>${contentHtml}</div></canvas>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>VibeCanvas Export</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#f7f9fb}
#render-canvas{width:100%;height:100%;display:block;${resolutionStyle}}
#staging-container{position:absolute;bottom:0;right:0;width:1px;height:1px;overflow:hidden;pointer-events:none}
.staging{position:absolute;top:0;left:0}
</style>
${panelHeadStyles.join("\n")}
</head>
<body>
<canvas id="render-canvas"></canvas>
<div id="staging-container">
${stagingCanvases}
</div>

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/"}}
<\/script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SCENE_DATA = ${sceneJson};

// --- Check for native API support ---
const _tc = document.createElement('canvas');
const _tx = _tc.getContext('2d');
if (!(_tx && 'drawElementImage' in _tx)) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;text-align:center;padding:2rem;"><div><h2 style="margin-bottom:1rem;">HTML-in-Canvas API Required</h2><p style="color:#666;max-width:500px;">This export requires the CanvasDrawElementImage API.<br><br>In Chrome, enable it at:<br><code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">chrome://flags/#canvas-draw-element-image</code><br><br>Then restart the browser.</p></div></div>';
  throw new Error('drawElementImage not supported');
}

// --- Three.js Setup ---
const canvas = document.getElementById('render-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f7f9fb');

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 4, 5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(8, 10, 5);
scene.add(dirLight);

// ═══════════════════════════════════════════════════════════════════════════
// HTML-in-Canvas Texture Pipeline (native drawElementImage)
// ═══════════════════════════════════════════════════════════════════════════

const textureMap = new Map();
const interactiveMap = new Map();

for (const panel of SCENE_DATA.panelIds) {
  const stagingCanvas = document.getElementById('stg-' + panel.id);
  const contentEl = document.getElementById('content-' + panel.id);
  if (!stagingCanvas || !contentEl) continue;

  const stagingCtx = stagingCanvas.getContext('2d');

  let panelReady = false;
  stagingCanvas.onpaint = () => {
    try {
      stagingCtx.clearRect(0, 0, panel.width, panel.height);
      stagingCtx.drawElementImage(contentEl, 0, 0, panel.width, panel.height);
      panelReady = true;
    } catch(e) {}
  };
  try { stagingCanvas.requestPaint(); } catch(e) {}

  const mirrorCanvas = document.createElement('canvas');
  mirrorCanvas.width = panel.width;
  mirrorCanvas.height = panel.height;
  const mirrorCtx = mirrorCanvas.getContext('2d');

  const tex = new THREE.CanvasTexture(mirrorCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  // Track all cloned textures that share this panel's mirror canvas
  const clones = [];

  textureMap.set(panel.id, {
    tex,
    mirrorCanvas,
    clones,
    sync() {
      if (panelReady) {
        mirrorCtx.drawImage(stagingCanvas, 0, 0, panel.width, panel.height);
        tex.needsUpdate = true;
        for (const c of clones) c.needsUpdate = true;
      } else {
        try {
          stagingCtx.clearRect(0, 0, panel.width, panel.height);
          stagingCtx.drawElementImage(contentEl, 0, 0, panel.width, panel.height);
          mirrorCtx.drawImage(stagingCanvas, 0, 0, panel.width, panel.height);
          tex.needsUpdate = true;
          for (const c of clones) c.needsUpdate = true;
          panelReady = true;
        } catch(e) {}
      }
      try { stagingCanvas.requestPaint(); } catch(e) {}
    }
  });

  interactiveMap.set(panel.id, { contentEl, width: panel.width, height: panel.height, meshes: [] });
}

// --- Geometry helpers ---
function createPrimitiveGeometry(type) {
  switch(type) {
    case 'box': return new THREE.BoxGeometry(1,1,1);
    case 'sphere': return new THREE.SphereGeometry(0.5,32,32);
    case 'plane': return new THREE.PlaneGeometry(2,2);
    case 'cylinder': return new THREE.CylinderGeometry(0.5,0.5,1,32);
    case 'torus': return new THREE.TorusGeometry(0.4,0.15,16,48);
    case 'cone': return new THREE.ConeGeometry(0.5,1,32);
    default: return new THREE.BoxGeometry(1,1,1);
  }
}

function buildShellGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
  if (data.normal && data.normal.length) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal), 3));
  if (data.uv && data.uv.length) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv), 2));
  if (data.index && data.index.length) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index), 1));
  return geo;
}

// --- Planar projection (matches studio's applyPlanarProjection) ---
function detectProjectionAxes(geo) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
  const accum = [0, 0, 0];
  const triCount = geo.index ? geo.index.count / 3 : count / 3;
  for (let i = 0; i < triCount; i++) {
    let i0, i1, i2;
    if (geo.index) { i0 = geo.index.getX(i*3); i1 = geo.index.getX(i*3+1); i2 = geo.index.getX(i*3+2); }
    else { i0 = i*3; i1 = i*3+1; i2 = i*3+2; }
    _vA.fromBufferAttribute(pos, i0);
    _vB.fromBufferAttribute(pos, i1);
    _vC.fromBufferAttribute(pos, i2);
    _e1.subVectors(_vB, _vA); _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2);
    const area = _fn.length() * 0.5;
    accum[0] += Math.abs(_fn.x) * area;
    accum[1] += Math.abs(_fn.y) * area;
    accum[2] += Math.abs(_fn.z) * area;
  }
  const thinAxis = accum.indexOf(Math.max(...accum));
  const axes = [0,1,2].filter(a => a !== thinAxis);
  return { uAxis: axes[0], vAxis: axes[1], thinAxis };
}

function getComp(pos, idx, axis) {
  return axis === 0 ? pos.getX(idx) : axis === 1 ? pos.getY(idx) : pos.getZ(idx);
}

function applyPlanarProjection(srcGeo) {
  const { uAxis, vAxis, thinAxis } = detectProjectionAxes(srcGeo);
  const geo = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
  const pos = geo.attributes.position;
  const count = pos.count;

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < count; i++) {
    const u = getComp(pos, i, uAxis), v = getComp(pos, i, vAxis);
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  const rangeU = maxU - minU || 1, rangeV = maxV - minV || 1;

  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const extents = [size.x, size.y, size.z];
  const thinExtent = extents[thinAxis];
  const maxExtent = Math.max(...extents);
  const isThin = thinExtent < maxExtent * 0.15;

  const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
  const frontIdx = [], backIdx = [];
  for (let i = 0; i < count; i += 3) {
    let isFront = true;
    if (!isThin) {
      _vA.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      _vB.set(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
      _vC.set(pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2));
      _e1.subVectors(_vB, _vA); _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      const nc = thinAxis === 0 ? _fn.x : thinAxis === 1 ? _fn.y : _fn.z;
      isFront = nc >= 0;
    }
    if (isFront) frontIdx.push(i, i+1, i+2);
    else backIdx.push(i, i+1, i+2);
  }

  const reorder = [...frontIdx, ...backIdx];
  const newPos = new Float32Array(count * 3);
  const newUvs = new Float32Array(count * 2);
  const hasN = !!geo.attributes.normal;
  const newN = hasN ? new Float32Array(count * 3) : null;
  const oldN = hasN ? geo.attributes.normal : null;

  for (let ni = 0; ni < count; ni++) {
    const oi = reorder[ni];
    newPos[ni*3] = pos.getX(oi); newPos[ni*3+1] = pos.getY(oi); newPos[ni*3+2] = pos.getZ(oi);
    if (newN && oldN) { newN[ni*3] = oldN.getX(oi); newN[ni*3+1] = oldN.getY(oi); newN[ni*3+2] = oldN.getZ(oi); }
    if (ni < frontIdx.length) {
      const inset = 0.004;
      const rawU = (getComp(pos, oi, uAxis) - minU) / rangeU;
      const rawV = (getComp(pos, oi, vAxis) - minV) / rangeV;
      newUvs[ni*2] = inset + rawU * (1 - 2*inset);
      newUvs[ni*2+1] = inset + rawV * (1 - 2*inset);
    }
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  newGeo.setAttribute('uv', new THREE.BufferAttribute(newUvs, 2));
  if (newN) newGeo.setAttribute('normal', new THREE.BufferAttribute(newN, 3));
  else newGeo.computeVertexNormals();
  newGeo.addGroup(0, frontIdx.length, 0);
  if (backIdx.length > 0) newGeo.addGroup(frontIdx.length, backIdx.length, 1);
  return { geo: newGeo, hasFrontBack: backIdx.length > 0 };
}

// --- Create a texture for each assignment (independent UV transforms) ---
function makeAssignmentTexture(panelId, assignment) {
  const entry = textureMap.get(panelId);
  if (!entry) return null;
  // Each assignment gets its own CanvasTexture pointing to the same mirror canvas
  // but with independent UV transform settings
  const tex = new THREE.CanvasTexture(entry.mirrorCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.offset.set(assignment.uvOffset[0], assignment.uvOffset[1]);
  tex.repeat.set(assignment.uvRepeat[0], assignment.uvRepeat[1]);
  tex.rotation = assignment.uvRotation;
  tex.center.set(0.5, 0.5);
  tex.needsUpdate = true;
  // Register so sync() marks it dirty each frame
  entry.clones.push(tex);
  return tex;
}

function applyTextureToMesh(mesh, assignment, meshColor) {
  const tex = makeAssignmentTexture(assignment.panelId, assignment);
  if (!tex) return;

  if (assignment.mappingMode === 'projected') {
    const srcGeo = mesh.geometry;
    const { geo: projGeo, hasFrontBack } = applyPlanarProjection(srcGeo);
    mesh.geometry = projGeo;
    const frontMat = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: tex, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide,
    });
    if (hasFrontBack) {
      const backMat = new THREE.MeshStandardMaterial({
        color: meshColor || '#e1e9ee', roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide,
      });
      mesh.material = [frontMat, backMat];
    } else {
      mesh.material = frontMat;
    }
  } else {
    mesh.material = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: tex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    });
  }
  const info = interactiveMap.get(assignment.panelId);
  if (info) info.meshes.push(mesh);
}

// --- Build primitive objects ---
for (const obj of SCENE_DATA.objects) {
  if (!obj.visible) continue;
  const geo = createPrimitiveGeometry(obj.type);
  const mat = new THREE.MeshStandardMaterial({ color: obj.color, roughness: 0.6, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...obj.position);
  mesh.rotation.set(...obj.rotation);
  mesh.scale.set(...obj.scale);
  mesh.name = obj.name;
  const a = SCENE_DATA.textureAssignments.find(a => a.targetType === 'primitive' && a.targetId === obj.id);
  if (a) applyTextureToMesh(mesh, a, obj.color);
  scene.add(mesh);
}

// --- Build GLTF models from stored geometry ---
for (const model of SCENE_DATA.gltfModels) {
  if (!model.visible) continue;
  const group = new THREE.Group();
  group.position.set(...model.position);
  group.rotation.set(...model.rotation);
  group.scale.set(...model.scale);

  for (const [key, shellData] of Object.entries(SCENE_DATA.shellGeometries)) {
    const [modelId, meshName] = key.split(':');
    if (modelId !== model.id) continue;
    const geo = buildShellGeometry(shellData);
    const mat = new THREE.MeshStandardMaterial({ color: '#e1e9ee', roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = meshName;
    const a = SCENE_DATA.textureAssignments.find(a => a.targetType === 'gltfMesh' && a.targetId === model.id && a.meshName === meshName);
    if (a) applyTextureToMesh(mesh, a, '#e1e9ee');
    group.add(mesh);
  }
  scene.add(group);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactivity: Raycasting → UV → Hit-test
//
// To use elementFromPoint we temporarily:
//  1. Move staging container to top-left and expand it
//  2. Remove overflow:hidden
//  3. Hide the render canvas so it does not occlude staging content
//  4. Call elementFromPoint, then restore everything
// ═══════════════════════════════════════════════════════════════════════════

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const stagingContainer = document.getElementById('staging-container');

let _downX = 0, _downY = 0, _downTime = 0;
canvas.addEventListener('pointerdown', (e) => {
  _downX = e.clientX; _downY = e.clientY; _downTime = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  const dx = e.clientX - _downX;
  const dy = e.clientY - _downY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const elapsed = performance.now() - _downTime;
  if (dist > 5 || elapsed > 400) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  const allMeshes = [];
  for (const info of interactiveMap.values()) allMeshes.push(...info.meshes);

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(allMeshes, false);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  if (!hit.uv) return;

  for (const [panelId, info] of interactiveMap.entries()) {
    if (!info.meshes.includes(hit.object)) continue;

    const uvX = hit.uv.x * info.width;
    const uvY = (1 - hit.uv.y) * info.height;

    const stgCanvas = document.getElementById('stg-' + panelId);
    if (!stgCanvas) break;

    // Save original styles
    const sc = stagingContainer.style;
    const saved = { w: sc.width, h: sc.height, ov: sc.overflow,
      pe: sc.pointerEvents, b: sc.bottom, r: sc.right, t: sc.top, l: sc.left };

    // Move to top-left, expand, make visible
    sc.bottom = 'auto'; sc.right = 'auto';
    sc.top = '0'; sc.left = '0';
    sc.width = info.width + 'px';
    sc.height = info.height + 'px';
    sc.overflow = 'visible';
    sc.pointerEvents = 'auto';
    // Hide render canvas so elementFromPoint sees staging content
    canvas.style.display = 'none';
    stagingContainer.offsetHeight; // force layout

    const cr = stgCanvas.getBoundingClientRect();
    const absX = cr.left + uvX;
    const absY = cr.top + uvY;
    const targetEl = document.elementFromPoint(absX, absY);

    // Restore immediately
    canvas.style.display = '';
    sc.width = saved.w; sc.height = saved.h; sc.overflow = saved.ov;
    sc.pointerEvents = saved.pe; sc.bottom = saved.b; sc.right = saved.r;
    sc.top = saved.t; sc.left = saved.l;

    if (!targetEl || !stagingContainer.contains(targetEl)) break;

    const tag = targetEl.tagName;
    if (tag === 'BUTTON' || (tag === 'INPUT' && targetEl.type === 'submit')) {
      targetEl.click();
    } else if (tag === 'INPUT' && targetEl.type === 'checkbox') {
      targetEl.checked = !targetEl.checked;
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (tag === 'INPUT' && targetEl.type === 'radio') {
      targetEl.checked = true;
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (tag === 'SELECT') {
      const cnt = targetEl.options.length;
      if (cnt > 0) {
        targetEl.selectedIndex = (targetEl.selectedIndex + 1) % cnt;
        targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (tag === 'INPUT' && targetEl.type === 'range') {
      // Re-expand to get slider bounding rect
      sc.bottom = 'auto'; sc.right = 'auto'; sc.top = '0'; sc.left = '0';
      sc.width = info.width + 'px'; sc.height = info.height + 'px';
      sc.overflow = 'visible'; canvas.style.display = 'none';
      stagingContainer.offsetHeight;
      const ir = targetEl.getBoundingClientRect();
      canvas.style.display = '';
      sc.width = saved.w; sc.height = saved.h; sc.overflow = saved.ov;
      sc.pointerEvents = saved.pe; sc.bottom = saved.b; sc.right = saved.r;
      sc.top = saved.t; sc.left = saved.l;
      const localX = absX - ir.left;
      const ratio = Math.max(0, Math.min(1, localX / ir.width));
      const mn = parseFloat(targetEl.min || '0');
      const mx = parseFloat(targetEl.max || '100');
      const st = parseFloat(targetEl.step || '1');
      targetEl.value = String(Math.round((mn + ratio * (mx - mn)) / st) * st);
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Generic: full mouse event sequence
      const evtOpts = { bubbles: true, cancelable: true, clientX: absX, clientY: absY, view: window };
      targetEl.dispatchEvent(new MouseEvent('pointerdown', evtOpts));
      targetEl.dispatchEvent(new MouseEvent('mousedown', evtOpts));
      targetEl.dispatchEvent(new MouseEvent('pointerup', evtOpts));
      targetEl.dispatchEvent(new MouseEvent('mouseup', evtOpts));
      targetEl.dispatchEvent(new MouseEvent('click', evtOpts));
      if (targetEl.focus) targetEl.focus({ preventScroll: true });
    }

    try { stgCanvas.requestPaint?.(); } catch(_) {}
    break;
  }
});

// --- Render loop ---
function animate() {
  requestAnimationFrame(animate);
  for (const entry of textureMap.values()) entry.sync();
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
<\/script>
</body>
</html>`;
}

export function previewExportHtml(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    URL.revokeObjectURL(url);
  }
}

/**
 * Resolution style for the render canvas.
 * - "responsive": fills the viewport (default, best for most cases)
 * - "1080p": fixed 1920×1080 canvas (for kiosk/display scenarios)
 * - "4k": fixed 3840×2160 canvas (for high-res displays)
 */
function getResolutionStyle(resolution: ExportOptions["resolution"]): string {
  switch (resolution) {
    case "1080p": return "width:1920px;height:1080px;";
    case "4k": return "width:3840px;height:2160px;";
    default: return "";
  }
}
