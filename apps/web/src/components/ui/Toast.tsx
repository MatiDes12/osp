"use client";

import { useToastStore, type ToastType } from "@/stores/toast";
import { Check, X, AlertCircle, Info } from "lucide-react";

const TYPE_STYLES: Record<ToastType, { border: string; bg: string; text: string; icon: typeof Check }> = {
  success: {
    border: "border-green-500/30",
    bg: "bg-green-500/10",
    text: "text-green-400",
    icon: Check,
  },
  error: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-400",
    icon: AlertCircle,
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    icon: Info,
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg border ${style.border} ${style.bg} px-4 py-3 text-sm ${style.text} shadow-lg backdrop-blur-sm animate-in slide-in-from-right-4`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {toast.message}
            <button
              onClick={() => removeToast(toast.id)}
              className={`ml-2 opacity-60 hover:opacity-100 transition-opacity duration-150 cursor-pointer`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
