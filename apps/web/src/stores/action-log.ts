import { create } from "zustand";

export type ActionKind =
  | "navigate"
  | "click"
  | "api_call"
  | "api_response"
  | "api_error"
  | "state_change"
  | "event"
  | "websocket";

export interface ActionEntry {
  readonly id: number;
  readonly timestamp: string;
  readonly kind: ActionKind;
  readonly label: string;
  readonly detail?: string;
  readonly data?: Record<string, unknown>;
  readonly status?: "ok" | "error" | "pending";
}

interface ActionLogState {
  readonly entries: readonly ActionEntry[];
  readonly visible: boolean;
  readonly push: (
    kind: ActionKind,
    label: string,
    opts?: { detail?: string; data?: Record<string, unknown>; status?: "ok" | "error" | "pending" },
  ) => void;
  readonly toggle: () => void;
  readonly clear: () => void;
}

const MAX_ENTRIES = 200;
let seq = 0;

export const useActionLogStore = create<ActionLogState>((set) => ({
  entries: [],
  visible: process.env.NODE_ENV === "development",

  push: (kind, label, opts) => {
    const entry: ActionEntry = {
      id: seq++,
      timestamp: new Date().toISOString().slice(11, 23), // HH:mm:ss.SSS
      kind,
      label,
      detail: opts?.detail,
      data: opts?.data,
      status: opts?.status,
    };
    set((state) => ({
      entries: [...state.entries.slice(-(MAX_ENTRIES - 1)), entry],
    }));
  },

  toggle: () => set((state) => ({ visible: !state.visible })),
  clear: () => set({ entries: [] }),
}));

// Convenience functions callable from anywhere.
export function logAction(
  kind: ActionKind,
  label: string,
  opts?: { detail?: string; data?: Record<string, unknown>; status?: "ok" | "error" | "pending" },
): void {
  useActionLogStore.getState().push(kind, label, opts);
}

export function logNavigate(from: string, to: string): void {
  logAction("navigate", `${from} -> ${to}`, { detail: to });
}

export function logClick(element: string, screen?: string): void {
  logAction("click", element, { detail: screen });
}

export function logApiCall(method: string, path: string): void {
  logAction("api_call", `${method} ${path}`, { status: "pending" });
}

export function logApiResponse(method: string, path: string, status: number, durationMs: number): void {
  logAction("api_response", `${method} ${path} ${status} ${durationMs}ms`, {
    data: { status, duration_ms: durationMs },
    status: status < 400 ? "ok" : "error",
  });
}

export function logApiError(method: string, path: string, error: string): void {
  logAction("api_error", `${method} ${path} FAILED`, {
    detail: error,
    status: "error",
  });
}
