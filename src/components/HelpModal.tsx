import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const shortcutGroups = [
  {
    title: "Transform",
    items: [
      { keys: "V / W", desc: "Move mode" },
      { keys: "R", desc: "Rotate mode" },
      { keys: "S", desc: "Scale mode" },
    ],
  },
  {
    title: "Selection",
    items: [
      { keys: "Esc", desc: "Deselect all" },
      { keys: "Delete / X", desc: "Delete selected" },
      { keys: "D", desc: "Duplicate selected" },
    ],
  },
  {
    title: "Camera",
    items: [
      { keys: "0 / Num 0", desc: "Perspective view" },
      { keys: "1 / Num 1", desc: "Front view" },
      { keys: "3 / Num 3", desc: "Right view" },
      { keys: "7 / Num 7", desc: "Top view" },
      { keys: "F", desc: "Focus / reset view" },
    ],
  },
  {
    title: "Project",
    items: [
      { keys: "Ctrl + S", desc: "Save project" },
      { keys: "Ctrl + O", desc: "Open project" },
      { keys: "Ctrl + N", desc: "New project" },
      { keys: "Ctrl + Z", desc: "Undo" },
      { keys: "Ctrl + Shift + Z", desc: "Redo" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: "?", desc: "Show this help" },
    ],
  },
];

export default function HelpModal({ open, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20 backdrop-blur-sm"
    >
      <div className="bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl border border-slate-200/60 w-[480px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">keyboard</span>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-600">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.split(" + ").map((k, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-slate-300 text-xs mx-0.5">+</span>}
                          <kbd className="inline-block px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-600 rounded border border-slate-200 min-w-[24px] text-center">
                            {k.trim()}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 text-center">
          <span className="text-[10px] text-slate-400">
            Press <kbd className="px-1 py-0.5 text-[10px] font-mono bg-slate-100 rounded border border-slate-200">?</kbd> anytime to toggle this panel
          </span>
        </div>
      </div>
    </div>
  );
}
