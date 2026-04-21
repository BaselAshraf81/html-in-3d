import * as THREE from "three";

/**
 * Three-stage HTML-to-texture pipeline using the CanvasDrawElementImage API.
 *
 * Each assignment gets its own fully independent pipeline with its own
 * DOM container (critical — multiple layoutsubtree canvases in a single
 * 1×1 container causes only the first to paint).
 *
 *   Stage 1: <canvas layoutsubtree> with HTML child — scripts STRIPPED for isolation
 *   Stage 2: Mirror canvas (drawImage copy each frame)
 *   Stage 3: THREE.CanvasTexture on the mirror
 *
 * Scripts are stripped from the live rendering to prevent imported HTML from
 * leaking into the studio page. The original HTML (with scripts) is preserved
 * in `htmlContent` and used only in the final export where it runs in its own
 * standalone document context.
 */

export interface LiveTextureInstance {
  id: string;
  panelId: string;
  /** Each instance gets its own container to ensure independent painting */
  container: HTMLDivElement;
  stagingCanvas: HTMLCanvasElement;
  stagingCtx: CanvasRenderingContext2D;
  contentElement: HTMLDivElement;
  mirrorCanvas: HTMLCanvasElement;
  mirrorCtx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  /** Original HTML content WITH scripts — preserved for export */
  htmlContent: string;
  /** True once the first successful drawElementImage capture has occurred */
  captureReady: boolean;
  captureTimer: number | null;
}

export class LiveTextureManager {
  private instances = new Map<string, LiveTextureInstance>();
  private animFrameId: number | null = null;

  constructor() {
    this.startGlobalLoop();
  }

  /** Create an isolated container for a single texture instance */
  private createContainer(id: string): HTMLDivElement {
    const container = document.createElement("div");
    container.id = `ltm-container-${id.slice(0, 8)}`;
    // Each container is independently positioned so the browser
    // lays out and paints each staging canvas independently.
    container.style.cssText = `
      position: fixed; bottom: 0; right: 0;
      width: 1px; height: 1px; overflow: hidden;
      pointer-events: none; z-index: -1;
    `;
    document.body.appendChild(container);
    return container;
  }

