import { useState, useCallback, useRef, useEffect } from "react";
import { useStore, type HtmlPanel, type TextureAssignment } from "@/store/useStore";

function PanelEditor({ panel }: { panel: HtmlPanel }) {
  const updateHtmlPanel = useStore((s) => s.updateHtmlPanel);
  const removeHtmlPanel = useStore((s) => s.removeHtmlPanel);
  const textureAssignments = useStore((s) => s.textureAssignments);
  const [localContent, setLocalContent] = useState(panel.htmlContent);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const assignmentCount = textureAssignments.filter(
    (a) => a.panelId === panel.id
  ).length;

  // Sync local content when panel changes externally
  useEffect(() => {
    if (!isEditing) setLocalContent(panel.htmlContent);
  }, [panel.htmlContent, isEditing]);

  const handleSave = useCallback(() => {
    updateHtmlPanel(panel.id, { htmlContent: localContent });
    setIsEditing(false);
  }, [panel.id, localContent, updateHtmlPanel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Allow Tab to insert spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = localContent;
        setLocalContent(val.substring(0, start) + "  " + val.substring(end));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [localContent]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            texture
          </span>
          <input
            type="text"
            value={panel.name}
            onChange={(e) => updateHtmlPanel(panel.id, { name: e.target.value })}
            className="bg-transparent border-none p-0 text-sm font-medium text-on-surface focus:ring-0 w-32"
          />
          {assignmentCount > 0 && (
            <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {assignmentCount} assigned
            </span>
          )}
        </div>
        <button
          onClick={() => removeHtmlPanel(panel.id)}
          className="text-on-surface-variant hover:text-error transition-colors p-0.5"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>

      {/* Resolution */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-on-surface-variant">Resolution:</span>
        <span className="text-on-surface font-mono">{panel.width} × {panel.height}</span>
      </div>

      {/* Code editor */}
      <div className="relative">
        <div className="flex items-center justify-between px-2 py-1 bg-surface-container-lowest rounded-t border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px] text-on-surface-variant">code</span>
            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">HTML</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="text-on-surface-variant hover:text-primary transition-colors p-0.5"
              title="Save"
            >
              <span className="material-symbols-outlined text-[14px]">save</span>
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => {
            setLocalContent(e.target.value);
            setIsEditing(true);
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="w-full h-40 bg-surface-container-lowest text-xs font-mono text-on-surface p-3 border-none rounded-b focus:ring-0 resize-none leading-relaxed"
          placeholder="Enter HTML content..."
        />
      </div>

      {/* Live indicator */}
      {assignmentCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
            Live texture active
          </span>
        </div>
      )}
    </div>
  );
}

export default function HtmlTexturePanel() {
  const htmlPanels = useStore((s) => s.htmlPanels);
  const addHtmlPanel = useStore((s) => s.addHtmlPanel);
  const selectedPanelId = useStore((s) => s.selectedPanelId);
  const selectPanel = useStore((s) => s.selectPanel);

  // Assignment UI state
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const textureAssignments = useStore((s) => s.textureAssignments);
  const assignTexture = useStore((s) => s.assignTexture);
  const removeAssignment = useStore((s) => s.removeAssignment);

  const [panelCounter, setPanelCounter] = useState(0);

  const handleAddPanel = useCallback(() => {
    const num = panelCounter + 1;
    setPanelCounter(num);
    addHtmlPanel(`HTML_Panel_${String(num).padStart(2, "0")}`);
  }, [panelCounter, addHtmlPanel]);

  // File drop handler for .html files
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const handleHtmlFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const name = file.name.replace(/\.html?$/i, "");
      const num = panelCounter + 1;
      setPanelCounter(num);
      addHtmlPanel(name, text);
    },
    [panelCounter, addHtmlPanel]
  );

  const handleImageFile = useCallback(
    async (file: File) => {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/\.[^.]+$/, "");
      const num = panelCounter + 1;
      setPanelCounter(num);
      const html = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;"><img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;" /></div>`;
      addHtmlPanel(name, html);
    },
    [panelCounter, addHtmlPanel]
  );

  return (
    <aside className="flex-1 glass-panel ghost-border rounded-lg soft-focus-shadow flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/20 bg-surface-container-low/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface tracking-tight uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">palette</span>
          HTML Textures
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="text-on-surface-variant hover:text-on-surface p-1 transition-colors"
            title="Import image as texture"
          >
            <span className="material-symbols-outlined text-[16px]">image</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-on-surface-variant hover:text-on-surface p-1 transition-colors"
            title="Import .html file"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
          </button>
          <button
            onClick={handleAddPanel}
            className="text-on-surface-variant hover:text-primary p-1 transition-colors"
            title="New HTML panel"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleHtmlFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      </div>

      {/* Panel tabs — outside scroll area so they're always visible */}
      {htmlPanels.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-1 border-b border-outline-variant/10 flex-shrink-0">
          {htmlPanels.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPanel(p.id)}
              className={`px-3 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                selectedPanelId === p.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-on-surface-variant hover:bg-surface-container-highest"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {htmlPanels.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-3">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
              texture
            </span>
            <p className="text-xs text-on-surface-variant">
              No panels yet. Create an HTML panel or import an image to start texturing meshes.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddPanel}
                className="text-xs font-medium text-primary hover:text-primary-dim transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                New Panel
              </button>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="text-xs font-medium text-primary hover:text-primary-dim transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">image</span>
                Import Image
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active panel editor */}
            {htmlPanels.map((panel) => {
              const isActive =
                selectedPanelId === panel.id ||
                (selectedPanelId === null && htmlPanels[0]?.id === panel.id);
              if (!isActive) return null;
              return <PanelEditor key={panel.id} panel={panel} />;
            })}

            {/* Assignment section */}
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3 pl-2 border-l-2 border-primary/30">
                Assignments
              </h3>

              {/* Current assignments */}
              {textureAssignments.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {textureAssignments.map((assignment) => (
                    <AssignmentCard key={assignment.id} assignment={assignment} />
                  ))}
                </div>
              )}

              {/* Quick assign: dropdown to pick a target */}
              <QuickAssign />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/** Assignment card with UV transform controls */
