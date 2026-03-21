"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ShortcutsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly {
    readonly keys: string;
    readonly description: string;
  }[];
}

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "1", description: "Go to Cameras" },
      { keys: "2", description: "Go to Events" },
      { keys: "3", description: "Go to Recordings" },
      { keys: "4", description: "Go to Rules" },
      { keys: "5", description: "Go to Settings" },
      { keys: "6", description: "Go to System Health" },
    ],
  },
  {
    title: "Camera",
    shortcuts: [{ keys: "Cmd+N", description: "Add new camera" }],
  },
  {
    title: "General",
    shortcuts: [
      { keys: "Cmd+K", description: "Search cameras" },
      { keys: "Esc", description: "Close modal / dialog" },
      { keys: "?", description: "Show this help" },
    ],
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-50">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map(({ keys, description }) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-zinc-300">{description}</span>
                    <div className="flex items-center gap-1">
                      {keys.split("+").map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex min-w-[24px] items-center justify-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-600 text-center">
            Press{" "}
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">
              ?
            </kbd>{" "}
            to toggle this panel
          </p>
        </div>
      </div>
    </div>
  );
}
