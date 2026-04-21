import type {
  SceneObject,
  GltfModel,
  HtmlPanel,
  TextureAssignment,
} from "@/store/useStore";

export interface ExportOptions {
  format: "standalone";
  bundleEngine: boolean;
  textureCompression: boolean;
  resolution: "responsive" | "1080p" | "4k";
  optimizeMeshes: boolean;
}

export const defaultExportOptions: ExportOptions = {
  format: "standalone",
  bundleEngine: true,
  textureCompression: false,
  resolution: "responsive",
  optimizeMeshes: false,
};

/**
 * Prepare HTML content for embedding in the export document.
 * The content goes inside a <canvas layoutsubtree> child — full CSS/JS isolation.
 * Scripts are PRESERVED for interactivity (forms, animations, etc).
 * Only strips document wrappers (<!DOCTYPE>, <html>, <head>, <body>).
 * Styles are scoped to the panel's container to prevent leaking to the export page.
 */
function prepareHtmlForExport(html: string, scopeSelector: string): string {
  const isFullDoc = /<html[\s>]/i.test(html) || /<!DOCTYPE/i.test(html);
  if (!isFullDoc) return scopeExportStyles(html, scopeSelector);

  const parts: string[] = [];

  // Collect all style blocks
  const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
  if (styleMatches) parts.push(styleMatches.join("\n"));

  // Collect external stylesheet links
  const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi);
  if (linkMatches) parts.push(linkMatches.join("\n"));

  // Extract body content (keep scripts for interactivity)
  const bodyMatch = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    // Carry over body attributes (e.g. style="background: #0a0a0a") as a wrapper div
    const bodyAttrs = bodyMatch[1] || "";
    const styleMatch = bodyAttrs.match(/style=["']([^"']*)["']/i);
    if (styleMatch) {
      parts.push(`<div style="${styleMatch[1]}">`);
    }
    let body = bodyMatch[2].replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    parts.push(body);
    if (styleMatch) {
      parts.push(`</div>`);
    }
  } else {
    let content = html
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<\/?html[^>]*>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<\/?body[^>]*>/gi, "");
    parts.push(content);
  }

  return scopeExportStyles(parts.join("\n"), scopeSelector);
}

/**
 * Wrap all <style> blocks in @scope and convert <link rel="stylesheet"> to
 * scoped @import so panel CSS doesn't leak to the export page.
 */
function scopeExportStyles(html: string, scopeSelector: string): string {
  // Scope inline <style> blocks
  let result = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, css) => {
    return `<style${attrs}>@scope (${scopeSelector}) { ${css} }</style>`;
  });

  // Convert <link rel="stylesheet"> to scoped @import inside a <style> block
  result = result.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, (linkTag) => {
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) return linkTag;
    return `<style>@scope (${scopeSelector}) { @import url("${hrefMatch[1]}"); }</style>`;
  });

  return result;
}

