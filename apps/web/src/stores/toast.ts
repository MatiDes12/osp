import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly type: ToastType;
}

interface ToastState {
  readonly toasts: readonly ToastItem[];
  readonly addToast: (message: string, type: ToastType) => void;
  readonly removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = String(nextId++);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function showToast(message: string, type: ToastType = "info") {
  useToastStore.getState().addToast(message, type);
}
