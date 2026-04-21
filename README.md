# VibeCanvas Studio

A 3D studio for rendering live HTML content as textures on 3D meshes using the [HTML-in-Canvas API](https://github.com/nicbarker/html-in-canvas).

## Requirements

- Node.js 18+
- Chrome/Chromium with the **HTML-in-Canvas** flag enabled:
  1. Navigate to `chrome://flags/#canvas-draw-element-image`
  2. Set to **Enabled**
  3. Restart the browser

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:1420 in Chrome (with the flag enabled).

## Features

- Import GLTF/GLB 3D models
- Create HTML panels with live CSS/JS content
- Assign HTML textures to any mesh surface
- UV mapping controls (offset, scale, rotation, projection mode)
- Real-time 3D preview with orbit controls
- Export standalone HTML files with embedded 3D scene
- Raycasting-based click interactivity on exported 3D surfaces
- Project save/load (.vibecanvas format)

## Architecture

The HTML-to-texture pipeline uses three stages:

1. `<canvas layoutsubtree>` with HTML child — browser paints the DOM content
2. Mirror canvas — `drawImage()` copy each frame decouples layout from Three.js
3. `THREE.CanvasTexture` on the mirror — `needsUpdate = true` triggers GPU upload

CSS is scoped via `@scope` to prevent panel styles from leaking to the host page.

## Tauri (Desktop)

The project includes a Tauri v2 shell for desktop builds. However, the HTML-in-Canvas API flag cannot currently be enabled in WebView2 at runtime. The Tauri build will run but textures will fall back to an SVG foreignObject renderer with limited fidelity.

For full functionality, use the browser-based dev server (`npm run dev`).

## Tech Stack

React 19, Three.js, React Three Fiber, Zustand, Tailwind CSS 4, Vite 6, Tauri 2
