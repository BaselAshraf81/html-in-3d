import { useState, useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { saveTextFile } from "@/lib/fileIO";
import {
  generateStandaloneHtml,
  previewExportHtml,
  defaultExportOptions,
  type ExportOptions,
} from "@/lib/exportHtml";
import { saveProject } from "@/lib/projectIO";
import {
  extractShellGeometry,
  deserializeShellGeometry,
  serializeShellGeometry,
} from "@/lib/meshOptimizer";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ExportFormat = "standalone" | "project";

export default function ExportModal({ open, onClose }: Props) {
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const textureAssignments = useStore((s) => s.textureAssignments);

  const [format, setFormat] = useState<ExportFormat>("standalone");
  const [bundleEngine, setBundleEngine] = useState(true);
  const [textureCompression, setTextureCompression] = useState(false);
  const [optimizeMeshes, setOptimizeMeshes] = useState(false);
  const [resolution, setResolution] = useState<ExportOptions["resolution"]>("responsive");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Estimate export size
  const estimateSize = useCallback(() => {
    let bytes = 0;
    // HTML panels
    for (const p of htmlPanels) bytes += new Blob([p.htmlContent]).size;
    // Shell geometry data (already compact)
    for (const m of gltfModels) {
      for (const node of m.meshNodes) {
        bytes += node.shell.position.length * 4; // Float32
        bytes += node.shell.normal.length * 4;
        bytes += node.shell.uv.length * 4;
      }
    }
    // Three.js runtime (~600KB minified via CDN — not embedded, just referenced)
    if (bundleEngine && format === "standalone") bytes += 10_000; // import map overhead only
    // Scene JSON overhead
    bytes += 10_000;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [htmlPanels, gltfModels, bundleEngine, format]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setStatus(null);

    try {
      if (format === "project") {
        const path = await saveProject(
          "untitled",
          objects,
          gltfModels,
          htmlPanels,
          textureAssignments
        );
        if (path) setStatus("Project saved successfully");
        else setStatus(null);
      } else {
        // Build shell geometries for export from stored lean geometry.
        // If optimizeMeshes is on, run back-face culling for thick meshes.
        // Otherwise, use the lean geometry as-is (all triangles preserved).
        const shellGeometries: Record<string, any> = {};
        for (const model of gltfModels) {
          for (const node of model.meshNodes) {
            if (optimizeMeshes) {
              // Reconstruct BufferGeometry, run shell extraction, re-serialize
              const leanGeo = deserializeShellGeometry(node.shell);
              const result = extractShellGeometry(leanGeo);
              shellGeometries[`${model.id}:${node.meshName}`] = serializeShellGeometry(result.geometry);
            } else {
              shellGeometries[`${model.id}:${node.meshName}`] = node.shell;
            }
          }
        }

        const html = generateStandaloneHtml(
          objects,
          gltfModels,
          htmlPanels,
          textureAssignments,
          {
            format: "standalone",
            bundleEngine,
            textureCompression,
            resolution,
            optimizeMeshes,
          },
          shellGeometries
        );

        const filePath = await saveTextFile(
          html,
          "vibecanvas-export.html",
          [{ name: "HTML", extensions: ["html"] }]
        );

        if (filePath) {
          setStatus("Export complete");
        }
      }
    } catch (err) {
      console.error("Export failed:", err);
      setStatus(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  }, [
    format, objects, gltfModels, htmlPanels, textureAssignments,
    bundleEngine, textureCompression, resolution, optimizeMeshes,
  ]);

  const handlePreview = useCallback(() => {
    const shellGeometries: Record<string, any> = {};
    for (const model of gltfModels) {
      for (const node of model.meshNodes) {
        shellGeometries[`${model.id}:${node.meshName}`] = node.shell;
      }
    }
    const html = generateStandaloneHtml(
      objects, gltfModels, htmlPanels, textureAssignments,
      { format: "standalone", bundleEngine, textureCompression, resolution, optimizeMeshes },
      shellGeometries
    );
    previewExportHtml(html);
  }, [objects, gltfModels, htmlPanels, textureAssignments, bundleEngine, textureCompression, resolution, optimizeMeshes]);

  if (!open) return null;

  const formatOptions: { key: ExportFormat; icon: string; label: string; desc: string }[] = [
    {
      key: "standalone",
      icon: "html",
      label: "Standalone HTML",
      desc: "Single file output. Three.js + scene embedded. Opens in any browser.",
    },
    {
      key: "project",
      icon: "folder_zip",
      label: "Project File (.vibecanvas)",
      desc: "Full project with all scene data. Re-open in VibeCanvas Studio.",
    },
  ];

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-on-surface/10 backdrop-blur-[2px]"
    >
      <div className="bg-white/70 backdrop-blur-[20px] w-full max-w-4xl rounded shadow-2xl border border-outline-variant/20 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-on-surface">
              Production Export
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Configure output settings for deployment.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded hover:bg-surface-container-highest"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-[400px]">
          {/* Left: Format selection */}
          <div className="w-full md:w-5/12 p-8 bg-surface-container-low/30 border-r border-outline-variant/20">
            <h3 className="text-sm font-medium text-on-surface uppercase tracking-widest mb-6">
              Output Format
            </h3>
            <div className="space-y-3">
              {formatOptions.map((opt) => (
                <label key={opt.key} className="block relative cursor-pointer group">
                  <input
                    type="radio"
                    name="export_format"
                    value={opt.key}
                    checked={format === opt.key}
                    onChange={() => setFormat(opt.key)}
                    className="peer sr-only"
                  />
                  <div className="p-4 rounded border border-outline-variant/20 bg-surface-container-lowest peer-checked:border-primary peer-checked:bg-primary-container/20 transition-all hover:border-outline-variant/50">
                    <div className="flex items-start gap-3">
                      <span className={`material-symbols-outlined mt-0.5 ${format === opt.key ? "text-primary" : "text-on-surface-variant"}`}>
                        {opt.icon}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-on-surface">{opt.label}</div>
                        <div className="text-xs text-on-surface-variant mt-1">{opt.desc}</div>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Right: Configuration */}
          <div className="w-full md:w-7/12 p-8">
            <h3 className="text-sm font-medium text-on-surface uppercase tracking-widest mb-6">
              Configuration
            </h3>
            <div className="space-y-6">
              {format !== "project" && (
                <>
                  <ToggleRow
                    label="Optimize Meshes for Export"
                    desc="Replace textured GLTF meshes with lightweight shell geometry. Dramatically reduces file size."
                    checked={optimizeMeshes}
                    onChange={setOptimizeMeshes}
                  />
                  <ToggleRow
                    label="Bundle Rendering Engine"
                    desc="Include Three.js core via CDN import map in the output file."
                    checked={bundleEngine}
                    onChange={setBundleEngine}
                  />
                  <ToggleRow
                    label="Texture Compression"
                    desc="Compress HTML textures for smaller output (may reduce quality)."
                    checked={textureCompression}
                    onChange={setTextureCompression}
                  />
                  <div className="pt-4 border-t border-outline-variant/20">
                    <label className="block text-sm text-on-surface mb-2">
                      Target Canvas Resolution
                    </label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as ExportOptions["resolution"])}
                      className="block w-full rounded border-outline-variant/30 bg-surface-container-lowest text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary h-10 px-3"
                    >
                      <option value="responsive">Responsive (Auto-scale to container)</option>
                      <option value="1080p">Fixed 1080p (1920×1080)</option>
                      <option value="4k">Fixed 4K (3840×2160)</option>
                    </select>
                  </div>
                </>
              )}
              {format === "project" && (
                <p className="text-sm text-on-surface-variant">
                  Saves all scene objects, GLTF models (as base64), HTML panels, and texture
                  assignments to a .vibecanvas JSON file. Full fidelity — no optimization applied.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low/50 flex justify-end gap-4 items-center">
          <div className="text-xs text-on-surface-variant mr-auto font-mono">
            Estimated Size: ~{estimateSize()}
          </div>
          {status && (
            <span className="text-xs text-primary font-medium">{status}</span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-medium text-on-surface bg-surface-container-highest hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          {format === "standalone" && (
            <button
              onClick={handlePreview}
              className="px-4 py-2 rounded text-sm font-medium text-on-surface border border-outline-variant/30 hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              Preview
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-6 py-2 rounded text-sm font-medium text-on-primary shadow-sm hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 primary-gradient"
          >
            <span className="material-symbols-outlined text-[18px]">
              {exporting ? "hourglass_empty" : "rocket_launch"}
            </span>
            {exporting ? "Exporting…" : "Generate Production Bundle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-on-surface">{label}</div>
        <div className="text-xs text-on-surface-variant mt-0.5">{desc}</div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  );
}
