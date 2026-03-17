"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";

interface MobileSidebarDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarDrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll when drawer is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close sidebar"
      />

      {/* Drawer panel */}
      <div className="relative z-50 h-full w-64 animate-[slideInLeft_200ms_ease-out]">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Reuse existing Sidebar — rendered in mobile drawer mode */}
        <Sidebar isMobileDrawer />
      </div>
    </div>
  );
}
