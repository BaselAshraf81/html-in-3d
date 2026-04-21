import { useCallback } from "react";
import { useStore } from "@/store/useStore";

function TransformRow({
  label,
  values,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  onChange: (axis: number, value: number) => void;
}) {
  const axisConfig = [
    { label: "X", color: "text-error" },
    { label: "Y", color: "text-green-600" },
    { label: "Z", color: "text-primary" },
  ];

  return (
    <div className="flex items-center text-sm">
      <span className="w-16 text-xs text-on-surface-variant text-right pr-3">
        {label}
      </span>
      <div className="flex-1 grid grid-cols-3 gap-1">
        {axisConfig.map((axis, i) => (
          <div
            key={axis.label}
            className="bg-surface-container-lowest border-b border-transparent focus-within:border-primary flex items-center px-2 py-1 rounded-sm"
          >
            <span className={`text-[10px] ${axis.color} mr-1 font-mono`}>
              {axis.label}
            </span>
            <input
              type="number"
              step={label === "Scale" ? 0.1 : label === "Rotation" ? 1 : 0.1}
              value={
                label === "Rotation"
                  ? ((values[i] * 180) / Math.PI).toFixed(1)
                  : values[i].toFixed(2)
              }
              onChange={(e) => {
                const raw = parseFloat(e.target.value) || 0;
                const val =
                  label === "Rotation" ? (raw * Math.PI) / 180 : raw;
                onChange(i, val);
              }}
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 text-right font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PropertiesPanel() {
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const objects = useStore((s) => s.objects);
  const updateObjectTransform = useStore((s) => s.updateObjectTransform);
  const updateObjectProperty = useStore((s) => s.updateObjectProperty);
  const duplicateObject = useStore((s) => s.duplicateObject);
  const removeObject = useStore((s) => s.removeObject);

  const selected = objects.find((o) => o.id === selectedObjectId);

  const handleTransformChange = useCallback(
    (field: "position" | "rotation" | "scale", axis: number, value: number) => {
      if (!selected) return;
      const current = [...selected[field]] as [number, number, number];
      current[axis] = value;
      updateObjectTransform(selected.id, { [field]: current });
    },
    [selected, updateObjectTransform]
  );

  return (
    <aside className="flex-1 glass-panel ghost-border rounded-lg soft-focus-shadow flex flex-col overflow-hidden">
      <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
        <h2 className="text-sm font-semibold tracking-tight text-on-surface">
          Properties
        </h2>
        <button className="text-on-surface-variant hover:text-on-surface">
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant text-xs text-center px-4">
            Select an object to view its properties.
          </div>
        ) : (
          <>
            {/* Object Info */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">
                  category
                </span>
              </div>
              <div>
                <div className="text-sm font-medium text-on-surface">
                  {selected.name}
                </div>
                <div className="text-xs text-on-surface-variant capitalize">
                  {selected.type} Primitive
                </div>
              </div>
            </div>

            {/* Transform Section */}
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant tracking-wider uppercase mb-3 pl-2 border-l-2 border-primary/30">
                Transform
              </h3>
              <div className="flex flex-col gap-2">
                <TransformRow
                  label="Position"
                  values={selected.position}
                  onChange={(axis, val) =>
                    handleTransformChange("position", axis, val)
                  }
                />
                <TransformRow
                  label="Rotation"
                  values={selected.rotation}
                  onChange={(axis, val) =>
                    handleTransformChange("rotation", axis, val)
                  }
                />
                <TransformRow
                  label="Scale"
                  values={selected.scale}
                  onChange={(axis, val) =>
                    handleTransformChange("scale", axis, val)
                  }
                />
              </div>
            </div>

            {/* Material Section */}
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant tracking-wider uppercase mb-3 pl-2 border-l-2 border-outline-variant/50">
                Material
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center text-sm">
                  <span className="w-16 text-xs text-on-surface-variant text-right pr-3">
                    Color
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(e) =>
                        updateObjectProperty(selected.id, {
                          color: e.target.value,
                        })
                      }
                      className="w-8 h-6 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-on-surface-variant">
                      {selected.color}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mesh Properties */}
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant tracking-wider uppercase mb-3 pl-2 border-l-2 border-outline-variant/50">
                Mesh
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-on-surface-variant">Visible</span>
                  <button
                    onClick={() =>
                      updateObjectProperty(selected.id, {
                        visible: !selected.visible,
                      })
                    }
                    className={`w-8 h-4 rounded-full relative transition-colors ${
                      selected.visible
                        ? "bg-primary"
                        : "bg-surface-container-highest"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 bg-surface-container-lowest rounded-full shadow-sm transition-all ${
                        selected.visible ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-on-surface-variant">
                    Cast Shadow
                  </span>
                  <button
                    onClick={() =>
                      updateObjectProperty(selected.id, {
                        castShadow: !selected.castShadow,
                      })
                    }
                    className={`w-8 h-4 rounded-full relative transition-colors ${
                      selected.castShadow
                        ? "bg-primary"
                        : "bg-surface-container-highest"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 bg-surface-container-lowest rounded-full shadow-sm transition-all ${
                        selected.castShadow ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-on-surface-variant">Locked</span>
                  <button
                    onClick={() =>
                      updateObjectProperty(selected.id, {
                        locked: !selected.locked,
                      })
                    }
                    className={`w-8 h-4 rounded-full relative transition-colors ${
                      selected.locked
                        ? "bg-primary"
                        : "bg-surface-container-highest"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 bg-surface-container-lowest rounded-full shadow-sm transition-all ${
                        selected.locked ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto pt-4 border-t border-outline-variant/20 flex gap-2">
              <button
                onClick={() => duplicateObject(selected.id)}
                className="flex-1 text-xs font-medium text-on-surface-variant hover:text-on-surface bg-surface-container-highest hover:bg-surface-container-high rounded py-1.5 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">
                  content_copy
                </span>
                Duplicate
              </button>
              <button
                onClick={() => removeObject(selected.id)}
                className="flex-1 text-xs font-medium text-error hover:text-on-error-container bg-surface-container-highest hover:bg-error-container/30 rounded py-1.5 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">
                  delete
                </span>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
