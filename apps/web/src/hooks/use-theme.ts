"use client";

import { useEffect, useState, useCallback } from "react";
import { useThemeStore, type Theme } from "@/stores/theme";

interface UseThemeReturn {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
  readonly resolvedTheme: "dark" | "light";
  readonly cycleTheme: () => void;
}

function getSystemPreference(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: Theme): "dark" | "light" {
  return theme === "system" ? getSystemPreference() : theme;
}

function applyThemeToDocument(resolved: "dark" | "light"): void {
  const html = document.documentElement;
  if (resolved === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
}

export function useTheme(): UseThemeReturn {
  const { theme, setTheme } = useThemeStore();
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    resolveTheme(theme),
  );

  // Apply theme on mount and when theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, [theme]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    const order: readonly Theme[] = ["dark", "light", "system"];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]!);
  }, [theme, setTheme]);

  return { theme, setTheme, resolvedTheme, cycleTheme };
}
