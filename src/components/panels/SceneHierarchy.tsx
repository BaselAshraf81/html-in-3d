import { useStore } from "@/store/useStore";

export default function SceneHierarchy() {
  const objects = useStore((s) => s.objects);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const selectObject = useStore((s) => s.selectObject);
  const updateObjectProperty = useStore((s) => s.updateObjectProperty);
  const removeObject = useStore((s) => s.removeObject);
  const duplicateObject = useStore((s) => s.duplicateObject);

  const gltfModels = useStore((s) => s.gltfModels);
  const selectedGltfId = useStore((s) => s.selectedGltfId);
  const selectGltf = useStore((s) => s.selectGltf);
  const updateGltfProperty = useStore((s) => s.updateGltfProperty);
  const removeGltfModel = useStore((s) => s.removeGltfModel);
  const duplicateGltfModel = useStore((s) => s.duplicateGltfModel);
  const toggleGltfExpanded = useStore((s) => s.toggleGltfExpanded);
  const snapshot = useStore((s) => s.snapshot);

  return (
    <aside className="fixed left-16 top-12 bottom-6 w-64 glass-panel ghost-border border-l-0 flex flex-col z-40 soft-focus-shadow overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-on-surface tracking-tight uppercase">
          Scene Graph
        </h2>
        <div className="flex gap-1">
          <button className="text-on-surface-variant hover:text-on-surface p-0.5">
            <span className="material-symbols-outlined text-[16px]">search</span>
          </button>
          <button className="text-on-surface-variant hover:text-on-surface p-0.5">
            <span className="material-symbols-outlined text-[16px]">filter_list</span>
          </button>
        </div>
      </div>

      {/* Scene tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-[2px] text-sm">
          {/* Root node */}
          <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-container-highest rounded cursor-pointer">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              arrow_drop_down
            </span>
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              public
            </span>
            <span className="text-on-surface text-sm font-medium">World_Root</span>
          </div>

          {/* Environment */}
          <div className="flex items-center gap-2 px-2 py-1.5 pl-6 rounded cursor-default opacity-60">
            <span className="material-symbols-outlined text-xs text-on-surface-variant invisible">
              arrow_right
            </span>
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              lightbulb
            </span>
            <span className="text-on-surface-variant text-sm">Environment</span>
          </div>

          {/* Camera */}
          <div className="flex items-center gap-2 px-2 py-1.5 pl-6 rounded cursor-default opacity-60">
            <span className="material-symbols-outlined text-xs text-on-surface-variant invisible">
              arrow_right
            </span>
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              videocam
            </span>
            <span className="text-on-surface-variant text-sm">Main Camera</span>
          </div>

          {/* Primitive objects */}
          {objects.map((obj) => {
            const isSelected = selectedObjectId === obj.id;
            return (
              <div
                key={obj.id}
                onClick={() => selectObject(obj.id)}
                className={`flex items-center gap-2 px-2 py-1.5 pl-6 rounded cursor-pointer group transition-colors ${
                  isSelected
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-surface-container-highest"
                }`}
              >
                <span className="material-symbols-outlined text-xs text-on-surface-variant invisible">
                  arrow_right
                </span>
                <span
                  className={`material-symbols-outlined text-xs ${
                    isSelected ? "text-primary" : "text-on-surface-variant"
                  }`}
                  style={isSelected ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  category
                </span>
                <span
                  className={`text-sm flex-1 truncate ${
                    isSelected ? "text-primary font-medium" : "text-on-surface-variant"
                  }`}
                >
                  {obj.name}
                </span>

                {/* Visibility */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateObjectProperty(obj.id, { visible: !obj.visible });
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {obj.visible ? "visibility" : "visibility_off"}
                  </span>
                </button>

                {/* Lock */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateObjectProperty(obj.id, { locked: !obj.locked });
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {obj.locked ? "lock" : "lock_open"}
                  </span>
                </button>

                {/* Duplicate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    snapshot();
                    duplicateObject(obj.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-primary"
                  title="Duplicate"
                >
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                </button>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    snapshot();
                    removeObject(obj.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-error"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            );
          })}

          {/* GLTF Models */}
          {gltfModels.map((model) => {
            const isSelected = selectedGltfId === model.id;
            return (
              <div key={model.id}>
                {/* GLTF parent row */}
                <div
                  onClick={() => selectGltf(model.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 pl-6 rounded cursor-pointer group transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "hover:bg-surface-container-highest"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGltfExpanded(model.id);
                    }}
                    className="flex items-center"
                  >
                    <span
                      className={`material-symbols-outlined text-xs ${
                        isSelected ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {model.expanded ? "arrow_drop_down" : "arrow_right"}
                    </span>
                  </button>
                  <span
                    className={`material-symbols-outlined text-xs ${
                      isSelected ? "text-primary" : "text-on-surface-variant"
                    }`}
                    style={isSelected ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    view_in_ar
                  </span>
                  <span
                    className={`text-sm flex-1 truncate ${
                      isSelected ? "text-primary font-medium" : "text-on-surface-variant"
                    }`}
                  >
                    {model.name}
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant/60">
                    GLTF
                  </span>

                  {/* Visibility */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateGltfProperty(model.id, { visible: !model.visible });
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {model.visible ? "visibility" : "visibility_off"}
                    </span>
                  </button>

                  {/* Lock */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateGltfProperty(model.id, { locked: !model.locked });
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {model.locked ? "lock" : "lock_open"}
                    </span>
                  </button>

                  {/* Duplicate */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      snapshot();
                      duplicateGltfModel(model.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-primary"
                    title="Duplicate"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      snapshot();
                      removeGltfModel(model.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>

                {/* GLTF mesh children */}
                {model.expanded &&
                  model.meshNodes.map((mesh) => (
                    <div
                      key={mesh.uuid}
                      className="flex items-center gap-2 px-2 py-1.5 pl-10 rounded cursor-default hover:bg-surface-container-highest"
                    >
                      <span className="material-symbols-outlined text-xs text-on-surface-variant invisible">
                        arrow_right
                      </span>
                      <span className="material-symbols-outlined text-xs text-on-surface-variant">
                        category
                      </span>
                      <span className="text-on-surface-variant text-sm truncate flex-1">
                        {mesh.name}
                      </span>
                    </div>
                  ))}
              </div>
            );
          })}

          {objects.length === 0 && gltfModels.length === 0 && (
            <div className="px-6 py-8 text-center text-on-surface-variant text-xs">
              No objects in scene.
              <br />
              Use the toolbar below to add meshes.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
