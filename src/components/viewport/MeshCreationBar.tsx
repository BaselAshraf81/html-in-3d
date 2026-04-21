import { useStore, type MeshType } from "@/store/useStore";

interface MeshOption {
  type: MeshType;
  icon: string;
  label: string;
}

const meshOptions: MeshOption[] = [
  { type: "plane", icon: "square", label: "Plane" },
  { type: "box", icon: "check_box_outline_blank", label: "Box" },
  { type: "sphere", icon: "circle", label: "Sphere" },
  { type: "cylinder", icon: "filter_tilt_shift", label: "Cylinder" },
  { type: "torus", icon: "trip_origin", label: "Torus" },
  { type: "cone", icon: "change_history", label: "Cone" },
];

export default function MeshCreationBar() {
  const addObject = useStore((s) => s.addObject);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
      <div className="glass-panel ghost-border rounded-lg p-2 flex items-center gap-1 soft-focus-shadow">
        <span className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider px-2">
          Add Mesh
        </span>
        <div className="w-[1px] h-6 bg-outline-variant/30 mx-1" />
        {meshOptions.map((opt) => (
          <button
            key={opt.type}
            onClick={() => addObject(opt.type)}
            title={opt.label}
            className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded transition-colors flex flex-col items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-[20px]">
              {opt.icon}
            </span>
            <span className="text-[9px] font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