function AssignmentCard({ assignment }: { assignment: TextureAssignment }) {
  const htmlPanels = useStore((s) => s.htmlPanels);
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const removeAssignment = useStore((s) => s.removeAssignment);
  const updateAssignmentUV = useStore((s) => s.updateAssignmentUV);
  const [expanded, setExpanded] = useState(false);
  const [scaleLinked, setScaleLinked] = useState(true);

  const panel = htmlPanels.find((p) => p.id === assignment.panelId);
  let targetName = "Unknown";
  if (assignment.targetType === "primitive") {
    targetName = objects.find((o) => o.id === assignment.targetId)?.name ?? "Deleted";
  } else {
    const model = gltfModels.find((m) => m.id === assignment.targetId);
    const mesh = model?.meshNodes.find((n) => n.meshName === assignment.meshName);
    targetName = mesh?.name ?? model?.name ?? "Deleted";
  }

  const handleScaleX = (v: number) => {
    if (scaleLinked) {
      const ratio = assignment.uvRepeat[0] !== 0 ? v / assignment.uvRepeat[0] : 1;
      updateAssignmentUV(assignment.id, {
        uvRepeat: [v, +(assignment.uvRepeat[1] * ratio).toFixed(2)],
      });
    } else {
      updateAssignmentUV(assignment.id, { uvRepeat: [v, assignment.uvRepeat[1]] });
    }
  };

  const handleScaleY = (v: number) => {
    if (scaleLinked) {
      const ratio = assignment.uvRepeat[1] !== 0 ? v / assignment.uvRepeat[1] : 1;
      updateAssignmentUV(assignment.id, {
        uvRepeat: [+(assignment.uvRepeat[0] * ratio).toFixed(2), v],
      });
    } else {
      updateAssignmentUV(assignment.id, { uvRepeat: [assignment.uvRepeat[0], v] });
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded ghost-border">
      <div className="flex items-center gap-2 px-2 py-1.5 group">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <p className="text-xs text-on-surface truncate">{panel?.name}</p>
          <p className="text-[10px] text-on-surface-variant truncate">→ {targetName}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-on-surface-variant hover:text-on-surface transition-all p-0.5"
        >
          <span className="material-symbols-outlined text-[12px]">
            {expanded ? "expand_less" : "tune"}
          </span>
        </button>
        <button
          onClick={() => removeAssignment(assignment.id)}
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all p-0.5"
        >
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-2 border-t border-outline-variant/10 pt-2">
          {/* Mapping mode toggle */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-on-surface-variant">Mapping:</span>
            <button
              onClick={() => updateAssignmentUV(assignment.id, { mappingMode: "uv" })}
              className={`px-2 py-0.5 rounded transition-colors ${
                assignment.mappingMode === "uv"
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              UV
            </button>
            <button
              onClick={() => updateAssignmentUV(assignment.id, { mappingMode: "projected" })}
              className={`px-2 py-0.5 rounded transition-colors ${
                assignment.mappingMode === "projected"
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Projected
            </button>
          </div>
          {assignment.mappingMode === "projected" && (
            <p className="text-[9px] text-on-surface-variant/70 leading-tight">
              Projects texture flat onto the front surface — fixes tearing on irregular meshes.
            </p>
          )}

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1">
            <PresetBtn label="Fit" onClick={() => updateAssignmentUV(assignment.id, {
              uvOffset: [0, 0], uvRepeat: [1, 1], uvRotation: 0,
            })} />
            <PresetBtn label="Fill" onClick={() => updateAssignmentUV(assignment.id, {
              uvOffset: [0, 0], uvRepeat: [0.5, 0.5],
            })} />
            <PresetBtn label="Tile 2×2" onClick={() => updateAssignmentUV(assignment.id, {
              uvRepeat: [2, 2],
            })} />
            <PresetBtn label="Flip H" onClick={() => updateAssignmentUV(assignment.id, {
              uvRepeat: [-assignment.uvRepeat[0], assignment.uvRepeat[1]],
            })} />
            <PresetBtn label="Flip V" onClick={() => updateAssignmentUV(assignment.id, {
              uvRepeat: [assignment.uvRepeat[0], -assignment.uvRepeat[1]],
            })} />
            <PresetBtn label="↻ 90°" onClick={() => updateAssignmentUV(assignment.id, {
              uvRotation: assignment.uvRotation + Math.PI / 2,
            })} />
          </div>

          {/* Sliders */}
          <UVSlider
            label="Offset X" value={assignment.uvOffset[0]} min={-2} max={2} step={0.01} decimals={2}
            onChange={(v) => updateAssignmentUV(assignment.id, { uvOffset: [v, assignment.uvOffset[1]] })}
          />
          <UVSlider
            label="Offset Y" value={assignment.uvOffset[1]} min={-2} max={2} step={0.01} decimals={2}
            onChange={(v) => updateAssignmentUV(assignment.id, { uvOffset: [assignment.uvOffset[0], v] })}
          />

          {/* Scale X with link toggle */}
          <div className="flex items-center gap-0">
            <div className="flex-1">
              <UVSlider
                label="Scale X" value={assignment.uvRepeat[0]} min={0.1} max={10} step={0.1} decimals={2}
                onChange={handleScaleX}
              />
            </div>
            <button
              onClick={() => setScaleLinked(!scaleLinked)}
              className={`px-1 text-[10px] transition-colors ${
                scaleLinked ? "text-primary" : "text-on-surface-variant/40"
              }`}
              title={scaleLinked ? "Unlink scale axes" : "Link scale axes"}
            >
              {scaleLinked ? "🔗" : "🔓"}
            </button>
          </div>
          <UVSlider
            label="Scale Y" value={assignment.uvRepeat[1]} min={0.1} max={10} step={0.1} decimals={2}
            onChange={handleScaleY}
          />

          <UVSlider
            label="Rotation" value={Math.round(assignment.uvRotation * 180 / Math.PI)} min={0} max={360} step={1} decimals={0}
            onChange={(v) => updateAssignmentUV(assignment.id, { uvRotation: v * Math.PI / 180 })}
          />

          <div className="flex items-center justify-end gap-2">
            <AutoFitButton assignment={assignment} />
            <button
              onClick={() => updateAssignmentUV(assignment.id, {
                uvOffset: [0, 0], uvRepeat: [1, 1], uvRotation: 0, mappingMode: "uv",
              })}
              className="text-[10px] text-on-surface-variant hover:text-primary transition-colors"
            >
              Reset UV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small preset button */
function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 text-[9px] rounded bg-surface-container-high/50 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
    >
      {label}
    </button>
  );
}

function AutoFitButton({ assignment }: { assignment: TextureAssignment }) {
  const updateAssignmentUV = useStore((s) => s.updateAssignmentUV);

  const handleAutoFit = () => {
    // Switch to projected mode with clean defaults.
    // Projected mode generates planar UVs from the geometry's bounding box,
    // so the texture maps cleanly onto the front surface regardless of the
    // original UV layout — no tearing on irregular meshes.
    updateAssignmentUV(assignment.id, {
      uvOffset: [0, 0],
      uvRepeat: [1, 1],
      uvRotation: 0,
      mappingMode: "projected",
    });
  };

  return (
    <button
      onClick={handleAutoFit}
      className="text-[10px] text-on-surface-variant hover:text-primary transition-colors"
    >
      Auto Fit
    </button>
  );
}

function UVSlider({ label, value, min, max, step, decimals, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  decimals: number; onChange: (v: number) => void;
}) {
  const [editValue, setEditValue] = useState<string | null>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const displayValue = editValue ?? value.toFixed(decimals);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    const next = Math.min(max, Math.max(min, +(value + delta).toFixed(decimals)));
    onChange(next);
  }, [value, min, max, step, decimals, onChange]);

  const commitEdit = () => {
    if (editValue !== null) {
      const parsed = parseFloat(editValue);
      if (!isNaN(parsed)) {
        onChange(Math.min(max, Math.max(min, parsed)));
      }
      setEditValue(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-14 text-on-surface-variant text-right shrink-0">{label}</span>
      <input
        ref={sliderRef}
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onWheel={handleWheel}
        className="flex-1 h-1 accent-primary min-w-0"
      />
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
        onFocus={(e) => { setEditValue(value.toFixed(decimals)); e.target.select(); }}
        className="w-11 text-right text-on-surface font-mono bg-transparent border-b border-outline-variant/20 focus:border-primary focus:outline-none px-0.5 py-0 shrink-0"
      />
    </div>
  );
}

/** Quick-assign dropdown for assigning the active panel to a mesh */
function QuickAssign() {
  const objects = useStore((s) => s.objects);
  const gltfModels = useStore((s) => s.gltfModels);
  const htmlPanels = useStore((s) => s.htmlPanels);
  const selectedPanelId = useStore((s) => s.selectedPanelId);
  const assignTexture = useStore((s) => s.assignTexture);

  const activePanelId = selectedPanelId ?? htmlPanels[0]?.id;
  if (!activePanelId) return null;

  const handleAssign = (value: string) => {
    if (!value) return;
    const [type, targetId, meshName] = value.split("|");
    assignTexture(
      activePanelId,
      type as "primitive" | "gltfMesh",
      targetId,
      meshName || undefined
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
        Assign to mesh
      </span>
      <select
        value=""
        onChange={(e) => handleAssign(e.target.value)}
        className="w-full bg-surface-container-lowest text-xs text-on-surface border-none rounded px-2 py-2 focus:ring-0 ghost-border"
      >
        <option value="">Select a target mesh...</option>
        {objects.length > 0 && (
          <optgroup label="Primitives">
            {objects.map((obj) => (
              <option key={obj.id} value={`primitive|${obj.id}`}>
                {obj.name}
              </option>
            ))}
          </optgroup>
        )}
        {gltfModels.map((model) => (
          <optgroup key={model.id} label={`${model.name} (GLTF)`}>
            {model.meshNodes.map((mesh) => (
              <option
                key={mesh.meshName}
                value={`gltfMesh|${model.id}|${mesh.meshName}`}
              >
                {mesh.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
