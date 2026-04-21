import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";

interface CameraPreset {
  label: string;
  key: string;
  position: [number, number, number];
  target: [number, number, number];
  shortcut: string;
}

const cameraPresets: CameraPreset[] = [
  { label: "Perspective", key: "perspective", position: [5, 4, 5], target: [0, 0, 0], shortcut: "Num 0" },
  { label: "Front", key: "front", position: [0, 1, 8], target: [0, 1, 0], shortcut: "Num 1" },
  { label: "Right", key: "right", position: [8, 1, 0], target: [0, 1, 0], shortcut: "Num 3" },
  { label: "Top", key: "top", position: [0, 10, 0.01], target: [0, 0, 0], shortcut: "Num 7" },
];

export default function ViewportOverlay() {
  const transformMode = useStore((s) => s.transformMode);
  const setTransformMode = useStore((s) => s.setTransformMode);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [activePreset, setActivePreset] = useState("perspective");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCameraOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applyPreset = (preset: CameraPreset) => {
    const fn = (window as any).__vibecanvas_applyPreset;
    if (fn) fn(preset);
    setActivePreset(preset.key);
    setCameraOpen(false);
  };

  const currentLabel = cameraPresets.find((p) => p.key === activePreset)?.label ?? "Perspective";

  return (
    <div className="absolute top-4 right-4 glass-panel ghost-border rounded p-1 flex items-center gap-1 soft-focus-shadow z-10">
      {/* Camera preset dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setCameraOpen(!cameraOpen)}
          className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest rounded text-sm font-medium flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[18px]">videocam</span>
          {currentLabel}
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant/60">
            {cameraOpen ? "expand_less" : "expand_more"}
          </span>
        </button>
        {cameraOpen && (
          <div className="absolute top-full right-0 mt-1 min-w-[160px] bg-white/90 backdrop-blur-xl rounded shadow-lg border border-slate-200/60 py-1 z-50">
            {cameraPresets.map((preset) => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset)}
                className={`w-full text-left px-3 py-1.5 text-sm flex justify-between items-center transition-colors ${
                  activePreset === preset.key
                    ? "text-primary bg-primary/5 font-medium"
                    : "text-slate-700 hover:bg-primary/5 hover:text-primary"
                }`}
              >
                <span>{preset.label}</span>
                <span className="text-[10px] font-mono text-slate-400">{preset.shortcut}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[1px] h-4 bg-outline-variant/30 mx-1" />

      {/* Transform mode buttons */}
      <button
        onClick={() => setTransformMode("translate")}
        className={`p-1.5 rounded ${
          transformMode === "translate"
            ? "text-primary bg-primary/10"
            : "text-on-surface-variant hover:bg-surface-container-highest"
        }`}
        title="Move (V)"
      >
        <span className="material-symbols-outlined text-[18px]">open_with</span>
      </button>
      <button
        onClick={() => setTransformMode("rotate")}
        className={`p-1.5 rounded ${
          transformMode === "rotate"
            ? "text-primary bg-primary/10"
            : "text-on-surface-variant hover:bg-surface-container-highest"
        }`}
        title="Rotate (R)"
      >
        <span className="material-symbols-outlined text-[18px]">sync</span>
      </button>
      <button
        onClick={() => setTransformMode("scale")}
        className={`p-1.5 rounded ${
          transformMode === "scale"
            ? "text-primary bg-primary/10"
            : "text-on-surface-variant hover:bg-surface-container-highest"
        }`}
        title="Scale (S)"
      >
        <span className="material-symbols-outlined text-[18px]">aspect_ratio</span>
      </button>

      <div className="w-[1px] h-4 bg-outline-variant/30 mx-1" />

      <button className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest rounded">
        <span className="material-symbols-outlined text-[18px]">grid_on</span>
      </button>
    </div>
  );
}
