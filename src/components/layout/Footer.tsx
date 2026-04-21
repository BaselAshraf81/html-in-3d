import { useStore } from "@/store/useStore";

export default function Footer() {
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const objects = useStore((s) => s.objects);
  const selected = objects.find((o) => o.id === selectedObjectId);

  const coords = selected
    ? `XYZ: ${selected.position[0].toFixed(1)}, ${selected.position[1].toFixed(1)}, ${selected.position[2].toFixed(1)}`
    : "XYZ: —";

  return (
    <footer className="fixed bottom-0 left-0 w-full z-[100] flex items-center justify-between px-4 h-6 bg-slate-100 border-t border-slate-900/10 select-none">
      <div className="text-[10px] font-mono uppercase tracking-tighter text-slate-500">
        VibeCanvas Studio | 60 FPS | {coords} | Objects: {objects.length}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-mono uppercase tracking-tighter text-slate-500 hover:underline cursor-pointer">
          Feedback
        </span>
        <span className="text-[10px] font-mono uppercase tracking-tighter text-slate-500 hover:underline cursor-pointer">
          Docs
        </span>
      </div>
    </footer>
  );
}
