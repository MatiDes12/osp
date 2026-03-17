import { create } from "zustand";

interface SidebarState {
  readonly collapsed: boolean;
  readonly toggle: () => void;
  readonly setCollapsed: (value: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (value: boolean) => set({ collapsed: value }),
}));
