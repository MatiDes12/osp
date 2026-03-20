import { isTauri, showNativeNotification } from "./tauri";

export async function requestNotificationPermission(): Promise<boolean> {
  // Tauri handles permissions via its plugin — no browser prompt needed.
  if (isTauri()) return true;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
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
  // In the Tauri desktop shell, use native OS notifications (fire-and-forget).
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
