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

/** Returns the desktop app version (e.g. "0.1.1"). Falls back to the
 *  NEXT_PUBLIC_APP_VERSION env var, then "web" when running in a browser. */
export async function getAppVersion(): Promise<string> {
  const invoke = getInvoke();
  if (invoke) {
    try {
      return await invoke<string>("plugin:app|version");
    } catch {
      // Fall through to env fallback
    }
  }
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "web";
}

/**
 * Convert a local file path to a URL the Tauri webview can load.
 * Uses the `asset://` protocol on macOS/Linux, `https://asset.localhost/` on Windows.
 * Returns null when not running in Tauri.
 */
export function convertFileSrc(filePath: string): string | null {
  if (!isTauri()) return null;
  // Tauri v2 asset protocol.
  // encodeURIComponent encodes everything including : → %3A and \ → %5C.
  // We need to restore / for path separators, and : for Windows drive letters.
  const encoded = encodeURIComponent(filePath)
    .replace(/%3A/g, ":")   // restore drive letter colon (C: not C%3A)
    .replace(/%2F/g, "/")   // restore forward slashes
    .replace(/%5C/g, "/");  // convert backslashes to forward slashes
  const isWindows = typeof navigator !== "undefined" && navigator.platform.includes("Win");
  return isWindows
    ? `https://asset.localhost/${encoded}`
    : `asset://localhost/${encoded}`;
}

/**
 * Read a locally-saved recording file and return a blob URL the <video>
 * element can play. Returns null when not in Tauri or if the read fails.
 * The caller is responsible for calling URL.revokeObjectURL when done.
 */
export async function readLocalFileAsUrl(
  filePath: string,
  mimeType = "video/webm",
): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const base64 = await invoke<string>("read_local_file", { path: filePath });
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Open a native folder-picker dialog. Returns the selected path or null. */
export async function pickFolder(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return await invoke<string | null>("pick_folder") ?? null;
  } catch {
    return null;
  }
}

/** Return the default recordings and snapshots directories for this app. */
export async function getAppDirs(): Promise<{ recordings: string; snapshots: string } | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return await invoke<{ recordings: string; snapshots: string }>("get_app_dirs");
  } catch {
    return null;
  }
}

/** Returns whether the local go2rtc sidecar is running and reachable. */
export async function getGo2rtcStatus(): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    return await invoke<boolean>("get_go2rtc_status");
  } catch {
    return false;
  }
}