/**
 * Escape JSON for safe embedding inside a <script> block.
 */
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
  // Scripts are preserved here — they execute in the export's own document context.
  const stagingCanvases = htmlPanels.map((p) => {
    const scopeSelector = `#content-${p.id}`;
    const prepared = prepareHtmlForExport(p.htmlContent, scopeSelector);
    return `<div class="stg-wrap"><canvas id="stg-${p.id}" width="${p.width}" height="${p.height}" layoutsubtree><div id="content-${p.id}" style="width:${p.width}px;height:${p.height}px;overflow:hidden;position:relative;box-sizing:border-box;background:#ffffff;">${prepared}</div></canvas></div>`;
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
#staging-container{position:fixed;bottom:0;right:0;width:1px;height:1px;overflow:hidden;pointer-events:none;z-index:-1}
.stg-wrap{position:absolute;bottom:0;right:0;width:1px;height:1px;overflow:hidden}
</style>
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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
//
//   Stage 1: <canvas layoutsubtree> with HTML child (already in DOM above)
//   Stage 2: Mirror canvas (copies staging each frame)
//   Stage 3: THREE.CanvasTexture on the mirror
// ═══════════════════════════════════════════════════════════════════════════

const textureMap = new Map();
const interactiveMap = new Map(); // panelId -> { contentEl, width, height, meshes[] }

for (const panel of SCENE_DATA.panelIds) {
  const stagingCanvas = document.getElementById('stg-' + panel.id);
  const contentEl = document.getElementById('content-' + panel.id);
  if (!stagingCanvas || !contentEl) continue;

  const stagingCtx = stagingCanvas.getContext('2d');

  // onpaint fires when child rendering changes
  let panelReady = false;
  stagingCanvas.onpaint = () => {
    try {
      try { stagingCtx.reset(); } catch(_) { stagingCtx.clearRect(0, 0, panel.width, panel.height); }
      stagingCtx.drawElementImage(contentEl, 0, 0, panel.width, panel.height);
      panelReady = true;
    } catch(e) {}
  };
  try { stagingCanvas.requestPaint(); } catch(e) {}

  // Mirror canvas for Three.js texture
  const mirrorCanvas = document.createElement('canvas');
  mirrorCanvas.width = panel.width;
  mirrorCanvas.height = panel.height;
  const mirrorCtx = mirrorCanvas.getContext('2d');

  // Pre-fill with white so the texture isn't transparent/black before first paint
  mirrorCtx.fillStyle = '#ffffff';
  mirrorCtx.fillRect(0, 0, panel.width, panel.height);

  const tex = new THREE.CanvasTexture(mirrorCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  textureMap.set(panel.id, {
    tex,
    sync() {
      if (panelReady) {
        // onpaint has fired — copy staging to mirror
        mirrorCtx.drawImage(stagingCanvas, 0, 0, panel.width, panel.height);
        tex.needsUpdate = true;
      } else {
        // onpaint hasn't fired yet — try direct capture as fallback
        try {
          try { stagingCtx.reset(); } catch(_) { stagingCtx.clearRect(0, 0, panel.width, panel.height); }
          stagingCtx.drawElementImage(contentEl, 0, 0, panel.width, panel.height);
          mirrorCtx.drawImage(stagingCanvas, 0, 0, panel.width, panel.height);
          tex.needsUpdate = true;
          panelReady = true;
        } catch(e) {
          // No snapshot yet — keep white pre-fill
        }
      }
      try { stagingCanvas.requestPaint(); } catch(e) {}
    }
  });

  // Track for interactivity
  interactiveMap.set(panel.id, { contentEl, width: panel.width, height: panel.height, meshes: [] });
}

// --- Geometry helpers ---
function createPrimitiveGeometry(type) {
  switch(type) {
    case 'box': return new THREE.BoxGeometry(1,1,1);
    case 'sphere': return new THREE.SphereGeometry(0.5,32,32);
    case 'plane': return new THREE.PlaneGeometry(1,1);
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

function applyTextureToMesh(mesh, assignment) {
  const entry = textureMap.get(assignment.panelId);
  if (!entry) return;
  const tex = entry.tex;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.offset.set(assignment.uvOffset[0], assignment.uvOffset[1]);
  tex.repeat.set(assignment.uvRepeat[0], assignment.uvRepeat[1]);
  tex.rotation = assignment.uvRotation;
  tex.center.set(0.5, 0.5);
  mesh.material.map = tex;
  mesh.material.visible = true;
  mesh.material.needsUpdate = true;
  // Track mesh for raycasting interactivity
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
  if (a) applyTextureToMesh(mesh, a);
  scene.add(mesh);
}

// --- Build GLTF models: load original + shell overlay for HTML textures ---
const gltfLoader = new GLTFLoader();
for (const model of SCENE_DATA.gltfModels) {
  if (!model.visible) continue;
  const group = new THREE.Group();
  group.position.set(...model.position);
  group.rotation.set(...model.rotation);
  group.scale.set(...model.scale);

  // Load original GLTF with its native materials/colors/textures
  if (model.dataUrl) {
    try {
      const gltf = await new Promise((resolve, reject) => {
        gltfLoader.load(model.dataUrl, resolve, undefined, reject);
      });
      group.add(gltf.scene);
    } catch(e) {
      console.warn('Failed to load original GLTF for', model.name, e);
    }
  }

  // Add shell overlay meshes for HTML texture assignments
  for (const [key, shellData] of Object.entries(SCENE_DATA.shellGeometries)) {
    const [modelId, meshName] = key.split(':');
    if (modelId !== model.id) continue;
    const a = SCENE_DATA.textureAssignments.find(a => a.targetType === 'gltfMesh' && a.targetId === model.id && a.meshName === meshName);
    if (!a) continue; // Only create overlay if there's a texture assignment
    const geo = buildShellGeometry(shellData);
    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, depthWrite: false, visible: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = meshName;
    mesh.renderOrder = 1;
    applyTextureToMesh(mesh, a);
    group.add(mesh);
  }
  scene.add(group);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactivity: Raycasting + Hit Testing
//
// Clicking on a textured 3D mesh converts the UV hit to pixel coordinates
// in the staging canvas, then walks the DOM to find interactive elements
// (input, select, textarea, button, a) and focuses/clicks them.
// ═══════════════════════════════════════════════════════════════════════════

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// Interactive meshes gathered lazily at click time (handles dynamic additions)

function getInteractiveElements(container) {
  return container.querySelectorAll('input, select, textarea, button, a, [tabindex], [contenteditable]');
}

function hitTestElement(elements, px, py, containerRect) {
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    // Convert element rect relative to container
    const elX = rect.left - containerRect.left;
    const elY = rect.top - containerRect.top;
    if (px >= elX && px <= elX + rect.width && py >= elY && py <= elY + rect.height) {
      return el;
    }
  }
  return null;
}

canvas.addEventListener('click', (event) => {
  // Convert mouse to NDC
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Gather meshes lazily — scene loops have already populated info.meshes
  const allInteractiveMeshes = [];
  for (const info of interactiveMap.values()) allInteractiveMeshes.push(...info.meshes);

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(allInteractiveMeshes, false);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  if (!hit.uv) return;

  // Find which panel this mesh belongs to
  for (const [panelId, info] of interactiveMap.entries()) {
    if (!info.meshes.includes(hit.object)) continue;

    // UV to pixel coordinates (UV.y is bottom-up, CSS is top-down)
    const px = hit.uv.x * info.width;
    const py = (1 - hit.uv.y) * info.height;

    // Walk DOM to find interactive element at this position
    const elements = getInteractiveElements(info.contentEl);
    const containerRect = info.contentEl.getBoundingClientRect();
    const target = hitTestElement(elements, px, py, containerRect);

    if (target) {
      // Focus the element without scrolling the off-screen staging canvas
      target.focus({ preventScroll: true });
      // For buttons and links, also dispatch a click
      if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        target.click();
      }
      // For select elements, cycle through options (native dropdown won't open)
      if (target.tagName === 'SELECT') {
        const sel = target;
        sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
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

/**
 * Open a live preview of the exported HTML in a new browser window.
 * The preview runs in its own document context — scripts execute safely
 * without affecting the studio.
 */
export function previewExportHtml(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Revoke after a delay to allow the window to load
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    URL.revokeObjectURL(url);
  }
}

function getResolutionStyle(resolution: ExportOptions["resolution"]): string {
  switch (resolution) {
    case "1080p": return "width:1920px;height:1080px;";
    case "4k": return "width:3840px;height:2160px;";
    default: return "";
  }
}
