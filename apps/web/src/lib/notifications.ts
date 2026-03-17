export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(title: string, options?: {
  readonly body?: string;
  readonly icon?: string;
  readonly tag?: string;
  readonly onClick?: () => void;
}) {
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