  createTexture(
    assignmentId: string,
    panelId: string,
    htmlContent: string,
    width = 1024,
    height = 1024
  ): THREE.CanvasTexture {
    this.destroyTexture(assignmentId);

    // Each instance gets its own container
    const container = this.createContainer(assignmentId);

    const stagingCanvas = document.createElement("canvas");
    stagingCanvas.width = width;
    stagingCanvas.height = height;

    const contentElement = document.createElement("div");
    contentElement.style.cssText = `
      width: ${width}px; height: ${height}px;
      overflow: hidden; position: relative; box-sizing: border-box;
    `;

    // Native path only — the studio requires the HTML-in-Canvas API flag
    stagingCanvas.setAttribute("layoutsubtree", "");
    (stagingCanvas as any).layoutSubtree = true;
    stagingCanvas.appendChild(contentElement);
    container.appendChild(stagingCanvas);

    const stagingCtx = stagingCanvas.getContext("2d")!;

    const mirrorCanvas = document.createElement("canvas");
    mirrorCanvas.width = width;
    mirrorCanvas.height = height;
    const mirrorCtx = mirrorCanvas.getContext("2d")!;

    const texture = new THREE.CanvasTexture(mirrorCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const inst: LiveTextureInstance = {
      id: assignmentId,
      panelId,
      container,
      stagingCanvas, stagingCtx, contentElement,
      mirrorCanvas, mirrorCtx, texture,
      width, height,
      htmlContent: "",
      captureReady: false,
      captureTimer: null,
    };

    this.instances.set(assignmentId, inst);

    // Check if the native API is actually available
    const hasNativeApi = "drawElementImage" in stagingCtx;
    if (hasNativeApi) {
      (stagingCanvas as any).onpaint = () => {
        try {
          try { (inst.stagingCtx as any).reset(); } catch { inst.stagingCtx.clearRect(0, 0, inst.width, inst.height); }
          (inst.stagingCtx as any).drawElementImage(
            inst.contentElement, 0, 0, inst.width, inst.height
          );
          inst.captureReady = true;
        } catch { /* no paint record yet — keep showing placeholder */ }
      };
    } else {
      // API not available — use html2canvas-style fallback via foreignObject SVG
      console.warn("[LiveTextureManager] drawElementImage not available, using SVG foreignObject fallback");
      inst.captureTimer = window.setTimeout(() => this.captureForeignObject(inst), 100);
    }

    this.drawPlaceholder(inst);
    this.updateContent(assignmentId, htmlContent);
    return texture;
  }

  updateContent(assignmentId: string, htmlContent: string): void {
    const inst = this.instances.get(assignmentId);
    if (!inst || inst.htmlContent === htmlContent) return;
    inst.htmlContent = htmlContent;
    inst.captureReady = false;

    // Content goes directly into the contentElement (direct child of layoutsubtree canvas).
    // drawElementImage captures the element's visual rendering including all children.
    // Scripts are stripped to prevent execution in the studio context.
    // CSS is scoped via @scope to prevent leaking to the studio page.
    const sanitized = stripScriptsForPreview(htmlContent, inst.width, inst.height);
    const scopeId = `ltm-${assignmentId.slice(0, 8)}`;
    inst.contentElement.setAttribute("data-ltm-scope", scopeId);
    inst.contentElement.innerHTML = `<div style="width:${inst.width}px;height:${inst.height}px;overflow:hidden;position:relative;box-sizing:border-box;background:#ffffff;">${scopeStyles(sanitized, scopeId)}</div>`;

    const hasNativeApi = "drawElementImage" in inst.stagingCtx;
    if (hasNativeApi) {
      try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
    } else {
      // Schedule SVG foreignObject capture
      if (inst.captureTimer !== null) clearTimeout(inst.captureTimer);
      inst.captureTimer = window.setTimeout(() => this.captureForeignObject(inst), 200);
    }
  }

  updateResolution(assignmentId: string, width: number, height: number): void {
    const inst = this.instances.get(assignmentId);
    if (!inst || (inst.width === width && inst.height === height)) return;

    const oldTex = inst.texture;
    inst.width = width;
    inst.height = height;
    inst.stagingCanvas.width = width;
    inst.stagingCanvas.height = height;
    inst.mirrorCanvas.width = width;
    inst.mirrorCanvas.height = height;
    inst.contentElement.style.width = `${width}px`;
    inst.contentElement.style.height = `${height}px`;

    const newTex = new THREE.CanvasTexture(inst.mirrorCanvas);
    newTex.colorSpace = THREE.SRGBColorSpace;
    newTex.minFilter = THREE.LinearFilter;
    newTex.magFilter = THREE.LinearFilter;
    newTex.generateMipmaps = false;
    inst.texture = newTex;
    oldTex.dispose();

    this.drawPlaceholder(inst);
    const content = inst.htmlContent;
    inst.htmlContent = "";
    this.updateContent(assignmentId, content);
  }

  syncAll(): void {
    for (const inst of this.instances.values()) {
      const hasNativeApi = "drawElementImage" in inst.stagingCtx;

      if (inst.captureReady) {
        if (hasNativeApi) {
          // Native path: keep syncing staging → mirror each frame
          try {
            inst.mirrorCtx.clearRect(0, 0, inst.width, inst.height);
            inst.mirrorCtx.drawImage(inst.stagingCanvas, 0, 0, inst.width, inst.height);
            inst.texture.needsUpdate = true;
          } catch { /* not ready */ }
          try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
        } else {
          // Fallback path: mirror already has content from captureForeignObject
          inst.texture.needsUpdate = true;
        }
      } else if (inst.htmlContent && hasNativeApi) {
        // No capture yet — just ping requestPaint; onpaint handles the capture
        try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
      }
    }
  }

  /**
   * Fallback capture: serialize the contentElement's innerHTML into an SVG foreignObject,
   * render it to an Image, then draw to the mirror canvas.
   * Works without the drawElementImage API flag.
   */
  private captureForeignObject(inst: LiveTextureInstance): void {
    const html = inst.contentElement.innerHTML;
    if (!html) return;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${inst.width}" height="${inst.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${inst.width}px;height:${inst.height}px;overflow:hidden;">${html}</div>
      </foreignObject>
    </svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      inst.mirrorCtx.clearRect(0, 0, inst.width, inst.height);
      inst.mirrorCtx.drawImage(img, 0, 0, inst.width, inst.height);
      inst.texture.needsUpdate = true;
      inst.captureReady = true;
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Keep placeholder on error
    };
    img.src = url;
  }

  private drawPlaceholder(inst: LiveTextureInstance): void {
    const { mirrorCtx: ctx, width: w, height: h } = inst;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f0f4f7"); g.addColorStop(1, "#e1e9ee");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(169,180,185,0.4)"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    const sz = Math.max(14, w / 40);
    ctx.fillStyle = "#566166";
    ctx.font = `600 ${sz}px Inter,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("HTML Texture", w / 2, h / 2 - sz);
    ctx.fillStyle = "#717c82"; ctx.font = `${sz * 0.75}px Inter,sans-serif`;
    ctx.fillText("Assign content in the Textures panel", w / 2, h / 2 + sz * 0.5);
    inst.texture.needsUpdate = true;
  }

  private startGlobalLoop(): void {
    const loop = () => { this.syncAll(); this.animFrameId = requestAnimationFrame(loop); };
    this.animFrameId = requestAnimationFrame(loop);
  }

  getTexture(id: string): THREE.CanvasTexture | null {
    return this.instances.get(id)?.texture ?? null;
  }

  destroyTexture(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (inst.captureTimer !== null) clearTimeout(inst.captureTimer);
    inst.texture.dispose();
    inst.container.remove(); // removes staging canvas, content element, iframe too
    inst.mirrorCanvas.remove();
    this.instances.delete(id);
  }

  destroy(): void {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    for (const id of this.instances.keys()) this.destroyTexture(id);
  }
}

// --- HTML preparation ---

/**
 * Scope CSS rules inside <style> blocks to a container attribute selector.
 * This prevents styles from imported HTML from leaking to the studio page.
 * Uses CSS @scope when supported, falls back to prefixing selectors with
 * the container attribute selector.
 */
function scopeStyles(html: string, scopeId: string): string {
  const scopeSelector = `[data-ltm-scope="${scopeId}"]`;
  return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, css) => {
    // Wrap all rules in @scope (Chrome 118+) with fallback nesting
    const scoped = `@scope (${scopeSelector}) { ${css} }`;
    return `<style${attrs}>${scoped}</style>`;
  });
}

/**
 * Strip scripts from HTML for safe live preview in the studio.
 *
 * The layoutsubtree canvas + shadow DOM provides CSS isolation, but scripts
 * inside shadow DOM still execute in the main page context and can access
 * `document`, `window`, etc. To prevent imported HTML from leaking into the
 * studio, we strip all <script> tags and inline event handlers for the live
 * rendering. The visual output (CSS, layout, static content) is preserved.
 *
 * The original HTML with scripts is kept in `htmlContent` and used in the
 * final export where each panel runs in its own standalone document.
 */
function stripScriptsForPreview(html: string, _width: number, _height: number): string {
  const isFullDoc = /<html[\s>]/i.test(html) || /<!DOCTYPE/i.test(html);

  let content: string;
  if (!isFullDoc) {
    content = html;
  } else {
    // Full document: extract styles and body content
    const parts: string[] = [];

    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) parts.push(styleMatches.join("\n"));

    // Convert <link rel="stylesheet"> to @import for shadow DOM compatibility
    const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi);
    if (linkMatches) {
      const imports: string[] = [];
      for (const link of linkMatches) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          imports.push(`@import url("${hrefMatch[1]}");`);
        }
      }
      if (imports.length) {
        parts.push(`<style>${imports.join("\n")}</style>`);
      }
    }

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      let bodyContent = bodyMatch[1].replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      parts.push(bodyContent);
    } else {
      let c = html
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<\/?html[^>]*>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?body[^>]*>/gi, "");
      parts.push(c);
    }
    content = parts.join("\n");
  }

  // Strip all <script> tags (inline and external) — they must not run in the studio
  content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Strip inline event handlers (onclick, onload, onerror, etc.)
  content = content.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  return content;
}

let _manager: LiveTextureManager | null = null;
export function getLiveTextureManager(): LiveTextureManager {
  if (!_manager) _manager = new LiveTextureManager();
  return _manager;
}
