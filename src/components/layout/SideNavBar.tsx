import { useStore, type ToolMode } from "@/store/useStore";

interface ToolButton {
  mode: ToolMode;
  icon: string;
  label: string;
  filled?: boolean;
}

const tools: (ToolButton | "separator")[] = [
  { mode: "pointer", icon: "arrow_selector_tool", label: "Pointer (mesh select)" },
  { mode: "select", icon: "near_me", label: "Select" },
  "separator",
  { mode: "translate", icon: "open_with", label: "Translate" },
  { mode: "rotate", icon: "sync", label: "Rotate" },
  { mode: "scale", icon: "aspect_ratio", label: "Scale" },
  "separator",
  { mode: "geometry", icon: "category", label: "Geometry" },
  { mode: "material", icon: "palette", label: "Materials" },
];

export default function SideNavBar() {
  const { toolMode, setToolMode } = useStore();

  return (
    <nav className="fixed left-0 top-12 bottom-6 z-50 flex flex-col items-center py-4 bg-slate-50/40 backdrop-blur-2xl w-16 border-r border-slate-900/5">
      <div className="flex flex-col gap-2 w-full px-2">
        {tools.map((tool, i) => {
          if (tool === "separator") {
            return (
              <div
                key={`sep-${i}`}
                className="h-[1px] w-8 mx-auto bg-slate-200/30 my-1"
              />
            );
          }
          const isActive = toolMode === tool.mode;
          return (
            <button
              key={tool.mode}
              onClick={() => setToolMode(tool.mode)}
              title={tool.label}
              className={`w-full aspect-square flex items-center justify-center rounded transition-all active:opacity-80 ${
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-slate-400 hover:text-slate-900"
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={
                  isActive
                    ? { fontVariationSettings: "'FILL' 1" }
                    : undefined
                }
              >
                {tool.icon}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
