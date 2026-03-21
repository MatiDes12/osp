"use client";

/**
 * Tauri desktop bridge.
 *
 * Detects whether the web app is running inside the Tauri desktop shell and
 * exposes typed wrappers for native commands.  All functions are no-ops when
 * running in a regular browser so the web app needs no conditional logic.
 */

/** Returns true when running inside the Tauri desktop wrapper. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): InvokeFn | null {
  if (!isTauri()) return null;
  // @tauri-apps/api is only bundled in the desktop package, so we access
  // it through the global that Tauri injects into every webview window.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI_INTERNALS__?.invoke ?? null;
}

/** Update the system tray tooltip with live camera/alert counts. */
export async function updateTrayStatus(
  camerasOnline: number,
  camerasTotal: number,
  alertsUnread: number,
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    await invoke("update_tray_status", {
      cameras_online: camerasOnline,
      cameras_total: camerasTotal,
      alerts_unread: alertsUnread,
    });
  } catch {
    // Tray update is non-critical
  }
}

/** Show a native OS notification via the Tauri notification plugin. */
export async function showNativeNotification(
  title: string,
  body: string,
): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    await invoke("show_os_notification", { title, body });
    return true;
  } catch {
    return false;
  }
}

/** Toggle auto-start on login. Returns the new enabled state. */
export async function toggleAutostart(): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    return await invoke<boolean>("toggle_autostart");
  } catch {
    return false;
  }
}

/** Returns whether auto-start is currently enabled. */
export async function getAutostartEnabled(): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    return await invoke<boolean>("get_autostart_enabled");
  } catch {
    return false;
  }
}

