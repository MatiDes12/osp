"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const NAV_ROUTES: Record<string, string> = {
  "1": "/cameras",
  "2": "/events",
  "3": "/recordings",
  "4": "/rules",
  "5": "/settings",
  "6": "/health",
};

interface KeyboardShortcutCallbacks {
  readonly onOpenSearch?: () => void;
  readonly onOpenAddCamera?: () => void;
  readonly onShowShortcuts?: () => void;
}

export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Cmd+K / Ctrl+K -- Focus search (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        callbacks.onOpenSearch?.();
        return;
      }

      // Cmd+N / Ctrl+N -- Open Add Camera dialog (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        callbacks.onOpenAddCamera?.();
        return;
      }

      // Skip remaining shortcuts when typing in an input
      if (isInput) return;

      // ? -- Show shortcuts help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        callbacks.onShowShortcuts?.();
        return;
      }

      // 1-6 -- Navigate to sidebar items
      const route = NAV_ROUTES[e.key];
      if (route && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        router.push(route);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router, callbacks]);
}
