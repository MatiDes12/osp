import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

interface ThemeState {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "osp_theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }
  return "dark";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    set({ theme });
  },
}));
