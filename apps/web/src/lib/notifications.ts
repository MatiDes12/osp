import { isTauri, showNativeNotification } from "./tauri";
import { showToast } from "@/stores/toast";

export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) return true;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** True when the app window is currently visible and focused. */
function isAppFocused(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

export function showNotification(
  title: string,
  options?: {
    readonly body?: string;
    readonly icon?: string;
    readonly tag?: string;
    readonly onClick?: () => void;
  },
): void {
  if (isAppFocused()) {
    // App is open and visible — show an in-app toast instead of OS notification
    const msg = options?.body ? `${title} — ${options.body}` : title;
    showToast(msg, "info");
    return;
  }

  // App is minimized / in background — use native or browser notification
  if (isTauri()) {
    void showNativeNotification(title, options?.body ?? "");
    return;
  }

  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body: options?.body,
    icon: options?.icon ?? "/osp-icon.png",
    tag: options?.tag,
    badge: "/osp-icon.png",
  });
  if (options?.onClick) {
    n.onclick = () => {
      options.onClick!();
      window.focus();
    };
  }
}
