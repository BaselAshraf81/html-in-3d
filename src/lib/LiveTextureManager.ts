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
 * HTML preparation uses DOMParser instead of regex for reliable handling of
 * full HTML documents, body styles, external stylesheets, and script removal.
 * The original HTML (with scripts) is preserved in `htmlContent` and used
 * only in the final export where it runs in its own standalone document.
 */

export interface LiveTextureInstance {
  id: string;
  panelId: string;
  container: HTMLDivElement;
  stagingCanvas: HTMLCanvasElement;
  stagingCtx: CanvasRenderingContext2D;
  contentElement: HTMLDivElement;
  mirrorCanvas: HTMLCanvasElement;
  mirrorCtx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  htmlContent: string;
  captureReady: boolean;
  captureTimer: number | null;
}

export class LiveTextureManager {
  private instances = new Map<string, LiveTextureInstance>();
  private animFrameId: number | null = null;

  constructor() {
    this.startGlobalLoop();
  }

  private createContainer(id: string): HTMLDivElement {
    const container = document.createElement("div");
    container.id = `ltm-container-${id.slice(0, 8)}`;
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

    const container = this.createContainer(assignmentId);

    const stagingCanvas = document.createElement("canvas");
    stagingCanvas.width = width;
    stagingCanvas.height = height;

    const contentElement = document.createElement("div");
    contentElement.style.cssText = `
      width: ${width}px; height: ${height}px;
      overflow: hidden; position: relative; box-sizing: border-box;
    `;

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

    const hasNativeApi = "drawElementImage" in stagingCtx;
    if (hasNativeApi) {
      (stagingCanvas as any).onpaint = () => {
        try {
          try { (inst.stagingCtx as any).reset(); } catch { inst.stagingCtx.clearRect(0, 0, inst.width, inst.height); }
          (inst.stagingCtx as any).drawElementImage(
            inst.contentElement, 0, 0, inst.width, inst.height
          );
          inst.captureReady = true;
        } catch { /* no paint record yet */ }
      };
    } else {
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

    const scopeId = `ltm-${assignmentId.slice(0, 8)}`;
    inst.contentElement.setAttribute("data-ltm-scope", scopeId);

    // Remove any previously injected <link>/<style> tags for this instance
    document.querySelectorAll(`[data-ltm-link="${scopeId}"]`).forEach((el) => el.remove());

    // Use DOMParser for reliable HTML processing — no regex CSS rewriting
    const prepared = prepareHtmlForPreview(htmlContent, scopeId);

    // Inject external <link> and <style> tags into document <head>.
    // Link tags inside a layoutsubtree canvas child won't trigger fetches,
    // so they must live in the real document head.
    for (const node of prepared.headNodes) {
      node.setAttribute("data-ltm-link", scopeId);
      document.head.appendChild(node);
    }

    // Set the content — this is the direct child of the layoutsubtree canvas
    // that drawElementImage will capture.
    inst.contentElement.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `width:${inst.width}px;height:${inst.height}px;overflow:hidden;position:relative;box-sizing:border-box;background:transparent;`;
    // Apply body-level styles (color, font, etc.) to the wrapper.
    // Strip any background properties — the wrapper must stay transparent
    // so the canvas has alpha=0 where there's no content, allowing the
    // overlay mesh to show the original 3D material through.
    if (prepared.bodyStyle) {
      const cleanedBodyStyle = prepared.bodyStyle
        .replace(/\bbackground(-color|-image|-attachment|-clip|-origin|-position|-repeat|-size|-blend-mode)?\s*:[^;]*(;|$)/gi, "");
      wrapper.style.cssText += cleanedBodyStyle;
    }
    wrapper.innerHTML = prepared.bodyHtml;
    inst.contentElement.appendChild(wrapper);

    const hasNativeApi = "drawElementImage" in inst.stagingCtx;
    if (hasNativeApi) {
      try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
    } else {
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
          try {
            inst.mirrorCtx.clearRect(0, 0, inst.width, inst.height);
            inst.mirrorCtx.drawImage(inst.stagingCanvas, 0, 0, inst.width, inst.height);
            inst.texture.needsUpdate = true;
          } catch { /* not ready */ }
          try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
        } else {
          inst.texture.needsUpdate = true;
        }
      } else if (inst.htmlContent && hasNativeApi) {
        try { (inst.stagingCanvas as any).requestPaint?.(); } catch {}
      }
    }
  }

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
    const scopeId = `ltm-${id.slice(0, 8)}`;
    document.querySelectorAll(`[data-ltm-link="${scopeId}"]`).forEach((el) => el.remove());
    inst.texture.dispose();
    inst.container.remove();
    inst.mirrorCanvas.remove();
    this.instances.delete(id);
  }

  destroy(): void {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    for (const id of this.instances.keys()) this.destroyTexture(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML Preparation — DOMParser-based (no regex CSS rewriting)
//
// Uses the browser's own HTML parser to reliably handle full documents,
// body styles, external stylesheets, script removal, and CSS scoping.
// ═══════════════════════════════════════════════════════════════════════════

interface PreparedHtml {
  /** Nodes to inject into document <head> (scoped <style> and <link> elements) */
  headNodes: HTMLElement[];
  /** Inner HTML for the body content wrapper */
  bodyHtml: string;
  /** CSS text from body element's style attribute + body CSS rules, to apply on wrapper */
  bodyStyle: string;
}

/**
 * Parse HTML content and prepare it for live preview inside a layoutsubtree canvas.
 *
 * 1. Parses with DOMParser (handles full docs, fragments, malformed HTML)
 * 2. Removes all <script> elements and inline event handlers via DOM traversal
 * 3. Detects Tailwind CDN and substitutes with CSS-only build
 * 4. Extracts <style> blocks and wraps them in @scope for CSS isolation
 * 5. Extracts <link rel="stylesheet"> for injection into document <head>
 * 6. Extracts body-level styles (from style attribute and CSS body{} rules)
 *    and returns them as inline CSS for the content wrapper
 */
function prepareHtmlForPreview(html: string, scopeId: string): PreparedHtml {
  const scopeSelector = `[data-ltm-scope="${scopeId}"]`;
  const headNodes: HTMLElement[] = [];

  // Detect Tailwind CDN before parsing (DOMParser won't execute scripts)
  const hasTailwind = /cdn\.tailwindcss\.com/i.test(html);

  // Parse the HTML into a real DOM tree
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // --- Remove all <script> elements ---
  doc.querySelectorAll("script").forEach((el) => el.remove());

  // --- Remove inline event handlers (onclick, onload, etc.) ---
  const allElements = doc.querySelectorAll("*");
  for (const el of allElements) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // --- Extract body style attribute ---
  const bodyEl = doc.body;
  const bodyStyleAttr = bodyEl?.getAttribute("style") || "";

  // --- Extract CSS body{} rules and rewrite them ---
  // Walk all <style> elements, parse their CSS to find body/html rules,
  // extract those properties, and scope the remaining rules.
  let extractedBodyCss = "";
  const styleElements = doc.querySelectorAll("style");
  for (const styleEl of styleElements) {
    const cssText = styleEl.textContent || "";

    // Use a temporary stylesheet to parse CSS rules properly
    const { bodyRules, otherCss } = extractBodyRules(cssText);
    extractedBodyCss += bodyRules;

    // Wrap remaining CSS in @scope for isolation
    const scopedStyle = document.createElement("style");
    scopedStyle.textContent = `@scope (${scopeSelector}) { ${otherCss} }`;
    headNodes.push(scopedStyle);

    // Remove from the body content (it's now in headNodes)
    styleEl.remove();
  }

  // --- Extract <link rel="stylesheet"> elements ---
  const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
  for (const linkEl of linkElements) {
    const clone = document.createElement("link");
    clone.rel = "stylesheet";
    clone.href = linkEl.getAttribute("href") || "";
    if (clone.href) headNodes.push(clone);
    linkEl.remove();
  }

  // --- Tailwind CDN substitution ---
  if (hasTailwind) {
    const twLink = document.createElement("link");
    twLink.rel = "stylesheet";
    twLink.href = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4/dist/cdn.min.css";
    headNodes.unshift(twLink);
  }

  // --- Combine body styles ---
  // bodyStyleAttr = inline style="..." from <body>
  // extractedBodyCss = properties extracted from body{} CSS rules
  const bodyStyle = [extractedBodyCss, bodyStyleAttr].filter(Boolean).join("; ");

  // --- Get body innerHTML ---
  const bodyHtml = bodyEl?.innerHTML || doc.documentElement?.innerHTML || html;

  return { headNodes, bodyHtml, bodyStyle };
}

/**
 * Extract `body` and `html` rule properties from a CSS string.
 * Returns the extracted properties as inline CSS text, and the remaining
 * CSS with those rules removed.
 *
 * Uses a temporary CSSStyleSheet for proper CSS parsing — no regex on CSS.
 */
function extractBodyRules(cssText: string): { bodyRules: string; otherCss: string } {
  let bodyRules = "";
  let otherCss = "";

  // Create a temporary stylesheet to parse the CSS properly
  const tempStyle = document.createElement("style");
  tempStyle.textContent = cssText;
  // Must be in the DOM for the browser to parse the rules
  document.head.appendChild(tempStyle);
  const sheet = tempStyle.sheet;

  if (sheet) {
    try {
      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        if (rule instanceof CSSStyleRule) {
          const sel = rule.selectorText.trim().toLowerCase();
          // Check if this rule targets body or html (possibly combined)
          const selParts = sel.split(",").map((s) => s.trim());
          const isBodyOrHtml = selParts.every(
            (s) => s === "body" || s === "html" || s === "html body" ||
                   s === ":root"
          );
          if (isBodyOrHtml && !sel.includes("::") && !sel.includes(":not")) {
            // Extract the properties as inline style text
            bodyRules += rule.style.cssText;
          } else {
            otherCss += rule.cssText + "\n";
          }
        } else if (rule instanceof CSSKeyframesRule) {
          otherCss += rule.cssText + "\n";
        } else if (rule instanceof CSSMediaRule) {
          otherCss += rule.cssText + "\n";
        } else if (rule instanceof CSSImportRule) {
          otherCss += rule.cssText + "\n";
        } else {
          // CSSSupportsRule, CSSLayerRule, etc.
          otherCss += rule.cssText + "\n";
        }
      }
    } catch {
      // CORS or parsing error — fall back to raw CSS
      otherCss = cssText;
    }
  } else {
    otherCss = cssText;
  }

  tempStyle.remove();
  return { bodyRules, otherCss };
}

let _manager: LiveTextureManager | null = null;
export function getLiveTextureManager(): LiveTextureManager {
  if (!_manager) _manager = new LiveTextureManager();
  return _manager;
}
