"use client";

/**
 * Syncs live camera / alert counts to the Tauri desktop system tray.
 * No-op when running in a browser (isTauri() returns false).
 */

import { useEffect } from "react";
import type { Camera } from "@osp/shared";
import { isTauri, updateTrayStatus } from "@/lib/tauri";

export function useTraySync(
  cameras: readonly Camera[],
  alertsUnread = 0,
): void {
  useEffect(() => {
    if (!isTauri() || cameras.length === 0) return;

    const online = cameras.filter((c) => c.status === "online").length;
    void updateTrayStatus(online, cameras.length, alertsUnread);
  }, [cameras, alertsUnread]);
}
